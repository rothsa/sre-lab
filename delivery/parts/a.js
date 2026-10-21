// Chapters 1-4: CI as a shared service, artifact promotion, GitOps with Argo CD, progressive delivery with Argo Rollouts.
// Spec format: see ../../k8s/README.md (plus `code` and `codeNote`: see ../../drawn/README.md).
export const CHAPTERS = [
  // ---------------------------------------------------------------- 1
  {
    id: "ci-pipeline",
    n: 1,
    title: "CI as a shared service",
    question: "2,000 engineers share one CI. What has to stay fast and trusted for a pull request to merge, and which numbers tell you it is slipping?",
    view: [940, 480],
    groups: [
      { id: "g-run", label: "One pipeline run (each job on a runner)", x: 150, y: 160, w: 780, h: 190 },
    ],
    nodes: [
      { id: "dev", label: "Developer", sub: "push / open PR", kind: "actor", x: 10, y: 40, w: 120, h: 50 },
      { id: "git", label: "Git host", sub: "emits an event", x: 160, y: 40, w: 120, h: 50 },
      { id: "queue", label: "Job queue", sub: "waits for runner", x: 380, y: 40, w: 130, h: 50 },
      { id: "runner", label: "Runner", sub: "fresh VM per job", x: 590, y: 40, w: 150, h: 50 },
      { id: "fleet", label: "Runner fleet", sub: "autoscaler (ARC)", x: 790, y: 40, w: 140, h: 50 },
      { id: "checkout", label: "Checkout", sub: "repo at commit", x: 170, y: 200, w: 110, h: 50 },
      { id: "build", label: "Build", sub: "deps + compile", x: 310, y: 200, w: 110, h: 50 },
      { id: "unit", label: "Unit tests", sub: "parallel job", x: 450, y: 180, w: 120, h: 46 },
      { id: "integ", label: "Integration", sub: "parallel job", x: 450, y: 250, w: 120, h: 46 },
      { id: "package", label: "Package", sub: "image build", x: 600, y: 200, w: 110, h: 50 },
      { id: "publish", label: "Publish", sub: "main branch only", x: 740, y: 200, w: 140, h: 50 },
      { id: "cache", label: "Dependency cache", sub: "key: lockfile hash", kind: "store", x: 170, y: 400, w: 160, h: 50 },
      { id: "checks", label: "Required checks", sub: "branch protection", x: 430, y: 400, w: 160, h: 50 },
      { id: "merge", label: "Merge", sub: "or merge queue", x: 630, y: 400, w: 120, h: 50 },
      { id: "registry", label: "Registry", sub: "image + digest", kind: "store", x: 790, y: 400, w: 130, h: 50 },
    ],
    edges: [
      { id: "e-push", from: "dev", to: "git" },
      { id: "e-event", from: "git", to: "queue", label: "queues jobs", labelPos: 0.5 },
      { id: "e-assign", from: "queue", to: "runner", label: "assigns", labelPos: 0.5 },
      { id: "e-fleet", from: "fleet", to: "runner", label: "adds", labelPos: 0.5 },
      { id: "e-run", from: "runner", to: "checkout", label: "runs the steps", via: [[665, 135], [225, 135]], labelAt: [420, 133] },
      { id: "e-co", from: "checkout", to: "build" },
      { id: "e-unit", from: "build", to: "unit" },
      { id: "e-int", from: "build", to: "integ" },
      { id: "e-pk1", from: "unit", to: "package" },
      { id: "e-pk2", from: "integ", to: "package" },
      { id: "e-pub", from: "package", to: "publish" },
      { id: "e-cache", from: "build", to: "cache", label: "restore / save", bidir: true, labelPos: 0.6 },
      { id: "e-status", from: "integ", to: "checks", label: "reports status", labelPos: 0.55 },
      { id: "e-merge", from: "checks", to: "merge" },
      { id: "e-reg", from: "publish", to: "registry", label: "push", labelPos: 0.5 },
    ],
    steps: [
      { text: "One pull request's path through CI is the worked example. With 2,000 engineers on the same CI, the job is keeping the shared parts fast and trusted: runners, cache, required checks and the way into main. Press Next." },
      { text: "A push or pull request emits an event, and every workflow whose trigger matches queues jobs. Each job waits for a runner with matching labels. Queue time is a separate number from run time, and on a busy shared CI it is often the larger one.", on: ["dev", "git", "queue"], flow: ["e-push", "e-event"] },
      { text: "The runner fleet is a platform service. Track queue time per runner label and autoscale on `workflow_job` events or with Actions Runner Controller. Use `--ephemeral` runners: one job, then de-register, so nothing leaks between jobs and scale-in never kills a running job.", on: ["queue", "runner", "fleet"], flow: ["e-assign", "e-fleet"] },
      { text: "Each job checks out the exact commit (for a pull request, a merge ref) and restores dependencies from a cache keyed on the lockfile hash. GitHub's default is 10 GB of cache per repository, oldest evicted first, so a big monorepo runs cold. Every branch can restore from the default branch, so keep that cache warm.", on: ["runner", "checkout", "build", "cache"], flow: ["e-run", "e-co", "e-cache"] },
      { text: "Tests fan out as parallel jobs, from a matrix or GitLab's `needs`. In a monorepo, testing everything on every commit grows with the repo, not the change. Trigger jobs on changed paths, build only affected targets, and split the work into child pipelines.", on: ["build", "unit", "integ"], flow: ["e-unit", "e-int"] },
      { text: "On main, packaging pushes one image to the registry and records its digest. Long-lived cloud keys stored in CI are a high-value target. With OIDC each job gets a short-lived token whose repo, ref and environment claims the cloud role checks, so there is nothing long-lived to steal.", on: ["unit", "integ", "package", "publish", "registry"], flow: ["e-pk1", "e-pk2", "e-pub", "e-reg"] },
      { text: "Each job reports a status, and branch protection lists the checks that must pass. Across thousands of tests, a small per-test flake rate makes many runs fail somewhere, and each flake blocks a merge. Track flake rate per test, move flaky tests out of the required set and give them owners.", on: ["integ", "checks"], flow: ["e-status"] },
      { text: "With strict up-to-date checks, each merge sends every other open pull request back to rerun, and authors race to rebase. A merge queue (GitHub) or merge train (GitLab) tests each change against the latest base plus the changes ahead of it. Chapter 8 covers running one.", on: ["checks", "merge"], flow: ["e-merge"] },
    ],
    code: [
      {
        lang: "yaml",
        label: "GitHub Actions: cached, parallel tests",
        src: `on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        suite: [unit, integration]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/cache@v6
        with:
          path: ~/.npm
          key: npm-\${{ hashFiles('package-lock.json') }}
          restore-keys: npm-
      - run: npm ci
      - run: npm run test:\${{ matrix.suite }}`,
      },
      {
        lang: "yaml",
        label: "GitLab CI: stages plus needs",
        src: `stages: [build, test, publish]
build:
  stage: build
  script: make build
unit:
  stage: test
  needs: [build]
  script: make unit
integration:
  stage: test
  needs: [build]
  script: make integration
publish:
  stage: publish
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  script: make push`,
      },
    ],
    codeNote: "Both run the two test suites in parallel. The cache key changes only when the lockfile changes; `restore-keys` gives a partial hit from an older cache instead of a cold start.",
    say30: "With 2,000 engineers on one CI, I run it as a shared service and watch queue time, flake rate, cache hit rate and time to merge. One pull request is the worked example: an event queues jobs, each waits for a runner, checks out the exact commit, restores a cache keyed on the lockfile, builds and tests in parallel, and reports the statuses branch protection requires. The runner fleet autoscales on queued jobs and uses ephemeral one-job runners. Flaky tests leave the required set and get owners. Monorepos build only what changed. Jobs reach the cloud with OIDC instead of stored keys, and a merge queue retests against the latest main.",
    gotchas: [
      "A cache is not an artifact. Caches are best-effort, and GitHub removes entries unused for 7 days. Hand build outputs between jobs as artifacts.",
      "Blanket auto-retry turns flaky tests green and hides real failures too. Quarantine the test and give it an owner instead.",
      "CI evidence expires. Since October 2026 GitHub's Actions retention setting also deletes checks, workflow runs and statuses, including third-party ones, and raising it later won't restore them. Copy the release evidence audits and postmortems need somewhere you control.",
      "`runs-on: ubuntu-latest` is a moving dependency. GitHub moves it from Ubuntu 24.04 to 26.04 between 19 October and 19 November 2026, and some preinstalled tools change, so the same commit can fail with no change in your repo. Pin `ubuntu-24.04` until you have tested `ubuntu-26.04`.",
    ],
    agentic: [
      "Coding agents multiply pull requests, and every agent PR queues the same jobs on the same runner fleet, so queue time and CI minutes become the limit before human review does. Budget agent runs like any workload: the Claude Code GitHub Actions docs suggest `--max-turns`, workflow timeouts and concurrency limits, and the queue-time dashboard should split agent and human jobs.",
      "An agent's branch is untrusted code that wants your secrets. For Copilot cloud agent, workflows do not run on its pushes until someone with write access clicks Approve and run workflows (unless configured to run automatically), so the human reading the diff to `.github/workflows/` and the lockfile before clicking is the real gate; a reflexive click is the new failure mode.",
      "An agent can read the failing job log, spot a flaky test or a cache-key miss and propose a fix faster than a person scrolling output. The trap is an agent that makes the check green instead of the code correct, by adding retries, skipping a test or weakening an assertion, so the reviewer checks that the required-check set and the tests did not shrink (see Agentic Engineering).",
    ],
    quiz: [
      { q: "Your PR pipeline takes 25 minutes but the jobs only run for 8. Where is the rest going, and what do you change?", a: "Queue time waiting for runners, plus stage-by-stage waiting. Autoscale the runner fleet on queued-job events, use `needs` or a DAG so jobs start when their own inputs are ready, and check cache hit rate so builds don't start cold." },
      { q: "Why might a PR that passed all required checks still break main?", a: "If checks are not strict, the PR ran against an older base. Another change merged since, and the combination was never tested. Require up-to-date branches or use a merge queue that tests against the latest base plus queued changes." },
      { q: "When would you choose ephemeral self-hosted runners over long-lived ones?", a: "Almost always for autoscaling and for anything security-sensitive. Each runner takes one job and is discarded, so no state, credentials or processes leak between jobs, and scaling in never kills a running job." },
    ],
    incidents: ["homebrew-2018-jenkins-github-token-leak", "buildkite-2022-build-matrix-retry-explosion", "circleci-2022-session-cookie-theft-secrets-exfil"],
    sources: [
      { title: "GitHub changelog: Ubuntu 26 GA and ubuntu-latest migration (17 Sep 2026)", url: "https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration/" },
      { title: "GitHub Docs: Caching dependencies to speed up workflows", url: "https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching" },
      { title: "GitHub Docs: Running variations of jobs in a workflow (matrix)", url: "https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations" },
      { title: "GitHub Docs: GitHub-hosted runners", url: "https://docs.github.com/en/actions/concepts/runners/github-hosted-runners" },
      { title: "GitHub Docs: Self-hosted runners reference", url: "https://docs.github.com/en/actions/reference/runners/self-hosted-runners" },
      { title: "GitHub Docs: About protected branches", url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches" },
      { title: "GitHub Docs: About security hardening with OpenID Connect", url: "https://docs.github.com/en/actions/concepts/security/openid-connect" },
      { title: "GitLab Docs: CI/CD pipelines", url: "https://docs.gitlab.com/ci/pipelines/" },
      { title: "GitHub Docs: Risks and mitigations for Copilot cloud agent", url: "https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations" },
      { title: "Claude Code: GitHub Actions", url: "https://code.claude.com/docs/en/github-actions" },
      { title: "GitHub changelog: Actions retention now covers checks, runs, and statuses (1 Oct 2026)", url: "https://github.blog/changelog/2026-10-01-actions-retention-now-covers-checks-runs-and-statuses/" },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: "artifacts-promotion",
    n: 2,
    title: "Build once, promote everywhere",
    question: "Thousands of services build on every merge. How do you make sure each one runs in production exactly what it ran in staging, and that the previous version is still there to roll back to?",
    view: [940, 430],
    nodes: [
      { id: "ci", label: "CI pipeline", sub: "builds once", x: 10, y: 60, w: 130, h: 50 },
      { id: "reg", label: "Registry", sub: "app@sha256:9f2c", kind: "store", x: 210, y: 60, w: 170, h: 50 },
      { id: "tag", label: "Tag v1.4.2", sub: "mutable alias", x: 460, y: 60, w: 150, h: 50 },
      { id: "dev", label: "Dev", sub: "runs 9f2c", kind: "pod", x: 170, y: 210, w: 120, h: 50 },
      { id: "gate1", label: "Auto gate", sub: "tests + checks", x: 320, y: 210, w: 130, h: 50 },
      { id: "stg", label: "Staging", sub: "runs 9f2c", kind: "pod", x: 480, y: 210, w: 120, h: 50 },
      { id: "gate2", label: "Approval", sub: "required reviewer", x: 630, y: 210, w: 130, h: 50 },
      { id: "prod", label: "Production", sub: "runs 9f2c", kind: "pod", x: 790, y: 210, w: 130, h: 50 },
      { id: "cdev", label: "Dev config", sub: "env vars", kind: "store", x: 170, y: 350, w: 120, h: 50 },
      { id: "cstg", label: "Staging config", sub: "env vars", kind: "store", x: 480, y: 350, w: 120, h: 50 },
      { id: "cprod", label: "Prod config", sub: "secrets via OIDC", kind: "store", x: 790, y: 350, w: 130, h: 50 },
    ],
    edges: [
      { id: "e-build", from: "ci", to: "reg", label: "push once", labelPos: 0.5 },
      { id: "e-tag", from: "tag", to: "reg", label: "points to" },
      { id: "e-dev", from: "reg", to: "dev", label: "by digest", via: [[295, 150], [230, 150]], labelAt: [175, 160] },
      { id: "e-stg", from: "reg", to: "stg", label: "same digest", dashed: true, via: [[295, 150], [540, 150]], labelAt: [415, 146] },
      { id: "e-prod", from: "reg", to: "prod", label: "same digest", dashed: true, via: [[295, 150], [855, 150]], labelAt: [700, 146] },
      { id: "e-g1", from: "dev", to: "gate1" },
      { id: "e-g1b", from: "gate1", to: "stg" },
      { id: "e-g2", from: "stg", to: "gate2" },
      { id: "e-g2b", from: "gate2", to: "prod" },
      { id: "e-cdev", from: "cdev", to: "dev", label: "injected" },
      { id: "e-cstg", from: "cstg", to: "stg", label: "injected" },
      { id: "e-cprod", from: "cprod", to: "prod", label: "injected" },
    ],
    steps: [
      { text: "One service's release is the worked example: one artifact, three environments, three configs. The platform makes that the only path for every service, and keeps old digests around for rollback. Press Next." },
      { text: "CI builds the image once and pushes it. The digest (`sha256:…`) is a hash of the content, so it always means the same bytes. With many build systems, artifact attestations bind provenance to the digest, and `gh attestation verify` proves it came from your CI and not a laptop.", on: ["ci", "reg"], flow: ["e-build"] },
      { text: "A tag like `v1.4.2` is a movable name. Nodes that pull at different times can run different images under one tag, and a replaced node can silently upgrade. Turn on tag immutability for release repositories (ECR then rejects a push that reuses a tag) and pin digests in manifests.", on: ["tag", "reg"], flow: ["e-tag"] },
      { text: "Dev deploys by digest, and its config (endpoints, flags, credentials) is injected at deploy time. Config is whatever differs between deploys, so it stays out of the image and goes through its own reviewed path.", on: ["reg", "dev", "cdev"], flow: ["e-dev", "e-cdev"] },
      { text: "Checks pass, so the pipeline deploys the same digest to staging with staging's config. Nothing is rebuilt, so what staging tests is what production will run.", on: ["dev", "gate1", "stg", "reg", "cstg"], flow: ["e-g1", "e-g1b", "e-stg", "e-cstg"] },
      { text: "A human approval on every deploy of every service turns into rubber-stamping. Keep required reviewers for high-risk tiers and automated checks for the rest. GitHub environments also accept custom protection rules from GitHub Apps.", on: ["stg", "gate2"], flow: ["e-g2"] },
      { text: "After the gate the same digest goes to production. Environment secrets reach the job only after protection rules pass, and the OIDC trust policy can require `environment: production`.", on: ["gate2", "prod", "cprod", "reg"], flow: ["e-g2b", "e-prod", "e-cprod"] },
      { text: "Replicate the registry so scale-ups don't pull across regions. ECR copies only images pushed after replication is set up, doesn't replicate deletes, and most images arrive within 30 minutes. So the deploy waits until the digest exists in each region.", on: ["reg", "prod"], flow: ["e-prod"] },
      { text: "Rollback is redeploying the previous digest. Lifecycle rules can expire an image that is still running or needed for rollback, so preview them and exclude release tags or the last few deployed digests. The old code must also fit today's schema, data and config.", on: ["reg", "prod"], flow: ["e-prod"] },
    ],
    code: [
      {
        lang: "yaml",
        label: "GitHub Actions: promote one digest",
        src: `deploy-prod:
  needs: [build, deploy-staging]
  environment: production   # reviewers, wait timer
  runs-on: ubuntu-latest
  permissions:
    id-token: write         # OIDC token for the cloud
    contents: read
  steps:
    - run: ./deploy.sh "app@\${{ needs.build.outputs.digest }}"`,
      },
      {
        lang: "yaml",
        label: "Kubernetes: pin the digest",
        src: `containers:
  - name: app
    # not app:v1.4.2, which can be re-pointed
    image: registry.example.com/app@sha256:9f2c…
    envFrom:
      - configMapRef:
          name: app-config   # differs per environment`,
      },
    ],
    codeNote: "The deploy job never builds. It takes the digest the build job produced and hands it to each environment in turn.",
    say30: "Across thousands of services the rule is the same. CI builds one immutable artifact and every environment runs that exact digest, with only config injected per environment. Digests, because tags move, and release repositories are tag-immutable. Attestations prove each digest came from our CI. Promotion moves the same digest through gates, with human approval for high-risk tiers and automated checks for the rest. Rollback is redeploying the previous digest, so registry retention keeps the last few deployed digests, and a deploy waits until replication has reached every region. Old code also has to fit today's schema and config, so we test the rollback path.",
    gotchas: [
      "Rebuilding per environment means staging tested a different artifact than production runs, even from the same commit. Base images and dependency resolution can change between builds.",
      "Pinning digests means you stop picking up base-image security fixes automatically. Rebuild, get a new digest and promote it like any other change.",
      "Config changes are deploys too. A config change that skips the promotion path, or ships separately from the code that needs it, is a common outage cause.",
    ],
    agentic: [
      "An agent can open the PR that bumps a digest, but promotion still moves that one digest through the same gates: the environment's required reviewer approves, and the agent's identity never holds the production OIDC role. The failure mode to watch is an agent that answers a staging failure by rebuilding, which ships a new digest that staging never tested.",
      "Artifact attestations bind an image digest to the workflow and commit that built it, so `gh attestation verify` answers whether the image came from your CI regardless of who or what wrote the code. They do not record whether a human reviewed that commit; that guarantee comes from branch protection, so it has to stay required for agent-authored changes.",
      "Approval fatigue gets worse when agents open many deploy PRs a day: the reviewer approving the tenth environment bump stops reading. Keep human approval for high-risk tiers, gate the rest with automated checks, and make the diff show the digest and config change plainly so a quick review is still a real one.",
    ],
    quiz: [
      { q: "Why deploy `app@sha256:…` instead of `app:v1.4.2`?", a: "The digest is a hash of the image content, so it always means the same bytes. A tag can be re-pointed, so two nodes, or a rollback next week, may get different images under the same tag." },
      { q: "Where should a production database URL live, and why not in the image?", a: "In environment config injected at deploy time (env vars, ConfigMaps, a secrets manager). Then the same image runs in every environment and was actually tested before it reaches production, and the image holds no credentials." },
      { q: "Your rollback failed because the old image was gone. What two settings do you check?", a: "Registry retention or lifecycle rules, which may have expired the old digest, and, in multi-region setups, whether that digest was ever replicated to the region you were rolling back in." },
    ],
    incidents: ["travisci-2017-worker-rollback-missing-tag", "cloudflare-2023-workers-kv-rollback", "heroku-2020-git-push-401-missing-config"],
    sources: [
      { title: "Docker Docs: docker image pull (pull by digest)", url: "https://docs.docker.com/reference/cli/docker/image/pull/" },
      { title: "GitHub Docs: Using environments for deployment", url: "https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments" },
      { title: "GitHub Docs: Security hardening with OpenID Connect", url: "https://docs.github.com/en/actions/concepts/security/openid-connect" },
      { title: "GitHub Docs: Using artifact attestations", url: "https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations" },
      { title: "GitLab Docs: Environments", url: "https://docs.gitlab.com/ci/environments/" },
      { title: "Amazon ECR: Image tag mutability", url: "https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html" },
      { title: "Amazon ECR: Lifecycle policies", url: "https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html" },
      { title: "Amazon ECR: Private image replication", url: "https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html" },
      { title: "The Twelve-Factor App: Config", url: "https://12factor.net/config" },
      { title: "The Twelve-Factor App: Build, release, run", url: "https://12factor.net/build-release-run" },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: "gitops",
    n: 3,
    title: "Desired-state control across hundreds of clusters",
    question: "With Argo CD managing hundreds of clusters, how do you know how much of the fleet matches Git right now, and what is the policy when someone has to change production by hand?",
    view: [940, 520],
    groups: [
      { id: "g-argo", label: "Argo CD", x: 370, y: 20, w: 560, h: 250 },
      { id: "g-cl", label: "Target cluster (one of hundreds)", x: 370, y: 320, w: 560, h: 180 },
    ],
    nodes: [
      { id: "eng", label: "Engineer", sub: "PR + review", kind: "actor", x: 10, y: 40, w: 120, h: 50 },
      { id: "ci", label: "CI pipeline", sub: "bumps digest", x: 10, y: 160, w: 120, h: 50 },
      { id: "repo", label: "Config repo", sub: "desired state", kind: "store", x: 180, y: 100, w: 140, h: 56 },
      { id: "api", label: "API server", sub: "UI, CLI, webhooks", x: 400, y: 50, w: 150, h: 50 },
      { id: "appset", label: "ApplicationSet", sub: "one App per target", x: 600, y: 50, w: 170, h: 50 },
      { id: "redis", label: "Redis", sub: "cache", kind: "store", x: 800, y: 50, w: 110, h: 50 },
      { id: "reposrv", label: "Repo server", sub: "renders YAML", x: 400, y: 190, w: 140, h: 50 },
      { id: "ctrl", label: "App controller", sub: "diff, sync, health", x: 620, y: 190, w: 180, h: 50 },
      { id: "kapi", label: "kube-apiserver", sub: "live state", x: 400, y: 360, w: 150, h: 50 },
      { id: "live", label: "Live objects", sub: "Deployment, Svc", kind: "pod", x: 600, y: 360, w: 160, h: 50 },
      { id: "manual", label: "kubectl edit", sub: "manual change", kind: "actor", x: 790, y: 360, w: 120, h: 50 },
      { id: "fleet", label: "Drift metrics", sub: "argocd_app_info", kind: "store", x: 10, y: 440, w: 150, h: 50 },
      { id: "bg", label: "Break-glass", sub: "deny window + PR", kind: "actor", x: 200, y: 440, w: 150, h: 50 },
    ],
    edges: [
      { id: "e-pr", from: "eng", to: "repo", label: "merges", labelPos: 0.5 },
      { id: "e-ci", from: "ci", to: "repo", label: "opens PR", labelAt: [118, 138] },
      { id: "e-hook", from: "repo", to: "api", label: "webhook", labelPos: 0.5 },
      { id: "e-refresh", from: "api", to: "ctrl", label: "refresh", labelPos: 0.45 },
      { id: "e-fetch", from: "reposrv", to: "repo", label: "git fetch", labelPos: 0.5 },
      { id: "e-render", from: "ctrl", to: "reposrv", label: "manifests", bidir: true },
      { id: "e-cache", from: "ctrl", to: "redis", label: "caches", labelPos: 0.6 },
      { id: "e-appset", from: "appset", to: "ctrl", label: "creates Apps", labelPos: 0.5 },
      { id: "e-diff", from: "ctrl", to: "kapi", label: "watch, diff, apply", bidir: true, labelPos: 0.5 },
      { id: "e-live", from: "kapi", to: "live" },
      { id: "e-manual", from: "manual", to: "live" },
      { id: "e-metrics", from: "ctrl", to: "fleet", label: "sync_status", via: [[590, 292], [200, 292]], labelAt: [300, 288] },
      { id: "e-bg", from: "bg", to: "kapi", label: "time-boxed", labelPos: 0.5 },
    ],
    steps: [
      { text: "Git holds desired state and Argo CD pulls it into each of hundreds of clusters. The questions are how much of the fleet matches Git right now, and who may make it not match. Press Next." },
      { text: "A change is a commit. An engineer merges a reviewed PR, or CI opens one that bumps an image digest. Git history is the audit log and the undo button, for one app or 300 clusters.", on: ["eng", "ci", "repo"], flow: ["e-pr", "e-ci"] },
      { text: "A webhook triggers a refresh; without one the controller polls every 120 seconds plus up to 60 of jitter. The repo server renders Helm or Kustomize into plain manifests. With thousands of apps, shard the controller by cluster, add repo servers, and set a target for p99 `argocd_app_reconcile` time.", on: ["repo", "api", "ctrl", "reposrv", "redis"], flow: ["e-hook", "e-refresh", "e-render", "e-fetch", "e-cache"] },
      { text: "The controller diffs Git against live state: same is `Synced`, different is `OutOfSync`. Health is separate, so an app can be Synced and Degraded. Rollback is `git revert`.", on: ["ctrl", "kapi", "live"], flow: ["e-diff", "e-live"] },
      { text: "ApplicationSets create one Application per target, such as every cluster labeled `env: prod`, so a new cluster gets the standard set with no YAML written. Count clusters missing any of it. Progressive Syncs (beta, off until you enable it) step a change through clusters by label and wait for Healthy.", on: ["appset", "ctrl"], flow: ["e-appset"] },
      { text: "Drift: someone runs `kubectl edit`. The app goes OutOfSync. With `selfHeal` on (it's off by default) Argo CD puts Git's value back within seconds. For production, make auto-sync, prune and selfHeal the platform default.", on: ["manual", "live", "kapi", "ctrl"], flow: ["e-manual", "e-diff"] },
      { text: "Drift is a fleet metric. `argocd_app_info` carries `sync_status` and `health_status`. Count OutOfSync apps by project and cluster, and how long each has been out. Minutes is a sync in flight. Days means a second source of truth.", on: ["ctrl", "fleet"], flow: ["e-metrics"] },
      { text: "Break-glass is for when Git is too slow. Write down who may do it and how: a deny sync window or auto-sync off for that one app, make the fix, land the same change in Git, turn sync back on. `manualSync: true` keeps a human sync path open meanwhile.", on: ["bg", "kapi", "manual", "ctrl"], flow: ["e-bg"] },
      { text: "Then measure break-glass: events per month, how long sync stayed paused, and whether Git caught up. A pause with no matching commit afterwards is drift someone chose and then forgot.", on: ["bg", "fleet"] },
    ],
    code: [
      {
        lang: "yaml",
        label: "ApplicationSet: one App per cluster",
        src: `apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: checkout
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            env: prod
  template:
    metadata:
      name: 'checkout-{{name}}'
    spec:
      project: payments
      source:
        repoURL: https://git.example.com/deploy.git
        targetRevision: main
        path: apps/checkout/overlays/prod
      destination:
        server: '{{server}}'
        namespace: checkout
      syncPolicy:
        automated:
          prune: true      # delete what Git deleted
          selfHeal: true   # undo manual drift`,
      },
      {
        lang: "yaml",
        label: "AppProject: break-glass window",
        src: `apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: payments
  namespace: argocd
spec:
  syncWindows:
    - kind: deny
      schedule: '0 * * * *'
      duration: 1h
      applications: ['checkout-*']
      clusters: ['prod-eu-1']
      manualSync: true   # humans can still sync`,
      },
      {
        lang: "promql",
        label: "Drift across the fleet",
        src: `# OutOfSync production apps, by project
count by (project) (
  argocd_app_info{sync_status="OutOfSync",
                  project=~"prod-.*"})

# share of apps Synced and Healthy
  count(argocd_app_info{sync_status="Synced",
                        health_status="Healthy"})
/
  count(argocd_app_info)`,
      },
    ],
    codeNote: "A new cluster registered with `env: prod` gets the checkout Application with prune and selfHeal on, so Git is the only normal way in. The deny window (here every hour for an hour, so always on while it exists) is the break-glass switch: add it by PR, remove it by PR once the fix is in Git, and `manualSync` keeps a human path open meanwhile. The label values in the PromQL depend on your Argo CD version; check your scraped output.",
    say30: "I run Argo CD as a control system for hundreds of clusters. Git is desired state, Argo CD diffs it against live state, Synced and Healthy are separate, and rollback is a git revert. ApplicationSets give every new cluster the standard set, and fleet-wide changes go out in waves by cluster label. Production defaults are auto-sync with prune and selfHeal. Drift is a fleet metric from `argocd_app_info`: OutOfSync apps by project and cluster, and how long they've been out. Break-glass is written policy: a scoped deny window, a fix, the same change in Git, sync back on. I count those events and watch p99 reconcile time.",
    gotchas: [
      "`Synced` only means live matches Git. An app can be Synced and Degraded, for example a new image that crashloops. Gate on health.",
      "Automated sync doesn't prune by default. Deleting a manifest leaves the object running, and turning prune on later can delete more than you expected.",
      "Fields other controllers own (replicas under an HPA, an injected `caBundle`) keep an app OutOfSync forever. Use `ignoreDifferences`, or the drift metric fills with noise.",
      "Rendered manifests are cached in plaintext in Redis, so Secrets stay out of Git and come from a secret operator on each cluster. Count Secret objects found in config repos; the target is zero.",
    ],
    agentic: [
      "GitOps suits agents because their only write path is a pull request to the config repo: Argo CD applies it, so the agent needs no cluster credentials. The human reviews the rendered result (`argocd app diff` or the PR's rendered manifests) as well as the values-file line, because one Helm value can change dozens of objects, and through an ApplicationSet, dozens of clusters.",
      "Mid-incident, an agent can gather evidence read-only from `argocd app get`, sync status, health and recent commits; a human decides whether to open a break-glass window, revert or roll back. An agent given write access that runs `kubectl edit` on a `selfHeal` app is reverted within seconds, and one pointed at the wrong Application or cluster context starts a second incident.",
      "Deletions are the risky agent edit: with prune enabled, removing a manifest from Git deletes the live object. Require human review for PRs that delete files under app paths, and remember that an agent reporting `Synced` has said nothing about `Healthy`.",
      "Read-only is not always passive. `argocd app diff --local --server-side-generate` uploads files for the repo server to render, and advisory GHSA-9v9p-x54c-58gc (7 Oct 2026, critical) showed that a crafted Kustomize ref there could run commands with only Application `get`; blocking egress doesn't stop it. Before an agent runs local diffs, confirm Argo CD is patched (3.3.15, 3.4.10, 3.5.4 or later; the advisory lists no 2.x fix), or render diffs in CI instead.",
    ],
    quiz: [
      { q: "Across 300 clusters, 4% of production apps are OutOfSync. Is that bad?", a: "It depends on age. Break it down by how long each app has been out, and by project. Minutes is syncs in flight. Days means someone changed production outside Git, or a field like HPA replicas needs `ignoreDifferences`. Check whether a break-glass event left them behind." },
      { q: "Mid-incident, someone needs to scale a Deployment by hand, but selfHeal keeps reverting it. What's the policy?", a: "Break-glass: open a scoped deny sync window (or turn off auto-sync for that one app), make the change, then put the same value in Git and re-enable sync. Record the event so the drift metric and the break-glass count both show it." },
      { q: "Argo CD manages 3,000 apps and syncs have slowed to many minutes. Where do you look?", a: "Controller queues and processor counts, controller sharding across clusters, repo server render times and OOMs (parallelism limit, replicas), cache invalidation from a monorepo without `manifest-generate-paths`, and whether refresh relies on polling instead of webhooks." },
    ],
    incidents: ["knightcapital-2012-power-peg-deploy"],
    sources: [
      { title: "OpenGitOps principles", url: "https://opengitops.dev/" },
      { title: "Argo CD: Metrics", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/metrics/" },
      { title: "Argo CD: Sync windows", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/sync_windows/" },
      { title: "Argo CD advisory GHSA-9v9p-x54c-58gc: a Kustomize remote ref can run commands in the repo-server (7 Oct 2026)", url: "https://github.com/argoproj/argo-cd/security/advisories/GHSA-9v9p-x54c-58gc" },
      { title: "Argo CD: Core concepts", url: "https://argo-cd.readthedocs.io/en/stable/core_concepts/" },
      { title: "Argo CD: Architecture", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/architecture/" },
      { title: "Argo CD: Automated sync policy", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/" },
      { title: "Argo CD: Resource health", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/health/" },
      { title: "Argo CD: Diffing customization", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/" },
      { title: "Argo CD: High availability", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/high_availability/" },
      { title: "Argo CD: Secret management", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/secret-management/" },
      { title: "Argo CD: ApplicationSet controller", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/" },
      { title: "Argo CD: Progressive Syncs", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Progressive-Syncs/" },
      { title: "Argo CD: argocd app diff", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_app_diff/" },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: "progressive-delivery",
    n: 4,
    title: "Rollout policy as a platform default",
    question: "How do you make wave-based, metric-gated rollout the default for every service in the fleet, and how do you measure how much of the fleet actually uses it?",
    view: [940, 510],
    groups: [
      { id: "g-plat", label: "Platform defaults (every service)", x: 10, y: 330, w: 920, h: 170 },
    ],
    nodes: [
      { id: "argo", label: "Argo CD sync", sub: "new image digest", kind: "actor", x: 10, y: 40, w: 140, h: 50 },
      { id: "rctl", label: "Rollouts controller", sub: "runs the steps", x: 220, y: 40, w: 170, h: 50 },
      { id: "analysis", label: "AnalysisRun", sub: "every interval", x: 450, y: 40, w: 150, h: 50 },
      { id: "prom", label: "Prometheus", sub: "success rate", kind: "store", x: 660, y: 40, w: 150, h: 50 },
      { id: "users", label: "Users", sub: "requests", kind: "actor", x: 10, y: 170, w: 120, h: 50 },
      { id: "router", label: "Traffic router", sub: "mesh or ingress", x: 200, y: 170, w: 170, h: 50 },
      { id: "stable", label: "Stable", sub: "v1 ReplicaSet", kind: "pod", x: 450, y: 150, w: 150, h: 50 },
      { id: "canary", label: "Canary", sub: "v2 ReplicaSet", kind: "pod", x: 450, y: 240, w: 150, h: 50 },
      { id: "tmpl", label: "Service template", sub: "Rollout + steps", x: 30, y: 380, w: 160, h: 50 },
      { id: "pol", label: "Admission policy", sub: "Warn, then Deny", x: 240, y: 380, w: 160, h: 50 },
      { id: "lib", label: "Analysis library", sub: "platform-owned", x: 450, y: 380, w: 160, h: 50 },
      { id: "score", label: "Fleet scorecard", sub: "% gated deploys", kind: "store", x: 680, y: 380, w: 170, h: 50 },
    ],
    edges: [
      { id: "e-spec", from: "argo", to: "rctl", label: "new spec" },
      { id: "e-weight", from: "rctl", to: "router", label: "set weight", labelPos: 0.5 },
      { id: "e-start", from: "rctl", to: "analysis", bidir: true },
      { id: "e-query", from: "analysis", to: "prom", label: "query" },
      { id: "e-metrics", from: "canary", to: "prom", label: "metrics", via: [[735, 265]], labelPos: 0.3 },
      { id: "e-users", from: "users", to: "router", label: "requests" },
      { id: "e-tostable", from: "router", to: "stable", label: "80%", labelPos: 0.5 },
      { id: "e-tocanary", from: "router", to: "canary", label: "20%", labelPos: 0.5 },
      { id: "e-tmpl", from: "tmpl", to: "argo", label: "default spec", via: [[165, 300], [165, 130]], labelAt: [165, 262] },
      { id: "e-pol", from: "pol", to: "tmpl", label: "checks", labelAt: [215, 399] },
      { id: "e-lib", from: "lib", to: "analysis", label: "imports", via: [[625, 340], [625, 120]], labelAt: [652, 318] },
      { id: "e-score", from: "prom", to: "score", label: "rollout_info", labelPos: 0.72 },
      { id: "e-audit", from: "pol", to: "score", label: "audit events", dashed: true, via: [[320, 475], [765, 475]], labelAt: [545, 470] },
    ],
    steps: [
      { text: "Top: one service's canary, the worked example. Bottom: how the platform gives every service that canary by default, and checks that it does. Press Next." },
      { text: "Google's SRE workbook says most of its incidents start with a binary or config push. So code, config and flag pushes all go out in steps with a metric gate, and no team should have to build that machinery itself.", on: ["argo", "rctl", "router"] },
      { text: "The default lives in the service template. A new service on the golden path starts as a Rollout with standard steps and the shared analysis wired in. A team that does nothing gets the safe path.", on: ["tmpl", "argo", "rctl"], flow: ["e-tmpl"] },
      { text: "For one service: Argo CD syncs a new image, the Rollouts controller creates a canary ReplicaSet and tells the router to send it 20%. Stable stays fully scaled, so traffic can snap back.", on: ["argo", "rctl", "router", "users", "stable", "canary"], flow: ["e-spec", "e-weight", "e-users", "e-tostable", "e-tocanary"] },
      { text: "An AnalysisRun queries Prometheus on an interval, say non-5xx over all requests, `>= 0.95`. Past `failureLimit` the rollout aborts and the canary drops to zero. Inconclusive pauses for a human.", on: ["rctl", "analysis", "prom", "canary"], flow: ["e-start", "e-query", "e-metrics"] },
      { text: "Teams shouldn't each write that query. The platform ships AnalysisTemplates built from SLIs, with the empty-result guard already in. Google advises keeping canary metrics to about a dozen. Prometheus is now in every deploy path, so AnalysisRun errors alert the platform team.", on: ["lib", "analysis", "prom"], flow: ["e-lib"] },
      { text: "Argo Rollouts works inside one cluster, so regional waves come from Argo CD Progressive Syncs (beta) or your deploy system. Count deploys that reached a second region before the first finished its bake; the target is zero.", on: ["argo", "rctl", "score"] },
      { text: "Defaults drift unless something checks them. A ValidatingAdmissionPolicy (stable since Kubernetes 1.30) can catch a production Deployment that skips the Rollout. Run it in Warn and Audit, fix what shows up, then switch to Deny.", on: ["pol", "tmpl"], flow: ["e-pol"] },
      { text: "Some services need an exception: a singleton, a batch job, too little traffic to judge. Each exception gets an owner and an end date. A list that only grows means the policy is failing.", on: ["pol", "score"], flow: ["e-audit"] },
      { text: "The scorecard says how much of the fleet really uses it. Argo Rollouts exports `rollout_info` and `analysis_run_info`. Join them with deploy records to get the share of production deploys that ran a gated canary, per org.", on: ["prom", "score", "pol"], flow: ["e-score", "e-audit"] },
      { text: "Then check the gate does work. Compare change fail rate (DORA) for gated and ungated services, and count aborts per 100 deploys. A gate that never aborts is probably watching the wrong metric.", on: ["score", "analysis"] },
    ],
    code: [
      {
        lang: "yaml",
        label: "Rollout: canary with analysis",
        src: `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: checkout
spec:
  replicas: 10
  strategy:
    canary:
      canaryService: checkout-canary
      stableService: checkout-stable
      trafficRouting:
        istio:
          virtualService:
            name: checkout
      steps:
        - setWeight: 5
        - pause: {duration: 10m}
        - analysis:
            templates:
              - templateName: success-rate
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {}           # wait for a human`,
      },
      {
        lang: "yaml",
        label: "AnalysisTemplate: shared success rate",
        src: `apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
    - name: success-rate
      interval: 5m
      count: 3
      failureLimit: 1
      # empty result (no traffic) counts as failure
      successCondition: len(result) > 0 && result[0] >= 0.95
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            sum(rate(http_requests_total{app="checkout",
              role="canary",code!~"5.."}[5m]))
            /
            sum(rate(http_requests_total{app="checkout",
              role="canary"}[5m]))`,
      },
      {
        lang: "yaml",
        label: "Admission policy: prod ships as a Rollout",
        src: `apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: prod-uses-rollouts
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
      - apiGroups: ["apps"]
        apiVersions: ["v1"]
        operations: ["CREATE", "UPDATE"]
        resources: ["deployments"]
  validations:
    - expression: >
        has(object.metadata.labels) &&
        'rollout-exception' in object.metadata.labels
      message: "prod services ship as a Rollout"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: prod-uses-rollouts
spec:
  policyName: prod-uses-rollouts
  validationActions: [Warn, Audit]   # Deny later
  matchResources:
    namespaceSelector:
      matchLabels: {env: prod}`,
      },
    ],
    codeNote: "The template ships the first two files to every new service. The policy starts in Warn and Audit so you can count violations before anything is blocked; `Deny` and `Warn` can't be combined, so switching is a one-line change to the binding.",
    say30: "I want wave-based, metric-gated rollout to be what a team gets by doing nothing. The service template ships a Rollout with standard steps and a shared AnalysisTemplate built from SLIs, so nobody writes their own canary query. An admission policy catches production Deployments that skip it, in Warn and Audit first, Deny later, with exceptions that have owners and end dates. Then I measure it: the share of production deploys that ran a gated canary, per org. And I check the gate works by comparing change fail rate for gated and ungated services. Config and flag pushes go through the same rings, and regions go in waves.",
    gotchas: [
      "Without a traffic router, `setWeight` is a replica ratio. At 4 replicas the smallest canary is 25%, so small services need a router or bigger steps.",
      "Traffic shifting doesn't undo side effects. Schema and message-format changes must work with both versions.",
      "Warn shows the person applying the change and Audit only writes the audit log. Nobody reads either unless the scorecard counts them.",
    ],
    agentic: [
      "Canaries with automated analysis are the main guardrail for agent-authored changes: the Rollout does not care who wrote the code, it checks error rate and latency at a small weight before sending more traffic. That holds only while the platform owns the shared AnalysisTemplates and step lists; an agent PR that loosens a success condition or shortens a pause disables the check it is supposed to pass, so those files need platform review.",
      "An agent can watch in-flight rollouts across the fleet and summarize AnalysisRun results, which helps with the Inconclusive pause nobody noticed. Promoting past a pause or aborting stays a human call (`kubectl argo rollouts promote` / `abort`) or an automated rule in the spec, not an agent's judgment from chat.",
      "A canary only tests what traffic exercises, and rollback does not undo side effects. An agent PR that bundles a schema or message-format change with code can pass the canary and still be impossible to roll back, so ask for side-effecting changes in separate, backward-compatible PRs.",
    ],
    quiz: [
      { q: "Half your services run Rollouts. How do you find out whether the other half are protected?", a: "Measure it per org: the share of production deploys that ran a gated canary, from `rollout_info` and deploy records. List the ungated services with owners, check the admission policy's audit results, and make sure every exception has an end date." },
      { q: "A team asks for an exception because their service gets 20 requests a minute. What do you offer?", a: "A canary on that traffic is noise. Offer longer analysis windows, header-routed test traffic to the canary, or bigger steps with a longer bake. If none fit, grant an exception with an owner and an end date, and still keep the regional waves." },
      { q: "An AnalysisRun failed. Exactly what does Argo Rollouts do, and what is left for you?", a: "It aborts: canary weight goes back to zero so stable takes all traffic, and the Rollout is marked Degraded. Git still declares the new version, so you revert or fix forward; the controller doesn't touch Git." },
    ],
    incidents: ["crowdstrike-2024-channel-file-291", "microsoft-2014-azure-storage-infinite-loop"],
    sources: [
      { title: "Google SRE workbook: Canarying releases", url: "https://sre.google/workbook/canarying-releases/" },
      { title: "Kubernetes: Validating Admission Policy", url: "https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/" },
      { title: "CNCF TAG App Delivery: Platforms white paper", url: "https://tag-app-delivery.cncf.io/whitepapers/platforms/" },
      { title: "Argo Rollouts: Controller metrics", url: "https://argoproj.github.io/argo-rollouts/features/controller-metrics/" },
      { title: "Argo Rollouts: Concepts", url: "https://argoproj.github.io/argo-rollouts/concepts/" },
      { title: "Argo Rollouts: Canary", url: "https://argoproj.github.io/argo-rollouts/features/canary/" },
      { title: "Argo Rollouts: Analysis and progressive delivery", url: "https://argoproj.github.io/argo-rollouts/features/analysis/" },
      { title: "Argo Rollouts: Traffic management", url: "https://argoproj.github.io/argo-rollouts/features/traffic-management/" },
      { title: "Argo Rollouts: Rollout specification", url: "https://argoproj.github.io/argo-rollouts/features/specification/" },
      { title: "Argo CD: Progressive Syncs", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Progressive-Syncs/" },
      { title: "DORA: Software delivery performance metrics", url: "https://dora.dev/guides/dora-metrics/" },
    ],
  },
];
