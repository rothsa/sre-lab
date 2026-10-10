// Chapters 1-4: Terraform 1.0 and lock files, moved/removed, import blocks, conditions and checks.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`, see ../../drawn/README.md).
export const CHAPTERS = [
  {
    id: "one-point-oh",
    n: 1,
    title: "Terraform 1.0 and the dependency lock file",
    question: "What did Terraform 1.0 actually promise, and how does `.terraform.lock.hcl` make two runs of `terraform init` pick the same providers?",
    view: [900, 470],
    nodes: [
      { id: "dev", label: "Engineer", sub: "edits versions.tf", kind: "actor", x: 10, y: 55, w: 140, h: 56 },
      { id: "config", label: "Configuration", sub: "required_version\nrequired_providers", x: 180, y: 50, w: 180, h: 66 },
      { id: "init", label: "terraform init", sub: "selects versions", x: 410, y: 55, w: 150, h: 56 },
      { id: "lock", label: ".terraform.lock.hcl", sub: "version + hashes", kind: "store", x: 640, y: 55, w: 190, h: 56 },
      { id: "mirror", label: "Mirror / cache", sub: "fs or network", x: 10, y: 200, w: 150, h: 56 },
      { id: "registry", label: "Origin registry", sub: "signed checksums", x: 410, y: 200, w: 170, h: 56 },
      { id: "git", label: "Git repo", sub: "lock file reviewed", kind: "store", x: 640, y: 200, w: 190, h: 56 },
      { id: "upgrade", label: "init -upgrade", sub: "newest allowed", kind: "actor", x: 200, y: 330, w: 170, h: 56 },
      { id: "plock", label: "providers lock", sub: "-platform=...", x: 410, y: 330, w: 150, h: 56 },
      { id: "ci", label: "CI runner", sub: "linux_amd64", x: 640, y: 330, w: 190, h: 56 },
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
      { id: "e-upgrade", from: "upgrade", to: "init", label: "ignores lock", labelPos: 0.3 },
    ],
    steps: [
      { text: "The whole loop: constraints in config, a selection made by `terraform init`, a lock file that records it, and every later machine reusing that record. Press Next." },
      { text: "Terraform 1.0.0 shipped on June 08, 2021 with no significant changes from 0.15.5. The point was the v1.0 compatibility promises: later 1.x releases should not need config or workflow changes. Providers and external modules are outside that promise.", on: ["init", "config"] },
      { text: "Constraints live in config. `required_version` limits which Terraform CLI may run this root module. `required_providers` gives each provider a source address and a version range such as `~> 5.0`.", on: ["dev", "config", "init"], flow: ["e-edit", "e-read"] },
      { text: "`terraform init` picks the newest provider version that satisfies every constraint, downloads it, and checks it against the checksums the registry publishes for that release.", on: ["init", "registry"], flow: ["e-fetch"] },
      { text: "It then writes `.terraform.lock.hcl` (added in 0.14.0, December 02, 2020): one entry per provider with the chosen `version` and a set of `h1:` and `zh:` hashes. Modules are not locked; pin those with exact version constraints.", on: ["init", "lock"], flow: ["e-record"] },
      { text: "Commit the lock file. `init` says when it changes the file, so a provider bump shows up as a reviewable diff instead of a silent change between yesterday's plan and today's apply.", on: ["lock", "git"], flow: ["e-commit"] },
      { text: "On CI, `init` reuses the recorded version and refuses any package that matches none of the recorded hashes. That is trust on first use: you vet a provider once, and Terraform guards against it changing later.", on: ["git", "ci", "registry"], flow: ["e-ci", "e-verify"] },
      { text: "Installing from a filesystem or network mirror only records hashes for the platform where `init` ran. A lock file made on a Mac then fails on a Linux runner.", on: ["mirror", "init", "lock"], flow: ["e-mirror", "e-record"] },
      { text: "Fix it with `terraform providers lock`, one `-platform` flag per OS and CPU you run on. It fetches signed checksums from the origin registry and writes hashes for all of them.", on: ["plock", "registry", "lock"], flow: ["e-plock-reg", "e-plock-lock"] },
      { text: "Upgrades are explicit. `terraform init -upgrade` ignores the recorded selection, picks the newest version allowed by the constraints, and rewrites `version` and `hashes`. You review that diff like code.", on: ["upgrade", "init", "lock"], flow: ["e-upgrade", "e-record"] },
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
    say30: "Terraform 1.0, released June 2021, was a stability release: no big features, just a compatibility promise that later 1.x versions keep the language, core CLI workflow and state upgrades working. Providers are not covered, so provider pinning matters. Since 0.14, `terraform init` writes `.terraform.lock.hcl` with the exact provider version and its checksums. You commit it, so CI and laptops install the same build, and a changed package fails verification. Constraints in `required_providers` say what is allowed; the lock says what was picked. Upgrades go through `terraform init -upgrade` and a reviewed diff. If you install from mirrors, run `terraform providers lock` with each `-platform` so the file works on every OS.",
    gotchas: [
      "The lock file only covers providers. Modules always resolve to the newest version that matches their constraint, so pin module versions exactly if you need repeatability.",
      "The 1.x promise covers Terraform core, not providers. A provider major version can still break your config, which is why the lock file and `~>` constraints matter.",
      "State written by a newer 1.x release is not guaranteed to be readable by an older one. Upgrading is safe; downgrading after a newer version wrote state may not be.",
      "A lock file created from a mirror only holds hashes for that machine's platform. The first CI run on another OS fails with a checksum error until you run `terraform providers lock -platform=...`.",
    ],
    atScale: [
      "Hundreds of root modules each pin providers on their own, so versions drift and a provider bug fix lands in some stacks months after others. Teams automate lock file bumps with bots that open one reviewed PR per root module.",
      "Every `init` downloads providers again. Large CI fleets set `plugin_cache_dir` or run a network mirror to cut download time and registry traffic; leave `plugin_cache_may_break_dependency_lock_file` unset so the cache still respects lock hashes.",
      "Air-gapped or regulated environments block the public registry. A `provider_installation` block in the CLI config points `init` at a `network_mirror` or `filesystem_mirror` and removes `direct`, while locking from the origin registry keeps the signed checksums.",
      "Mixed fleets (Linux x86 and ARM runners, macOS laptops) break lock files made on one machine. Generate lock files in CI with a fixed `-platform` list so every entry covers every runner.",
      "Mismatched Terraform CLI versions across teams risk a newer version writing state an older one cannot read. Pin `required_version` and the CLI version in CI images, and upgrade forward only.",
    ],
    agentic: [
      "Models trained months ago can suggest provider versions that are stale or never shipped, and a confident `version` constraint reads fine in review. The Terraform MCP server's `get_latest_provider_version` tool lets an agent ask the registry instead of recalling, but a human still checks what `terraform init` actually resolved in `.terraform.lock.hcl`.",
      "An agent bumping providers is a faster lock-file bot: it should run `terraform providers lock` with the CI `-platform` list and open one PR per root module. The reviewer still reads the provider CHANGELOG between the two versions, because lock hashes prove the download is authentic, not that the upgrade is safe.",
      "A checksum mismatch is the supply-chain check working, so an agent must not \"fix\" it by deleting `.terraform.lock.hcl` or running `init -upgrade`. Make that a stop-and-ask-a-human event in the agent's rules (see Agentic Engineering, Drawn).",
    ],
    quiz: [
      { q: "What is the difference between `required_providers` and `.terraform.lock.hcl`?", a: "`required_providers` declares the allowed source and version range. The lock file records the exact version `init` chose plus checksums, so future runs reuse it until someone runs `init -upgrade`." },
      { q: "CI fails with a provider checksum error after a developer on a Mac committed a new lock file. Why, and how do you fix it?", a: "The provider was installed from a mirror or cache, so only darwin hashes were recorded. Run `terraform providers lock` with `-platform` for each OS and architecture and commit the result." },
      { q: "Does the lock file pin module versions?", a: "No. It only tracks providers. Modules resolve to the newest version matching their constraint, so use exact version constraints for modules you need pinned." },
    ],
    incidents: ["zenml-2025-eks-upgrade-iam-regression"],
    sources: [
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
    question: "You rename a resource or move it into a module. How do you stop Terraform from destroying and recreating it, and how do you stop managing something without deleting it?",
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
      { text: "Config addresses on the left, the plan in the middle, state and real infrastructure on the right. Terraform knows objects only by their address in state. Press Next." },
      { text: "Rename `aws_s3_bucket.logs` or move it into a module with nothing else, and the plan sees an object at an address no longer in config and a new address with no object. It proposes destroy and create.", on: ["newcfg", "plan", "replace"], flow: ["e-new", "e-replace"] },
      { text: "Before 1.1 the fix was `terraform state mv`: edit state by hand, outside any plan, once per root module that uses the code. Nothing reviewable is left behind.", on: ["statemv", "state"], flow: ["e-statemv"] },
      { text: "Terraform 1.1.0 (December 08, 2021) added `moved` blocks. You write `from` and `to` in the config, so the refactor is code that ships with the module.", on: ["movedb", "plan"], flow: ["e-moved"] },
      { text: "During plan, Terraform finds the object at the old address in state and treats it as if it had always lived at the new one. The plan reports the move and shows no destroy.", on: ["plan", "state", "movedb"], flow: ["e-moved", "e-read"] },
      { text: "Apply rewrites the state entry to the new address. The real bucket is never touched: same ID, same data.", on: ["apply", "state", "infra"], flow: ["e-apply", "e-write", "e-infra"] },
      { text: "The same block handles adding `count` or `for_each` (map the old object to `[0]` or `[\"key\"]`), renaming module calls, and moving resources into child modules. You cannot move a managed resource to a `data` block.", on: ["movedb", "newcfg", "plan"], flow: ["e-new", "e-moved"] },
      { text: "A consumer may jump straight from v1 to v3 of your module. Chain moves (a to b, then b to c) and keep every old `moved` block. Deleting one makes old addresses plan as destroy again.", on: ["consumer", "plan", "movedb"], flow: ["e-consumer", "e-moved"] },
      { text: "Terraform 1.7.0 (January 17, 2024) added `removed` blocks: replace the `resource` block with `removed { from = ... }`. The default still destroys; `lifecycle { destroy = false }` only drops it from state.", on: ["removedb", "plan", "state"], flow: ["e-removed", "e-read"] },
      { text: "Unlike `terraform state rm`, the removal shows up in a plan you can review before it happens. The bucket keeps running, now unmanaged. To manage it again, import it.", on: ["removedb", "apply", "state", "infra"], flow: ["e-apply", "e-write", "e-infra"] },
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
    say30: "Terraform tracks objects by address, so a rename or a move into a module looks like a delete plus a create. Before 1.1 you fixed that with `terraform state mv`, by hand, outside a plan. Since 1.1 you write a `moved` block with `from` and `to`; plan treats the object as already at the new address and shows a move instead of a replacement. For shared modules you chain moves and keep them forever, because consumers may upgrade from any old version. Terraform 1.7 added `removed` blocks for the opposite case: stop managing a resource. With `lifecycle { destroy = false }` it leaves state but keeps running, and you see that in the plan first.",
    gotchas: [
      "A `removed` block destroys by default. Without `lifecycle { destroy = false }` it behaves like deleting the resource block.",
      "Deleting old `moved` blocks is a breaking change for module consumers who have not applied the move yet: their plan goes back to destroy and create.",
      "A module can only declare moves for its own objects and its child modules. You cannot move objects into or out of a module you do not control from the caller side.",
      "`removed` takes a resource or module address without instance keys. You cannot forget just `aws_instance.web[1]` with it.",
    ],
    atScale: [
      "A shared module used by hundreds of root modules cannot ask each owner to run `terraform state mv`. Shipping `moved` blocks in the module makes the refactor apply itself on each team's next plan.",
      "Consumers upgrade at different speeds, sometimes skipping several versions. Teams keep every historical `moved` block as a chain and only prune them in private modules where they know every caller has applied.",
      "Splitting a large state into smaller stacks means objects leave one state and appear in another. Teams pair `removed` with `destroy = false` in the old stack and `import` blocks in the new one, and review both plans before applying either.",
      "Big refactors produce plans with hundreds of moves that hide one real destroy. Teams gate on the machine-readable plan (`terraform show -json`) and fail CI on any unexpected delete action.",
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
    ],
  },
  {
    id: "import-blocks",
    n: 3,
    title: "Config-driven import",
    question: "Someone built production by hand in the console. How do you bring it under Terraform without breaking it, and what changed with `import` blocks?",
    view: [900, 450],
    nodes: [
      { id: "eng", label: "Engineer", sub: "writes imports.tf", kind: "actor", x: 10, y: 40, w: 140, h: 56 },
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
      { text: "Two ways to adopt existing infrastructure: the old CLI command on the left, and the plan-based `import` block flow across the top. Press Next." },
      { text: "The starting point: objects exist in the cloud, created by hand or by another tool, but no state entry points at them. Terraform cannot see or change them.", on: ["cloud", "state"] },
      { text: "The old way, `terraform import ADDRESS ID`, handles one resource per run and writes state immediately. You must write the `resource` block yourself first, and there is no plan to review.", on: ["cli", "state"], flow: ["e-cli"] },
      { text: "Terraform 1.5.0 (June 12, 2023) added `import` blocks. You declare `to` (the resource address) and `id` (the provider's ID for the object) in config, so the import is code that can be reviewed.", on: ["eng", "impb"], flow: ["e-write"] },
      { text: "The import becomes part of a normal plan. The provider reads the object by ID, and the plan shows what will be imported next to any other changes.", on: ["impb", "plan", "prov", "cloud"], flow: ["e-plan", "e-read", "e-api"] },
      { text: "No resource block yet? `terraform plan -generate-config-out=generated.tf` writes best-guess HCL from the object's attributes. The file must not exist already, and the feature is marked experimental.", on: ["plan", "gen"], flow: ["e-gen"] },
      { text: "Clean the generated code: drop defaults, fix conflicting arguments, replace literals with variables and references. Re-plan until the import shows no changes to the resource.", on: ["gen", "review", "plan"], flow: ["e-edit", "e-replan"] },
      { text: "`terraform apply` performs the import and records the object in state. Import blocks are idempotent, so you can delete them afterwards or keep them as a record.", on: ["review", "apply", "state"], flow: ["e-apply", "e-state"] },
      { text: "Terraform 1.7.0 (January 17, 2024) added `for_each` on import blocks, so one block can adopt a whole set of buckets or DNS records from a map. OpenTofu 1.7 added loopable imports too. Until Terraform 1.16.0 (August 26, 2026), import blocks had to be in the root module; 1.16 allows them inside modules.", on: ["impb", "plan"], flow: ["e-plan"] },
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
    say30: "Terraform 1.5 added `import` blocks. Instead of running `terraform import` per resource, which writes state immediately with no preview, you declare `to` and `id` in config and the import shows up in a normal plan. If you have no resource block, `terraform plan -generate-config-out` writes a best-guess one from the live object. You clean that up until the plan says it will import with zero changes, then apply. Since 1.7, import blocks take `for_each`, so one block can adopt a whole map of resources. Import blocks are idempotent and reviewable, which makes adopting ClickOps infrastructure a normal pull request instead of a risky manual step.",
    gotchas: [
      "Import only adopts the object. If your config differs from reality, the same apply will also change the resource to match your config, so read the plan for updates before applying.",
      "Generated config is a template. It often includes computed or conflicting attributes and literal IDs where references belong, and the feature is labelled experimental.",
      "`-generate-config-out` fails if the output file already exists, so it is not a way to refresh existing config.",
      "The `id` must be known at plan time. Since 1.6.0 it can be an expression, but not one that depends on values only known after apply.",
    ],
    atScale: [
      "Thousands of hand-made resources cannot be imported one CLI call at a time. Teams generate `import` blocks with `for_each` from an inventory (tags, cloud asset exports) and adopt them in batches per service.",
      "Generated HCL for a big estate is huge and repetitive. Teams fold it into modules with `for_each` and use `moved` blocks after the import so the module structure can change later without replacement.",
      "Importing everything into one state makes every plan refresh every object, so plans slow down and lock contention grows. Split imports into many small root modules along team and blast-radius lines.",
      "People keep clicking after the import, and drift returns. Teams restrict console write access to break-glass roles and run scheduled plans to report drift, which is how CircleCI caught a hand-edited WAF rule.",
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
      { title: "What's new in OpenTofu 1.7", url: "https://opentofu.org/docs/v1.7/intro/whats-new/" },
    ],
  },
  {
    id: "conditions-checks",
    n: 4,
    title: "Preconditions, postconditions and check blocks",
    question: "Where can you put assertions in Terraform, when does each one run, and which ones stop the run versus only warn?",
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
      { text: "The run goes left to right along the top. Everything that can stop it points at the red box; `check` blocks point to a warning instead. Press Next." },
      { text: "Input `validation` blocks (since 0.13) run first, before a plan exists. A false `condition` prints your `error_message` and stops. Since 1.9.0 (June 26, 2024) a condition may reference other variables and objects, not only its own variable.", on: ["vars", "valid", "stop"], flow: ["e-in", "e-fail1"] },
      { text: "Terraform 1.2.0 (May 18, 2022) added `precondition` and `postcondition` in `lifecycle` blocks of resources and data sources, plus preconditions in `output` blocks. A precondition is checked while planning, before the object is created.", on: ["valid", "pre"], flow: ["e-v2p"] },
      { text: "If a precondition needs a value only known after apply, Terraform checks it during apply instead. Either way a failure stops the operation for that object.", on: ["pre", "stop"], flow: ["e-fail2"] },
      { text: "The provider creates or updates the real object.", on: ["pre", "apply"], flow: ["e-p2a"] },
      { text: "A postcondition runs after the object is applied (or a data source is read) and can test `self`. A failure stops downstream objects that depend on it, but does not undo what already happened.", on: ["apply", "post", "stop"], flow: ["e-a2p", "e-fail3"] },
      { text: "Terraform 1.5.0 (June 12, 2023) added `check` blocks. They run as the last step of plan and apply, can hold one scoped `data` block only they can see, and use `assert` blocks.", on: ["post", "check", "endpoint"], flow: ["e-p2c", "e-data"] },
      { text: "A failed assert, or an error from the scoped data source, becomes a warning. The run continues. Use checks for things you want to know about, such as an endpoint returning 200 or a cert expiring.", on: ["check", "warn"], flow: ["e-warn"] },
      { text: "With health checks on a workspace, HCP Terraform re-evaluates checks, preconditions and postconditions on a schedule between runs and alerts on failure. That is continuous validation.", on: ["health", "check", "endpoint"], flow: ["e-health", "e-data"] },
      { text: "Organisation policy usually lives outside modules: HCP Terraform runs Sentinel or OPA policy sets against each run's plan, and a failed policy can stop the run depending on its enforcement level.", on: ["policy", "stop"], flow: ["e-deny"] },
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
    say30: "Terraform has four assertion points. Variable `validation` runs before planning and, since 1.9, can reference other variables. Since 1.2, `precondition` and `postcondition` live in a resource's `lifecycle`: preconditions are checked at plan time, or at apply if values are unknown, and postconditions after the object is created, using `self`. Both stop the run, but a postcondition does not roll anything back. Since 1.5, `check` blocks run at the end of plan and apply with their own scoped data source, and failures only warn, which makes them good for health checks, and HCP Terraform can re-run them on a schedule. Module conditions encode a module's own contract; org-wide rules usually belong in Sentinel or OPA.",
    gotchas: [
      "A failed postcondition does not undo the change. The object already exists or was already updated; Terraform only stops dependent work.",
      "`check` blocks never block an apply, and errors from their scoped data source are turned into warnings. Do not use them for rules that must be enforced.",
      "Preconditions on values known only after apply are checked during apply, so a clean plan does not prove every condition passed.",
      "Cross-variable references in `validation` need Terraform 1.9 or later. Modules that use them break for callers on older versions, so raise `required_version` too.",
    ],
    atScale: [
      "A shared module used by hundreds of teams is the cheapest place to stop bad inputs. Validation and preconditions fail at plan time with a clear message, before a ticket ever reaches the platform team.",
      "Rules written into modules only apply to callers who use those modules and upgrade. Org-wide rules (no public buckets, required tags) go in Sentinel or OPA policy sets applied to every workspace, because they also catch raw resources.",
      "Scoped data sources in `check` blocks run on every plan and apply. Across thousands of workspaces, HTTP checks against shared endpoints add load and slow plans; keep them cheap or move deep probes to real monitoring.",
      "Warnings scale badly: a plan with dozens of failed checks gets ignored. Teams route check results (and HCP health assessment alerts) to an owner instead of leaving them in CI logs.",
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
      { title: "Validate your configuration (custom conditions)", url: "https://developer.hashicorp.com/terraform/language/expressions/custom-conditions" },
      { title: "Checks", url: "https://developer.hashicorp.com/terraform/language/checks" },
      { title: "check block reference", url: "https://developer.hashicorp.com/terraform/language/block/check" },
      { title: "Policy enforcement in HCP Terraform", url: "https://developer.hashicorp.com/terraform/cloud-docs/policy-enforcement" },
      { title: "Terraform MCP server: tools reference", url: "https://developer.hashicorp.com/terraform/mcp-server/reference" },
    ],
  },
];
