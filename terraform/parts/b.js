// Chapters 5-8: testing, standardizing on Terraform or OpenTofu, secrets out of state, workspaces and Stacks.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `agentic`: see ../../drawn/README.md).
// No `atScale` box: scale is the main thread of each chapter's steps.
export const CHAPTERS = [
  {
    id: "terraform-test",
    n: 5,
    title: "Testing with terraform test",
    question: "How do you test hundreds of modules with `terraform test` on every PR, without slow CI, leaks or runaway cost?",
    view: [920, 430],
    nodes: [
      { id: "dev", label: "terraform test", sub: "CI or laptop", kind: "actor", x: 10, y: 40, w: 130, h: 50 },
      { id: "tfile", label: ".tftest.hcl", sub: "run blocks, in order", x: 180, y: 40, w: 150, h: 50 },
      { id: "run1", label: "run \"unit\"", sub: "command = plan", x: 380, y: 40, w: 160, h: 50 },
      { id: "run2", label: "run \"e2e\"", sub: "command = apply", x: 380, y: 140, w: 160, h: 50 },
      { id: "assert", label: "assert", sub: "condition, message", x: 600, y: 40, w: 150, h: 50 },
      { id: "result", label: "Pass / fail", sub: "per run", x: 800, y: 40, w: 110, h: 50 },
      { id: "mock", label: "mock_provider", sub: "fake computed values", x: 150, y: 270, w: 150, h: 50 },
      { id: "state", label: "In-memory state", sub: "per test file", x: 370, y: 270, w: 170, h: 50 },
      { id: "provider", label: "Real provider", sub: "your credentials", x: 590, y: 270, w: 140, h: 50 },
      { id: "infra", label: "Real resources", sub: "cost money", kind: "store", x: 770, y: 270, w: 140, h: 50 },
      { id: "destroy", label: "Destroy", sub: "reverse run order", x: 590, y: 370, w: 140, h: 50 },
    ],
    edges: [
      { id: "e-read", from: "dev", to: "tfile" },
      { id: "e-r1", from: "tfile", to: "run1" },
      { id: "e-r2", from: "tfile", to: "run2" },
      { id: "e-a1", from: "run1", to: "assert" },
      { id: "e-a2", from: "run2", to: "assert", label: "checks state" },
      { id: "e-res", from: "assert", to: "result" },
      { id: "e-mock", from: "run2", to: "mock", label: "mocked" },
      { id: "e-state", from: "run2", to: "state", label: "records" },
      { id: "e-prov", from: "run2", to: "provider", label: "calls APIs" },
      { id: "e-infra", from: "provider", to: "infra" },
      { id: "e-end", from: "state", to: "destroy", label: "end of file" },
      { id: "e-del", from: "destroy", to: "infra", label: "deletes" },
    ],
    steps: [
      { text: "A test file is a list of `run` blocks; each plans or applies the module, then checks assertions. Across hundreds of modules, which runs apply for real decides your CI time and cloud bill. Press Next to follow one file." },
      { text: "`terraform test` went GA in Terraform 1.6.0 (4 October 2023) and runs the `run` blocks in each `.tftest.hcl` file in order. In a monorepo, CI runs it only in module directories that changed.", on: ["dev", "tfile"], flow: ["e-read"] },
      { text: "A run with `command = plan` only plans: fast and free, like a unit test, though it can assert only on values known at plan time. Make these the per-PR tier.", on: ["tfile", "run1"], flow: ["e-r1"] },
      { text: "Each `assert` has a `condition` and an `error_message` and can read resources and outputs of this and earlier runs. A failed condition fails the run, not the whole file.", on: ["run1", "assert", "result"], flow: ["e-a1", "e-res"] },
      { text: "Mocks (Terraform 1.7.0) make apply runs free too. `mock_provider` invents computed values; `override_resource`, `override_data` and `override_module` pin chosen ones. Mocked values show as unknown in plan runs unless you set `override_during = plan` (1.11).", on: ["run2", "mock", "run1"], flow: ["e-mock"] },
      { text: "A run with no `command` defaults to `apply`: real provider, real credentials, real resources that take time and cost money. Run these nightly or on module release, in sandbox accounts kept apart from prod.", on: ["tfile", "run2", "provider", "infra"], flow: ["e-r2", "e-prov", "e-infra"] },
      { text: "Test state lives in memory, one per file plus one per alternate `module`, and later runs build on it. Asserts in apply runs see real computed values such as ARNs, which a plan can't.", on: ["run2", "state", "assert", "result"], flow: ["e-state", "e-a2", "e-res"] },
      { text: "Parallel jobs testing one module collide on bucket and role names, so pass a random suffix as a variable. Terraform 1.12 added `parallel = true` for runs inside a file. Many apply jobs share one account's API quota, so cap them or spread across accounts.", on: ["run2", "provider", "infra"], flow: ["e-prov"] },
      { text: "At the end of each file Terraform destroys what it created, in reverse run order. If the destroy fails or the runner dies, the in-memory state is gone and resources are orphaned. Tag everything with the test run and reap old tagged resources.", on: ["state", "destroy", "infra"], flow: ["e-end", "e-del"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "tests/unit.tftest.hcl: no cloud account",
        src: `mock_provider "aws" {}

variables {
  bucket_name = "logs-test"
}

run "name_is_kept" {
  command = plan

  assert {
    condition     = aws_s3_bucket.this.bucket == "logs-test"
    error_message = "bucket name was changed"
  }
}`,
      },
      {
        lang: "hcl",
        label: "tests/e2e.tftest.hcl: real resources",
        src: `# command defaults to apply
run "create" {
  variables {
    bucket_name = "logs-e2e-7f3a"
  }

  assert {
    condition     = startswith(output.bucket_arn, "arn:aws:s3:::")
    error_message = "unexpected ARN"
  }
}
# destroyed at the end of the file`,
      },
    ],
    codeNote: "Run all files with `terraform test`, or one with `-filter=tests/unit.tftest.hcl`. Mocks need Terraform 1.7 or later; `-junit-xml` reports became generally available in 1.11.",
    say30: "Across hundreds of modules I tier it. Every PR runs `terraform test` only in modules that changed, with `command = plan` runs and mock providers, so most tests need no cloud account. Runs default to `apply`, which creates real resources with real credentials and destroys them at the end of the file, so those run nightly or on module release, in sandbox accounts. Parallel jobs get unique names, apply jobs are capped so they don't exhaust one account's API quota, and everything is tagged with the test run so a reaper can clean up what failed destroys leave behind. It's plain HCL next to the module; Terratest covers end-to-end probes HCL can't express.",
    gotchas: [
      "A run defaults to `apply`, not `plan`. Forget `command = plan` and every PR creates real infrastructure.",
      "Mocks invent values: strings are random 8-character text, numbers are 0. A mocked test proves your logic, not that the cloud accepts the request.",
      "A `test cleanup` command for orphaned test resources exists only as an experiment so far, so the reaper is still yours to run.",
    ],
    agentic: [
      "Agents write `.tftest.hcl` files fast, especially mocked `command = plan` runs, so test coverage becomes cheap. The reviewer's question changes to whether each `assert` could ever fail, because an agent writing code and tests together can end up asserting whatever the code already does.",
      "Ask for one negative test per rule: `expect_failures` with `command = plan` passes only if the named custom condition reports a problem, so deleting or weakening the rule turns CI red.",
      "A `run` without `command` defaults to `apply` with real credentials, so an agent running `terraform test` in a shell that holds production credentials can create real, billable resources. Give agents mock providers or a sandbox account with a reaper job.",
    ],
    quiz: [
      { q: "What does a `run` block do if you don't set `command`?", a: "It runs `apply`: it creates real resources with the configured providers, then checks its assertions. Those resources are destroyed at the end of the test file." },
      { q: "How can an apply-style test run without cloud credentials?", a: "Replace the provider with `mock_provider` (Terraform 1.7+). Terraform creates fake resources with generated computed values and keeps them in the test state." },
      { q: "In what order are resources destroyed when a test file ends, and why does it matter?", a: "In reverse run-block order. A later run may have created something that depends on an earlier one, such as objects inside a bucket, which must go first." },
    ],
    incidents: [],
    sources: [
      { title: "Terraform: Tests", url: "https://developer.hashicorp.com/terraform/language/tests" },
      { title: "Terraform: Tests, mocks", url: "https://developer.hashicorp.com/terraform/language/tests/mocking" },
      { title: "Terraform v1.6 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.6/CHANGELOG.md" },
      { title: "Terraform v1.7 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.7/CHANGELOG.md" },
      { title: "Terraform v1.11 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.11/CHANGELOG.md" },
      { title: "Terraform v1.12 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.12/CHANGELOG.md" },
      { title: "Terraform v1.14 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.14/CHANGELOG.md" },
      { title: "Terratest documentation", url: "https://terratest.gruntwork.io/docs/" },
    ],
  },
  {
    id: "license-opentofu",
    n: 6,
    title: "Standardizing an IaC tool for the org",
    question: "Terraform or OpenTofu for hundreds of teams: what decides it, what does switching cost, and how do you run both?",
    view: [940, 380],
    groups: [
      { id: "g-tf", label: "HashiCorp Terraform", x: 200, y: 20, w: 730, h: 110 },
      { id: "g-tofu", label: "OpenTofu (Linux Foundation, MPL 2.0)", x: 200, y: 265, w: 730, h: 100 },
    ],
    nodes: [
      { id: "mpl", label: "Terraform 1.5.x", sub: "MPL 2.0, to 1.5.7", x: 10, y: 165, w: 150, h: 60 },
      { id: "bsl", label: "BUSL announced", sub: "10 Aug 2023", x: 210, y: 55, w: 150, h: 50 },
      { id: "tf16", label: "Terraform 1.6.0", sub: "4 Oct 2023, BUSL", x: 390, y: 55, w: 150, h: 50 },
      { id: "ibm", label: "IBM acquisition", sub: "announced 24 Apr 2024", x: 570, y: 55, w: 150, h: 50 },
      { id: "tf110", label: "Terraform 1.10+", sub: "ephemeral values", x: 750, y: 55, w: 170, h: 50 },
      { id: "wrapper", label: "Apply platform", sub: "runs tf or tofu", x: 210, y: 175, w: 150, h: 50 },
      { id: "tfreg", label: "registry.terraform.io", sub: "terraform default", x: 420, y: 175, w: 170, h: 50 },
      { id: "tofureg", label: "registry.opentofu.org", sub: "tofu default", x: 630, y: 175, w: 170, h: 50 },
      { id: "fork", label: "OpenTF fork", sub: "25 Aug 2023", x: 210, y: 300, w: 150, h: 50 },
      { id: "lf", label: "OpenTofu at LF", sub: "20 Sep 2023", x: 390, y: 300, w: 150, h: 50 },
      { id: "tofu16", label: "OpenTofu 1.6.0", sub: "GA 10 Jan 2024", x: 570, y: 300, w: 150, h: 50 },
      { id: "tofu17", label: "OpenTofu 1.7+", sub: "state encryption", x: 750, y: 300, w: 170, h: 50 },
    ],
    edges: [
      { id: "e-relic", from: "mpl", to: "bsl", label: "relicensed" },
      { id: "e-fork", from: "mpl", to: "fork", label: "forked" },
      { id: "e-b1", from: "bsl", to: "tf16" },
      { id: "e-b2", from: "tf16", to: "ibm" },
      { id: "e-b3", from: "ibm", to: "tf110" },
      { id: "e-f1", from: "fork", to: "lf" },
      { id: "e-f2", from: "lf", to: "tofu16" },
      { id: "e-f3", from: "tofu16", to: "tofu17" },
      { id: "e-tfreg", from: "tf16", to: "tfreg" },
      { id: "e-tofureg", from: "tofu16", to: "tofureg" },
      { id: "e-run1", from: "wrapper", to: "tf16", label: "runs" },
      { id: "e-run2", from: "wrapper", to: "tofu16", label: "runs" },
    ],
    steps: [
      { text: "One codebase, two projects. The top lane is HashiCorp Terraform, the bottom lane is OpenTofu, and the middle row is what the org actually runs: an apply platform and registries. Press Next." },
      { text: "Decide on what the org depends on around the binary: the apply platform with its policies and private registry, features only one tool has, license terms for what you build, and vendor support. Daily commands are nearly the same.", on: ["wrapper", "tfreg", "tofureg"] },
      { text: "The cost is the platform. Thousands of workspaces on HCP Terraform or Terraform Enterprise can't just swap binaries: moving means leaving that platform's runs, policy sets and private registry. Price that migration, not the CLI.", on: ["wrapper", "tf16"], flow: ["e-run1"] },
      { text: "The license is why the question exists. Terraform was MPL 2.0 up to 1.5.7 (7 September 2023). On 10 August 2023 HashiCorp announced BUSL 1.1 for future releases, allowing use except in a competing offering. 1.6.0 (4 October 2023) was the first BUSL release.", on: ["mpl", "bsl", "tf16"], flow: ["e-relic", "e-b1"] },
      { text: "Vendors forked the MPL code as OpenTF on 25 August 2023. The Linux Foundation announced it as OpenTofu on 20 September 2023, 1.6.0 went GA on 10 January 2024, and it joined the CNCF as a Sandbox project on 23 April 2025.", on: ["mpl", "fork", "lf", "tofu16"], flow: ["e-fork", "e-f1", "e-f2"] },
      { text: "IBM announced it would acquire HashiCorp on 24 April 2024 and completed the deal on 27 February 2025. Terraform stayed under BUSL.", on: ["ibm"], flow: ["e-b2"] },
      { text: "The tools diverge every release. OpenTofu has state and plan encryption (1.7.0), variables in backend and module sources (1.8.0) and `for_each` on providers (1.9.0). Terraform has Stacks, ephemeral values (1.10.0) and write-only arguments (1.11.0); OpenTofu added those two in its 1.11.0.", on: ["tofu17", "tf110"], flow: ["e-f3", "e-b3"] },
      { text: "Short addresses resolve per tool: `hashicorp/aws` means `registry.terraform.io` to Terraform and `registry.opentofu.org` to OpenTofu. The plugin protocol is shared, so providers work in both. Check that your private registry serves both tools.", on: ["tf16", "tofu16", "tfreg", "tofureg"], flow: ["e-tfreg", "e-tofureg"] },
      { text: "Running both? Write it down as policy: pin the tool and version per root module, let the apply platform pick the binary per project (Atlantis `terraform_distribution`), and keep shared modules to features both tools have.", on: ["wrapper", "tf16", "tofu16"], flow: ["e-run1", "e-run2"] },
      { text: "Migrate in waves, starting with roots whose state is backed up and whose plans are empty. OpenTofu's guide says to migrate dependent configurations before their dependencies, because Terraform may not reliably read state OpenTofu wrote. Prove a no-op `tofu plan` before the first apply.", on: ["wrapper", "tofu16"], flow: ["e-run2"] },
      { text: "Upgrades within one tool need the same no-op check. OpenTofu 1.13 removed WinRM for provisioners, and its `base64gzip` output is no longer byte-for-byte identical, so configs using it show a change.", on: ["tofu17"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "Same source, two registries",
        src: `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
# terraform -> registry.terraform.io/hashicorp/aws
# tofu      -> registry.opentofu.org/hashicorp/aws`,
      },
      {
        lang: "hcl",
        label: "OpenTofu only (1.8+): early evaluation",
        src: `variable "env" {
  type = string
}

terraform {
  backend "s3" {
    bucket = "acme-tfstate"
    key    = "\${var.env}/network.tfstate"
    region = "eu-central-1"
  }
}`,
      },
    ],
    codeNote: "The second file works in OpenTofu 1.8 and later and fails in Terraform, which does not allow variables in backend blocks. Code like this ties a repository to one tool.",
    say30: "I'd decide on what the org depends on around the binary: the apply platform with its runs, policies and private registry, features only one tool has, license terms for what we build, and vendor support. With thousands of workspaces on HCP Terraform, switching means leaving that platform, which is the real cost. The background: HashiCorp moved to BUSL 1.1 in August 2023, and the MPL fork became OpenTofu, GA in January 2024. They now diverge: OpenTofu has state encryption, Terraform has Stacks. If we run both, the policy is a pinned tool and version per root module, shared modules on common features, and migration in waves, dependents first, each proven by a no-op plan.",
    gotchas: [
      "The license change was not retroactive. 1.5.7 and earlier stay MPL 2.0; only 1.6.0 and later are BUSL.",
      "Compatibility is per feature now. OpenTofu-only syntax (encryption blocks, variables in backend blocks) and Terraform-only features (Stacks, HCP Terraform integrations) lock a repo to one tool.",
      "Same name, different feature version. Both have provider-defined functions and ephemeral values, shipped at different versions, so `required_version` checks don't translate.",
      "Whether BUSL affects you depends on what you build. That is a question for your legal team.",
    ],
    agentic: [
      "Registry grounding is tool-specific: HashiCorp's Terraform MCP server reads the Terraform registry, and OpenTofu publishes its own MCP server for the OpenTofu registry. An agent grounded on one can still suggest features only the other has, such as Stacks or OpenTofu state encryption, so `validate` with the pinned binary is the check.",
      "Models learned from years of mixed Terraform and OpenTofu content and can blend syntax across versions. The pinned `required_version` and the binary in CI decide what is valid, not the model's memory.",
      "Choosing Terraform or OpenTofu is still a human decision about license terms, support contracts and platform. An agent can diff changelogs quickly, but it cannot weigh your contract or your risk appetite.",
    ],
    quiz: [
      { q: "Which was the first Terraform release under the Business Source License, and the last under MPL 2.0?", a: "1.6.0 (4 October 2023) was the first BUSL release. 1.5.7 (7 September 2023) was the last MPL 2.0 release." },
      { q: "Name two features OpenTofu shipped that Terraform does not have.", a: "Client-side state and plan encryption (1.7.0) and early evaluation of variables and locals in backend settings (1.8.0); Terraform 1.15.0 added them only for module `source` and `version`. `for_each` on provider blocks and `-exclude` (1.9.0) are others." },
      { q: "Your fleet is moving to OpenTofu. Which configurations go first, producers or consumers?", a: "Consumers first, producers last. OpenTofu can read Terraform state, but Terraform may not reliably read state OpenTofu wrote, so anything still on Terraform should only read Terraform-written state." },
    ],
    incidents: [],
    sources: [
      { title: "HashiCorp adopts the Business Source License (10 Aug 2023)", url: "https://www.hashicorp.com/en/blog/hashicorp-adopts-business-source-license" },
      { title: "Linux Foundation: Announcing OpenTofu (20 Sep 2023)", url: "https://www.linuxfoundation.org/press/announcing-opentofu" },
      { title: "OpenTofu is going GA (10 Jan 2024)", url: "https://opentofu.org/blog/opentofu-is-going-ga/" },
      { title: "OpenTofu releases and CHANGELOG", url: "https://github.com/opentofu/opentofu/releases" },
      { title: "Terraform releases", url: "https://github.com/hashicorp/terraform/releases" },
      { title: "IBM to acquire HashiCorp (24 Apr 2024)", url: "https://newsroom.ibm.com/2024-04-24-IBM-to-Acquire-HashiCorp-Inc-Creating-a-Comprehensive-End-to-End-Hybrid-Cloud-Platform" },
      { title: "HashiCorp officially joins the IBM family (27 Feb 2025)", url: "https://www.hashicorp.com/en/blog/hashicorp-officially-joins-the-ibm-family" },
      { title: "OpenTofu: provider registry protocol", url: "https://opentofu.org/docs/internals/provider-registry-protocol/" },
      { title: "Terraform: provider requirements", url: "https://developer.hashicorp.com/terraform/language/providers/requirements" },
      { title: "Atlantis: server configuration", url: "https://www.runatlantis.io/docs/server-configuration" },
      { title: "Atlantis: repo-level atlantis.yaml (terraform_distribution)", url: "https://www.runatlantis.io/docs/repo-level-atlantis-yaml" },
      { title: "OpenTofu: migration guide", url: "https://opentofu.org/docs/intro/migration/migration-guide/" },
      { title: "OpenTofu: migrating interdependent configurations", url: "https://opentofu.org/docs/intro/migration/multiple-configurations/" },
      { title: "Terraform MCP server", url: "https://developer.hashicorp.com/terraform/mcp-server" },
      { title: "opentofu/opentofu-mcp-server (GitHub)", url: "https://github.com/opentofu/opentofu-mcp-server" },
      { title: "OpenTofu 1.13.0 (29 Sep 2026)", url: "https://opentofu.org/blog/opentofu-1-13-0/" },
    ],
  },
  {
    id: "ephemeral-secrets",
    n: 7,
    title: "Keeping secrets out of state",
    question: "Thousands of states hold plaintext passwords. How do you get them out across the fleet, and rotate them?",
    view: [900, 400],
    nodes: [
      { id: "src", label: "Secret store", sub: "Vault, AWS SM", kind: "store", x: 10, y: 60, w: 150, h: 50 },
      { id: "eph", label: "ephemeral block", sub: "open, renew, close", x: 220, y: 60, w: 150, h: 50 },
      { id: "wo", label: "password_wo", sub: "write-only arg", x: 440, y: 60, w: 150, h: 50 },
      { id: "prov", label: "Provider", sub: "plugin", x: 680, y: 60, w: 140, h: 50 },
      { id: "db", label: "Database", sub: "password set", kind: "store", x: 680, y: 190, w: 140, h: 50 },
      { id: "evar", label: "ephemeral var", sub: "ephemeral = true", x: 220, y: 190, w: 150, h: 50 },
      { id: "ver", label: "password_wo_version", sub: "a plain number", x: 440, y: 190, w: 170, h: 50 },
      { id: "state", label: "State + plan", sub: "no secret inside", kind: "store", x: 440, y: 320, w: 170, h: 50 },
      { id: "sens", label: "sensitive = true", sub: "masked, still stored", x: 10, y: 320, w: 170, h: 50 },
      { id: "encr", label: "OpenTofu encryption", sub: "encrypts whole file", x: 680, y: 320, w: 190, h: 50 },
    ],
    edges: [
      { id: "e-read", from: "src", to: "eph", bidir: true },
      { id: "e-pass", from: "eph", to: "wo" },
      { id: "e-evar", from: "evar", to: "wo" },
      { id: "e-wo", from: "wo", to: "prov", label: "sends" },
      { id: "e-api", from: "prov", to: "db", label: "creates" },
      { id: "e-track", from: "wo", to: "ver" },
      { id: "e-ver", from: "ver", to: "state", label: "stored" },
      { id: "e-sens", from: "sens", to: "state", label: "whole value stored" },
      { id: "e-encr", from: "encr", to: "state" },
    ],
    steps: [
      { text: "Two ways a secret reaches a resource. The old way stores it in state, where every role that can read the state can read it. The new way keeps it in memory for one run. Press Next." },
      { text: "State and plan files record every attribute, passwords included. One state read by many pipelines means every one of those roles can read every secret in it, so split state and grant read access per state.", on: ["state"] },
      { text: "`sensitive = true` only hides values in CLI output and the HCP Terraform UI. State and plan files still store them in full, and `terraform output -json` prints them.", on: ["sens", "state"], flow: ["e-sens"] },
      { text: "Terraform 1.10.0 (27 November 2024) added ephemeral resources, opened when needed, read again in each phase, renewed if a lease runs out, then closed and never saved. Ephemeral variables and child-module outputs came with it.", on: ["src", "eph", "evar"], flow: ["e-read"] },
      { text: "Ephemeral values may only flow into locals, other ephemeral blocks, provider configuration, provisioners and write-only arguments. Anywhere else is an error at plan time.", on: ["eph", "evar", "wo"], flow: ["e-pass", "e-evar"] },
      { text: "Terraform 1.11.0 (27 February 2025) added write-only arguments, named with `_wo`, such as `password_wo`. The provider gets the value and Terraform never stores it. They need a provider upgrade first, so track which resources across the fleet still store secrets in state.", on: ["wo", "prov", "db"], flow: ["e-wo", "e-api"] },
      { text: "Terraform can't diff a value it never saved, so you rotate by bumping `password_wo_version`. A shared credential across hundreds of workspaces then means a bump and apply in each; an ephemeral read from Vault or a secret manager uses the current value on every run.", on: ["wo", "ver", "state", "src"], flow: ["e-track", "e-ver"] },
      { text: "OpenTofu took a different first step: state and plan encryption in 1.7.0 (30 April 2024). Use a KMS key per state and `enforced = true`, so a missing key setting can't write plaintext state. A lost key makes that state unrecoverable.", on: ["encr", "state"], flow: ["e-encr"] },
      { text: "Whatever the tool, lock down the backend: encryption at rest, read access as tight as the secrets themselves, and audit logs of who read state.", on: ["state"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "Terraform 1.11+: secret never in state",
        src: `ephemeral "random_password" "db" {
  length = 16
}

resource "aws_db_instance" "main" {
  # ...
  password_wo         = ephemeral.random_password.db.result
  password_wo_version = 1 # bump to rotate
}`,
      },
      {
        lang: "hcl",
        label: "Terraform 1.10+: ephemeral input",
        src: `variable "ci_token" {
  type      = string
  ephemeral = true # not in plan or state
  sensitive = true # also masked in output
}`,
      },
      {
        lang: "hcl",
        label: "OpenTofu 1.7+: encrypt the state",
        src: `terraform {
  encryption {
    key_provider "aws_kms" "k" {
      kms_key_id = "alias/tofu-state"
      region     = "eu-central-1"
      key_spec   = "AES_256"
    }
    method "aes_gcm" "m" {
      keys = key_provider.aws_kms.k
    }
    state {
      method   = method.aes_gcm.m
      enforced = true
    }
  }
}`,
      },
    ],
    codeNote: "In the first example the password is not kept anywhere after the run. The Terraform docs pair it with storing the password in a secret manager when something else needs it.",
    say30: "Across a fleet, every role that can read a state can read its secrets, and `sensitive` only masks output. So I split state and grant read per state, then move secrets out. Terraform 1.10 added ephemeral resources, variables and module outputs, which never reach plan or state, and 1.11 added write-only arguments like `password_wo`. Those need provider upgrades, so I track which resources still store secrets and migrate them. Rotation is a version bump per workspace, or an ephemeral read from Vault on every run. OpenTofu encrypts state with a KMS key per state and `enforced = true`. Either way, the backend stays locked down: encryption, tight reads, audit logs.",
    gotchas: [
      "`sensitive` is a display flag. The value is still in state and plan files.",
      "Terraform can't detect drift in a write-only value. Rotation happens only when you change the version argument.",
      "`terraform_remote_state` needs read access to the whole state snapshot, not just outputs, so it exposes every secret stored there.",
    ],
    agentic: [
      "Anything in plan or state is something an agent can read once it explains plans (the MCP server has `get_plan_json_output` and `get_plan_logs`) or opens a state file. Values from ephemeral resources and write-only arguments are never stored in those files, so the agent can explain the change without ever seeing the password.",
      "Keep secrets out of the agent's context entirely: it writes `ephemeral` blocks that fetch from Vault or a secret manager at run time, and the runner identity, not the agent, holds that credential. `sensitive = true` only masks output, so an agent with state read access still sees the value.",
      "An agent that reads a state full of secrets and also reads untrusted text (issues, docs, tool output) and can reach the network has Simon Willison's lethal trifecta. Remove a leg: no state-backend read for the agent, and an egress allowlist.",
    ],
    quiz: [
      { q: "A variable is marked `sensitive = true`. Is its value in the state file?", a: "Yes, if it is used in a resource or output. `sensitive` only redacts it in CLI and UI output; state and plan files store it in full." },
      { q: "How do you rotate a password that was set through a write-only argument?", a: "Change the value and increase the companion version argument (for example `password_wo_version` from 1 to 2). Terraform stores only the version, so the version change is what triggers the update." },
      { q: "How does OpenTofu's state encryption differ from ephemeral values?", a: "Encryption keeps the secret in state but encrypts the whole file with a key you control. Ephemeral values never write the secret to state or plan at all." },
    ],
    incidents: [],
    sources: [
      { title: "Terraform: Manage sensitive data", url: "https://developer.hashicorp.com/terraform/language/manage-sensitive-data" },
      { title: "Terraform: ephemeral block", url: "https://developer.hashicorp.com/terraform/language/block/ephemeral" },
      { title: "Terraform: Write-only arguments", url: "https://developer.hashicorp.com/terraform/language/manage-sensitive-data/write-only" },
      { title: "Terraform: terraform_remote_state data source", url: "https://developer.hashicorp.com/terraform/language/state/remote-state-data" },
      { title: "Terraform v1.10 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.10/CHANGELOG.md" },
      { title: "Terraform v1.11 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.11/CHANGELOG.md" },
      { title: "OpenTofu: State and plan encryption", url: "https://opentofu.org/docs/language/state/encryption/" },
      { title: "OpenTofu releases and CHANGELOG", url: "https://github.com/opentofu/opentofu/releases" },
      { title: "Terraform: ephemeral values and write-only arguments", url: "https://developer.hashicorp.com/terraform/language/manage-sensitive-data/ephemeral" },
      { title: "Terraform MCP server: tools reference", url: "https://developer.hashicorp.com/terraform/mcp-server/reference" },
      { title: "Simon Willison: The lethal trifecta for AI agents", url: "https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/" },
    ],
  },
  {
    id: "stacks-scale",
    n: 8,
    title: "Workspaces, Stacks and deferred changes",
    question: "One state holds thousands of resources, plans take twenty minutes, and the same stack runs in twenty regions. How do you split, order and roll it out?",
    view: [940, 410],
    groups: [
      { id: "g-split", label: "Split state: one per component", x: 170, y: 150, w: 600, h: 100 },
      { id: "g-stack", label: "HCP Terraform Stacks", x: 170, y: 285, w: 760, h: 110 },
    ],
    nodes: [
      { id: "runner", label: "terraform plan", sub: "or apply", kind: "actor", x: 10, y: 50, w: 130, h: 50 },
      { id: "lock", label: "State lock", sub: "one writer", x: 180, y: 50, w: 130, h: 50 },
      { id: "state", label: "State", sub: "one root module", kind: "store", x: 350, y: 50, w: 130, h: 50 },
      { id: "refresh", label: "Refresh", sub: "read every object", x: 520, y: 50, w: 150, h: 50 },
      { id: "api", label: "Cloud APIs", sub: "rate limited", kind: "store", x: 720, y: 50, w: 150, h: 50 },
      { id: "net", label: "network", sub: "own state", x: 180, y: 180, w: 130, h: 50 },
      { id: "clu", label: "cluster", sub: "own state", x: 400, y: 180, w: 130, h: 50 },
      { id: "app", label: "apps", sub: "own state", x: 620, y: 180, w: 130, h: 50 },
      { id: "stack", label: "Components", sub: ".tfcomponent.hcl", x: 180, y: 320, w: 150, h: 50 },
      { id: "deps", label: "Deployments", sub: ".tfdeploy.hcl", x: 380, y: 320, w: 150, h: 50 },
      { id: "defer", label: "Deferred changes", sub: "partial plan", x: 580, y: 320, w: 150, h: 50 },
      { id: "conv", label: "Convergence", sub: "replan until empty", x: 770, y: 320, w: 150, h: 50 },
    ],
    edges: [
      { id: "e-lock", from: "runner", to: "lock" },
      { id: "e-st", from: "lock", to: "state" },
      { id: "e-ref", from: "state", to: "refresh" },
      { id: "e-api", from: "refresh", to: "api" },
      { id: "e-split", from: "state", to: "clu", label: "split into" },
      { id: "e-o1", from: "net", to: "clu", label: "outputs" },
      { id: "e-o2", from: "clu", to: "app", label: "outputs" },
      { id: "e-comp", from: "clu", to: "stack", label: "module source" },
      { id: "e-dep", from: "stack", to: "deps" },
      { id: "e-def", from: "deps", to: "defer" },
      { id: "e-conv", from: "defer", to: "conv", bidir: true },
      { id: "e-apply", from: "conv", to: "api", label: "applies" },
    ],
    steps: [
      { text: "Three ways to organize the same infrastructure: one big state (top), one state per component (middle), and HCP Terraform Stacks (bottom). Press Next to see why orgs move down the page." },
      { text: "A big state hurts everyone who shares it. Every plan and apply takes the one lock, so other teams and PRs queue behind it. Plan on PR and apply on merge, and use `-lock-timeout` so runs wait instead of failing.", on: ["runner", "lock", "state"], flow: ["e-lock", "e-st"] },
      { text: "Plan refreshes first: it reads every object in state from the provider's API at a default `-parallelism` of 10. Pipelines across the org share each account's API quota, so lower parallelism, spread work across accounts and regions, and stagger drift plans.", on: ["state", "refresh", "api"], flow: ["e-ref", "e-api"] },
      { text: "`-refresh=false` and `-target` are escape hatches. The first trusts stale state and misses console changes; the docs say not to use the second routinely because it hides drift.", on: ["runner", "refresh"] },
      { text: "The lasting fix is smaller states, split by environment and component until each plan takes a few minutes. Keep long-lived shared pieces such as network and IAM apart from fast-changing apps. Each state gets its own lock, refresh and blast radius.", on: ["state", "net", "clu", "app"], flow: ["e-split"] },
      { text: "The price is wiring. Later states read earlier outputs, and something must apply them in order. Hand-built pipelines with `terraform_remote_state` reads break when that order changes, and the reads need access to the whole upstream state.", on: ["net", "clu", "app"], flow: ["e-o1", "e-o2"] },
      { text: "Stacks move that wiring into HCP Terraform. A `.tfcomponent.hcl` file lists components: each is an ordinary module with its inputs and providers, and all share one lifecycle.", on: ["clu", "stack"], flow: ["e-comp"] },
      { text: "A `.tfdeploy.hcl` file lists deployments, one per environment, account or region, each with isolated state. The docs set limits of 20 deployments, 100 components and 10,000 resources per Stack. Roll a change to one region's deployment first.", on: ["stack", "deps"], flow: ["e-dep"] },
      { text: "Deferred changes: when a value is unknown at plan time, such as a Kubernetes cluster that doesn't exist yet, Stacks make a partial plan and defer what can't be planned, instead of failing.", on: ["deps", "defer"], flow: ["e-def"] },
      { text: "After each apply, HCP Terraform runs a convergence check: it replans until the plan is empty. An `empty_plan` auto-approve rule exists by default. In the CLI, deferral is still an experiment (`-allow-deferral`), available only in alpha builds.", on: ["defer", "conv", "api"], flow: ["e-conv", "e-apply"] },
      { text: "Stacks entered public beta at HashiConf in October 2024. HashiCorp announced general availability on 25 September 2025 for HCP Terraform plans priced by resources under management. Terraform 1.13.0 added a `terraform stacks` command.", on: ["stack", "deps", "defer", "conv"] },
    ],
    code: [
      {
        lang: "hcl",
        label: "One small state per component",
        src: `# network/backend.tf
terraform {
  backend "s3" {
    bucket       = "acme-tfstate"
    key          = "prod/network.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true # S3-native lock, GA in 1.11
  }
}`,
      },
      {
        lang: "hcl",
        label: "Stacks: components.tfcomponent.hcl",
        src: `component "cluster" {
  source = "./modules/eks"

  inputs = {
    region = var.region
  }

  providers = {
    aws = provider.aws.main
  }
}`,
      },
    ],
    codeNote: "Deployments are declared separately in a `.tfdeploy.hcl` file, one `deployment` block per environment or region, each with its own inputs and state.",
    say30: "A big state hurts everyone who shares it: one lock queues every team's change, every plan refreshes every object against shared API quotas, and a mistake can reach everything. `-refresh=false` and `-target` are escape hatches. I split state by environment and component until plans take a few minutes, and keep network and IAM apart from fast-changing apps. Then the order between states needs orchestration. HCP Terraform Stacks provide it: components are modules, deployments are environments or regions with isolated state, and deferred changes let a plan proceed when values are unknown, replanning until it converges. A change goes to one region's deployment first. Stacks went GA in September 2025.",
    gotchas: [
      "`-target` is for recovery, not routine work. Using it regularly lets state and configuration drift apart unnoticed.",
      "Stacks are an HCP Terraform feature. Community Terraform has the `terraform stacks` command for talking to HCP Terraform, and deferral in plain `terraform plan` is still experimental.",
      "Splitting state does not remove dependencies. It moves them between states, where only your pipeline knows the order.",
    ],
    agentic: [
      "The Terraform MCP server (GA June 2026) lets an agent query HCP Terraform workspaces, runs and Stacks (`list_workspaces`, `get_run_details`, `list_stacks`), which helps triage which of hundreds of plans needs a human. Its riskier tools (`action_run`, workspace delete, `force_unlock_workspace`, and `create_run` with auto-approve or destroy) stay off unless `ENABLE_TF_OPERATIONS=true`. Workspace create and update, and team tools such as `grant_team_access`, are not gated; only `delete_team` is.",
      "The GA post says the server enforces your existing Terraform authentication and authorization, so an agent with a broad org token is an OWASP LLM06:2025 Excessive Agency problem. Scope the token to the projects it should touch; the wrong workspace name is the IaC version of the wrong kube context.",
      "Agents raise change volume, and DORA 2025 still links AI adoption to lower delivery stability. With many states, keep the gate where it was: a plan per state, mandatory policy, human apply approval, and one region first for Stacks deployments.",
    ],
    quiz: [
      { q: "Why does plan time grow with state size even when nothing changed?", a: "Plan refreshes first: it reads every resource in state from the provider's API, at a default parallelism of 10, before comparing with configuration." },
      { q: "What is a deferred change in Stacks?", a: "When some values are unknown at plan time, for example a cluster's endpoint before the cluster exists, Stacks plan what they can, defer the rest, and replan after apply until the plan is empty (a convergence check)." },
      { q: "When would you use `-target` in production?", a: "Only in exceptional cases, such as recovering from a mistake or working around a Terraform limitation. For routine work, split the configuration so each part can be applied on its own." },
    ],
    incidents: ["rust-lang-2023-crates-dns-terraform"],
    sources: [
      { title: "Terraform: plan command", url: "https://developer.hashicorp.com/terraform/cli/commands/plan" },
      { title: "Terraform: State locking", url: "https://developer.hashicorp.com/terraform/language/state/locking" },
      { title: "Terraform: S3 backend", url: "https://developer.hashicorp.com/terraform/language/backend/s3" },
      { title: "Terraform: Stacks overview", url: "https://developer.hashicorp.com/terraform/language/stacks" },
      { title: "Terraform: component block", url: "https://developer.hashicorp.com/terraform/language/block/stack/tfcomponent/component" },
      { title: "HCP Terraform: Stacks deployment runs", url: "https://developer.hashicorp.com/terraform/cloud-docs/stacks/deploy/runs" },
      { title: "Terraform Stacks, explained", url: "https://www.hashicorp.com/en/blog/terraform-stacks-explained" },
      { title: "HashiConf 2025: Terraform and Packer features (25 Sep 2025)", url: "https://www.hashicorp.com/en/blog/scale-infrastructure-with-new-terraform-and-packer-features-at-hashiconf-2025" },
      { title: "Terraform: terraform_remote_state data source", url: "https://developer.hashicorp.com/terraform/language/state/remote-state-data" },
      { title: "Terraform v1.11 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.11/CHANGELOG.md" },
      { title: "Terraform v1.13 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.13/CHANGELOG.md" },
      { title: "Terraform MCP server is now generally available (11 Jun 2026)", url: "https://www.hashicorp.com/en/blog/terraform-mcp-server-is-now-generally-available" },
      { title: "Terraform MCP server: tools reference", url: "https://developer.hashicorp.com/terraform/mcp-server/reference" },
      { title: "hashicorp/terraform-mcp-server (GitHub)", url: "https://github.com/hashicorp/terraform-mcp-server" },
      { title: "OWASP LLM06:2025 Excessive Agency", url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/" },
      { title: "Announcing the 2025 DORA report", url: "https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report" },
    ],
  },
];
