// Chapters 1-4: state topology, modules, environments, change control. Spec format: see ../../k8s/README.md.
// No `atScale` box: scale is the main thread of each chapter's steps.
export const CHAPTERS = [
  {
    id: "state",
    n: 1,
    title: "State topology as blast-radius policy",
    question: "Across hundreds of teams and thousands of states, what may share a state, who may read it, and how do you keep a mistake inside one team's boundary?",
    view: [920, 420],
    groups: [
      { id: "g-backend", label: "One account's backend: its own bucket and KMS key", x: 170, y: 10, w: 610, h: 200 },
      { id: "g-split", label: "Split by owner, environment and rate of change", x: 170, y: 250, w: 740, h: 160 },
    ],
    nodes: [
      { id: "runner", label: "CI runner", sub: "plan / apply", kind: "actor", x: 10, y: 70, w: 130, h: 50 },
      { id: "lock", label: "Lock file", sub: "<key>.tflock", x: 190, y: 40, w: 150, h: 50 },
      { id: "state", label: "State object", sub: "<key>", kind: "store", x: 400, y: 40, w: 160, h: 50 },
      { id: "versions", label: "Old versions", sub: "bucket versioning", kind: "store", x: 620, y: 40, w: 150, h: 50 },
      { id: "alerts", label: "Read alerts", sub: "S3 data events", x: 190, y: 140, w: 150, h: 50 },
      { id: "kms", label: "KMS key + IAM", sub: "who can read state", x: 400, y: 140, w: 160, h: 50 },
      { id: "cloud", label: "Cloud APIs", sub: "real resources", kind: "store", x: 800, y: 140, w: 110, h: 50 },
      { id: "operator", label: "On-call", sub: "force-unlock", kind: "actor", x: 10, y: 290, w: 130, h: 50 },
      { id: "netst", label: "network state", sub: "platform team", kind: "store", x: 180, y: 290, w: 140, h: 50 },
      { id: "ssm", label: "SSM parameter", sub: "/prod/net/vpc_id", kind: "store", x: 390, y: 290, w: 160, h: 50 },
      { id: "appst", label: "app state", sub: "app team", kind: "store", x: 620, y: 290, w: 150, h: 50 },
    ],
    edges: [
      { id: "e-lock", from: "runner", to: "lock" },
      { id: "e-read", from: "runner", to: "state", via: [[370, 115]], label: "read, then write", labelAt: [300, 128] },
      { id: "e-ver", from: "state", to: "versions" },
      { id: "e-kms", from: "state", to: "kms", bidir: true },
      { id: "e-alert", from: "alerts", to: "state" },
      { id: "e-refresh", from: "runner", to: "cloud", via: [[75, 225], [855, 225]], label: "refresh, apply", labelAt: [470, 222] },
      { id: "e-unlock", from: "operator", to: "lock", via: [[160, 315], [160, 65]], dashed: true },
      { id: "e-out", from: "netst", to: "ssm", label: "publishes", labelAt: [355, 287] },
      { id: "e-in", from: "ssm", to: "appst", label: "reads" },
      { id: "e-rs", from: "appst", to: "netst", via: [[695, 380], [250, 380]], dashed: true, label: "remote_state: all", labelAt: [470, 377] },
    ],
    steps: [
      { text: "What shares a state shares a blast radius, so state layout is an org policy. Top: one account's backend, which every run uses. Bottom: how the fleet splits states and passes values between them. Press Next." },
      { text: "The rule I'd set org-wide: one state per owner, environment and rate of change. HashiCorp's workspace guidance says to split by team responsibility and group resources by volatility. The network changes rarely and belongs to the platform team; apps change daily.", on: ["netst", "appst"] },
      { text: "Track it as a fleet metric: plan time and resource count per state. Every plan refreshes every object in its state, so big states plan slowly and hit API limits. HashiCorp calls long-running workloads an early sign of a bloated workspace. Split the slowest first.", on: ["runner", "state", "cloud"], flow: ["e-refresh"] },
      { text: "Give each account or team its own bucket or prefix, and each environment its own KMS key and key policy. One org-wide bucket read by every pipeline role means one compromised pipeline can read every secret in every state.", on: ["state", "kms"], flow: ["e-kms"] },
      { text: "Generate backend config instead of copying it. With hundreds of roots, a pasted `key` that points two roots at one state corrupts both. Terragrunt's `remote_state` with `path_relative_to_include()` in the key gives each directory its own key.", on: ["runner", "state"], flow: ["e-read"] },
      { text: "A state read is a secret read: state holds every attribute in plaintext, and `sensitive = true` only hides CLI output. Write-only arguments (1.11+) keep a value out. Alert on reads by unexpected roles; CloudTrail logs S3 `GetObject` only as data events, which are off by default.", on: ["alerts", "state"], flow: ["e-alert"] },
      { text: "`terraform_remote_state` returns only outputs, but its reader needs read access to the whole upstream state, secrets included.", on: ["appst", "netst"], flow: ["e-rs"] },
      { text: "So publish values instead. The network root writes an `aws_ssm_parameter` and the app root reads that one value. With many consumers, outputs become an API: keep names stable and treat a rename as a breaking change with a deprecation period.", on: ["netst", "ssm", "appst"], flow: ["e-out", "e-in"] },
      { text: "The worked example is one run. Terraform takes a lock first: with `use_lockfile = true` the S3 backend writes `<key>.tflock`, and a second run fails or waits for `-lock-timeout`. DynamoDB locking is deprecated.", on: ["runner", "lock"], flow: ["e-lock"] },
      { text: "Holding the lock, it reads and refreshes, applies, writes a new state object and releases the lock. Bucket versioning keeps the previous object, so a deleted or corrupted state can be restored.", on: ["runner", "state", "versions", "cloud"], flow: ["e-read", "e-ver"] },
      { text: "Runners on spot instances or with hard CI timeouts die mid-apply and leave stale locks. Set the job timeout above the longest apply. `force-unlock LOCK_ID` is a runbook step: confirm the holder is dead, unlock, re-plan.", on: ["operator", "lock"], flow: ["e-unlock"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "Remote state: locked, encrypted, scoped",
        src: `terraform {
  backend "s3" {
    bucket       = "acme-tfstate-prod"
    key          = "network/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    kms_key_id   = "arn:aws:kms:eu-central-1:111122223333:key/EXAMPLE"
    use_lockfile = true # writes network/terraform.tfstate.tflock
  }
}`,
      },
      {
        lang: "hcl",
        label: "Share one value, not the whole state",
        src: `# network root module
resource "aws_ssm_parameter" "vpc_id" {
  name  = "/prod/net/vpc_id"
  type  = "String"
  value = aws_vpc.main.id
}

# app root module
data "aws_ssm_parameter" "vpc_id" {
  name = "/prod/net/vpc_id"
}`,
      },
    ],
    codeNote: "The runner role needs `s3:ListBucket` on the bucket, `s3:GetObject`/`s3:PutObject` on the state key, `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject` on the `.tflock` key, and `kms:Encrypt`/`kms:Decrypt`/`kms:GenerateDataKey` on the KMS key. To migrate off DynamoDB, set `use_lockfile` and `dynamodb_table` together for a while, then drop the table.",
    say30: "I treat state layout as org policy, because what shares a state shares a blast radius. One state per owner, environment and rate of change, so the network, shared services and each app get their own state, lock and IAM grant. Each account gets its own bucket or prefix and each environment its own KMS key. Backend config is generated, so no two roots share a key. State holds secrets in plaintext, so unexpected reads raise alerts, and values cross states through published outputs like SSM, not `terraform_remote_state`. I track plan time and resource count per state and split the slow ones. Underneath: `use_lockfile` on S3, bucket versioning, and `force-unlock` only as a runbook step.",
    gotchas: [
      "Restoring an older state version after an apply makes Terraform forget objects created since then. They keep running unmanaged until you import them again. After a partial failure, re-running apply is usually the fix.",
      "`force-unlock` on a lock held by a live run lets two writers race, and the last one to write state wins. `-lock=false` has the same risk.",
      "A prefix per team in one shared bucket isolates only if the IAM grants and the KMS key policy are scoped to that prefix. One bucket-wide read grant undoes it.",
    ],
    agentic: [
      "Agents that run `terraform plan` or read state through a tool need the same `s3:GetObject` on the state key as the runner, and that grant is read access to every plaintext secret in it. Give each agent its own role scoped to one key and one KMS key, never the launching developer's standing credentials, and include it in the unexpected-reader alerts like any new pipeline.",
      "Whatever an agent reads from state or a saved plan lands in its context, so a `terraform show` run to answer a question can put database passwords into a model provider's transcript. Point agents at published outputs (SSM, `tfe_outputs`) instead of whole state, and avoid pairing state access with untrusted PR text and outbound network, the combination Simon Willison calls the lethal trifecta.",
      "An agent that hits a lock error tends to reach for `force-unlock` or `-lock=false` as the quick fix. The lock is the only thing stopping two writers, so keep both out of the agent's allowed commands, and leave the Terraform MCP server's `force_unlock_workspace` off (it needs `ENABLE_TF_OPERATIONS`). Confirming the holding job is dead and choosing the lock ID stays a human runbook step.",
    ],
    quiz: [
      { q: "Your largest state takes 25 minutes to plan and three teams change it. What do you do?", a: "Split it by owner and rate of change, so each team gets its own state, lock and IAM grant, and share values through published outputs. Each plan then refreshes fewer objects." },
      { q: "Why is giving every team read access to the network state a security problem, even if they only need the VPC ID?", a: "State stores every attribute in plaintext, including secrets. Read access to the state is read access to all of it. Publish the VPC ID to SSM or similar instead." },
      { q: "Someone deleted the state object in S3. How do you recover?", a: "With bucket versioning on, restore the previous version of the object. Without versioning you would have to rebuild state by importing every resource." },
    ],
    incidents: [],
    sources: [
      { title: "HCP Terraform: workspace best practices", url: "https://developer.hashicorp.com/terraform/cloud-docs/workspaces/best-practices" },
      { title: "AWS CloudTrail: logging data events", url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html" },
      { title: "Terraform: S3 backend", url: "https://developer.hashicorp.com/terraform/language/backend/s3" },
      { title: "Terraform: backend block", url: "https://developer.hashicorp.com/terraform/language/backend" },
      { title: "Terraform: purpose of state", url: "https://developer.hashicorp.com/terraform/language/state/purpose" },
      { title: "Terraform: state locking", url: "https://developer.hashicorp.com/terraform/language/state/locking" },
      { title: "Terraform: force-unlock command", url: "https://developer.hashicorp.com/terraform/cli/commands/force-unlock" },
      { title: "Terraform: sensitive data in state", url: "https://developer.hashicorp.com/terraform/language/manage-sensitive-data" },
      { title: "Terraform: terraform_remote_state data source", url: "https://developer.hashicorp.com/terraform/language/state/remote-state-data" },
      { title: "Terragrunt: state backend", url: "https://docs.terragrunt.com/features/units/state-backend/" },
      { title: "Google SRE: AI in SRE, engineering reliable operations", url: "https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/" },
      { title: "Simon Willison: the lethal trifecta", url: "https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/" },
    ],
  },
  {
    id: "modules",
    n: 2,
    title: "Module design and versioning",
    question: "Hundreds of repositories depend on your shared modules. How do you design, version and roll out changes to them without breaking every consumer?",
    view: [920, 400],
    groups: [
      { id: "g-root", label: "Root module: payments/prod", x: 170, y: 140, w: 740, h: 250 },
    ],
    nodes: [
      { id: "author", label: "Module owner", sub: "vpc module repo", kind: "actor", x: 10, y: 40, w: 130, h: 50 },
      { id: "tag", label: "Tag v2.3.0", sub: "CHANGELOG entry", x: 190, y: 40, w: 150, h: 50 },
      { id: "registry", label: "Private registry", sub: "semver versions", kind: "store", x: 410, y: 40, w: 160, h: 50 },
      { id: "renovate", label: "Renovate bot", sub: "opens bump PRs", x: 650, y: 40, w: 150, h: 50 },
      { id: "rootcfg", label: "main.tf", sub: "module + version", x: 190, y: 180, w: 150, h: 50 },
      { id: "child", label: "vpc module", sub: "required_providers", x: 450, y: 180, w: 170, h: 50 },
      { id: "prov", label: "provider \"aws\"", sub: "root module only", x: 190, y: 310, w: 150, h: 50 },
      { id: "lockf", label: ".terraform.lock.hcl", sub: "provider hashes", kind: "store", x: 450, y: 310, w: 180, h: 50 },
      { id: "others", label: "Other roots", sub: "still on v1.9.x", x: 720, y: 310, w: 170, h: 50 },
    ],
    edges: [
      { id: "e-tag", from: "author", to: "tag" },
      { id: "e-pub", from: "tag", to: "registry" },
      { id: "e-poll", from: "renovate", to: "registry" },
      { id: "e-pr", from: "renovate", to: "rootcfg", label: "PR: bump version", labelPos: 0.3 },
      { id: "e-fetch", from: "registry", to: "child", label: "init downloads", labelPos: 0.5 },
      { id: "e-call", from: "rootcfg", to: "child", label: "inputs/outputs", bidir: true },
      { id: "e-prov", from: "prov", to: "child", label: "passed in", labelPos: 0.35 },
      { id: "e-hash", from: "prov", to: "lockf", label: "pins exact" },
      { id: "e-old", from: "registry", to: "others", dashed: true, label: "pinned to v1", labelPos: 0.72 },
    ],
    steps: [
      { text: "The life of a shared module across hundreds of repos: its owner releases a version, each root pins it, and a bot proposes the upgrade everywhere. Press Next." },
      { text: "Run a shared module like a public API with an owner: CODEOWNERS on its repo, the private registry as the catalogue, inputs and outputs versioned like any API. A module nobody owns rots while everyone depends on it.", on: ["author", "registry"] },
      { text: "Design for many callers: one architectural concept per module, such as a VPC with its subnets and routes. No thin wrappers around one resource, and no god module holding a whole environment. Dependencies such as `vpc_id` come in as inputs.", on: ["rootcfg", "child"], flow: ["e-call"] },
      { text: "Release by pushing a semver Git tag with a changelog entry; the private registry imports each tag as a version. HashiCorp's style guide suggests one repo per module. Multi-module repos use tag prefixes such as `vpc-v2.3.0`, which the HCP Terraform registry can strip.", on: ["author", "tag", "registry"], flow: ["e-tag", "e-pub"] },
      { text: "Roots pin exactly: a `version` for registry sources, a tag or SHA `?ref=` for Git. The lock file doesn't cover modules, so with a range a buggy release reaches every consumer on its next `init`. An exact pin makes each consumer's plan show the change first.", on: ["rootcfg", "registry", "child"], flow: ["e-fetch"] },
      { text: "Provider config lives only in roots and is passed down; a module with its own `provider` block can't use `count`, `for_each` or `depends_on`. Shared modules declare only minimum provider versions (`>= 5.0`), so one module never holds the fleet back from a provider major.", on: ["prov", "child", "lockf"], flow: ["e-prov", "e-hash"] },
      { text: "Nobody upgrades hundreds of repos by hand. Renovate or Dependabot opens bump PRs in every consumer, with patch and minor bumps grouped. Each PR runs a plan, and teams auto-merge when the plan is empty.", on: ["renovate", "registry", "rootcfg"], flow: ["e-poll", "e-pr"] },
      { text: "Breaking changes need a process: a new major version, upgrade notes with `moved` blocks, the old major patched through a published deprecation window, and a scan of all repos for who still pins it before support ends.", on: ["registry", "others"], flow: ["e-old"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "Root module: pin exactly",
        src: `module "vpc" {
  source  = "app.terraform.io/acme/vpc/aws"
  version = "2.3.0" # Renovate bumps this in a PR

  cidr_block = "10.20.0.0/16"
}

module "dns" {
  source = "git::https://github.com/acme/tf-dns.git?ref=v1.4.2"
}`,
      },
      {
        lang: "hcl",
        label: "Shared module: no provider block",
        src: `# modules/vpc/versions.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0" # minimum only
    }
  }
}`,
      },
    ],
    codeNote: "The root module holds the `provider \"aws\"` block, a `~>` constraint, and the committed `.terraform.lock.hcl`. A Git `ref` pointing at a branch moves under you; use a tag or a commit SHA.",
    say30: "With hundreds of consumers, a shared module is a public API. It has an owner in CODEOWNERS, sits in a private registry as the catalogue, and ships with semver tags and changelogs. Each module is one architectural concept with clear inputs, no provider blocks and only minimum provider versions, so it never holds the fleet back. Roots pin exact versions, because the lock file doesn't cover modules and a range lets a bad release reach everyone. Renovate or Dependabot opens the bump PRs everywhere, and each plan shows what the upgrade changes. Breaking changes get a major version, `moved` blocks, a deprecation window and a scan for who still pins the old one.",
    gotchas: [
      "A root constraint like `~> 2.3` silently picks up 2.4.0 on the next `init -upgrade` or fresh checkout.",
      "Deleting a module call that holds its own `provider` block also deletes the provider config Terraform needs to destroy that module's resources.",
      "Renaming resources inside a module is a breaking change for every caller unless the release adds `moved` blocks (see Terraform, Five Years On).",
    ],
    agentic: [
      "Agents now write the upgrade, not just the version bump: across hundreds of consumer repos they add `moved` blocks, rename inputs and fix the failing plan. The consumer's plan is still what a human reads, and the new failure is a plan made empty by the wrong means, such as an added `ignore_changes` or a loosened pin, so auto-merge on an empty plan should also require that only the `version` line changed.",
      "Module READMEs, variable descriptions and the private registry are now context agents read when choosing a module, and the Terraform MCP server (GA since June 2026) serves registry and private-module data to them. The module owner keeps those descriptions accurate and the catalogue curated, because a vague description now produces misused inputs in many repos at once (see Agentic Engineering on context engineering).",
      "DORA linked AI adoption to larger batches and lower stability in 2024, and in 2025 stability still suffered as change volume rose. An agent jumping a consumer three majors in one PR is the ZenML upgrade pattern at machine speed; the module owner still sets the deprecation window and the one-major-at-a-time rule, and bots and agents follow it.",
    ],
    quiz: [
      { q: "Why shouldn't a reusable module contain a `provider` block?", a: "Provider configuration belongs to the root. A module with its own provider block can't be used with `count`, `for_each` or `depends_on`, and removing the module also removes the config needed to destroy its resources." },
      { q: "Does `.terraform.lock.hcl` pin module versions?", a: "No, only providers. Pin modules with an exact `version` for registry sources or a tag or commit `ref` for Git sources." },
      { q: "What version constraint should a shared module set for the AWS provider, and what should the root set?", a: "The shared module sets a minimum such as `>= 5.0`. The root sets a bounded `~>` constraint and commits the lock file that records the exact version." },
    ],
    incidents: ["zenml-2025-eks-upgrade-iam-regression"],
    sources: [
      { title: "Terraform: creating modules", url: "https://developer.hashicorp.com/terraform/language/modules/develop" },
      { title: "Terraform: module composition", url: "https://developer.hashicorp.com/terraform/language/modules/develop/composition" },
      { title: "Terraform: providers within modules", url: "https://developer.hashicorp.com/terraform/language/modules/develop/providers" },
      { title: "Terraform: module sources", url: "https://developer.hashicorp.com/terraform/language/modules/configuration" },
      { title: "Terraform: version constraints", url: "https://developer.hashicorp.com/terraform/language/expressions/version-constraints" },
      { title: "Terraform: dependency lock file", url: "https://developer.hashicorp.com/terraform/language/files/dependency-lock" },
      { title: "Terraform: style guide", url: "https://developer.hashicorp.com/terraform/language/style" },
      { title: "HCP Terraform: publishing private modules", url: "https://developer.hashicorp.com/terraform/cloud-docs/registry/publish-modules" },
      { title: "HCP Terraform: using private modules", url: "https://developer.hashicorp.com/terraform/cloud-docs/registry/using" },
      { title: "Renovate: Terraform manager", url: "https://docs.renovatebot.com/modules/manager/terraform/" },
      { title: "Terraform MCP server overview", url: "https://developer.hashicorp.com/terraform/mcp-server" },
      { title: "Terraform MCP server: tools reference", url: "https://developer.hashicorp.com/terraform/mcp-server/reference" },
      { title: "DORA: impact of generative AI in software development", url: "https://dora.dev/ai/gen-ai-report/report/" },
      { title: "Google Cloud: announcing the 2025 DORA report", url: "https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report" },
    ],
  },
  {
    id: "environments",
    n: 3,
    title: "Laying out environments",
    question: "Hundreds of teams need dev, staging and prod. How do you lay them out so they stay isolated, comparable and cheap to add?",
    view: [920, 460],
    groups: [
      { id: "g-live", label: "live/ repo: one directory per environment", x: 170, y: 10, w: 740, h: 110 },
      { id: "g-org", label: "AWS Organization: one account per environment", x: 170, y: 190, w: 740, h: 110 },
      { id: "g-ws", label: "Alternative: CLI workspaces", x: 170, y: 330, w: 740, h: 120 },
    ],
    nodes: [
      { id: "modsrc", label: "Module release", sub: "app v2.4.0", kind: "store", x: 10, y: 50, w: 140, h: 50 },
      { id: "devdir", label: "live/dev", sub: "ref=v2.4.0", x: 190, y: 50, w: 150, h: 50 },
      { id: "stgdir", label: "live/staging", sub: "ref=v2.4.0", x: 440, y: 50, w: 150, h: 50 },
      { id: "proddir", label: "live/prod", sub: "ref=v2.3.0", x: 690, y: 50, w: 150, h: 50 },
      { id: "tg", label: "Terragrunt", sub: "root.hcl", x: 10, y: 225, w: 140, h: 50 },
      { id: "devacct", label: "dev account", sub: "own state + role", kind: "store", x: 190, y: 225, w: 150, h: 50 },
      { id: "stgacct", label: "staging account", sub: "own state + role", kind: "store", x: 440, y: 225, w: 150, h: 50 },
      { id: "prodacct", label: "prod account", sub: "own state + role", kind: "store", x: 690, y: 225, w: 150, h: 50 },
      { id: "aft", label: "Account Factory", sub: "AFT request", x: 10, y: 370, w: 140, h: 50 },
      { id: "wsdir", label: "One directory", sub: "workspace select", x: 190, y: 370, w: 150, h: 50 },
      { id: "creds", label: "One backend", sub: "same credentials", x: 440, y: 370, w: 150, h: 50 },
      { id: "wsstate", label: "State per ws", sub: "env:/<ws>/<key>", kind: "store", x: 690, y: 370, w: 150, h: 50 },
    ],
    edges: [
      { id: "e-first", from: "modsrc", to: "devdir" },
      { id: "e-p1", from: "devdir", to: "stgdir", label: "promote" },
      { id: "e-p2", from: "stgdir", to: "proddir", label: "promote" },
      { id: "e-d", from: "devdir", to: "devacct", label: "applies to", labelPos: 0.55 },
      { id: "e-s", from: "stgdir", to: "stgacct" },
      { id: "e-pa", from: "proddir", to: "prodacct" },
      { id: "e-gen", from: "tg", to: "devdir", label: "generates", labelPos: 0.45 },
      { id: "e-aft", from: "aft", to: "devacct", label: "vends", labelPos: 0.6 },
      { id: "e-ws1", from: "wsdir", to: "creds" },
      { id: "e-ws2", from: "creds", to: "wsstate", label: "reads any env" },
    ],
    steps: [
      { text: "Top: one directory per environment. Middle: one account per environment, vended by the account factory at bottom left. Bottom: CLI workspaces, the layout to avoid. With hundreds of teams, all of it is generated, not hand-made. Press Next." },
      { text: "Every environment calls the same released module and differs only in inputs: sizes, counts, CIDR ranges, feature switches. If prod needs different code, that is a module input, not a fork.", on: ["modsrc", "devdir", "stgdir", "proddir"], flow: ["e-first"] },
      { text: "Each environment is its own root with its own backend key and role, in its own cloud account. An AWS account is an IAM boundary with its own quotas and bill, so a mistake in dev can't reach prod.", on: ["devdir", "devacct", "stgacct", "prodacct"], flow: ["e-d", "e-s", "e-pa"] },
      { text: "Hundreds of accounts can't be set up by hand. With AWS Account Factory for Terraform, an account request pushed to Git makes Control Tower create the account, then pipelines apply baseline customizations, so every account starts with the same roles, logging and guardrails.", on: ["aft", "devacct", "stgacct", "prodacct"], flow: ["e-aft"] },
      { text: "Hand-kept directories drift apart. Terragrunt generates each unit's backend and provider from a parent `root.hcl`, and explicit stacks (`terragrunt.stack.hcl`) stamp out units that differ only in values, so a new region or tenant is a few lines of input.", on: ["tg", "devdir"], flow: ["e-gen"] },
      { text: "Promotion: bump the module ref in dev, then staging, then prod, each in its own PR. Staging rarely matches prod's scale or history, so roll a prod change to one prod-like account or region before the rest.", on: ["devdir", "stgdir", "proddir"], flow: ["e-p1", "e-p2"] },
      { text: "Track version skew as a fleet metric. Scan for the module version each environment pins, and alert when prod lags past a set age, because each big jump is a risky promotion. Promote small increments often.", on: ["stgdir", "proddir"] },
      { text: "CLI workspaces keep one directory and switch with `terraform workspace select`. Every workspace's state sits in the same backend, under `env:/<name>/<key>` on S3.", on: ["wsdir", "creds", "wsstate"], flow: ["e-ws1", "e-ws2"] },
      { text: "So HashiCorp calls them unsuitable for isolating stages or teams: one set of credentials and access controls, and a wrong selected workspace applies to prod. HCP Terraform workspaces differ: each has its own variables, credentials and permissions, one per component per environment.", on: ["creds", "wsstate"], flow: ["e-ws2"] },
      { text: "A scheduled `plan -detailed-exitcode` in each environment keeps them comparable; exit code 2 means live infrastructure no longer matches the code. Across thousands of roots, stagger these per account and region so they don't eat API quota.", on: ["devacct", "stgacct", "prodacct"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "live/prod/app/terragrunt.hcl",
        src: `include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "git::https://github.com/acme/modules.git//app?ref=v2.3.0"
}

inputs = {
  instance_count = 12
  instance_type  = "m7g.large"
}`,
      },
      {
        lang: "hcl",
        label: "live/root.hcl",
        src: `remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
  config = {
    bucket       = "acme-tfstate"
    key          = "\${path_relative_to_include()}/tofu.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}`,
      },
    ],
    codeNote: "Promoting to prod is a one-line PR changing `ref=v2.3.0` to `v2.4.0`. In practice each environment also gets its own state bucket in its own account; one bucket keeps the example short.",
    say30: "For hundreds of teams I make environments cheap and identical. Accounts come from an account factory with the same baseline roles, logging and guardrails. Each environment gets its own root, state and account, all calling the same versioned modules, and Terragrunt or generated configs stamp out the directories, so the only differences are inputs. Promotion is a PR per environment, and prod changes go to one prod-like account or region first. I track version skew between environments and alert when prod lags too long. CLI workspaces aren't isolation: they share one backend and one set of credentials, and a wrong `workspace select` hits prod. Staggered scheduled plans catch drift.",
    gotchas: [
      "CLI workspaces and HCP Terraform workspaces share a name, not a design. HCP workspaces have their own variables, credentials and permissions; CLI workspaces share one backend and whatever credentials you run with.",
      "Environments in one account share IAM, quotas and blast radius, whatever the directory layout. Directories isolate state; accounts isolate access.",
      "A partial `backend` block filled in with `-backend-config` at `init` is easy to get wrong in CI. Terraform backend blocks can't use variables (OpenTofu 1.8+ allows static variables and locals there), so generate them.",
    ],
    agentic: [
      "Promotion stays a one-line `ref` change per environment, which is a good task to hand an agent. The order and soak time between staging and prod belong to the pipeline, not the agent; the failure mode is an agent making a prod plan pass by editing prod's directory, so the code diverges and staging stops testing anything.",
      "An agent in a terminal inherits whatever `AWS_PROFILE` or workspace is selected, the same wrong-context trap as the PSF `kubectl` incident. Give agent identities credentials only for sandbox and dev accounts, never a developer's standing prod access, so prod is reachable only through the pipeline's OIDC role.",
      "With Account Factory for Terraform an account request is a Git commit, so an agent can draft one. The human-reviewed part is the target OU and baseline customizations, because the guardrails attached there bound every identity that later runs in the account, agents included.",
    ],
    quiz: [
      { q: "Why does HashiCorp say CLI workspaces aren't suitable for separating dev and prod?", a: "All workspaces of a configuration share one backend and whatever credentials you run with, so there is no separate access control. Environments need different credentials and isolation." },
      { q: "How do you promote a change from staging to prod in a directory-per-environment layout?", a: "Open a PR that sets prod's module version (or Terragrunt `?ref=`) to the version staging already runs, review the plan, and apply it from the pipeline." },
      { q: "What does `terraform plan -detailed-exitcode` returning 2 tell a nightly drift job?", a: "The plan succeeded and has changes: live infrastructure or state no longer matches the code. 0 means no changes and 1 means an error." },
    ],
    incidents: ["cloudflare-2025-r2-credential-rotation", "psf-2026-kubectl-wrong-context-scale-zero", "zenml-2025-eks-upgrade-iam-regression"],
    sources: [
      { title: "Terraform: workspaces", url: "https://developer.hashicorp.com/terraform/cli/workspaces" },
      { title: "Terraform: style guide", url: "https://developer.hashicorp.com/terraform/language/style" },
      { title: "Terraform: backend block", url: "https://developer.hashicorp.com/terraform/language/backend" },
      { title: "Terraform: S3 backend", url: "https://developer.hashicorp.com/terraform/language/backend/s3" },
      { title: "Terraform: plan command", url: "https://developer.hashicorp.com/terraform/cli/commands/plan" },
      { title: "HCP Terraform: recommended practices, part 1", url: "https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices/part1" },
      { title: "Terragrunt: units", url: "https://docs.terragrunt.com/features/units" },
      { title: "Terragrunt: stacks", url: "https://docs.terragrunt.com/features/stacks" },
      { title: "Terragrunt: implicit stacks", url: "https://docs.terragrunt.com/features/stacks/implicit" },
      { title: "Terragrunt: state backend", url: "https://docs.terragrunt.com/features/units/state-backend/" },
      { title: "AWS: Account Factory for Terraform overview", url: "https://docs.aws.amazon.com/controltower/latest/userguide/aft-overview.html" },
      { title: "AWS: organizing your environment using multiple accounts", url: "https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html" },
      { title: "Google SRE: AI in SRE, engineering reliable operations", url: "https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/" },
    ],
  },
  {
    id: "pr-workflow",
    n: 4,
    title: "Infra change control across hundreds of teams",
    question: "Hundreds of teams change infrastructure every day. What makes every change go through the same gate, who owns the rules, and how do you know it works?",
    view: [940, 470],
    groups: [
      { id: "g-runner", label: "One apply platform: Atlantis, HCP Terraform, Spacelift", x: 160, y: 150, w: 770, h: 235 },
    ],
    nodes: [
      { id: "dev", label: "Engineer", sub: "no prod creds", kind: "actor", x: 10, y: 40, w: 120, h: 50 },
      { id: "pr", label: "Pull request", sub: "main.tf change", x: 170, y: 40, w: 150, h: 50 },
      { id: "oidc", label: "OIDC → STS", sub: "short-lived role", x: 570, y: 40, w: 150, h: 50 },
      { id: "cloud", label: "Cloud APIs", sub: "prod account", kind: "store", x: 780, y: 40, w: 140, h: 50 },
      { id: "reviewer", label: "Reviewer", sub: "reads the plan", kind: "actor", x: 10, y: 180, w: 120, h: 50 },
      { id: "lock", label: "Project lock", sub: "dir + workspace", x: 170, y: 180, w: 150, h: 50 },
      { id: "plan", label: "terraform plan", sub: "-out=tfplan", x: 370, y: 180, w: 150, h: 50 },
      { id: "planfile", label: "tfplan", sub: "saved plan", kind: "store", x: 570, y: 180, w: 140, h: 50 },
      { id: "policy", label: "Policy + cost", sub: "Conftest, Infracost", x: 555, y: 310, w: 170, h: 50 },
      { id: "apply", label: "terraform apply", sub: "tfplan as-is", x: 780, y: 310, w: 140, h: 50 },
      { id: "platform", label: "Platform team", sub: "rules + policy repo", kind: "actor", x: 10, y: 410, w: 140, h: 50 },
      { id: "cfr", label: "Change fail rate", sub: "per root module", x: 770, y: 410, w: 160, h: 50 },
    ],
    edges: [
      { id: "e-local", from: "dev", to: "cloud", via: [[70, 20], [850, 20]], dashed: true, label: "no local apply", labelAt: [450, 18] },
      { id: "e-rules", from: "platform", to: "policy", via: [[640, 435]], label: "versioned rules", labelAt: [400, 432] },
      { id: "e-cfr", from: "apply", to: "cfr" },
      { id: "e-open", from: "dev", to: "pr" },
      { id: "e-autoplan", from: "pr", to: "lock", label: "autoplan" },
      { id: "e-l2p", from: "lock", to: "plan" },
      { id: "e-assume", from: "plan", to: "oidc", label: "assumes role" },
      { id: "e-creds", from: "oidc", to: "cloud" },
      { id: "e-write", from: "plan", to: "planfile" },
      { id: "e-json", from: "planfile", to: "policy", label: "show -json" },
      { id: "e-comment", from: "policy", to: "pr", via: [[150, 335], [150, 65]], label: "posts results", labelAt: [350, 332] },
      { id: "e-approve", from: "reviewer", to: "pr", label: "approves", labelPos: 0.4 },
      { id: "e-apply", from: "planfile", to: "apply", label: "applies as-is", labelPos: 0.45 },
      { id: "e-change", from: "apply", to: "cloud", label: "changes infra" },
    ],
    steps: [
      { text: "One gate for every infrastructure change in the org. Hundreds of teams open PRs; one apply platform plans, checks and applies them; the platform team owns the rules; outcomes feed a change fail rate per root module. Press Next." },
      { text: "Standardize on one apply platform and make its role the only identity that can write to prod. Engineers get read access at most, so a laptop with stale code or the wrong workspace can't change production.", on: ["dev", "cloud"], flow: ["e-local"] },
      { text: "The platform team owns the gate, not each repo. In Atlantis the server-side `repos.yaml` sets `apply_requirements` for every matching repo, and `allowed_overrides` lists the only keys a repo's own `atlantis.yaml` may change.", on: ["platform", "lock", "apply"] },
      { text: "Each PR autoplans the projects whose files changed and locks that directory and workspace. A shared-module PR can plan hundreds of projects, so narrow it with `when_modified` and cap concurrency (`--parallel-pool-size`, default 15). Stale PRs hold locks, so expire them.", on: ["dev", "pr", "lock", "plan"], flow: ["e-open", "e-autoplan", "e-l2p"] },
      { text: "The runner gets short-lived credentials through OIDC: the CI token is exchanged with STS for a role whose trust policy pins the repo, branch or environment in the `sub` claim. No static keys anywhere.", on: ["plan", "oidc", "cloud"], flow: ["e-assume", "e-creds"] },
      { text: "`plan -out=tfplan` saves the plan and `show -json` feeds policy as code: Conftest in Rego, or Sentinel or OPA on HCP Terraform, plus scanners and an Infracost estimate, all posted on the PR. The plan file holds secrets in cleartext, so treat it like state.", on: ["plan", "planfile", "policy", "pr"], flow: ["e-write", "e-json", "e-comment"] },
      { text: "Policy lives in its own versioned repo under its own CODEOWNERS. New rules roll out as advisory, then soft-mandatory with a recorded override, then hard-mandatory, so a new rule doesn't block every team on day one.", on: ["platform", "policy"], flow: ["e-rules"] },
      { text: "The reviewer approves the plan as well as the diff, since a one-line change can replace a database. Deletes, including the delete half of a replacement, show `delete` in `actions`, so policy can hold them for a named owner.", on: ["reviewer", "pr", "policy"], flow: ["e-approve"] },
      { text: "Apply runs the saved plan exactly and accepts no new `-var` or `-target`. Atlantis applies before merge; HCP Terraform applies after merge, one run at a time per workspace. Apply each merge promptly: crates.io lost DNS when one apply shipped several changes at once.", on: ["planfile", "apply", "cloud"], flow: ["e-apply", "e-change"] },
      { text: "Dependent stacks apply in order: network, then cluster, then apps. Atlantis has `depends_on` and `execution_order_group` per project; HCP Terraform uses run triggers. Without them, a parallel apply reads outputs that don't exist yet.", on: ["lock", "plan", "apply"] },
      { text: "Measure the gate. Track change fail rate per root module: DORA's ratio of deployments that need immediate intervention, here applies that error or need a quick fix or revert. A rising rate shows which state needs tests, policy or a smaller scope.", on: ["apply", "cfr"], flow: ["e-cfr"] },
      { text: "People with console write access bypass all of this, as CircleCI found when a role could edit a WAF rule outside Terraform. Remove write access for people and run scheduled drift plans to catch what slips through.", on: ["dev", "cloud"] },
    ],
    code: [
      {
        lang: "sh",
        label: "CI job: plan, check, apply the same plan",
        src: `terraform init -input=false
terraform plan -input=false -lock-timeout=5m -out=tfplan
terraform show -json tfplan > tfplan.json
conftest test tfplan.json              # deny rules fail the PR
infracost diff --path tfplan.json      # classic CLI (v0.10); cost change for the PR comment

# after approval, same working directory:
terraform apply -input=false tfplan`,
      },
      {
        lang: "rego",
        label: "policy/destroy.rego (Conftest)",
        src: `package main

import rego.v1

deny contains msg if {
  rc := input.resource_changes[_]
  "delete" in rc.change.actions
  msg := sprintf("%s would be deleted: needs destroy approval", [rc.address])
}`,
      },
    ],
    codeNote: "In Atlantis, the server-side `repos.yaml` sets `apply_requirements: [approved, mergeable, undiverged]`, and policy sets list `owners` who can approve a failed policy with `atlantis approve_policies`. On GitHub any user with read access counts for `approved`, so rely on `mergeable` with branch protection that requires code-owner review, and note `undiverged` needs the `merge` checkout strategy.",
    say30: "Every infrastructure change goes through one apply platform, Atlantis or HCP Terraform, and its role is the only one that can write to prod. The platform team owns the gate centrally: apply requirements in the server config, and policy as code in its own repo, rolled out advisory first, then soft and hard mandatory. Each PR plans with short-lived OIDC credentials, policy and cost checks read the plan JSON, a reviewer approves the plan with extra approval for deletes, and the platform applies exactly that saved plan, in dependency order. Then I measure it: change fail rate per root module shows which states need more tests or policy, and scheduled drift plans catch console changes.",
    gotchas: [
      "Running `terraform apply` without the plan file makes a fresh plan at apply time, which may differ from what was reviewed. Apply the saved plan.",
      "Atlantis applies before merge, so `main` can disagree with live infrastructure if a PR is applied and then abandoned. The `undiverged` and `mergeable` requirements reduce this.",
      "Policies on raw `.tf` files miss values that only resolve at plan time, such as module outputs and variables. Check the plan JSON as well.",
      "One org-wide change fail rate hides the few roots that fail most.",
    ],
    agentic: [
      "Agent identities slot into the plan/apply split: an agent may push a branch, open the PR and read the plan comment, but the OIDC trust policy's `sub` should only ever give its branches the plan role. Copilot cloud agent, for example, pushes only to its own `copilot/` branch (or the PR branch it was asked to update), cannot approve or merge, and the person who asked for the PR cannot approve it.",
      "In Atlantis, once `apply_requirements` are met, anyone who can comment on the PR can run `atlantis apply`, and that includes an agent bot with comment rights. Make `mergeable` with required code-owner review the real gate, and do not count an AI review as approval; Copilot code review, for one, does not count toward required approvals by default.",
      "Policy as code is the guardrail that scales to agent volume: Conftest or Sentinel rules on `resource_changes` check the fortieth agent PR of the day as strictly as the first, when human reviewers start to rubber-stamp. Keep the policy repo under its own CODEOWNERS and agents out of the `approve_policies` owners, or an agent can relax a rule in the same change it is checked against.",
    ],
    quiz: [
      { q: "Why apply a saved plan file instead of running `terraform apply` again after review?", a: "A fresh apply re-plans against the current state and code, which can differ from what was reviewed. A saved plan applies exactly the reviewed actions, and Terraform invalidates it if another apply changes the state first." },
      { q: "Why track change fail rate per root module instead of one number for the org?", a: "One average hides the few states that fail most, and DORA applies its metrics per application or service. Per root module, a rising rate points at the state that needs tests, policy or a smaller scope." },
      { q: "How can a policy catch a resource replacement in the plan JSON?", a: "Replacements appear as `[\"delete\", \"create\"]` or `[\"create\", \"delete\"]` in `change.actions`, so a rule that looks for `delete` catches both deletions and replacements." },
    ],
    incidents: ["rust-lang-2023-crates-dns-terraform", "circleci-2025-manual-waf-rule-outage"],
    sources: [
      { title: "Terraform: running Terraform in automation", url: "https://developer.hashicorp.com/terraform/tutorials/automation/automate-terraform" },
      { title: "Terraform: plan command", url: "https://developer.hashicorp.com/terraform/cli/commands/plan" },
      { title: "Terraform: apply command", url: "https://developer.hashicorp.com/terraform/cli/commands/apply" },
      { title: "Terraform: JSON output format", url: "https://developer.hashicorp.com/terraform/internals/json-format" },
      { title: "DORA: software delivery performance metrics", url: "https://dora.dev/guides/dora-metrics/" },
      { title: "Atlantis: server-side repo config", url: "https://www.runatlantis.io/docs/server-side-repo-config" },
      { title: "Atlantis: locking", url: "https://www.runatlantis.io/docs/locking" },
      { title: "Atlantis: command requirements", url: "https://www.runatlantis.io/docs/command-requirements" },
      { title: "Atlantis: policy checking", url: "https://www.runatlantis.io/docs/policy-checking" },
      { title: "Atlantis: repo-level atlantis.yaml", url: "https://www.runatlantis.io/docs/repo-level-atlantis-yaml" },
      { title: "HCP Terraform: UI and VCS-driven run workflow", url: "https://developer.hashicorp.com/terraform/cloud-docs/workspaces/run/ui" },
      { title: "HCP Terraform: dynamic provider credentials", url: "https://developer.hashicorp.com/terraform/cloud-docs/dynamic-provider-credentials" },
      { title: "GitHub Actions: OIDC in AWS", url: "https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws" },
      { title: "Sentinel: enforcement levels", url: "https://developer.hashicorp.com/sentinel/docs/concepts/enforcement-levels" },
      { title: "Conftest", url: "https://www.conftest.dev/" },
      { title: "Checkov: Terraform plan scanning", url: "https://www.checkov.io/7.Scan%20Examples/Terraform%20Plan%20Scanning.html" },
      { title: "Trivy: misconfiguration scanning", url: "https://trivy.dev/docs/latest/scanner/misconfiguration/" },
      { title: "Infracost docs", url: "https://www.infracost.io/docs/" },
      { title: "GitHub: risks and mitigations for Copilot cloud agent", url: "https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations" },
      { title: "GitHub: Copilot code review", url: "https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review" },
    ],
  },
];
