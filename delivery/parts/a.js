// Chapters 1-4: CI pipelines, artifact promotion, GitOps with Argo CD, progressive delivery with Argo Rollouts.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`: see ../../drawn/README.md).
export const CHAPTERS = [
  // ---------------------------------------------------------------- 1
  {
    id: "ci-pipeline",
    n: 1,
    title: "What a CI pipeline actually does",
    question: "A developer opens a pull request. Walk me through everything that happens before it can merge, and what slows it down when 2,000 engineers share the same CI.",
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
      { text: "The whole path from a push to a mergeable change. A pipeline is a graph of jobs, each running on a runner machine. Press Next to follow one pull request." },
      { text: "The developer pushes a branch or opens a pull request. The Git host emits an event, and every workflow whose trigger matches it (for example `on: pull_request`) creates jobs.", on: ["dev", "git", "queue"], flow: ["e-push", "e-event"] },
      { text: "Jobs wait in a queue until a runner with matching labels is free. On GitHub Actions, a job queued for a self-hosted runner for more than 24 hours fails. Queue time is a separate number from run time, and at scale it is often the larger one.", on: ["queue", "runner"], flow: ["e-assign"] },
      { text: "GitHub-hosted runners are a new VM for each job (single-CPU runners excepted). Self-hosted runners keep state between jobs unless registered with `--ephemeral`, which takes one job and de-registers. An autoscaler such as Actions Runner Controller adds runners as jobs queue.", on: ["runner", "fleet"], flow: ["e-fleet"] },
      { text: "The runner checks out the exact commit under test. For a pull request on GitHub that is a merge ref: your branch merged into the base branch.", on: ["runner", "checkout"], flow: ["e-run"] },
      { text: "The build restores dependencies from the cache. An exact `key` match is a hit; otherwise `restore-keys` prefixes are tried, newest first. Entries are immutable, so a new lockfile hash makes a new key, saved after the job succeeds.", on: ["build", "cache"], flow: ["e-co", "e-cache"] },
      { text: "Tests fan out as parallel jobs, from a matrix in GitHub Actions or jobs in the same stage in GitLab. GitLab's `needs` lets a job start as soon as its own dependencies finish instead of waiting for the whole previous stage.", on: ["build", "unit", "integ"], flow: ["e-unit", "e-int"] },
      { text: "Packaging turns the build into one deployable artifact, usually a container image. On the main branch the pipeline pushes it to a registry, which returns its content digest. Pull request runs usually stop before publishing.", on: ["unit", "integ", "package", "publish", "registry"], flow: ["e-pk1", "e-pk2", "e-pub", "e-reg"] },
      { text: "Each job reports a status on the commit. Branch protection lists the checks that must be successful, skipped or neutral. In strict mode the branch must also be up to date with the base, which means more re-runs.", on: ["integ", "checks"], flow: ["e-status"] },
      { text: "Only when every required check is green, and required reviews are in, can the change merge. A merge queue (GitHub) or merge train (GitLab) tests each change against the latest base plus the changes queued ahead of it.", on: ["checks", "merge"], flow: ["e-merge"] },
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
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
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
    say30: "A CI pipeline turns a commit into evidence and an artifact. The push or pull request emits an event, matching workflows queue jobs, and each job waits for a runner: a fresh VM if hosted, or your own machine. The job checks out the exact commit, restores dependencies from a cache keyed on the lockfile hash, builds, and runs unit and integration tests as parallel jobs. Each job reports a status, branch protection requires the important ones to pass before merge, and a merge queue retests against the latest main. On main it pushes one image and records its digest. At scale the hard parts are queue time, flaky tests, cache misses and building only what changed.",
    gotchas: [
      "A cache is not an artifact. Caches are best-effort and get evicted (GitHub removes entries unused for 7 days and evicts the oldest when a repository hits its limit). Use artifacts to hand build outputs between jobs.",
      "Cache scope follows branches: a run can restore from its own branch and the default branch (pull requests also from the base), never from sibling branches. A cold feature branch is normal; keep the default branch's cache warm.",
      "With loose status checks a green pull request can still break main if the base moved after its run. Strict mode or a merge queue closes that gap.",
      "A self-hosted runner that is not ephemeral keeps files, credentials and processes from earlier jobs, so one job can affect the next.",
    ],
    atScale: [
      "Queue time: when the runner fleet is too small, jobs sit queued while dashboards show short run times. Track queue time per runner label, scale runners from `workflow_job` events or Actions Runner Controller, and use ephemeral one-job runners so scale-in is safe.",
      "Flaky tests: across thousands of tests, a small per-test flake rate makes many runs fail somewhere, and required checks turn each flake into a blocked merge. Teams track flake rate per test, quarantine flaky tests out of the required set, and give them owners, instead of blanket auto-retry that hides real failures.",
      "Cache pressure: GitHub's default is 10 GB of cache per repository, oldest-by-access evicted first. A large monorepo with many keys thrashes and every run goes cold. Key caches on lockfile hashes, share broad `restore-keys` prefixes, and save from the default branch.",
      "Monorepos: building and testing everything on every commit grows with the repo, not the change. Teams trigger jobs on changed paths, use build tools that compute affected targets, and split work into child pipelines (GitLab parent-child pipelines are common for monorepos).",
      "Busy main branch: with strict up-to-date checks, every merge invalidates every other open pull request's checks, so authors rebase and rerun in a race. A merge queue or merge train batches and serializes this.",
      "Secrets: long-lived cloud keys stored in CI are a high-value target. OIDC gives each job a short-lived token whose claims (repository, ref, environment) the cloud role checks, so there is nothing long-lived to steal.",
    ],
    quiz: [
      { q: "Your PR pipeline takes 25 minutes but the jobs only run for 8. Where is the rest going, and what do you change?", a: "Queue time waiting for runners, plus stage-by-stage waiting. Autoscale the runner fleet on queued-job events, use `needs` or a DAG so jobs start when their own inputs are ready, and check cache hit rate so builds don't start cold." },
      { q: "Why might a PR that passed all required checks still break main?", a: "If checks are not strict, the PR ran against an older base. Another change merged since, and the combination was never tested. Require up-to-date branches or use a merge queue that tests against the latest base plus queued changes." },
      { q: "When would you choose ephemeral self-hosted runners over long-lived ones?", a: "Almost always for autoscaling and for anything security-sensitive. Each runner takes one job and is discarded, so no state, credentials or processes leak between jobs, and scaling in never kills a running job." },
    ],
    incidents: ["homebrew-2018-jenkins-github-token-leak", "buildkite-2022-build-matrix-retry-explosion", "circleci-2022-session-cookie-theft-secrets-exfil"],
    sources: [
      { title: "GitHub Docs: Caching dependencies to speed up workflows", url: "https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/caching-dependencies-to-speed-up-workflows" },
      { title: "GitHub Docs: Running variations of jobs in a workflow (matrix)", url: "https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow" },
      { title: "GitHub Docs: GitHub-hosted runners", url: "https://docs.github.com/en/actions/concepts/runners/github-hosted-runners" },
      { title: "GitHub Docs: Self-hosted runners reference", url: "https://docs.github.com/en/actions/reference/runners/self-hosted-runners" },
      { title: "GitHub Docs: About protected branches", url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches" },
      { title: "GitHub Docs: About security hardening with OpenID Connect", url: "https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect" },
      { title: "GitLab Docs: CI/CD pipelines", url: "https://docs.gitlab.com/ci/pipelines/" },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: "artifacts-promotion",
    n: 2,
    title: "Build once, promote everywhere",
    question: "How do you guarantee that what runs in production is exactly what you tested in staging, and how do you roll back to the previous version in under a minute?",
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
      { text: "One artifact, three environments, three configs. The artifact never changes on the way to production; only the config around it does. Press Next to follow one release." },
      { text: "CI builds the image once and pushes it. The registry stores it by content: the digest (`sha256:…`) is a hash of the image, so the same digest always means the same bytes.", on: ["ci", "reg"], flow: ["e-build"] },
      { text: "A tag like `v1.4.2` or `latest` is just a name pointing at a digest, and by default it can be moved to a different image. Registries can enforce tag immutability: ECR then rejects a push that reuses an existing tag.", on: ["tag", "reg"], flow: ["e-tag"] },
      { text: "Dev deploys the image by digest (`app@sha256:9f2c…`), so every node pulls identical bytes. Dev's config (endpoints, flags, credentials) is injected at deploy time, not baked into the image.", on: ["reg", "dev", "cdev"], flow: ["e-dev", "e-cdev"] },
      { text: "Automated checks pass in dev, so the pipeline promotes: it deploys the same digest to staging. Nothing is rebuilt, so what staging tests is what production will run.", on: ["dev", "gate1", "stg", "reg"], flow: ["e-g1", "e-g1b", "e-stg"] },
      { text: "Staging gets its own config. Config is whatever differs between deploys, so it lives outside the artifact and is versioned and reviewed on its own path.", on: ["stg", "cstg"], flow: ["e-cstg"] },
      { text: "Production is a protected environment. In GitHub Actions it can require one approval from up to 6 listed reviewers, block self-review, add a wait timer, and limit which branches or tags may deploy.", on: ["stg", "gate2"], flow: ["e-g2"] },
      { text: "After approval the same digest goes to production. Environment secrets are released to the job only after the protection rules pass, and with OIDC the cloud role can require `environment: production` in the token.", on: ["gate2", "prod", "cprod", "reg"], flow: ["e-g2b", "e-prod", "e-cprod"] },
      { text: "Rollback is just promotion in reverse: deploy the previous digest, which every environment already ran. That only works if the registry still holds it, so retention rules must keep anything that could be rolled back to.", on: ["reg", "prod"], flow: ["e-prod"] },
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
    say30: "Build once, promote everywhere means CI produces one immutable artifact and every environment runs that exact artifact. For containers that means deploying by digest, not by tag, because a tag is a movable pointer and a digest is a content hash. Dev, staging and production differ only in config, which is injected at deploy time and versioned separately. Promotion is a pointer move: after checks pass, the same digest goes to the next environment, and production sits behind protection rules like required reviewers, with secrets released only after approval. Rollback is redeploying the previous digest, which is fast and safe because it already ran in production. At scale, watch registry retention, replication and tags that quietly moved.",
    gotchas: [
      "Rebuilding per environment (`docker build` in each deploy job) means staging tested a different artifact than production runs, even from the same commit: base images and dependency resolution can change between builds.",
      "Rolling back to a tag can pull different bytes than last time if the tag was overwritten. Record and deploy digests; treat tags as labels for humans.",
      "Pinning digests means you stop picking up base-image security fixes automatically. You must rebuild, get a new digest and promote it like any other change.",
      "Config changes are deploys too. A config change that skips the promotion path, or ships separately from the code that needs it, is a common outage cause.",
    ],
    atScale: [
      "Registry growth: thousands of services building on every merge fill registries fast. Lifecycle rules (ECR expires by image count or age, within 24 hours of matching) clean up, but a careless rule can expire an image still running or needed for rollback. Preview rules first and exclude release tags or the last N deployed digests.",
      "Multi-region pulls: pulling from one central registry adds latency and a cross-region dependency to every scale-up. Teams replicate (ECR supports cross-region and cross-account), but only images pushed after replication is configured are copied, deletes are not replicated, and most images arrive within 30 minutes, so the deploy must wait until the digest exists in each region.",
      "Tag drift: with mutable tags, nodes that pull at different times can run different images under the same name, and a node replacement can silently upgrade. Pin digests in manifests and turn on tag immutability for release repositories.",
      "Approvals at scale: a human approval on every service's every deploy becomes rubber-stamping. Keep human gates for high-risk tiers and replace the rest with automated checks; GitHub also supports custom protection rules from GitHub Apps.",
      "Provenance: with many build systems, you need proof that a digest came from your CI and not a laptop. Artifact attestations bind build provenance to the image digest and can be checked with `gh attestation verify` before deploy.",
    ],
    quiz: [
      { q: "Why deploy `app@sha256:…` instead of `app:v1.4.2`?", a: "The digest is a hash of the image content, so it always means the same bytes. A tag can be re-pointed, so two nodes, or a rollback next week, may get different images under the same tag." },
      { q: "Where should a production database URL live, and why not in the image?", a: "In environment config injected at deploy time (env vars, ConfigMaps, a secrets manager). Then the same image runs in every environment and was actually tested before it reaches production, and the image holds no credentials." },
      { q: "Your rollback failed because the old image was gone. What two settings do you check?", a: "Registry retention or lifecycle rules, which may have expired the old digest, and, in multi-region setups, whether that digest was ever replicated to the region you were rolling back in." },
    ],
    incidents: ["travisci-2017-worker-rollback-missing-tag", "cloudflare-2023-workers-kv-rollback", "heroku-2020-git-push-401-missing-config"],
    sources: [
      { title: "Docker Docs: docker image pull (pull by digest)", url: "https://docs.docker.com/reference/cli/docker/image/pull/" },
      { title: "GitHub Docs: Using environments for deployment", url: "https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment" },
      { title: "GitHub Docs: Security hardening with OpenID Connect", url: "https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect" },
      { title: "GitHub Docs: Using artifact attestations", url: "https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds" },
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
    title: "GitOps with Argo CD",
    question: "With Argo CD, what actually happens between merging a manifest change and the cluster changing? And what happens when someone runs `kubectl edit` in production?",
    view: [940, 520],
    groups: [
      { id: "g-argo", label: "Argo CD", x: 370, y: 20, w: 560, h: 250 },
      { id: "g-cl", label: "Target cluster", x: 370, y: 320, w: 560, h: 180 },
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
    ],
    steps: [
      { text: "Git holds the desired state; Argo CD keeps the cluster matching it. Nobody, including CI, pushes to the cluster directly. Press Next to follow one change and then one drift." },
      { text: "A change to the cluster is a commit. An engineer merges a reviewed PR, or CI opens a PR that bumps the image digest. Git history becomes the audit log and the undo button.", on: ["eng", "ci", "repo"], flow: ["e-pr", "e-ci"] },
      { text: "Argo CD notices the commit. A Git webhook to the API server triggers a refresh straight away; without one, the controller polls every `timeout.reconciliation`, by default 120 seconds plus up to 60 seconds of jitter.", on: ["repo", "api", "ctrl"], flow: ["e-hook", "e-refresh"] },
      { text: "The repo server fetches the repo and renders plain manifests from Helm, Kustomize or YAML for that revision and path. Generated manifests are cached, by default for 24 hours, so unchanged paths aren't re-rendered.", on: ["ctrl", "reposrv", "repo", "redis"], flow: ["e-render", "e-fetch", "e-cache"] },
      { text: "The application controller compares the target state from Git with the live state it watches through the cluster's API server. Any difference marks the Application `OutOfSync`; no difference is `Synced`.", on: ["ctrl", "kapi", "live"], flow: ["e-diff"] },
      { text: "Sync applies the difference. With automated sync, Argo CD syncs only when the app is `OutOfSync`, and won't retry a failed sync against the same commit. Deleting a file from Git deletes the object only if `prune` is on; it's off by default.", on: ["ctrl", "kapi", "live"], flow: ["e-diff", "e-live"] },
      { text: "Order is controlled with phases and waves: PreSync hooks (say, a migration Job) run first, then lower `sync-wave` numbers before higher ones. Each wave must be in sync and healthy before the next, with a 2 second pause between waves.", on: ["ctrl", "live"], flow: ["e-live"] },
      { text: "Sync status and health are separate. Health is the worst of the app's resources: a Deployment is Healthy when the observed generation is current and all replicas are updated. An app can be `Synced` and `Degraded` at once.", on: ["ctrl", "live"] },
      { text: "Drift: someone runs `kubectl edit` in production. The controller sees live state no longer matches Git and marks the app `OutOfSync`. With `selfHeal` on (off by default), it syncs the change away, by default after a 5 second timeout.", on: ["manual", "live", "kapi", "ctrl"], flow: ["e-manual", "e-diff"] },
      { text: "At fleet size you don't write Applications by hand. An ApplicationSet uses generators (a list, every registered cluster, directories in Git) to create one Application per target. The older app-of-apps pattern does the same with a parent Application.", on: ["appset", "ctrl"], flow: ["e-appset"] },
      { text: "Rollback is `git revert`. Argo CD's own rollback isn't available while automated sync is on, because Git would immediately win again.", on: ["eng", "repo", "ctrl"], flow: ["e-pr", "e-diff"] },
    ],
    code: [
      {
        lang: "yaml",
        label: "Application with auto-sync",
        src: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: checkout-prod
  namespace: argocd
spec:
  project: payments
  source:
    repoURL: https://git.example.com/deploy.git
    targetRevision: main
    path: apps/checkout/overlays/prod
  destination:
    server: https://prod-eu-1.example.com
    namespace: checkout
  syncPolicy:
    automated:
      prune: true      # delete what Git deleted
      selfHeal: true   # undo manual drift`,
      },
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
        namespace: checkout`,
      },
    ],
    codeNote: "A new cluster registered with label `env: prod` gets the checkout Application automatically. Turning on `prune` and `selfHeal` makes Git the only way to change the app.",
    say30: "In GitOps, Git is the desired state and a controller in the cluster pulls it, instead of CI pushing to the cluster. In Argo CD, a commit triggers a refresh by webhook or by polling about every three minutes. The repo server renders manifests from Helm or Kustomize, and the application controller diffs them against live state: same is Synced, different is OutOfSync. Sync applies the change, ordered by phases and sync waves, and health is tracked separately, so Synced can still be Degraded. With self-heal on, a manual kubectl edit is reverted. Rollback is a git revert. At scale: ApplicationSets, controller sharding, more repo servers, and secrets kept out of Git.",
    gotchas: [
      "`Synced` only means live matches Git. The app can be Synced and Degraded, for example a new image that crashloops. Gate on health, not sync status.",
      "Automated sync doesn't prune by default. Deleting a manifest from Git leaves the object running until you prune, and turning prune on later can delete more than you expected.",
      "`selfHeal` is off by default, so drift is reported but not fixed. With it on, an emergency `kubectl` fix during an incident gets reverted within seconds unless you pause auto-sync first.",
      "Fields that other controllers own (replicas under an HPA, an injected `caBundle`) make an app permanently OutOfSync. Use `ignoreDifferences` or `managedFieldsManagers` rather than living with constant noise.",
    ],
    atScale: [
      "One controller, thousands of apps: the controller defaults to 20 status and 10 operation processors; Argo CD's own example for about 1,000 apps raises them to 50 and 25. Past that, shard the controller StatefulSet by cluster (`ARGOCD_CONTROLLER_REPLICAS`); the round-robin and consistent-hashing algorithms are still marked experimental.",
      "Repo server saturation: rendering Helm and Kustomize is CPU and memory heavy, and a burst of refreshes can OOM it. Symptoms are \"context deadline exceeded\" and slow syncs. Cap concurrent renders with `--parallelismlimit`, add replicas, and raise exec and repo-server timeouts deliberately.",
      "Monorepos: one commit to a shared repo invalidates the manifest cache for every app pointing at it. The `argocd.argoproj.io/manifest-generate-paths` annotation limits regeneration to the paths an app actually uses, and webhooks replace polling thousands of apps on a timer.",
      "Hundreds of clusters: ApplicationSets with a cluster generator create Applications as clusters are registered. Rolling a change across them in waves needs Progressive Syncs (RollingSync steps by label, each step Healthy before the next), which is beta and must be enabled explicitly.",
      "Secrets: plaintext secrets can't go in Git. Argo CD recommends secret operators on the destination cluster (External Secrets Operator, Sealed Secrets, Secrets Store CSI driver) and cautions against injecting secrets during manifest generation, because rendered manifests are cached in plaintext in Redis.",
    ],
    quiz: [
      { q: "An Argo CD app shows `Synced` and `Degraded`. What does that tell you?", a: "Argo CD applied exactly what Git says, but the resulting resources are unhealthy, for example a Deployment whose new Pods don't become ready. The fix is a new commit (revert or fix forward), not another sync." },
      { q: "Someone scaled a Deployment by hand during an incident and Argo CD put it back. Why, and what should they have done?", a: "Self-heal was on, so the controller treated the change as drift and synced Git's value back. They should change the value in Git, or pause auto-sync for that app first, and exclude HPA-owned `replicas` with `ignoreDifferences` if an autoscaler manages it." },
      { q: "Argo CD manages 3,000 apps and syncs have slowed to many minutes. Where do you look?", a: "Controller queues and processor counts, controller sharding across clusters, repo server render times and OOMs (parallelism limit, replicas), cache invalidation from a monorepo without `manifest-generate-paths`, and whether refresh relies on polling instead of webhooks." },
    ],
    incidents: ["knightcapital-2012-power-peg-deploy"],
    sources: [
      { title: "Argo CD: Core concepts", url: "https://argo-cd.readthedocs.io/en/stable/core_concepts/" },
      { title: "Argo CD: Architecture", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/architecture/" },
      { title: "Argo CD: Automated sync policy", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/" },
      { title: "Argo CD: Sync phases and waves", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/" },
      { title: "Argo CD: Resource health", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/health/" },
      { title: "Argo CD: Diffing customization", url: "https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/" },
      { title: "Argo CD: High availability", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/high_availability/" },
      { title: "Argo CD: Secret management", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/secret-management/" },
      { title: "Argo CD: ApplicationSet controller", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/" },
      { title: "Argo CD: Progressive Syncs", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Progressive-Syncs/" },
      { title: "Argo CD: Cluster bootstrapping (app of apps)", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/" },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: "progressive-delivery",
    n: 4,
    title: "Canaries and blue-green with Argo Rollouts",
    question: "How do you ship a new version to 5% of traffic, let metrics decide whether it goes to 100%, and roll back automatically if it doesn't?",
    view: [940, 510],
    groups: [
      { id: "g-bg", label: "Blue-green alternative", x: 170, y: 330, w: 760, h: 170 },
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
      { id: "active", label: "Active Service", sub: "production", x: 200, y: 360, w: 150, h: 50 },
      { id: "preview", label: "Preview Service", sub: "testing only", x: 200, y: 440, w: 150, h: 50 },
      { id: "blue", label: "Blue", sub: "v1 ReplicaSet", kind: "pod", x: 450, y: 360, w: 150, h: 50 },
      { id: "green", label: "Green", sub: "v2 ReplicaSet", kind: "pod", x: 450, y: 440, w: 150, h: 50 },
      { id: "bgan", label: "Pre-promotion", sub: "AnalysisRun", x: 680, y: 440, w: 180, h: 50 },
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
      { id: "e-act", from: "active", to: "blue", label: "selects" },
      { id: "e-prev", from: "preview", to: "green", label: "selects" },
      { id: "e-switch", from: "active", to: "green", label: "after promote", dashed: true, labelPos: 0.5 },
      { id: "e-bgan", from: "green", to: "bgan", label: "tests v2" },
    ],
    steps: [
      { text: "Two strategies. Top: a canary, where traffic shifts in steps while metrics are checked. Bottom: blue-green, where a full new copy waits behind a preview Service. Press Next to follow a canary that gets promoted, then one that gets aborted." },
      { text: "Argo CD syncs a Rollout whose pod template has a new image digest. The Rollouts controller, which plays the role of the Deployment controller, creates a canary ReplicaSet and starts the `steps` list.", on: ["argo", "rctl", "canary"], flow: ["e-spec"] },
      { text: "Step `setWeight: 20`: the controller tells the traffic router (Istio, NGINX, ALB, Gateway API and others) to send 20% to the canary. The stable ReplicaSet stays fully scaled, so traffic can snap back.", on: ["rctl", "router", "users", "stable", "canary"], flow: ["e-weight", "e-users", "e-tostable", "e-tocanary"] },
      { text: "With no traffic router, weight is just the pod ratio: at 10 replicas, `setWeight: 10` means 1 canary pod and 9 stable. Small fleets can't do small percentages.", on: ["router", "stable", "canary"] },
      { text: "Step `pause: {duration: 10m}` is bake time: the canary serves real traffic while nothing changes. `pause: {}` waits for a human to run `kubectl argo rollouts promote`.", on: ["rctl", "canary"] },
      { text: "An AnalysisRun queries Prometheus on an interval, for example non-5xx requests divided by all requests, with `successCondition: result[0] >= 0.95`. It can run as a blocking step or in the background for the whole rollout.", on: ["rctl", "analysis", "prom", "canary"], flow: ["e-start", "e-query", "e-metrics"] },
      { text: "Analysis passes, so the steps continue: 40%, 60%, 80%. After the last step the canary becomes the new stable, and the old ReplicaSet is scaled down after `scaleDownDelaySeconds` (30 by default with traffic routing).", on: ["rctl", "router", "stable", "canary"], flow: ["e-weight", "e-tostable", "e-tocanary"] },
      { text: "The other ending: failed measurements exceed `failureLimit`. The rollout aborts, the canary weight drops to zero, and the Rollout is marked Degraded. Git still names the new version, so you fix forward or revert the commit.", on: ["analysis", "rctl", "router", "stable"], flow: ["e-start", "e-weight", "e-tostable"] },
      { text: "If a measurement meets neither condition, the run is Inconclusive and the rollout pauses at its step until a human resumes or aborts. Empty Prometheus results and NaN need explicit handling in the conditions.", on: ["analysis", "prom"], flow: ["e-query"] },
      { text: "Blue-green: the new ReplicaSet (green) is scaled up behind a preview Service while the active Service still selects blue. Pre-promotion analysis tests green before any user sees it; failure aborts.", on: ["active", "preview", "blue", "green", "bgan"], flow: ["e-act", "e-prev", "e-bgan"] },
      { text: "Promotion switches the active Service's selector to green in one step. Post-promotion analysis can still fail and switch traffic back. Blue stays up for `scaleDownDelaySeconds` (30 by default), which is the window for an instant rollback.", on: ["active", "green", "blue"], flow: ["e-switch"] },
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
        label: "AnalysisTemplate: success rate",
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
    ],
    codeNote: "The analysis step blocks the rollout until it finishes. The `len(result) > 0` guard means a canary that got no traffic fails instead of passing by default.",
    say30: "Argo Rollouts replaces a Deployment with a Rollout that has a strategy. For a canary, you list steps: set weight to 5%, pause to bake, run an analysis, increase the weight, and so on. With a traffic router like Istio or an ingress controller the weights are exact and the stable version stays fully scaled; without one, weight is approximated by pod counts. Analysis runs query metrics such as success rate from Prometheus; failing past the limit aborts, sends all traffic back to stable and marks the rollout Degraded, while inconclusive results pause for a human. Blue-green instead brings up a full green copy behind a preview Service, tests it, then flips the active Service, keeping blue briefly for rollback.",
    gotchas: [
      "Without a traffic router, `setWeight` is approximated with replica counts. At 4 replicas you cannot send 5%; the smallest canary is 25%.",
      "An abort doesn't change Git. The Rollout stays Degraded and Argo CD shows Degraded too, until someone reverts the commit or ships a fix.",
      "An Inconclusive analysis pauses the rollout indefinitely. If nobody is watching, the release sits half-done.",
      "Traffic shifting doesn't undo side effects. A schema migration or a message format change made by the canary stays after rollback, so changes must be backward compatible across both versions.",
    ],
    atScale: [
      "Canaries without enough traffic: 5% of a low-traffic service may be a handful of requests per interval, so one error swings the rate, and zero traffic gives an empty result or NaN. Write conditions that treat empty results explicitly (`len(result) > 0`), measure over longer windows, or route test traffic to the canary with header routing where the router supports it.",
      "Multi-cluster and regional waves: Argo Rollouts runs per cluster, with its controller installed in each, and does not coordinate across clusters. The wave across regions is orchestrated above it, for example Argo CD Progressive Syncs stepping through clusters by label and waiting for each step to be Healthy.",
      "Bake time adds up: a 10 minute pause across 5 steps and 6 regional waves is hours per release, and with many deploys a day they queue or get batched. Bigger batches raise change fail rate and slow lead time (DORA). Teams shorten bakes by relying on automated analysis rather than long fixed pauses.",
      "Capacity: canary with traffic routing keeps stable at 100% plus the canary, and blue-green runs two full copies. On a large fleet that is real money; `dynamicStableScale` scales stable down as traffic moves (slower rollback), and `previewReplicaCount` keeps green small until promotion.",
      "Not just binaries: config, feature flags and content pushes can take down a fleet as fast as code, and several large outages came from changes that skipped staged rollout. Apply the same rings, bake times and automatic aborts to them.",
      "The metrics pipeline is now in the deploy path: a slow or broken Prometheus stalls or aborts every rollout at once. Use dry-run mode to trial a new metric before it gates anything, and alert on analysis errors, not just failures.",
    ],
    quiz: [
      { q: "Your canary passed analysis, went to 100%, and then errors spiked. What could the analysis have missed?", a: "The canary may have seen too little traffic, or the wrong traffic, to be meaningful; the metric may not cover the failure (latency, a downstream dependency, one customer segment); or the problem only appears at full load. Add metrics, minimum traffic checks and a background analysis that keeps running through the final steps." },
      { q: "An AnalysisRun failed. Exactly what does Argo Rollouts do, and what is left for you?", a: "It aborts: canary weight goes back to zero so stable takes all traffic, and the Rollout is marked Degraded. Git still declares the new version, so you revert or fix forward; the controller doesn't touch Git." },
      { q: "When would you pick blue-green over a canary?", a: "When you can't run two versions side by side for real users, or want to test the full new copy before any user sees it, and can afford double capacity briefly. The cutover is all at once, so pre-promotion analysis and the short scale-down window for rollback matter." },
    ],
    incidents: ["crowdstrike-2024-channel-file-291", "microsoft-2014-azure-storage-infinite-loop"],
    sources: [
      { title: "Argo Rollouts: Concepts", url: "https://argoproj.github.io/argo-rollouts/concepts/" },
      { title: "Argo Rollouts: Canary", url: "https://argoproj.github.io/argo-rollouts/features/canary/" },
      { title: "Argo Rollouts: Blue-green", url: "https://argoproj.github.io/argo-rollouts/features/bluegreen/" },
      { title: "Argo Rollouts: Analysis and progressive delivery", url: "https://argoproj.github.io/argo-rollouts/features/analysis/" },
      { title: "Argo Rollouts: Traffic management", url: "https://argoproj.github.io/argo-rollouts/features/traffic-management/" },
      { title: "Argo Rollouts: Rollout specification", url: "https://argoproj.github.io/argo-rollouts/features/specification/" },
      { title: "Argo Rollouts: FAQ", url: "https://argoproj.github.io/argo-rollouts/FAQ/" },
      { title: "Argo CD: Progressive Syncs", url: "https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Progressive-Syncs/" },
      { title: "DORA: Software delivery performance metrics", url: "https://dora.dev/guides/dora-metrics/" },
    ],
  },
];
