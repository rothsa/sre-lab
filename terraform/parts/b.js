// Chapters 5-8: testing, the license change and OpenTofu, secrets out of state, Terraform at scale.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`: see ../../drawn/README.md).
export const CHAPTERS = [
  {
    id: "terraform-test",
    n: 5,
    title: "Testing with terraform test",
    question: "How do you test a Terraform module with the built-in `terraform test` framework, and when do the tests create real infrastructure?",
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
      { text: "The whole test loop. A test file is a list of `run` blocks. Each run either plans or applies the module, then checks assertions. Press Next to follow one file." },
      { text: "`terraform test` became generally available in Terraform 1.6.0 (4 October 2023). It finds `.tftest.hcl` (or `.tftest.json`) files and runs the `run` blocks in each file in order.", on: ["dev", "tfile"], flow: ["e-read"] },
      { text: "A run with `command = plan` only plans. Nothing is created, so it is fast and free, like a unit test. It can only assert on values that are known at plan time.", on: ["tfile", "run1"], flow: ["e-r1"] },
      { text: "Each `assert` has a `condition` and an `error_message`. It can read resources, outputs of this run, and outputs of earlier runs. A failed condition fails the run, not the whole file.", on: ["run1", "assert", "result"], flow: ["e-a1", "e-res"] },
      { text: "A run with no `command` defaults to `apply`. Terraform calls the real provider with real credentials and creates real resources, which take time and cost money.", on: ["tfile", "run2", "provider", "infra"], flow: ["e-r2", "e-prov", "e-infra"] },
      { text: "Terraform keeps test state in memory: one state for the main configuration per file, plus one per alternate `module`. Later runs build on that state. Terraform 1.11 added `state_key` to choose which state a run uses.", on: ["run2", "state"], flow: ["e-state"] },
      { text: "Assertions in an apply run see real computed values, such as an ARN or an IP address, so they catch what a plan cannot.", on: ["run2", "assert", "result"], flow: ["e-a2", "e-res"] },
      { text: "Terraform 1.7.0 (17 January 2024) added mocks. `mock_provider` replaces a provider and invents computed values; `override_resource`, `override_data` and `override_module` pin specific values. An apply run then needs no cloud account at all.", on: ["run2", "mock"], flow: ["e-mock"] },
      { text: "Mocked values are generated during apply. In plan runs they show as unknown, unless you set `override_during = plan` (Terraform 1.11).", on: ["run1", "mock"] },
      { text: "At the end of each file, Terraform tries to destroy everything it created, in reverse run order (simplified to this in 1.7.0). If the destroy fails, the resources stay behind and you clean them up.", on: ["state", "destroy", "infra"], flow: ["e-end", "e-del"] },
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
    say30: "`terraform test`, GA in Terraform 1.6, runs `.tftest.hcl` files. Each file has `run` blocks that execute in order. A run with `command = plan` only plans, so it is a cheap unit test. A run defaults to `apply`, which creates real resources with real credentials, checks `assert` blocks against real values, and at the end of the file Terraform destroys everything in reverse run order. Since 1.7 you can mock providers and override resources, data sources and modules, so most tests need no cloud account. Unlike Terratest, a Go library that applies, probes and destroys, it is plain HCL next to the module. In practice: mocked plan tests on every PR, real apply tests on a schedule.",
    gotchas: [
      "A run defaults to `apply`, not `plan`. Forget `command = plan` and every PR creates real infrastructure.",
      "Cleanup is best effort. If a destroy fails or the CI job is killed, the in-memory state is gone and the resources are orphaned. A `test cleanup` command exists only as an experiment so far.",
      "Mocks invent values: strings are random 8-character text, numbers are 0. A mocked test proves your logic, not that the cloud accepts the request.",
      "Terratest is different: it is Go code that shells out to `terraform`, then can check the result over HTTP or cloud APIs. It fits end-to-end checks that HCL assertions cannot express.",
    ],
    atScale: [
      "Hundreds of modules with apply tests: every PR creates real databases and clusters, so CI takes tens of minutes and the cloud bill grows. Teams run mocked `command = plan` tests per PR and apply tests nightly or on module release.",
      "Leaked resources: failed destroys and killed runners leave orphans that nobody owns. Run apply tests in dedicated sandbox accounts, tag everything with the test run, and run a reaper job that deletes old tagged resources.",
      "Name collisions: parallel CI jobs testing the same module create the same bucket or role names. Generate unique names per run (a random suffix passed as a variable).",
      "Monorepos: running every test on every change does not scale. CI computes which module directories changed and runs `terraform test` only there; Terraform 1.12 also added parallel runs inside a file (`parallel = true`).",
      "Provider rate limits: many test pipelines applying at once share the same account's API quotas and start getting throttled. Spread tests across accounts or limit concurrent apply jobs.",
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
    title: "The license change and OpenTofu",
    question: "What happened to Terraform's license in 2023, where did OpenTofu come from, and how far have the two projects diverged?",
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
      { id: "wrapper", label: "Automation", sub: "runs tf or tofu", x: 210, y: 175, w: 150, h: 50 },
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
      { text: "One codebase, two projects. The top lane is HashiCorp Terraform, the bottom lane is OpenTofu, and the middle row is what an organization has to choose between. Press Next to walk the timeline." },
      { text: "Up to the 1.5 series, Terraform was licensed under the Mozilla Public License 2.0. The last MPL release was 1.5.7, published 7 September 2023.", on: ["mpl"] },
      { text: "On 10 August 2023 HashiCorp announced that future releases of its products would use the Business Source License (BUSL, or BSL) 1.1. Using it is still allowed, except in an offering that competes with HashiCorp. APIs and SDKs stayed MPL.", on: ["mpl", "bsl"], flow: ["e-relic"] },
      { text: "Terraform 1.6.0, released 4 October 2023, was the first Terraform release under BUSL 1.1. It also made `terraform test` generally available.", on: ["bsl", "tf16"], flow: ["e-b1"] },
      { text: "Vendors and users published the OpenTF manifesto asking HashiCorp to return to an open source license. When that did not happen, they announced a fork of the MPL code on 25 August 2023.", on: ["mpl", "fork"], flow: ["e-fork"] },
      { text: "On 20 September 2023 the Linux Foundation announced the project under its new name, OpenTofu. Early backers included Harness, Gruntwork, Spacelift, env0 and Scalr. On 23 April 2025 it joined the CNCF, also part of the Linux Foundation, as a Sandbox project.", on: ["fork", "lf"], flow: ["e-f1"] },
      { text: "OpenTofu 1.6.0, the first stable release, shipped on 10 January 2024 as a drop-in replacement for Terraform, with its own registry. The binary is `tofu`.", on: ["lf", "tofu16"], flow: ["e-f2"] },
      { text: "The registry split. A short address like `hashicorp/aws` means `registry.terraform.io/hashicorp/aws` to Terraform and `registry.opentofu.org/hashicorp/aws` to OpenTofu. The provider plugin protocol is shared, so the same providers work in both.", on: ["tf16", "tofu16", "tfreg", "tofureg"], flow: ["e-tfreg", "e-tofureg"] },
      { text: "Then the projects diverged. OpenTofu 1.7.0 (30 April 2024) added state and plan encryption, plus provider-defined functions. 1.8.0 (29 July 2024) allowed variables and locals in module sources and backend settings, which it calls early evaluation. 1.9.0 added `for_each` on providers and `-exclude`.", on: ["tofu16", "tofu17"], flow: ["e-f3"] },
      { text: "Terraform went its own way too: provider-defined functions in 1.8.0 (10 April 2024), ephemeral values in 1.10.0 (27 November 2024), write-only arguments in 1.11.0 (27 February 2025). OpenTofu added ephemeral values and write-only attributes in 1.11.0 (9 December 2025).", on: ["tf16", "ibm", "tf110", "tofu17"], flow: ["e-b2", "e-b3"] },
      { text: "IBM announced it would acquire HashiCorp on 24 April 2024, at $35 per share in cash, and completed the deal on 27 February 2025. Terraform stayed under BUSL.", on: ["ibm"] },
      { text: "Automation has to pick a binary. Atlantis has `--default-tf-distribution` with `terraform` or `opentofu`, Spacelift and env0 were founding OpenTofu backers, so check which Terraform versions each platform supports.", on: ["wrapper", "tf16", "tofu16"], flow: ["e-run1", "e-run2"] },
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
    say30: "In August 2023 HashiCorp moved its products from MPL 2.0 to the Business Source License 1.1, which forbids offering Terraform in a product that competes with HashiCorp. Terraform 1.5.7 was the last MPL release and 1.6.0, in October 2023, the first under BUSL. Vendors forked the MPL code as OpenTF, it joined the Linux Foundation as OpenTofu in September 2023, and OpenTofu 1.6.0 went GA in January 2024 with its own registry. Since then they have diverged: OpenTofu has state encryption and variables in backend blocks, Terraform has Stacks, and both added provider functions and ephemeral values. IBM completed its HashiCorp acquisition in February 2025. Choosing between them is mostly about features, support and your automation, not daily use.",
    gotchas: [
      "The license change was not retroactive. 1.5.7 and earlier stay MPL 2.0; only 1.6.0 and later are BUSL.",
      "Compatibility is per feature now. State files and most HCL move across, but OpenTofu-only syntax (encryption blocks, variables in backend blocks) and Terraform-only features (Stacks, HCP Terraform integrations) lock you in.",
      "Same name, different feature version. Both have provider-defined functions and ephemeral values, but they shipped at different versions, so `required_version` checks do not translate.",
      "Whether BUSL affects you depends on what you build. That is a question for your legal team, not something to settle in an interview.",
    ],
    atScale: [
      "Thousands of workspaces on HCP Terraform or Terraform Enterprise: switching means leaving the platform's runs, policies and private registry, so the real cost is the platform, not the binary.",
      "Mixed fleets: some teams on `terraform`, some on `tofu`. Pin the tool and version per root module, and have CI or the orchestrator (Atlantis, Spacelift, env0) select the binary per project.",
      "Private module and provider registries: make sure both tools can install from yours, and that no module uses features only one tool has.",
      "Migration at scale: move workspaces in waves, start with ones whose state is backed up and whose plans are empty, and keep one plan-only run with the new binary to prove a no-op diff before the first apply.",
      "Upgrades within one tool need the same no-op check: OpenTofu 1.13 removed WinRM for the `remote-exec` and `file` provisioners (a `winrm` connection is now an error), and its `base64gzip` output is equivalent but not byte-for-byte identical, so configurations using it show a change after upgrading.",
      "Feature divergence grows each release. Teams that need state encryption without a platform may lean to OpenTofu; teams that need Stacks or vendor support from HashiCorp/IBM stay on Terraform.",
    ],
    agentic: [
      "Registry grounding is tool-specific: HashiCorp's Terraform MCP server reads the Terraform registry, and OpenTofu publishes its own MCP server for the OpenTofu registry. An agent grounded on one can still suggest features only the other has, such as Stacks or OpenTofu state encryption, so `validate` with the pinned binary is the check.",
      "Models learned from years of mixed Terraform and OpenTofu content and can blend syntax across versions. The pinned `required_version` and the binary in CI decide what is valid, not the model's memory.",
      "Choosing Terraform or OpenTofu is still a human decision about license terms, support contracts and platform. An agent can diff changelogs quickly, but it cannot weigh your contract or your risk appetite.",
    ],
    quiz: [
      { q: "Which was the first Terraform release under the Business Source License, and the last under MPL 2.0?", a: "1.6.0 (4 October 2023) was the first BUSL release. 1.5.7 (7 September 2023) was the last MPL 2.0 release." },
      { q: "Name two features OpenTofu shipped that Terraform does not have.", a: "Client-side state and plan encryption (1.7.0) and early evaluation of variables and locals in backend settings (1.8.0); Terraform 1.15.0 added them only for module `source` and `version`. `for_each` on provider blocks and `-exclude` (1.9.0) are others." },
      { q: "Why does `hashicorp/aws` resolve differently in the two tools?", a: "A source address without a hostname uses the tool's default registry: `registry.terraform.io` for Terraform, `registry.opentofu.org` for OpenTofu." },
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
      { title: "Terraform MCP server", url: "https://developer.hashicorp.com/terraform/mcp-server" },
      { title: "opentofu/opentofu-mcp-server (GitHub)", url: "https://github.com/opentofu/opentofu-mcp-server" },
      { title: "OpenTofu 1.13.0 (29 Sep 2026)", url: "https://opentofu.org/blog/opentofu-1-13-0/" },
    ],
  },
  {
    id: "ephemeral-secrets",
    n: 7,
    title: "Keeping secrets out of state",
    question: "Why do Terraform state files contain secrets, and how do ephemeral values and write-only arguments keep them out?",
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
      { text: "Two ways a secret reaches a resource. The old way stores it in state. The new way keeps it in memory for one run. Press Next to compare them." },
      { text: "State and plan files record every attribute of every resource, including passwords and tokens. Local state is plain text, so anyone who can read the state can read the secrets.", on: ["state"] },
      { text: "`sensitive = true` (on input variables since Terraform 0.14) only hides values in CLI output and the HCP Terraform UI. Terraform still writes them in full to state and plan files, and `terraform output -json` prints them.", on: ["sens", "state"], flow: ["e-sens"] },
      { text: "Terraform 1.10.0 (27 November 2024) added ephemeral resources. An `ephemeral` block is opened only when needed, read again in each phase, renewed if a lease runs out, then closed. Nothing about it is saved.", on: ["src", "eph"], flow: ["e-read"] },
      { text: "The same release added ephemeral input variables and child-module outputs (`ephemeral = true`), for example a short-lived CI token. Root module outputs cannot be ephemeral.", on: ["evar"] },
      { text: "Ephemeral values may only flow into a few places: locals, other ephemeral blocks, provider configuration, provisioners, and write-only arguments. Anywhere else is an error at plan time.", on: ["eph", "evar", "wo"], flow: ["e-pass", "e-evar"] },
      { text: "Terraform 1.11.0 (27 February 2025) added write-only arguments, which providers name with a `_wo` suffix, such as `password_wo` on `aws_db_instance`. The provider receives the value and Terraform never stores it.", on: ["wo", "prov", "db"], flow: ["e-wo", "e-api"] },
      { text: "Terraform cannot diff a value it never saved, so it sends write-only values on every run. To rotate, you bump the companion `password_wo_version`, which is stored and tells the provider to apply the new value.", on: ["wo", "ver", "state"], flow: ["e-track", "e-ver"] },
      { text: "A secret generated with an ephemeral resource, such as `random_password`, is gone after the run. If anything else needs it later, write it to a secret store in the same run.", on: ["eph", "src"], flow: ["e-read"] },
      { text: "OpenTofu took a different first step: state and plan encryption in 1.7.0 (30 April 2024). Secrets stay in state, but OpenTofu encrypts the file with a key from a passphrase or a KMS before it is stored. OpenTofu 1.11.0 later added ephemeral values too.", on: ["encr", "state"], flow: ["e-encr"] },
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
    say30: "State records every attribute, so passwords end up in it, and `sensitive` only masks them in output: they are still stored. Terraform 1.10 added ephemeral values: ephemeral resources that fetch a secret fresh in each phase, and ephemeral variables and module outputs. They never reach the plan or state. Terraform 1.11 added write-only arguments, like `password_wo`, which accept those values and pass them to the provider without storing them. Because Terraform cannot diff them, you rotate by bumping a version argument. OpenTofu took a different first step: it encrypts the whole state and plan with a KMS key, and later added ephemeral values too. Either way, still lock down the backend: encrypt at rest, least-privilege access, audit logs.",
    gotchas: [
      "`sensitive` is a display flag. The value is still in state and plan files.",
      "Write-only arguments only exist where the provider implemented them. Many resources still have only the normal argument, which stores the secret.",
      "Terraform cannot detect drift in a write-only value. Rotation happens only when you change the version argument.",
      "`terraform_remote_state` needs read access to the whole state snapshot, not just outputs, so it exposes every secret stored there.",
    ],
    atScale: [
      "One shared state file read by many pipelines: every role that can read it can read every secret in it. Split state by component and grant read access per state, and share values through `tfe_outputs` or a parameter store instead of `terraform_remote_state`.",
      "Thousands of workspaces still on older providers: write-only arguments need a provider upgrade first. Track which resources still store secrets in state and migrate them as providers add `_wo` arguments.",
      "Rotating a shared credential across hundreds of workspaces means a version bump and an apply in each one. Many teams read the secret from Vault or a cloud secret manager with an ephemeral resource, so each run uses the current value.",
      "OpenTofu encryption keys: losing the key makes the state unrecoverable. The docs recommend a separate KMS key per state file and `enforced = true` so a missing key setting cannot write plain-text state.",
      "Backend hygiene: turn on encryption at rest (S3 `encrypt = true`, GCS customer-managed keys), restrict read access to the state bucket as tightly as the secrets themselves, and keep audit logs of who read state.",
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
    title: "Terraform at scale: workspaces, Stacks and deferred changes",
    question: "Your Terraform state has grown to thousands of resources and plans take twenty minutes. How do you split it, and what do Stacks and deferred changes add?",
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
      { text: "Three ways to organize the same infrastructure: one big state (top), one state per component (middle), and HCP Terraform Stacks (bottom). Press Next to see why teams move down the page." },
      { text: "Every plan and apply first takes the state lock, if the backend supports locking. Only one writer at a time; other runs wait (`-lock-timeout`) or fail. The S3 backend's native lock file, `use_lockfile`, became GA in Terraform 1.11.", on: ["runner", "lock", "state"], flow: ["e-lock", "e-st"] },
      { text: "By default, plan refreshes first: it reads every object in state from the provider's API. The number of API calls grows with the number of resources, at a default `-parallelism` of 10.", on: ["state", "refresh", "api"], flow: ["e-ref", "e-api"] },
      { text: "`-refresh=false` skips those reads and plans faster, but Terraform then ignores changes made outside it. `-target` plans a subset; the docs say not to use it routinely because it hides drift.", on: ["runner", "refresh"] },
      { text: "The lasting fix is smaller states. Split by environment and by component, for example network, cluster and apps. Each has its own lock, its own refresh and its own blast radius.", on: ["state", "net", "clu", "app"], flow: ["e-split"] },
      { text: "The price is wiring. Later components read earlier outputs, and something must apply them in order. `terraform_remote_state` works but needs read access to the whole upstream state.", on: ["net", "clu", "app"], flow: ["e-o1", "e-o2"] },
      { text: "Stacks move that wiring into HCP Terraform. A `.tfcomponent.hcl` file lists components: each is an ordinary module with its inputs and providers, and all share one lifecycle.", on: ["clu", "stack"], flow: ["e-comp"] },
      { text: "A `.tfdeploy.hcl` file lists deployments, one per environment, account or region. Each deployment has its own isolated state. The docs set limits of 20 deployments, 100 components and 10,000 resources per Stack.", on: ["stack", "deps"], flow: ["e-dep"] },
      { text: "Deferred changes: when a value is unknown at plan time, such as a Kubernetes cluster that does not exist yet, Stacks make a partial plan and defer what cannot be planned, instead of failing.", on: ["deps", "defer"], flow: ["e-def"] },
      { text: "After each apply, HCP Terraform runs a convergence check: it replans until the plan is empty. An `empty_plan` auto-approve rule exists by default. In the CLI, deferral is still an experiment (`-allow-deferral`), available only in alpha builds.", on: ["defer", "conv", "api"], flow: ["e-conv", "e-apply"] },
      { text: "Stacks entered public beta at HashiConf in October 2024. HashiCorp announced general availability on 25 September 2025 for HCP Terraform plans priced by resources under management. Terraform 1.13.0 added a `terraform stacks` command.", on: ["stack", "deps", "defer", "conv"] },
      { text: "One more tool for large codebases: provider-defined functions (Terraform 1.8.0, 10 April 2024). Providers ship functions called as `provider::<name>::<function>()`, which replaces glue code repeated across modules.", on: ["clu", "stack"] },
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
    say30: "A big state hurts in three ways: one lock serializes every change, refresh reads every resource from the cloud API on each plan, and a mistake can reach everything. `-refresh=false` and `-target` are escape hatches, not fixes. The fix is to split state by environment and component, with remote backends that lock and encrypt, and to pass outputs between them. Then you need orchestration. HCP Terraform Stacks provide that: components are modules, deployments are environments or regions with isolated state, and deferred changes let a plan proceed when values are unknown, like workloads on a cluster that does not exist yet, replanning until it converges. Stacks went GA in September 2025.",
    gotchas: [
      "`-target` is for recovery, not routine work. Using it regularly lets state and configuration drift apart unnoticed.",
      "`-refresh=false` makes plans fast by trusting stale state. A change made in the console is invisible to that plan.",
      "Stacks are an HCP Terraform feature. Community Terraform has the `terraform stacks` command for talking to HCP Terraform, and deferral in plain `terraform plan` is still experimental.",
      "Splitting state does not remove dependencies. It moves them between states, where only your pipeline knows the order.",
    ],
    atScale: [
      "Thousands of resources in one state: every plan refreshes all of them, so plans take many minutes and the lock is held the whole time. Split state until each plan finishes in a few minutes, and keep long-lived shared pieces (network, IAM) separate from fast-changing apps.",
      "Provider API rate limits: refresh and apply calls across many pipelines hit the same account quotas and get throttled. Lower `-parallelism`, spread work across accounts and regions, and stagger scheduled drift-detection plans.",
      "Lock contention: many teams or PRs targeting one state queue behind each other. Smaller states, plan-on-PR with apply-on-merge (Atlantis, HCP Terraform), and `-lock-timeout` instead of failing fast.",
      "Orchestrating dependent states: hand-built pipelines with remote-state reads break when the order changes. Stacks express components and deployments in one place and handle unknown values with deferred changes and convergence replans.",
      "Fan-out across regions and accounts: the same component in 20 regions means 20 states to plan and apply. Stacks deployments (up to 20 per Stack) or one workspace per region keep blast radius per region, and you roll a change to one region first.",
    ],
    agentic: [
      "The Terraform MCP server (GA June 2026) lets an agent query HCP Terraform workspaces, runs and Stacks (`list_workspaces`, `get_run_details`, `list_stacks`), which helps triage which of hundreds of plans needs a human. Its riskier tools (`action_run`, workspace create, update and delete, and `create_run` with auto-approve or destroy) stay off unless `ENABLE_TF_OPERATIONS=true`.",
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
      { title: "Terraform v1.8 CHANGELOG", url: "https://github.com/hashicorp/terraform/blob/v1.8/CHANGELOG.md" },
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
