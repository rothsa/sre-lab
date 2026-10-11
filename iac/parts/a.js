// Chapters 1-4: state, modules, environments, the PR workflow. Spec format: see ../../k8s/README.md.
export const CHAPTERS = [
  {
    id: "state",
    n: 1,
    title: "Remote state, locking and blast radius",
    question: "Where should Terraform state live for a team, what protects it from two writers and from leaking secrets, and how do you split it so one mistake can't reach everything?",
    view: [920, 420],
    groups: [
      { id: "g-backend", label: "Backend: S3 bucket acme-tfstate-prod", x: 170, y: 10, w: 610, h: 200 },
      { id: "g-split", label: "Split by lifecycle and owner", x: 170, y: 250, w: 740, h: 160 },
    ],
    nodes: [
      { id: "runner", label: "CI runner", sub: "plan / apply", kind: "actor", x: 10, y: 70, w: 130, h: 50 },
      { id: "lock", label: "Lock file", sub: "<key>.tflock", x: 190, y: 40, w: 150, h: 50 },
      { id: "state", label: "State object", sub: "<key>", kind: "store", x: 400, y: 40, w: 160, h: 50 },
      { id: "versions", label: "Old versions", sub: "bucket versioning", kind: "store", x: 620, y: 40, w: 150, h: 50 },
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
      { id: "e-refresh", from: "runner", to: "cloud", via: [[75, 225], [855, 225]], label: "refresh, apply", labelAt: [470, 222] },
      { id: "e-unlock", from: "operator", to: "lock", dashed: true },
      { id: "e-out", from: "netst", to: "ssm", label: "publishes", labelAt: [355, 287] },
      { id: "e-in", from: "ssm", to: "appst", label: "reads" },
      { id: "e-rs", from: "appst", to: "netst", via: [[695, 380], [250, 380]], dashed: true, label: "remote_state: all", labelAt: [470, 377] },
    ],
    steps: [
      { text: "One plan or apply against a remote backend, top half, and the same infrastructure split into small states that share values, bottom half. Press Next to follow a run." },
      { text: "The `backend` block tells `terraform init` where state lives: an S3 object here, or GCS or Azure Blob. HCP Terraform uses a `cloud` block instead. Without one, state is a local plaintext file, which a team can't share or lock.", on: ["runner", "state"] },
      { text: "Before any operation that can write state, Terraform takes a lock. With `use_lockfile = true` the S3 backend writes `<key>.tflock` next to the state. A second run fails, or retries for `-lock-timeout`. DynamoDB locking is deprecated.", on: ["runner", "lock"], flow: ["e-lock"] },
      { text: "Holding the lock, it reads the state and refreshes: it asks the cloud APIs for the current attributes of every object in that state, then compares them with configuration.", on: ["runner", "state", "cloud"], flow: ["e-read", "e-refresh"] },
      { text: "State maps each resource address to a real object ID with all its attributes, including database passwords and generated keys in plaintext. `sensitive = true` hides them from CLI output only, not from state or plan files. Ephemeral resources and write-only arguments (1.11+, like `password_wo`) keep it out entirely.", on: ["state"] },
      { text: "So state is a secret. Turn on `encrypt` and a `kms_key_id`, limit who may read the state key and the KMS key, and keep audit logs of reads. OpenTofu can also encrypt state and plan files itself, with keys from KMS or OpenBao.", on: ["state", "kms"], flow: ["e-kms"] },
      { text: "Apply writes a new state object and releases the lock. With bucket versioning on, the previous object stays as an older version, so a deleted or corrupted state can be restored. HashiCorp strongly recommends versioning for this.", on: ["state", "versions", "lock"], flow: ["e-ver"] },
      { text: "A runner killed mid-apply can leave a stale lock. `terraform force-unlock LOCK_ID` removes it; the lock ID in the error acts as a nonce. Only release a lock whose holder is truly dead, or two writers corrupt state.", on: ["operator", "lock"], flow: ["e-unlock"] },
      { text: "Blast radius is set by what shares a state. Split by lifecycle and owner: the network changes rarely and belongs to the platform team, apps change daily. Each state gets its own key, lock and IAM grant.", on: ["netst", "appst"] },
      { text: "Share values by publishing them. The network root writes `aws_ssm_parameter`; the app root reads it with a data source. The app team gets that one value, not the network state.", on: ["netst", "ssm", "appst"], flow: ["e-out", "e-in"] },
      { text: "`terraform_remote_state` returns only outputs, but the reader needs read access to the whole state snapshot, secrets included. HashiCorp recommends a separate store, or `tfe_outputs` on HCP Terraform.", on: ["appst", "netst"], flow: ["e-rs"] },
      { text: "Other tools: Pulumi keeps state in Pulumi Cloud or your own bucket and encrypts secret values per stack. CloudFormation has no state file for you to manage; the stack lives in the service. Crossplane's state is its objects in the Kubernetes API.", on: ["state"] },
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
    say30: "State maps every resource to a real object and holds all its attributes, including secrets in plaintext, so I keep it in a remote backend like S3 or HCP Terraform with locking, encryption with a KMS key, tight IAM, access logs and bucket versioning for recovery. On S3 that's now `use_lockfile`; DynamoDB locking is deprecated. `force-unlock` is only for a lock whose holder is definitely dead. Then I split state by lifecycle and ownership, so the network, shared services and each app have their own state, lock and access. Values cross between states through published outputs, like an SSM parameter read with a data source, rather than `terraform_remote_state`, which needs read access to the whole upstream state.",
    gotchas: [
      "`sensitive = true` hides a value in CLI output only. The value is still in plaintext in state and in saved plan files.",
      "Restoring an older state version after an apply makes Terraform forget objects created since then. They keep running unmanaged until you import them again. After a partial failure, re-running apply is usually the fix, not a restore.",
      "`force-unlock` on a lock held by a live run lets two writers race, and the last one to write state wins. `-lock=false` has the same risk.",
      "`terraform_remote_state` looks like it shares only outputs, but its caller must be able to read the full upstream state.",
    ],
    atScale: [
      "One org-wide state bucket read by every pipeline role means any compromised pipeline can read every secret in every state. Large orgs use a bucket or prefix per account or team, a KMS key per environment with its own key policy, and alerts on state reads by unexpected roles.",
      "Hundreds of states mean hundreds of backend blocks, and a copy-pasted `key` that points two roots at one state corrupts both. Teams generate backend config instead, for example Terragrunt `remote_state` with `path_relative_to_include()` in the key, so each directory gets a unique key.",
      "Runners on spot instances or with hard CI timeouts get killed mid-apply and leave stale locks. Set the CI job timeout above the longest apply, and make `force-unlock` a runbook step: confirm the holding job is dead, unlock with its lock ID, then re-plan.",
      "Many consumers of one producer state turn its outputs into an API that nobody versioned. Publish shared values to SSM, DNS or `tfe_outputs` under stable names, and treat renames like breaking API changes with a deprecation period.",
      "Plan time and API throttling grow with state size. Splitting state and the Stacks option are covered in Terraform, Five Years On; the backend side of that choice is one key, lock and IAM grant per split.",
    ],
    agentic: [
      "Agents that run `terraform plan` or read state through a tool need the same `s3:GetObject` on the state key as the runner, and that grant is read access to every plaintext secret in it. Give each agent its own role scoped to one key and one KMS key, never the launching developer's standing credentials, and include it in the unexpected-reader alerts like any new pipeline.",
      "Whatever an agent reads from state or a saved plan lands in its context, so a `terraform show` run to answer a question can put database passwords into a model provider's transcript. Point agents at published outputs (SSM, `tfe_outputs`) instead of whole state, and avoid pairing state access with untrusted PR text and outbound network, the combination Simon Willison calls the lethal trifecta.",
      "An agent that hits a lock error tends to reach for `force-unlock` or `-lock=false` as the quick fix. The lock is the only thing stopping two writers, so keep both out of the agent's allowed commands; confirming the holding job is dead and choosing the lock ID stays a human runbook step.",
    ],
    quiz: [
      { q: "Two CI jobs start `terraform apply` on the same S3 state with `use_lockfile = true`. What happens?", a: "The first creates `<key>.tflock` and proceeds. The second can't get the lock and fails, or keeps retrying until `-lock-timeout` runs out." },
      { q: "Why is giving every team read access to the network state a security problem, even if they only need the VPC ID?", a: "State stores every attribute in plaintext, including secrets. Read access to the state is read access to all of it. Publish the VPC ID to SSM or similar instead." },
      { q: "Someone deleted the state object in S3. How do you recover?", a: "With bucket versioning on, restore the previous version of the object. Without versioning you would have to rebuild state by importing every resource." },
    ],
    incidents: [],
    sources: [
      { title: "Terraform: S3 backend", url: "https://developer.hashicorp.com/terraform/language/backend/s3" },
      { title: "Terraform: GCS backend", url: "https://developer.hashicorp.com/terraform/language/backend/gcs" },
      { title: "Terraform: backend block", url: "https://developer.hashicorp.com/terraform/language/backend" },
      { title: "Terraform: purpose of state", url: "https://developer.hashicorp.com/terraform/language/state/purpose" },
      { title: "Terraform: state locking", url: "https://developer.hashicorp.com/terraform/language/state/locking" },
      { title: "Terraform: force-unlock command", url: "https://developer.hashicorp.com/terraform/cli/commands/force-unlock" },
      { title: "Terraform: sensitive data in state", url: "https://developer.hashicorp.com/terraform/language/manage-sensitive-data" },
      { title: "Terraform: terraform_remote_state data source", url: "https://developer.hashicorp.com/terraform/language/state/remote-state-data" },
      { title: "OpenTofu: state and plan encryption", url: "https://opentofu.org/docs/language/state/encryption/" },
      { title: "Terragrunt: state backend", url: "https://docs.terragrunt.com/features/units/state-backend/" },
      { title: "Pulumi: state and backends", url: "https://www.pulumi.com/docs/iac/concepts/state-and-backends/" },
      { title: "Google SRE: AI in SRE, engineering reliable operations", url: "https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/" },
      { title: "Simon Willison: the lethal trifecta", url: "https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/" },
    ],
  },
  {
    id: "modules",
    n: 2,
    title: "Module design and versioning",
    question: "What makes a good Terraform module, and how do you publish, pin and upgrade shared modules across hundreds of repositories without breaking them?",
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
      { text: "The life of a shared module: its owner releases a version, a root module pins it, and a bot proposes upgrades. Press Next." },
      { text: "The root module is the directory where you run `plan` and `apply`; it owns the backend and the state. Child modules are called from it with `module` blocks: values go in as variables and come back as outputs.", on: ["rootcfg", "child"], flow: ["e-call"] },
      { text: "A good module is a concept from your architecture, such as a VPC with its subnets and routes. HashiCorp advises against thin wrappers around one resource. The opposite failure is a god module holding a whole environment, where every change plans everything.", on: ["child"] },
      { text: "Keep the tree flat: roots compose modules, and a module receives what it depends on, such as `vpc_id`, as input instead of creating it or looking it up. That keeps modules small and reusable.", on: ["rootcfg", "child"], flow: ["e-call"] },
      { text: "The owner releases by pushing a semver Git tag with a changelog entry. With tag-based publishing the private registry imports each new tag as a version; tags that aren't semver are ignored.", on: ["author", "tag", "registry"], flow: ["e-tag", "e-pub"] },
      { text: "The root pins it: registry sources take a `version` argument, Git sources a `?ref=` tag or commit SHA. The dependency lock file does not cover modules, and `init` takes the newest version a range allows, so pin exactly in roots.", on: ["rootcfg", "registry", "child"], flow: ["e-fetch"] },
      { text: "Provider configuration lives only in root modules and is passed down, by inheritance or a `providers` map. A module with its own `provider` block can't use `count`, `for_each` or `depends_on`, and removing it removes the config needed to destroy its resources.", on: ["prov", "child"], flow: ["e-prov"] },
      { text: "Every module still declares `required_providers`. A shared module sets only a minimum (`>= 5.0`); the root sets `~>` bounds, and `.terraform.lock.hcl` records the exact provider version and hashes (see Terraform, Five Years On).", on: ["child", "prov", "lockf"], flow: ["e-hash"] },
      { text: "Renovate watches the registry and Git tags and opens a PR that bumps the version. It can also bump `required_providers` and maintain the lock file. The PR runs a plan, so the upgrade's effect is reviewed before it applies.", on: ["renovate", "registry", "rootcfg"], flow: ["e-poll", "e-pr"] },
      { text: "Other roots stay on v1.9.x until they choose to move. That is the point of versions: a breaking change goes in a new major version, and the owner keeps patching the old major for a published deprecation window.", on: ["registry", "others"], flow: ["e-old"] },
      { text: "Other tools: Pulumi components and AWS CDK constructs are classes shipped as language packages (npm, PyPI) and versioned that way. Crossplane turns a module into an API: an XRD defines the schema and a Composition maps it to managed resources.", on: ["child", "registry"] },
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
    say30: "A good module is one architectural concept, like a VPC or a service, with clear inputs and outputs. It takes its dependencies as inputs, contains no provider blocks, and declares only minimum provider versions. I avoid thin wrappers around one resource and god modules that hold a whole environment. Shared modules are released with semver tags and changelogs into a private registry, and root modules pin exact versions, because the lock file covers providers but not modules. Renovate or Dependabot opens the upgrade PRs and the plan on each PR shows what the upgrade changes. Breaking changes get a major version, upgrade notes with `moved` blocks, and a deprecation window for the old major.",
    gotchas: [
      "`.terraform.lock.hcl` pins providers only. A module constraint like `~> 2.3` silently picks up 2.4.0 on the next `init -upgrade` or fresh checkout.",
      "A `provider` block inside a child module blocks `count`, `for_each` and `depends_on` on that module, and deleting the module call also deletes the provider config Terraform needs to destroy its resources.",
      "A shared module that pins `version = \"~> 4.0\"` for a provider stops every root that uses it from moving to 5.x. Shared modules should declare minimums only.",
      "Renaming resources inside a module is a breaking change for every caller unless the release adds `moved` blocks (see Terraform, Five Years On).",
    ],
    atScale: [
      "Hundreds of repositories pin one shared module and nobody upgrades by hand, so versions spread across years. Renovate or Dependabot opens bump PRs everywhere, with patch and minor bumps grouped, and teams auto-merge when the plan is empty.",
      "A buggy release reaches every consumer that uses a version range on its next `init`. Exact pins plus bot PRs make each consumer's plan show the change first; a release that destroys or replaces resources then shows up in review instead of in production.",
      "Breaking changes with hundreds of callers need a process: a new major version, upgrade notes with `moved` blocks, the old major patched through a deprecation window, and a scan of all repos to see who still pins it before support ends.",
      "Repo layout: HashiCorp's style guide suggests one repository per module so each is versioned and access-controlled on its own. Multi-module repos work with tag prefixes such as `vpc-v2.3.0`, which the HCP Terraform registry can strip.",
      "Ownership: a module with no owner rots while everyone depends on it. Large orgs put each module under CODEOWNERS, publish the private registry as the catalogue, and treat a module's inputs and outputs as a public API.",
    ],
    agentic: [
      "Agents now write the upgrade, not just the version bump: across hundreds of consumer repos they add `moved` blocks, rename inputs and fix the failing plan. The consumer's plan is still what a human reads, and the new failure is a plan made empty by the wrong means, such as an added `ignore_changes` or a loosened pin, so auto-merge on an empty plan should also require that only the `version` line changed.",
      "Module READMEs, variable descriptions and the private registry are now context agents read when choosing a module, and the Terraform MCP server (GA since June 2026) serves registry and private-module data to them. The module owner keeps those descriptions accurate and the catalogue curated, because a vague description now produces misused inputs in many repos at once (see Agentic Engineering, Drawn on context engineering).",
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
      { title: "AWS CDK: constructs", url: "https://docs.aws.amazon.com/cdk/v2/guide/constructs.html" },
      { title: "Crossplane: compositions", url: "https://docs.crossplane.io/latest/composition/compositions/" },
      { title: "Terraform MCP server overview", url: "https://developer.hashicorp.com/terraform/mcp-server" },
      { title: "DORA: impact of generative AI in software development", url: "https://dora.dev/ai/gen-ai-report/report/" },
      { title: "Google Cloud: announcing the 2025 DORA report", url: "https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report" },
    ],
  },
  {
    id: "environments",
    n: 3,
    title: "Laying out environments",
    question: "How do you lay out dev, staging and prod so they stay isolated but comparable, and why aren't Terraform CLI workspaces the answer?",
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
      { text: "Top: one directory per environment, each applying to its own account. Bottom: CLI workspaces, the layout to avoid for environments. Press Next." },
      { text: "Every environment calls the same released module. Only inputs differ: instance sizes, counts, CIDR ranges, feature switches. If prod needs different code, that is a module input, not a fork.", on: ["modsrc", "devdir", "stgdir", "proddir"], flow: ["e-first"] },
      { text: "Each environment is its own root directory with its own backend key, provider role and variable values. HashiCorp's style guide recommends this layout when you aren't using HCP Terraform workspaces.", on: ["devdir", "stgdir", "proddir"] },
      { text: "Each environment also gets its own cloud account (or GCP project). An AWS account is an IAM boundary: nothing crosses it unless explicitly allowed, and each account has its own quotas and bill.", on: ["devdir", "devacct", "stgacct", "prodacct"], flow: ["e-d", "e-s", "e-pa"] },
      { text: "Promotion: bump the module ref in dev and apply, then make the same bump in staging, then prod, each in its own PR. Prod sits on v2.3.0 until staging has run v2.4.0. The diff between environment directories should be only version and inputs.", on: ["devdir", "stgdir", "proddir"], flow: ["e-p1", "e-p2"] },
      { text: "Terragrunt removes the copy-paste. A parent `root.hcl` generates each unit's backend, keyed by `path_relative_to_include()`, plus the provider block; each unit sets a module `source` with `?ref=` and its `inputs`. `terragrunt run --all` runs every unit below a directory.", on: ["tg", "devdir"], flow: ["e-gen"] },
      { text: "CLI workspaces instead keep one directory and switch with `terraform workspace select`. Each workspace's state is stored in the same backend, under `env:/<name>/<key>` on S3.", on: ["wsdir", "creds", "wsstate"], flow: ["e-ws1", "e-ws2"] },
      { text: "That is why HashiCorp calls CLI workspaces unsuitable for isolating stages or teams: one backend, one set of credentials and access controls. A wrong selected workspace applies to prod. They fit short-lived copies, like testing a branch.", on: ["creds", "wsstate"], flow: ["e-ws2"] },
      { text: "HCP Terraform workspaces are different: each has its own variables, credentials and permissions. HashiCorp recommends one workspace per component per environment, such as `billing-app-prod`, never a whole environment in one.", on: ["devdir", "stgdir", "proddir"] },
      { text: "Accounts themselves are code at scale. With AWS Account Factory for Terraform, an account request file pushed to Git makes Control Tower create the account, then pipelines apply global and per-account customizations.", on: ["aft", "devacct", "stgacct", "prodacct"], flow: ["e-aft"] },
      { text: "Other tools: Pulumi gives each environment a stack with its own `Pulumi.<stack>.yaml` config, and a `StackReference` reads another stack's outputs. The rule is the same: one program, many isolated instances.", on: ["devdir", "stgdir", "proddir"] },
      { text: "Keep environments comparable: same module versions within a short window, same topology at smaller size, and a scheduled `plan -detailed-exitcode` in each one. Exit code 2 means live infrastructure no longer matches the code.", on: ["devacct", "stgacct", "prodacct"] },
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
    say30: "I give each environment its own root directory, its own state and its own cloud account, all calling the same versioned modules, so the only differences are variable values. Promotion is a PR that moves the same module version from dev to staging to prod. I don't use CLI workspaces for environments: they share one backend and one set of credentials, so HashiCorp says they're not an isolation mechanism, and a wrong `workspace select` hits prod. Terragrunt or generated configs remove the duplication, HCP Terraform workspaces work if each one has its own credentials, and at scale accounts come from an account factory. Scheduled plans catch drift and keep environments comparable.",
    gotchas: [
      "CLI workspaces and HCP Terraform workspaces share a name, not a design. HCP workspaces each have their own variables, credentials and permissions; CLI workspaces share one backend and whatever credentials you run with.",
      "If dev, staging and prod use different code, staging tests nothing. Differences belong in inputs and module versions, never in copied and edited resource blocks.",
      "Environments in one account share IAM, quotas and blast radius, whatever the directory layout. Directories isolate state; accounts isolate access.",
      "A partial `backend` block filled in with `-backend-config` at `init` is easy to get wrong in CI. Terraform backend blocks can't use variables (OpenTofu 1.8+ allows static variables and locals there), so generate them or keep them in each environment's directory.",
    ],
    atScale: [
      "Hundreds of accounts can't be set up by hand. Teams vend them with AWS Account Factory for Terraform or similar, where a Git push of an account request creates the account and applies baseline customizations, so every account starts with the same roles, logging and guardrails.",
      "Hand-maintained environment directories drift apart over time. Teams generate them instead: Terragrunt explicit stacks (`terragrunt.stack.hcl`) for many units that differ only in values, or templates rendered from one catalogue, so a new region or tenant is a few lines of input.",
      "Staging rarely matches prod's scale or history, so a change passes staging and fails in prod. Keep the topology the same at smaller size, feed flags as inputs, and roll prod changes to one prod-like account or region before the rest.",
      "Version skew: when prod lags dev by many module versions, each prod promotion becomes a large, risky jump. Scan the repo for the version each environment pins, alert when skew passes a set age, and promote small increments often.",
      "Scheduled drift plans across thousands of roots compete for API quota. Stagger them per account and region, and look at roots with exit code 2 first.",
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
      { title: "Pulumi: stacks", url: "https://www.pulumi.com/docs/iac/concepts/stacks/" },
      { title: "Google SRE: AI in SRE, engineering reliable operations", url: "https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/" },
    ],
  },
  {
    id: "pr-workflow",
    n: 4,
    title: "Plan in CI, review, apply from a pipeline",
    question: "Walk me through how a Terraform change should reach production on a team: who runs plan, what gets reviewed, what enforces policy, and what actually runs apply?",
    view: [940, 400],
    groups: [
      { id: "g-runner", label: "Runner: Atlantis, HCP Terraform, Spacelift", x: 160, y: 150, w: 770, h: 235 },
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
    ],
    edges: [
      { id: "e-local", from: "dev", to: "cloud", via: [[70, 20], [850, 20]], dashed: true, label: "no local apply", labelAt: [450, 18] },
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
      { text: "The whole path from a pull request to a production change. The only identity that can change prod is the pipeline. Press Next." },
      { text: "No local applies to prod. Engineers have read access at most, so a laptop with stale code or the wrong workspace can't change production. Everything goes through a PR.", on: ["dev", "cloud"], flow: ["e-local"] },
      { text: "Opening the PR triggers an autoplan for each project whose files changed (`when_modified` in Atlantis). Atlantis locks that directory and workspace; another PR that plans it gets an error linking to this one.", on: ["dev", "pr", "lock"], flow: ["e-open", "e-autoplan"] },
      { text: "The runner gets cloud credentials through OIDC: the CI job's token is exchanged with STS for temporary role credentials. The role's trust policy pins the repo, branch or environment in the `sub` claim. No static keys anywhere.", on: ["lock", "plan", "oidc", "cloud"], flow: ["e-l2p", "e-assume", "e-creds"] },
      { text: "`terraform plan -out=tfplan` saves the plan. The file holds configuration, state and variables in cleartext, so treat it like state. If apply runs on another machine, archive the whole working directory, including `.terraform`, and restore it at the same absolute path on the same OS and CPU architecture.", on: ["plan", "planfile"], flow: ["e-write"] },
      { text: "`terraform show -json tfplan` turns it into JSON. Policies read `resource_changes[].change.actions`: Conftest rules in Rego, Sentinel or OPA on HCP Terraform, plus scanners like Checkov or Trivy for misconfigurations.", on: ["planfile", "policy"], flow: ["e-json"] },
      { text: "Infracost reads the same plan JSON and estimates the monthly cost change. Plan output, policy results and cost are posted back on the PR as a comment.", on: ["policy", "pr"], flow: ["e-comment"] },
      { text: "The reviewer approves the plan, not just the code diff: a one-line change can replace a database. Atlantis can require `approved`, `mergeable` and `undiverged` before it will apply.", on: ["reviewer", "pr"], flow: ["e-approve"] },
      { text: "Destroys get a stricter gate. Every deletion, including the delete half of a replacement, shows `delete` in `actions`, so a policy can block it until a named owner approves.", on: ["policy", "reviewer"] },
      { text: "Apply runs the saved plan exactly; with a plan file Terraform doesn't prompt and accepts no new planning options such as `-var` or `-target`. Applying a plan invalidates other plans made against the same state, so they must be re-planned.", on: ["planfile", "apply", "cloud"], flow: ["e-apply", "e-change"] },
      { text: "Atlantis applies before merge and releases the lock when the PR merges. HCP Terraform's VCS flow is the reverse: a speculative plan on the PR, then a run when the change merges to the tracked branch, one run at a time per workspace.", on: ["pr", "lock", "apply"] },
      { text: "Other tools follow the same shape: `pulumi preview`, CloudFormation change sets that you view and then execute. Crossplane has no separate plan: once a manifest is applied, its controllers keep reconciling and revert console changes, so review happens on the manifest PR.", on: ["plan", "planfile", "apply"] },
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
    say30: "Nobody applies to prod from a laptop. A PR triggers a plan in CI, which gets short-lived cloud credentials through OIDC and locks that project so other PRs can't plan over it. The plan is saved with `-out`, converted with `show -json`, and checked by policy as code: Conftest or Sentinel rules, misconfiguration scanners and an Infracost estimate, all posted to the PR. A reviewer approves the plan itself, with extra approval for any delete. Then the pipeline applies exactly that saved plan, so what was reviewed is what runs. Atlantis applies before merge; HCP Terraform applies after merge. Either way, the pipeline's role is the only one that can write to prod.",
    gotchas: [
      "Running `terraform apply` without the plan file makes a fresh plan at apply time, which may differ from what was reviewed. Apply the saved plan.",
      "Plan files contain secrets in cleartext. Store them as short-lived, access-controlled CI artifacts, never as public build logs.",
      "Atlantis applies before merge, so `main` can disagree with live infrastructure if a PR is applied and then abandoned. The `undiverged` and `mergeable` requirements reduce this.",
      "Policies on raw `.tf` files miss values that only resolve at plan time, such as module outputs and variables. Check the plan JSON as well.",
    ],
    atScale: [
      "A PR touching a shared module can autoplan hundreds of projects. Narrow it with `when_modified`, cap concurrency (Atlantis `parallel_plan` with `--parallel-pool-size`, default 15), and expect HCP Terraform to queue one run per workspace at a time.",
      "Dependent stacks must apply in order: network, then cluster, then apps. Atlantis has `depends_on` and `execution_order_group` per project; HCP Terraform uses run triggers. Without them, a parallel apply reads outputs that don't exist yet.",
      "Long-lived PRs hold Atlantis locks and block every other change to that directory. Set a policy for stale PRs, use `atlantis unlock` or the UI to free them, and keep projects small so locks cover less.",
      "When applies lag merges, one apply ships several unrelated changes at once, which is how crates.io lost DNS during a certificate swap. Apply each merge promptly and keep every environment's applied commit visible.",
      "Policy across hundreds of repos lives in its own versioned repo. Roll new rules out as advisory, then soft-mandatory (overridable with a recorded override), then hard-mandatory, so a new rule doesn't block every team on day one.",
      "Humans with console write access bypass all of this, as CircleCI found when a role could edit a WAF rule outside Terraform. Remove write access for people and run scheduled drift plans to catch what slips through.",
    ],
    agentic: [
      "Agent identities slot into the plan/apply split: an agent may push a branch, open the PR and read the plan comment, but the OIDC trust policy's `sub` should only ever give its branches the plan role. Copilot cloud agent, for example, pushes only to its own `copilot/` branch (or the PR branch it was asked to update), cannot approve or merge, and the person who asked for the PR cannot approve it.",
      "In Atlantis, once `apply_requirements` are met, anyone who can comment on the PR can run `atlantis apply`, and that includes an agent bot with comment rights. Make `mergeable` with required code-owner review the real gate, and do not count an AI review as approval; Copilot code review, for one, does not count toward required approvals by default.",
      "Policy as code is the guardrail that scales to agent volume: Conftest or Sentinel rules on `resource_changes` check the fortieth agent PR of the day as strictly as the first, when human reviewers start to rubber-stamp. Keep the policy repo under its own CODEOWNERS and agents out of the `approve_policies` owners, or an agent can relax a rule in the same change it is checked against.",
    ],
    quiz: [
      { q: "Why apply a saved plan file instead of running `terraform apply` again after review?", a: "A fresh apply re-plans against the current state and code, which can differ from what was reviewed. A saved plan applies exactly the reviewed actions, and Terraform invalidates it if another apply changes the state first." },
      { q: "How does a CI pipeline get AWS credentials without storing access keys?", a: "OIDC: the CI provider issues a signed token for the job, and AWS STS exchanges it for temporary role credentials. The role's trust policy restricts which repo, branch or environment may assume it." },
      { q: "How can a policy catch a resource replacement in the plan JSON?", a: "Replacements appear as `[\"delete\", \"create\"]` or `[\"create\", \"delete\"]` in `change.actions`, so a rule that looks for `delete` catches both deletions and replacements." },
    ],
    incidents: ["rust-lang-2023-crates-dns-terraform", "circleci-2025-manual-waf-rule-outage"],
    sources: [
      { title: "Terraform: running Terraform in automation", url: "https://developer.hashicorp.com/terraform/tutorials/automation/automate-terraform" },
      { title: "Terraform: plan command", url: "https://developer.hashicorp.com/terraform/cli/commands/plan" },
      { title: "Terraform: apply command", url: "https://developer.hashicorp.com/terraform/cli/commands/apply" },
      { title: "Terraform: JSON output format", url: "https://developer.hashicorp.com/terraform/internals/json-format" },
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
      { title: "AWS CloudFormation: change sets", url: "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html" },
      { title: "Crossplane: managed resources", url: "https://docs.crossplane.io/latest/managed-resources/managed-resources/" },
      { title: "GitHub: risks and mitigations for Copilot cloud agent", url: "https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations" },
      { title: "GitHub: Copilot code review", url: "https://docs.github.com/en/copilot/concepts/agents/code-review" },
    ],
  },
];
