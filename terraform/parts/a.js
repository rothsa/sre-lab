// Chapters 1-4: provider and version governance, moved/removed, import blocks, conditions and checks.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `agentic`, see ../../drawn/README.md).
// No `atScale` box: scale is the main thread of each chapter's steps.
export const CHAPTERS = [
  {
    id: "one-point-oh",
    n: 1,
    title: "Provider and version governance across hundreds of root modules",
    question: "Hundreds of root modules pick their own Terraform and provider versions. How do you keep the fleet current and reproducible?",
    view: [900, 500],
    nodes: [
      { id: "dev", label: "Platform team", sub: "version policy", kind: "actor", x: 10, y: 55, w: 140, h: 56 },
      { id: "config", label: "Configuration", sub: "required_version\nrequired_providers", x: 180, y: 50, w: 180, h: 66 },
      { id: "init", label: "terraform init", sub: "selects versions", x: 410, y: 55, w: 150, h: 56 },
      { id: "lock", label: ".terraform.lock.hcl", sub: "version + hashes", kind: "store", x: 640, y: 55, w: 190, h: 56 },
      { id: "mirror", label: "Mirror + cache", sub: "your network", x: 10, y: 200, w: 150, h: 56 },
      { id: "registry", label: "Origin registry", sub: "signed checksums", x: 410, y: 200, w: 170, h: 56 },
      { id: "git", label: "Git repo", sub: "lock file reviewed", kind: "store", x: 640, y: 200, w: 190, h: 56 },
      { id: "upgrade", label: "Upgrade bot", sub: "PR per root module", kind: "actor", x: 200, y: 330, w: 170, h: 56 },
      { id: "plock", label: "providers lock", sub: "-platform=...", x: 410, y: 330, w: 150, h: 56 },
      { id: "ci", label: "CI runner", sub: "pinned CLI image", x: 640, y: 330, w: 190, h: 56 },
      { id: "skew", label: "Version skew", sub: "per root module", kind: "store", x: 640, y: 430, w: 190, h: 56 },
    ],
    edges: [
      { id: "e-edit", from: "dev", to: "config" },
      { id: "e-read", from: "config", to: "init", label: "constraints", labelAt: [385, 45] },
      { id: "e-fetch", from: "init", to: "registry", label: "download+verify", labelAt: [545, 160] },
      { id: "e-record", from: "init", to: "lock", label: "records" },
      { id: "e-mirror", from: "mirror", to: "init", label: "packages" },
      { id: "e-commit", from: "lock", to: "git", label: "commit" },
      { id: "e-ci", from: "git", to: "ci", label: "checkout" },
      { id: "e-verify", from: "ci", to: "registry", label: "checks hashes", labelPos: 0.12 },
      { id: "e-plock-reg", from: "plock", to: "registry", label: "sums", labelAt: [455, 300] },
      { id: "e-plock-lock", from: "plock", to: "lock", label: "adds hashes", via: [[600, 358], [600, 140]], labelAt: [600, 300] },
      { id: "e-upgrade", from: "upgrade", to: "init", label: "init -upgrade", labelPos: 0.3 },
      { id: "e-skew", from: "ci", to: "skew" },
    ],
    steps: [
      { text: "Version governance for a fleet: a policy says which versions are allowed, each root records what it picked, bots move roots forward, and a fleet view shows who lags. Press Next." },
      { text: "Set the policy centrally. Roots pin `required_version` and a `~>` provider range such as `~> 5.0`. Shared modules declare only minimums such as `>= 5.0`, so one module never forces every consumer to upgrade at once.", on: ["dev", "config", "init"], flow: ["e-edit", "e-read"] },
      { text: "Pin the CLI in CI images too. Terraform 1.0 (8 June 2021) promised later 1.x releases keep config and workflow working, but providers sit outside that promise, and state written by a newer 1.x may not be readable by an older one. Upgrade forward only.", on: ["config", "ci"] },
      { text: "`terraform init` picks the newest provider version the constraints allow, checks it against the registry's checksums, and records version and hashes in `.terraform.lock.hcl` (since 0.14). Modules are not locked; pin those exactly.", on: ["init", "registry", "lock"], flow: ["e-fetch", "e-record"] },
      { text: "Commit the lock file. CI then reuses the recorded version and refuses any package whose hash doesn't match, which is trust on first use. A provider bump becomes a reviewed diff instead of a silent change.", on: ["lock", "git", "ci", "registry"], flow: ["e-commit", "e-ci", "e-verify"] },
      { text: "Hundreds of roots drift months apart if upgrades are manual. A bot opens one PR per root (Renovate updates `required_providers`, `required_version` and the lock file), each planned with a full refresh, and they roll out in waves: sandbox, non-prod, prod.", on: ["upgrade", "init", "lock"], flow: ["e-upgrade", "e-record"] },
      { text: "Lock files made on one machine break a mixed fleet of x86 and ARM runners and macOS laptops. Generate them in CI with `terraform providers lock` and a fixed `-platform` list, so every entry has hashes for every runner.", on: ["plock", "registry", "lock"], flow: ["e-plock-reg", "e-plock-lock"] },
      { text: "Runners install from your own mirror: a `provider_installation` block in the CLI config (set with `TF_CLI_CONFIG_FILE`) points `init` at a `network_mirror` and drops `direct`, which also serves air-gapped accounts. Mirror installs record hashes only for the runner's own platform, so lock files come from `providers lock`.", on: ["mirror", "init"], flow: ["e-mirror"] },
      { text: "Every `init` downloads providers again. A `plugin_cache_dir` on runners cuts download time and registry traffic; leave `plugin_cache_may_break_dependency_lock_file` unset so the cache still honors lock hashes.", on: ["mirror", "ci"] },
      { text: "Measure skew: record the CLI and provider versions each root resolved, and alert when a root falls a set age or a major version behind. HCP Terraform's Explorer lists versions in use across an org. Jumping several versions at once is where the surprises are, as ZenML found with old EKS modules.", on: ["ci", "skew"], flow: ["e-skew"] },
    ],
    code: [
      { lang: "hcl", label: "versions.tf", src: `terraform {
  required_version = ">= 1.5, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}` },
      { lang: "bash", label: "multi-platform lock", src: `# record hashes for every platform you run on
terraform providers lock \\
  -platform=linux_amd64 \\
  -platform=linux_arm64 \\
  -platform=darwin_arm64

# deliberate upgrade, then review the diff
terraform init -upgrade
git diff .terraform.lock.hcl` },
    ],
    codeNote: "Constraints say what is allowed; the lock file says what was chosen. Both belong in Git.",
    say30: "I treat versions as fleet policy. Roots pin `required_version` and bounded provider ranges, shared modules declare minimums only, and the CLI is pinned in CI images, because Terraform's 1.x promise covers core, not providers. Every root commits `.terraform.lock.hcl`, so CI installs exactly what was reviewed and rejects changed packages. Lock files are generated in CI with `providers lock` for every platform we run, and runners install from our own mirror with a plugin cache. A bot opens one upgrade PR per root module, rolled out in waves, and a fleet view of resolved versions shows which roots lag, so nobody jumps three majors at once.",
    gotchas: [
      "The lock file only covers providers. Modules resolve to the newest version that matches their constraint, so pin module versions exactly.",
      "A provider major version can still break your config, since the 1.x promise covers Terraform core only.",
      "A lock file created from a mirror only holds hashes for that machine's platform. The first CI run on another OS fails with a checksum error until you run `terraform providers lock -platform=...`.",
    ],
    agentic: [
      "Models trained months ago can suggest provider versions that are stale or never shipped, and a confident `version` constraint reads fine in review. The Terraform MCP server's `get_latest_provider_version` tool lets an agent ask the registry instead of recalling, but a human still checks what `terraform init` actually resolved in `.terraform.lock.hcl`.",
      "An agent bumping providers is a faster lock-file bot: it should run `terraform providers lock` with the CI `-platform` list and open one PR per root module. The reviewer still reads the provider CHANGELOG between the two versions, because lock hashes prove the download is authentic, not that the upgrade is safe.",
      "A checksum mismatch is the supply-chain check working, so an agent must not \"fix\" it by deleting `.terraform.lock.hcl` or running `init -upgrade`. Make that a stop-and-ask-a-human event in the agent's rules (see Agentic Engineering).",
    ],
    quiz: [
      { q: "What is the difference between `required_providers` and `.terraform.lock.hcl`?", a: "`required_providers` declares the allowed source and version range. The lock file records the exact version `init` chose plus checksums, so future runs reuse it until someone runs `init -upgrade`." },
      { q: "CI fails with a provider checksum error after a developer on a Mac committed a new lock file. Why, and how do you fix it?", a: "The provider was installed from a mirror or cache, so only darwin hashes were recorded. Run `terraform providers lock` with `-platform` for each OS and architecture and commit the result." },
      { q: "Half your root modules are two AWS provider majors behind. How do you catch up safely?", a: "One bot PR per root module, one major at a time, in waves from sandbox to prod. Each PR's plan shows what the upgrade changes, and the reviewer reads the provider changelog between the two versions." },
    ],
    incidents: ["zenml-2025-eks-upgrade-iam-regression"],
    sources: [
      { title: "Renovate: Terraform manager", url: "https://docs.renovatebot.com/modules/manager/terraform/" },
      { title: "HCP Terraform: explorer", url: "https://developer.hashicorp.com/terraform/cloud-docs/workspaces/explorer" },
      { title: "Terraform v1.0 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.0/CHANGELOG.md" },
      { title: "Terraform v0.14 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v0.14/CHANGELOG.md" },
      { title: "Terraform v1.x compatibility promises", url: "https://developer.hashicorp.com/terraform/language/v1-compatibility-promises" },
      { title: "Dependency lock file", url: "https://developer.hashicorp.com/terraform/language/files/dependency-lock" },
      { title: "terraform providers lock", url: "https://developer.hashicorp.com/terraform/cli/commands/providers/lock" },
      { title: "CLI configuration file", url: "https://developer.hashicorp.com/terraform/cli/config/config-file" },
      { title: "Terraform MCP server: tools reference", url: "https://developer.hashicorp.com/terraform/mcp-server/reference" },
      { title: "Terraform MCP server", url: "https://developer.hashicorp.com/terraform/mcp-server" },
    ],
  },
  {
    id: "moved-removed",
    n: 2,
    title: "Refactoring with moved and removed blocks",
    question: "You rename resources in a module that hundreds of roots use, or split a big state. How do you do it without replacements or hand-edited state?",
    view: [900, 460],
    nodes: [
      { id: "newcfg", label: "New address", sub: "module.logs.this", x: 10, y: 40, w: 170, h: 56 },
      { id: "movedb", label: "moved block", sub: "from old, to new", x: 10, y: 150, w: 170, h: 56 },
      { id: "removedb", label: "removed block", sub: "destroy = false", x: 10, y: 260, w: 170, h: 56 },
      { id: "statemv", label: "state mv / rm", sub: "CLI, no plan", kind: "actor", x: 10, y: 380, w: 170, h: 56 },
      { id: "consumer", label: "Old consumer", sub: "upgrading from v1", kind: "actor", x: 300, y: 30, w: 160, h: 56 },
      { id: "plan", label: "terraform plan", sub: "matches addresses", x: 300, y: 150, w: 160, h: 56 },
      { id: "apply", label: "terraform apply", sub: "writes state", x: 300, y: 300, w: 160, h: 56 },
      { id: "replace", label: "Replace", sub: "destroy + create", x: 580, y: 30, w: 170, h: 56 },
      { id: "state", label: "State", sub: "address to object", kind: "store", x: 580, y: 150, w: 170, h: 56 },
      { id: "infra", label: "Real bucket", sub: "untouched", kind: "pod", x: 580, y: 300, w: 170, h: 56 },
    ],
    edges: [
      { id: "e-new", from: "newcfg", to: "plan", label: "declares" },
      { id: "e-moved", from: "movedb", to: "plan", label: "maps old→new" },
      { id: "e-removed", from: "removedb", to: "plan", label: "forget" },
      { id: "e-consumer", from: "consumer", to: "plan", label: "upgrades", labelAt: [430, 128] },
      { id: "e-read", from: "plan", to: "state", label: "reads, diffs", bidir: true },
      { id: "e-replace", from: "plan", to: "replace", label: "no moved: replace", dashed: true },
      { id: "e-apply", from: "plan", to: "apply", label: "approve" },
      { id: "e-write", from: "apply", to: "state", label: "renames entry" },
      { id: "e-infra", from: "state", to: "infra", label: "tracks" },
      { id: "e-statemv", from: "statemv", to: "state", label: "edits state", dashed: true, via: [[540, 408], [540, 250]], labelAt: [330, 400] },
    ],
    steps: [
      { text: "Config addresses on the left, the plan in the middle, state and real infrastructure on the right. Terraform knows objects only by address, so a refactor in a shared module reaches every root that calls it. Press Next." },
      { text: "Rename `aws_s3_bucket.logs` or move it into a module with nothing else, and every caller's plan sees an old address with no config and a new address with no object. It proposes destroy and create.", on: ["newcfg", "plan", "replace"], flow: ["e-new", "e-replace"] },
      { text: "Before 1.1 the fix was `terraform state mv`, run by hand outside any plan, once per root module. With hundreds of callers, that never happens everywhere.", on: ["statemv", "state"], flow: ["e-statemv"] },
      { text: "Terraform 1.1.0 (December 08, 2021) added `moved` blocks. The refactor ships inside the module, so it applies itself on each team's next plan, which reports a move and no destroy.", on: ["movedb", "plan", "state"], flow: ["e-moved", "e-read"] },
      { text: "Apply rewrites the state entry to the new address. The real bucket is never touched: same ID, same data.", on: ["apply", "state", "infra"], flow: ["e-apply", "e-write", "e-infra"] },
      { text: "The same block handles adding `count` or `for_each`, renaming module calls and moving into child modules. You can't move a managed resource to a `data` block.", on: ["movedb", "newcfg", "plan"], flow: ["e-new", "e-moved"] },
      { text: "Consumers upgrade at different speeds and skip versions. Chain moves (a to b, then b to c) and keep every old `moved` block; deleting one makes old addresses plan as destroy again. Prune only in private modules where every caller has applied.", on: ["consumer", "plan", "movedb"], flow: ["e-consumer", "e-moved"] },
      { text: "Terraform 1.7.0 (January 17, 2024) added `removed` blocks. The default still destroys; `lifecycle { destroy = false }` only drops the object from state, and unlike `terraform state rm` the plan shows it first.", on: ["removedb", "plan", "state"], flow: ["e-removed", "e-read"] },
      { text: "Splitting a big state moves objects between states: `removed` with `destroy = false` in the old one, `import` blocks in the new one. Review both plans before applying either.", on: ["removedb", "apply", "state", "infra"], flow: ["e-apply", "e-write", "e-infra"] },
      { text: "A refactor plan with hundreds of moves can hide one real destroy. Gate CI on `terraform show -json` and fail on any `delete` action you didn't expect.", on: ["plan", "replace"], flow: ["e-replace"] },
    ],
    code: [
      { lang: "hcl", label: "moved.tf", src: `# v2: renamed
moved {
  from = aws_s3_bucket.logs
  to   = aws_s3_bucket.audit_logs
}

# v3: moved into a child module (chained)
moved {
  from = aws_s3_bucket.audit_logs
  to   = module.logs.aws_s3_bucket.this
}` },
      { lang: "hcl", label: "removed.tf", src: `# hand the bucket to another team's stack
removed {
  from = aws_s3_bucket.legacy

  lifecycle {
    destroy = false
  }
}` },
    ],
    codeNote: "Keep both `moved` blocks: a consumer still on v1 follows the chain to the final address in one plan.",
    say30: "Terraform tracks objects by address, so a rename or a move into a module looks like delete plus create in every root that calls it. With hundreds of callers you can't ask each owner to run `terraform state mv`, so since 1.1 the module ships `moved` blocks and each team's next plan shows a move instead of a replacement. Moves are chained and kept, because consumers skip versions. Since 1.7, `removed` with `lifecycle { destroy = false }` stops managing a resource without deleting it, and paired with `import` blocks it splits a big state, with both plans reviewed. CI parses the plan JSON and fails on unexpected deletes, since hundreds of moves can hide one.",
    gotchas: [
      "A `removed` block destroys by default. Without `lifecycle { destroy = false }` it behaves like deleting the resource block.",
      "Terraform 1.16 also accepts `destroy = false` in a resource's own `lifecycle` block: when that resource is planned for destruction, it is removed from state instead and the real object is left in place.",
      "A module can only declare moves for its own objects and its child modules. You can't move objects into or out of a module you don't control from the caller side.",
      "`removed` takes a resource or module address without instance keys. You can't forget just `aws_instance.web[1]` with it.",
    ],
    agentic: [
      "Agents handle the mechanical part of a refactor well: renaming resources, adding `for_each`, and writing a `moved` block for every old and new address. The human owns the plan, which should show only moves; a missed `moved` block appears as a destroy and create pair that an agent's summary can easily gloss over.",
      "Check the agent's \"only moves\" claim against the machine-readable plan, not its prose: `terraform show -json` lists each entry in `resource_changes` with its `actions`, and a CI rule that fails on any unexpected `delete` catches what a rubber-stamp review misses.",
      "`removed` with `destroy = false` keeps taking objects out of management inside plan review. `terraform state rm` writes state immediately with no plan, so keep state subcommands out of an agent's allowed tools.",
    ],
    quiz: [
      { q: "You add `for_each` to a resource that already exists. What do you add so it is not replaced?", a: "A `moved` block from the old address to the specific instance key, for example `from = aws_instance.web` and `to = aws_instance.web[\"blue\"]`." },
      { q: "When can you safely delete old `moved` blocks from a module?", a: "Only when you know every user of the module has applied the move, which is realistic only for private modules. For shared modules, keep them; removing one is a breaking change." },
      { q: "How is a `removed` block with `destroy = false` better than `terraform state rm`?", a: "It is part of the configuration and goes through plan, so the removal is reviewed and previewed before apply and applies in every environment that uses the code." },
    ],
    incidents: [],
    sources: [
      { title: "Terraform v1.1 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.1/CHANGELOG.md" },
      { title: "Terraform v1.7 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.7/CHANGELOG.md" },
      { title: "Refactoring modules", url: "https://developer.hashicorp.com/terraform/language/modules/develop/refactoring" },
      { title: "removed block reference", url: "https://developer.hashicorp.com/terraform/language/block/removed" },
      { title: "Remove a resource from state", url: "https://developer.hashicorp.com/terraform/language/state/remove" },
      { title: "What's new in OpenTofu 1.7", url: "https://opentofu.org/docs/v1.7/intro/whats-new/" },
      { title: "Terraform JSON output format", url: "https://developer.hashicorp.com/terraform/internals/json-format" },
      { title: "The lifecycle meta-argument", url: "https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle" },
    ],
  },
  {
    id: "import-blocks",
    n: 3,
    title: "Config-driven import",
    question: "Thousands of resources were built by hand in the console. How do you bring them under Terraform in batches without breaking production?",
    view: [900, 450],
    nodes: [
      { id: "eng", label: "Inventory", sub: "tags, asset export", kind: "store", x: 10, y: 40, w: 140, h: 56 },
      { id: "impb", label: "import block", sub: "to + id, for_each", x: 190, y: 40, w: 170, h: 56 },
      { id: "plan", label: "terraform plan", sub: "-generate-config-out", x: 410, y: 40, w: 180, h: 56 },
      { id: "gen", label: "generated.tf", sub: "best-guess HCL", x: 650, y: 40, w: 170, h: 56 },
      { id: "cli", label: "terraform import", sub: "CLI, state now", kind: "actor", x: 10, y: 180, w: 150, h: 56 },
      { id: "prov", label: "Provider", sub: "reads by ID", x: 410, y: 180, w: 180, h: 56 },
      { id: "review", label: "Review + edit", sub: "until 0 changes", kind: "actor", x: 650, y: 180, w: 170, h: 56 },
      { id: "state", label: "State", sub: "now managed", kind: "store", x: 190, y: 320, w: 170, h: 56 },
      { id: "cloud", label: "Cloud API", sub: "ClickOps objects", kind: "store", x: 410, y: 320, w: 180, h: 56 },
      { id: "apply", label: "terraform apply", sub: "performs import", x: 650, y: 320, w: 170, h: 56 },
    ],
    edges: [
      { id: "e-write", from: "eng", to: "impb" },
      { id: "e-plan", from: "impb", to: "plan" },
      { id: "e-read", from: "plan", to: "prov", label: "read by ID" },
      { id: "e-api", from: "prov", to: "cloud", label: "GET", bidir: true },
      { id: "e-gen", from: "plan", to: "gen", label: "writes HCL", labelAt: [620, 30] },
      { id: "e-edit", from: "gen", to: "review", label: "cleanup" },
      { id: "e-replan", from: "review", to: "plan", label: "re-plan" },
      { id: "e-apply", from: "review", to: "apply", label: "apply" },
      { id: "e-state", from: "apply", to: "state", label: "records", via: [[735, 420], [275, 420]], labelAt: [500, 412] },
      { id: "e-cli", from: "cli", to: "state", label: "writes now" },
    ],
    steps: [
      { text: "Adopting a ClickOps estate: an inventory feeds `import` blocks, a plan imports and writes config, and review edits until nothing changes. The old one-at-a-time CLI command is on the left. Press Next." },
      { text: "The starting point: objects exist in the cloud, made by hand or by another tool, but no state points at them. Terraform can't see or change them.", on: ["cloud", "state"] },
      { text: "The old `terraform import ADDRESS ID` handles one resource per run, writes state immediately and has no plan to review. That won't adopt thousands.", on: ["cli", "state"], flow: ["e-cli"] },
      { text: "Terraform 1.5.0 (June 12, 2023) added `import` blocks with `to` and `id`, and 1.7.0 (January 17, 2024) added `for_each`. Generate them from an inventory (tags, cloud asset exports) and adopt in batches per service and owner.", on: ["eng", "impb"], flow: ["e-write"] },
      { text: "The import becomes part of a normal plan. The provider reads each object by ID, and the plan shows imports next to any other changes.", on: ["impb", "plan", "prov", "cloud"], flow: ["e-plan", "e-read", "e-api"] },
      { text: "`terraform plan -generate-config-out=generated.tf` writes best-guess HCL for objects with no resource block. The file must not exist yet, and the feature is marked experimental.", on: ["plan", "gen"], flow: ["e-gen"] },
      { text: "Generated HCL for a big estate is huge and repetitive. Fold it into modules with `for_each`, replace literals with references, and re-plan until the imports show no changes.", on: ["gen", "review", "plan"], flow: ["e-edit", "e-replan"] },
      { text: "Apply records the objects in state. Put them in many small root modules along team and blast-radius lines, not one state per account, or every plan refreshes everything. `moved` blocks let you restructure later.", on: ["review", "apply", "state"], flow: ["e-apply", "e-state"] },
      { text: "Since Terraform 1.16.0 (August 26, 2026), import blocks can sit inside modules. Then stop the estate growing back: console writes only through break-glass roles, and scheduled plans that report drift, which is how CircleCI caught a hand-edited WAF rule.", on: ["impb", "plan", "cloud"], flow: ["e-plan"] },
    ],
    code: [
      { lang: "hcl", label: "imports.tf", src: `import {
  to = aws_s3_bucket.assets
  id = "acme-prod-assets"
}

# Terraform 1.7+: many objects, one block
import {
  for_each = var.legacy_buckets   # map: key => bucket name
  to       = aws_s3_bucket.legacy[each.key]
  id       = each.value
}` },
      { lang: "bash", label: "generate, review, apply", src: `terraform plan -generate-config-out=generated.tf
# edit generated.tf, then re-plan until:
#   N to import, 0 to add, 0 to change, 0 to destroy
terraform plan
terraform apply` },
    ],
    codeNote: "The goal of cleanup is a plan that imports and changes nothing. Any change in that plan is a change to production.",
    say30: "For a big ClickOps estate I generate `import` blocks from an inventory, using `for_each` since 1.7, and adopt in batches per service and owner. Each import shows up in a normal plan instead of writing state immediately like `terraform import`. `plan -generate-config-out` writes best-guess HCL, which I fold into modules and clean until the plan imports with zero changes, then apply. Imports land in many small root modules along team lines, not one huge state, and `moved` blocks let the structure change later. Then I keep it from growing back: console writes only through break-glass roles, and scheduled plans that report drift.",
    gotchas: [
      "Import only adopts the object. If your config differs from reality, the same apply also changes the resource to match your config, so read the plan for updates first.",
      "Generated config is a template. It often includes computed or conflicting attributes and literal IDs where references belong.",
      "The `id` must be known at plan time. Since 1.6.0 it can be an expression, but not one that depends on values only known after apply.",
    ],
    agentic: [
      "Adoption is a good agent task: list resources through read-only cloud APIs, write `import` blocks with `for_each`, run `plan -generate-config-out`, then fold the generated HCL into modules. The finish line stays objective: a plan that imports with zero changes, reviewed by a human before apply.",
      "Generated config copies the live object, including hand-made mistakes such as an open security group rule, and an agent chasing a zero-diff plan will preserve them. A human decides which drift to codify and which to fix in a follow-up change.",
      "To find import IDs the agent needs read access to the account, not write access. Give it a read-only role and let the apply run through the pipeline's own identity, so an agent mistake cannot change infrastructure directly.",
    ],
    quiz: [
      { q: "What does an `import` block give you that `terraform import` does not?", a: "It goes through plan, so you see the import and any resulting changes before anything happens, it lives in version control, and it can be repeated safely because it is idempotent." },
      { q: "After `-generate-config-out`, the plan shows 1 to import and 1 to change. What do you do?", a: "Edit the configuration until the change disappears, unless the change is intentional. Applying as is would modify the live resource during the import." },
      { q: "Which version added `for_each` for import blocks?", a: "Terraform 1.7.0, released January 17, 2024. Import blocks themselves arrived in 1.5.0 on June 12, 2023." },
    ],
    incidents: ["circleci-2025-manual-waf-rule-outage"],
    sources: [
      { title: "Terraform v1.5 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.5/CHANGELOG.md" },
      { title: "Terraform v1.7 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.7/CHANGELOG.md" },
      { title: "Import existing resources", url: "https://developer.hashicorp.com/terraform/language/import" },
      { title: "import block reference", url: "https://developer.hashicorp.com/terraform/language/block/import" },
      { title: "Import a single resource", url: "https://developer.hashicorp.com/terraform/language/import/single-resource" },
      { title: "Generating configuration", url: "https://developer.hashicorp.com/terraform/language/import/generating-configuration" },
    ],
  },
  {
    id: "conditions-checks",
    n: 4,
    title: "Preconditions, postconditions and check blocks",
    question: "Hundreds of teams call your modules. Which rules go in module assertions, which in org-wide policy, and which should only warn?",
    view: [930, 420],
    nodes: [
      { id: "vars", label: "Inputs", sub: "tfvars, -var", kind: "actor", x: 10, y: 60, w: 120, h: 56 },
      { id: "valid", label: "validation", sub: "variable blocks", x: 170, y: 60, w: 150, h: 56 },
      { id: "pre", label: "precondition", sub: "checked at plan", x: 370, y: 60, w: 150, h: 56 },
      { id: "apply", label: "Provider call", sub: "create / update", x: 570, y: 60, w: 150, h: 56 },
      { id: "post", label: "postcondition", sub: "uses self", x: 770, y: 60, w: 150, h: 56 },
      { id: "policy", label: "Policy as code", sub: "Sentinel / OPA", x: 10, y: 210, w: 140, h: 56 },
      { id: "stop", label: "Run stops", sub: "error, no undo", kind: "q", x: 370, y: 210, w: 150, h: 56 },
      { id: "endpoint", label: "Live endpoint", sub: "scoped data", kind: "pod", x: 570, y: 210, w: 150, h: 56 },
      { id: "check", label: "check block", sub: "assert", x: 770, y: 210, w: 150, h: 56 },
      { id: "health", label: "Health checks", sub: "HCP, scheduled", x: 570, y: 340, w: 150, h: 56 },
      { id: "warn", label: "Warning", sub: "run continues", x: 770, y: 340, w: 150, h: 56 },
    ],
    edges: [
      { id: "e-in", from: "vars", to: "valid" },
      { id: "e-v2p", from: "valid", to: "pre" },
      { id: "e-p2a", from: "pre", to: "apply" },
      { id: "e-a2p", from: "apply", to: "post" },
      { id: "e-fail1", from: "valid", to: "stop", label: "fails" },
      { id: "e-fail2", from: "pre", to: "stop", label: "fails" },
      { id: "e-fail3", from: "post", to: "stop", label: "fails", labelPos: 0.3 },
      { id: "e-deny", from: "policy", to: "stop", label: "denies plan" },
      { id: "e-p2c", from: "post", to: "check", label: "last step" },
      { id: "e-data", from: "check", to: "endpoint", label: "reads", labelAt: [745, 200] },
      { id: "e-warn", from: "check", to: "warn", label: "fails" },
      { id: "e-health", from: "health", to: "check", label: "re-runs" },
    ],
    steps: [
      { text: "The run goes left to right along the top, where a module's own rules sit. Org-wide policy comes in from the left. Everything that can stop the run points at the red box; `check` blocks point to a warning instead. Press Next." },
      { text: "A shared module is the cheapest place to stop bad input for hundreds of callers, before a ticket reaches the platform team. `validation` blocks run before a plan exists and print your `error_message`; since 1.9.0 a condition can reference other variables.", on: ["vars", "valid", "stop"], flow: ["e-in", "e-fail1"] },
      { text: "Terraform 1.2.0 (May 18, 2022) added `precondition` and `postcondition` in `lifecycle` blocks. A precondition is checked while planning, or during apply if it needs values known only then. A failure stops that object.", on: ["valid", "pre", "stop"], flow: ["e-v2p", "e-fail2"] },
      { text: "After the provider creates or updates the object, a postcondition can test `self`. A failure stops objects that depend on it, but doesn't undo what already happened.", on: ["pre", "apply", "post", "stop"], flow: ["e-p2a", "e-a2p", "e-fail3"] },
      { text: "Module rules reach only callers who use the module and upgrade it. Org-wide rules such as no public buckets go in Sentinel or OPA policy sets, which HCP Terraform applies globally or to chosen projects, workspaces or tags. They catch raw resources too.", on: ["policy", "stop"], flow: ["e-deny"] },
      { text: "Terraform 1.5.0 (June 12, 2023) added `check` blocks. They run last in plan and apply, can hold one scoped `data` block, and a failed `assert` only warns. Use them for things you want to know, like an endpoint returning 200.", on: ["post", "check", "endpoint", "warn"], flow: ["e-p2c", "e-data", "e-warn"] },
      { text: "Scoped data sources run on every plan and apply. Across thousands of workspaces, HTTP checks against shared endpoints add load and slow plans, so keep them cheap and leave deep probes to monitoring.", on: ["check", "endpoint"], flow: ["e-data"] },
      { text: "With health checks on, HCP Terraform re-runs checks and conditions on a schedule between runs. Route the results to the owning team: dozens of failed checks in a CI log get ignored.", on: ["health", "check", "warn"], flow: ["e-health"] },
    ],
    code: [
      { lang: "hcl", label: "conditions", src: `resource "aws_instance" "web" {
  ami           = data.aws_ami.web.id
  instance_type = var.instance_type

  lifecycle {
    precondition {
      condition     = data.aws_ami.web.architecture == "x86_64"
      error_message = "The AMI must be built for x86_64."
    }
    postcondition {
      condition     = self.public_dns != ""
      error_message = "The instance must get a public DNS name."
    }
  }
}` },
      { lang: "hcl", label: "check block", src: `check "site_up" {
  data "http" "home" {
    url = "https://www.example.com/healthz"
  }

  assert {
    condition     = data.http.home.status_code == 200
    error_message = "Health endpoint did not return 200."
  }
}` },
    ],
    codeNote: "Preconditions and postconditions stop the run. The `check` block only warns, so it is safe to point at things outside your control.",
    say30: "I split rules by reach. A shared module's own contract goes in the module: variable `validation`, and since 1.2 `precondition` and `postcondition` in `lifecycle`, which stop the run with a clear message before a bad input becomes a ticket. They only reach callers who use and upgrade that module, so org-wide rules like no public buckets go in Sentinel or OPA policy sets applied to every workspace, which also catch raw resources. Since 1.5, `check` blocks only warn, so they're for things worth knowing, like an endpoint's health. I keep their data sources cheap across thousands of workspaces, and route results and HCP health-check alerts to the owning team.",
    gotchas: [
      "A failed postcondition does not undo the change. The object already exists or was already updated; Terraform only stops dependent work.",
      "`check` blocks never block an apply, and errors from their scoped data source are turned into warnings. Do not use them for rules that must be enforced.",
      "Preconditions on values known only after apply are checked during apply, so a clean plan does not prove every condition passed.",
      "Cross-variable references in `validation` need Terraform 1.9 or later. Modules that use them break for callers on older versions, so raise `required_version` too.",
    ],
    agentic: [
      "Validation, preconditions and mandatory policy sets apply to whoever wrote the HCL, so they are guardrails for agent-written code too. The Terraform MCP server can search Sentinel policies (`search_policies`) to help an agent draft new rules, but a human reviews what each rule actually allows.",
      "Agent loops read error messages and retry, so a clear `error_message` doubles as guidance for the next attempt. The new failure mode is an agent that makes the plan pass by loosening or deleting the condition, so route edits to `validation`, `precondition` and policy files to a code owner.",
      "`check` block assertions only warn, so an agent driving towards a green apply can treat them as noise. Send check results to a named human owner instead of trusting the agent to raise them.",
    ],
    quiz: [
      { q: "Order these by when they run: postcondition, variable validation, check block, precondition.", a: "Variable validation (before planning), precondition (during planning, or apply if values are unknown), postcondition (after the object is applied), check block (last step of plan and apply)." },
      { q: "Which of these stop the run, and which only warn?", a: "Validation, preconditions and postconditions stop the run. `check` block assertions and errors from their scoped data sources only produce warnings." },
      { q: "Your company requires every S3 bucket to block public access. Module postcondition or policy as code?", a: "Policy as code, such as Sentinel or OPA on every run, because it also covers resources created outside your modules and callers on old module versions. A module condition is a useful extra check." },
    ],
    incidents: [],
    sources: [
      { title: "Terraform v1.2 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.2/CHANGELOG.md" },
      { title: "Terraform v1.5 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.5/CHANGELOG.md" },
      { title: "Terraform v1.9 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.9/CHANGELOG.md" },
      { title: "Validate your configuration (custom conditions, checks, order of validation)", url: "https://developer.hashicorp.com/terraform/language/validate" },
      { title: "check block reference", url: "https://developer.hashicorp.com/terraform/language/block/check" },
      { title: "Policy enforcement in HCP Terraform", url: "https://developer.hashicorp.com/terraform/cloud-docs/policy-enforcement" },
      { title: "HCP Terraform: manage policy sets", url: "https://developer.hashicorp.com/terraform/cloud-docs/policy-enforcement/manage-policy-sets" },
      { title: "Terraform MCP server: tools reference", url: "https://developer.hashicorp.com/terraform/mcp-server/reference" },
    ],
  },
];
