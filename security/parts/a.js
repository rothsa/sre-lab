// Chapters 1-4: AWS IAM evaluation, roles and federation, the TLS 1.3 handshake, mTLS and service identity.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`, see ../../drawn/README.md).
export const CHAPTERS = [
  {
    id: "iam-evaluation",
    n: 1,
    title: "How AWS decides allow or deny",
    question: "A role has `s3:GetObject` in its policy, but the call still returns AccessDenied. Walk through how AWS evaluates a request, in order.",
    view: [940, 560],
    groups: [
      { id: "g-cross", label: "Cross-account request", x: 720, y: 150, w: 210, h: 240 },
    ],
    nodes: [
      { id: "req", label: "Request", sub: "principal, action,\nresource, context", kind: "actor", x: 20, y: 20, w: 150, h: 62 },
      { id: "q-deny", label: "Explicit Deny?", sub: "in any policy", kind: "q", x: 230, y: 20, w: 210, h: 46 },
      { id: "q-rcp", label: "RCPs allow?", sub: "resource's org", kind: "q", x: 230, y: 90, w: 210, h: 46 },
      { id: "q-scp", label: "SCPs allow?", sub: "principal's org", kind: "q", x: 230, y: 160, w: 210, h: 46 },
      { id: "q-rbp", label: "Resource policy?", sub: "grants user/session", kind: "q", x: 230, y: 230, w: 210, h: 46 },
      { id: "q-idp", label: "Identity policy?", sub: "allows the action", kind: "q", x: 230, y: 300, w: 210, h: 46 },
      { id: "q-pb", label: "Boundary?", sub: "if set, allows", kind: "q", x: 230, y: 370, w: 210, h: 46 },
      { id: "q-sp", label: "Session policy?", sub: "if passed, allows", kind: "q", x: 230, y: 440, w: 210, h: 46 },
      { id: "allow", label: "Allow", sub: "final decision", x: 230, y: 510, w: 210, h: 44 },
      { id: "deny", label: "Deny", sub: "final decision", x: 560, y: 150, w: 130, h: 200 },
      { id: "acct-a", label: "Account A", sub: "trusted", x: 730, y: 190, w: 92, h: 50 },
      { id: "acct-b", label: "Account B", sub: "trusting", x: 830, y: 190, w: 92, h: 50 },
      { id: "both", label: "Both Allow?", sub: "else Deny", kind: "q", x: 740, y: 310, w: 170, h: 50 },
    ],
    edges: [
      { id: "e-req", from: "req", to: "q-deny" },
      { id: "e-d1", from: "q-deny", to: "deny", via: [[500, 43]], label: "yes", labelAt: [470, 43] },
      { id: "e-n1", from: "q-deny", to: "q-rcp" },
      { id: "e-d2", from: "q-rcp", to: "deny", via: [[500, 113]], label: "no", labelAt: [470, 113] },
      { id: "e-n2", from: "q-rcp", to: "q-scp" },
      { id: "e-d3", from: "q-scp", to: "deny", via: [[500, 183]], label: "no", labelAt: [470, 183] },
      { id: "e-n3", from: "q-scp", to: "q-rbp" },
      { id: "e-rbp-allow", from: "q-rbp", to: "allow", via: [[195, 253], [195, 532]], label: "yes: Allow", labelAt: [150, 400] },
      { id: "e-n4", from: "q-rbp", to: "q-idp" },
      { id: "e-d5", from: "q-idp", to: "deny", via: [[500, 323]], label: "no", labelAt: [470, 323] },
      { id: "e-n5", from: "q-idp", to: "q-pb" },
      { id: "e-d6", from: "q-pb", to: "deny", via: [[500, 393]], label: "no", labelAt: [470, 393] },
      { id: "e-n6", from: "q-pb", to: "q-sp" },
      { id: "e-d7", from: "q-sp", to: "deny", via: [[500, 463]], label: "no", labelAt: [470, 463] },
      { id: "e-n7", from: "q-sp", to: "allow" },
      { id: "e-a", from: "acct-a", to: "both" },
      { id: "e-b", from: "acct-b", to: "both" },
    ],
    steps: [
      { text: "The documented evaluation order for one account. Every request starts as an implicit deny, and only an Allow that survives every check turns it into Allow. Press Next to follow a request." },
      { text: "AWS authenticates the caller and builds the request context: principal, action, resource and condition keys. Then it scans every applicable policy for a matching `Deny`. One explicit deny anywhere ends evaluation with Deny.", on: ["req", "q-deny", "deny"], flow: ["e-req", "e-d1"] },
      { text: "Resource control policies from AWS Organizations, attached above the account that owns the resource. `RCPFullAWSAccess` is always attached, so RCPs restrict through Deny statements, even for principals outside your organization. Like SCPs, they don't apply to resources in the management account or to service-linked roles.", on: ["q-rcp", "deny"], flow: ["e-n1", "e-d2"] },
      { text: "Service control policies, attached above the caller's account. Every level from the org root down must allow the action. SCPs never grant anything, and they don't apply to the management account or to service-linked roles.", on: ["q-scp", "deny"], flow: ["e-n2", "e-d3"] },
      { text: "Same-account resource policies. If one grants the IAM user or the role session ARN directly, the request is allowed even without an identity-policy allow. If it names the role ARN instead, boundaries and session policies still limit it.", on: ["q-rbp", "allow"], flow: ["e-n3", "e-rbp-allow"] },
      { text: "Identity-based policies on the user (and its groups) or role. No statement allowing the action means an implicit deny. This is the usual cause of AccessDenied.", on: ["q-idp", "deny"], flow: ["e-n4", "e-d5"] },
      { text: "Permissions boundary, if the user or role has one. It is a ceiling: the effective permission is the intersection of the boundary and the identity policy. Not listed in the boundary means Deny.", on: ["q-pb", "deny"], flow: ["e-n5", "e-d6"] },
      { text: "Session policy, if one was passed to an `AssumeRole*` call or `GetFederationToken`. The session can only narrow the role, never widen it. A non-session principal, or a session with no session policy, reaches Allow here.", on: ["q-sp", "allow", "deny"], flow: ["e-n6", "e-n7", "e-d7"] },
      { text: "Cross-account: the request is evaluated in both accounts. The caller's identity policy in account A must allow it, and the resource policy (or role trust policy) in account B must name the caller. Only two Allows give Allow.", on: ["acct-a", "acct-b", "both"], flow: ["e-a", "e-b"] },
    ],
    say30: "Everything starts as an implicit deny, and an explicit deny in any policy wins. AWS first checks all policies for a matching Deny. Then it checks Organizations guardrails: RCPs on the resource's account and SCPs on the caller's account must allow the action, but they never grant anything. Next, a same-account resource policy that grants the user or session directly can allow on its own. Otherwise the identity policy must allow it, and a permissions boundary and any session policy can only narrow that. Cross-account, it runs twice: the caller's account must allow the call and the resource's policy must trust the caller.",
    gotchas: [
      "An SCP or RCP Allow grants nothing. A role in an account with `FullAWSAccess` still needs an identity policy that allows the action.",
      "Within one account, a resource policy that names the role session ARN or IAM user can allow by itself. Naming the role ARN does not escape the permissions boundary or session policy.",
      "Role trust policies and KMS key policies are exceptions: they must explicitly allow the principal, even inside the same account.",
      "SCPs don't restrict the management account or service-linked roles, so a guardrail tested only there proves nothing about member accounts.",
    ],
    atScale: [
      "Role and policy quotas: an account defaults to 1,000 roles (up to 10,000) and 20 managed policies per role (up to 25), with 6,144 characters per managed policy. Large orgs hit these and split workloads across accounts or move to tag-based (ABAC) policies.",
      "Least privilege across thousands of roles can't be done by hand. IAM Access Analyzer generates policies from CloudTrail activity, and its unused-access analyzer flags unused roles, access keys and actions (it is billed per role analyzed).",
      "SCP guardrails across hundreds of accounts: attach them to OUs, not accounts, and roll out by moving a few accounts at a time into a test OU. Removing `FullAWSAccess` without a replacement allow blocks every action in member accounts.",
      "Accidental public or cross-account sharing grows with the number of buckets, keys and queues. External-access analyzers flag it, but they only see the Region they run in, so you create one per Region in use.",
      "Data perimeters: RCPs restrict who can reach S3, KMS, SQS, Secrets Manager and other supported services org-wide, even when a bucket owner writes a wide-open bucket policy.",
    ],
    agentic: [
      "An agent can now walk this chain for you, pulling the identity policy, SCPs, RCPs and boundary and pointing at the deny. The human still checks that answer against the real denial in CloudTrail, because a plausible but wrong \"just add an Allow\" leads straight to over-granting.",
      "Agent calls go through exactly the same evaluation: no explicit deny, SCP or RCP knows the request came from an LLM. That makes these layers the real guardrail, and LLM06:2025 Excessive Agency says to authorize in downstream systems, not in the model; a prompt saying \"read-only\" is not a Deny.",
      "New failure mode: an agent that fixes its own AccessDenied. The EKS MCP server (in preview) documents an `add_inline_policy` write tool, so keep `iam:Put*Policy` and `iam:Attach*Policy` out of agent roles, or cap them with a permissions boundary and SCP.",
    ],
    code: [
      { lang: "json", label: "SCP guardrail (attach to an OU)", src: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Deny",
    "Action": "organizations:LeaveOrganization",
    "Resource": "*"
  }]
}` },
    ],
    codeNote: "Guardrails are usually written as Deny statements on top of the default `FullAWSAccess` SCP, so they cut specific actions without having to list everything that is allowed.",
    quiz: [
      { q: "An SCP allows `s3:*`, but the role has no identity policy. Can it read a bucket in its own account that has no bucket policy?", a: "No. SCPs only set the maximum. With no identity-based or resource-based allow, the request stays an implicit deny." },
      { q: "A role in account A calls `GetObject` on a bucket in account B. The bucket policy allows the role. What else is needed?", a: "The role's identity policy in account A must allow `s3:GetObject` on that bucket. Cross-account requests are evaluated in both accounts and both must allow." },
      { q: "What's the difference between a permissions boundary and a session policy?", a: "Both narrow permissions and grant nothing. A boundary is a managed policy set on the user or role itself and applies to every use; a session policy is passed when the session is created and applies only to that session." },
    ],
    incidents: ["sentry-2016-s3-backup-acl"],
    sources: [
      { title: "Policy evaluation logic", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html" },
      { title: "How AWS enforcement code logic evaluates requests", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic_policy-eval-denyallow.html" },
      { title: "Cross-account policy evaluation logic", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html" },
      { title: "Service control policies (SCPs)", url: "https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html" },
      { title: "Resource control policies (RCPs)", url: "https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html" },
      { title: "Using IAM Access Analyzer", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html" },
      { title: "IAM and AWS STS quotas", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html" },
      { title: "OWASP LLM06:2025 Excessive Agency", url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/" },
      { title: "Amazon EKS MCP Server tools reference (preview)", url: "https://docs.aws.amazon.com/eks/latest/userguide/eks-mcp-tools.html" },
    ],
  },
  {
    id: "roles-federation",
    n: 2,
    title: "Roles, AssumeRole and federation instead of keys",
    question: "How should CI pipelines and Kubernetes pods get AWS credentials, and why not just give them an access key?",
    view: [940, 520],
    groups: [
      { id: "g-role", label: "IAM role", x: 620, y: 100, w: 190, h: 270 },
    ],
    nodes: [
      { id: "gha", label: "GitHub Actions", sub: "job: id-token write", kind: "actor", x: 20, y: 40, w: 150, h: 50 },
      { id: "ghoidc", label: "GitHub OIDC", sub: "signs a JWT", x: 230, y: 40, w: 150, h: 50 },
      { id: "iamprov", label: "IAM OIDC provider", sub: "issuer + audience", x: 430, y: 40, w: 170, h: 50 },
      { id: "pod", label: "Pod", sub: "service account", kind: "pod", x: 20, y: 200, w: 150, h: 50 },
      { id: "k8s", label: "Token or agent", sub: "IRSA / Pod Identity", x: 215, y: 200, w: 160, h: 50 },
      { id: "sts", label: "AWS STS", sub: "AssumeRole*", x: 430, y: 200, w: 140, h: 60 },
      { id: "trust", label: "Trust policy", sub: "who may assume", x: 640, y: 140, w: 150, h: 50 },
      { id: "perms", label: "Permissions", sub: "what it may do", x: 640, y: 300, w: 150, h: 50 },
      { id: "api", label: "AWS API", sub: "S3, SQS, ...", x: 820, y: 300, w: 110, h: 50 },
      { id: "ct", label: "CloudTrail", sub: "who assumed what", kind: "store", x: 640, y: 410, w: 150, h: 50 },
      { id: "key", label: "Access key", sub: "IAM user, no expiry", x: 20, y: 455, w: 150, h: 50 },
    ],
    edges: [
      { id: "e-gha-oidc", from: "gha", to: "ghoidc" },
      { id: "e-gha-sts", from: "gha", to: "sts", label: "JWT → temp creds", bidir: true, labelPos: 0.45 },
      { id: "e-sts-prov", from: "sts", to: "iamprov", label: "verify JWT", labelAt: [550, 140] },
      { id: "e-pod-k8s", from: "pod", to: "k8s" },
      { id: "e-k8s-sts", from: "k8s", to: "sts", bidir: true },
      { id: "e-sts-trust", from: "sts", to: "trust", label: "check trust", labelAt: [600, 182] },
      { id: "e-use", from: "pod", to: "api", via: [[95, 385], [875, 385]], label: "signed API calls", labelAt: [470, 385] },
      { id: "e-perms-api", from: "perms", to: "api" },
      { id: "e-sts-ct", from: "sts", to: "ct", label: "logs AssumeRole", labelAt: [560, 330] },
      { id: "e-api-ct", from: "api", to: "ct", label: "logs calls", labelAt: [860, 450] },
      { id: "e-key", from: "key", to: "api", via: [[875, 480]], label: "valid until revoked", labelAt: [470, 480], dashed: true },
    ],
    steps: [
      { text: "Two ways to get AWS credentials: a long-lived access key, or a role whose temporary credentials are minted on demand. Press Next to compare them." },
      { text: "The old way: an IAM user access key stored in CI settings, a config file or a server. It works until someone revokes it, so a leaked copy keeps working too. BrowserStack, Bitly and CircleCI all had stored keys or secrets stolen.", on: ["key", "api"], flow: ["e-key"] },
      { text: "A role has no password or key of its own. It has two policies: the trust policy (a resource policy on the role) says who may assume it, and the permissions policy says what the session may do.", on: ["trust", "perms"] },
      { text: "`AssumeRole` returns an access key ID, secret key, session token and expiration. Sessions last 15 minutes up to the role's maximum (1 to 12 hours), 1 hour by default, and role chaining caps them at 1 hour.", on: ["sts", "trust"], flow: ["e-sts-trust"] },
      { text: "CI with no stored secret: a GitHub Actions job with `id-token: write` asks GitHub's OIDC provider for a signed JWT describing the repo, branch and workflow.", on: ["gha", "ghoidc"], flow: ["e-gha-oidc"] },
      { text: "The job sends the JWT to STS with `AssumeRoleWithWebIdentity`. STS checks it against the IAM OIDC provider for `token.actions.githubusercontent.com`: signature from the issuer's keys, and audience `sts.amazonaws.com`.", on: ["gha", "sts", "iamprov"], flow: ["e-gha-sts", "e-sts-prov"] },
      { text: "The trust policy must also pin the `sub` claim, for example `repo:my-org/deploy:ref:refs/heads/main`. Without it, any repository's workflow with a GitHub token could try to assume the role.", on: ["sts", "trust"], flow: ["e-sts-trust"] },
      { text: "Pods: with IRSA, each EKS cluster's OIDC issuer signs a projected service account token, and the SDK swaps it at STS. With EKS Pod Identity, a node agent gets credentials through EKS Auth, and roles trust `pods.eks.amazonaws.com`.", on: ["pod", "k8s", "sts"], flow: ["e-pod-k8s", "e-k8s-sts"] },
      { text: "The workload signs API calls with the temporary credentials. The role's permissions policy, narrowed by any session policy, decides what's allowed. When the session expires, the SDK fetches new credentials.", on: ["pod", "api", "perms"], flow: ["e-use", "e-perms-api"] },
      { text: "CloudTrail records every `AssumeRole*` call with its session name and source identity, and later calls show `assumed-role/<role>/<session>`. Source identity can't be changed during the session and carries through role chaining.", on: ["ct", "sts", "api"], flow: ["e-sts-ct", "e-api-ct"] },
    ],
    say30: "A role has no stored secret. Its trust policy says who can assume it and its permissions policy says what the session can do. STS returns credentials that expire, an hour by default. In CI, a GitHub Actions job gets a signed OIDC token and calls AssumeRoleWithWebIdentity. AWS checks the issuer, audience and subject, so only that repo and branch can deploy. In EKS, IRSA does the same with the cluster's service account tokens, and Pod Identity uses an on-node agent and a single service principal. A leaked access key works until someone revokes it; a leaked session dies on its own, and CloudTrail shows which session did what.",
    gotchas: [
      "Trust policy vs permissions policy: an AccessDenied on `sts:AssumeRole` is a trust policy problem, or, cross-account, a missing `sts:AssumeRole` allow in the caller's identity policy. It isn't fixed by adding permissions to the role.",
      "An OIDC trust policy that checks only `aud` lets any workflow that can get a token from that issuer assume the role. Always pin `sub`, and check its format: GitHub says repositories created, renamed or transferred after 15 July 2026 (or opted in) use a subject with immutable IDs, `repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:...`, so check the `sub` a token actually carries.",
      "Role chaining (using a role session to assume another role) caps the new session at 1 hour, even if the role's maximum is 12 hours.",
      "Neither IRSA nor Pod Identity is a security boundary on the node. If pods can reach the EC2 instance metadata service, they can get the node role's credentials, so restrict IMDS access.",
    ],
    atScale: [
      "Role sprawl: the default quota is 1,000 roles per account (up to 10,000). Instead of one role per team, pass session tags (up to 50) from the IdP and write ABAC policies on `aws:PrincipalTag`. Roles must allow `sts:TagSession` in their trust policy.",
      "IRSA needs one IAM OIDC provider per cluster (100 per account by default, 700 max). A role shared by many clusters needs a trust statement per cluster, and trust policies cap at 2,048 characters by default (8,192 max). Pod Identity uses one service principal, so the same role works in every cluster.",
      "STS rate limits: `AssumeRole` and `GetCallerIdentity` share 600 requests per second per account per Region. Thousands of pods or jobs calling `AssumeRole` with existing credentials can hit it (`AssumeRoleWithWebIdentity`, used by IRSA, isn't in that shared list). Pod Identity fetches credentials once per node, not once per pod, and SDKs should reuse them until they near expiry.",
      "Pod Identity supports up to 5,000 associations per cluster, and associations are eventually consistent: create them during setup, not in a hot deploy path.",
      "Auditing shared roles: session names alone are chosen by the caller. Require `sts:SourceIdentity` in trust policies so CloudTrail shows the original human or workload even after role chaining. AWS doesn't control that value either, so it must come from something you control, such as your IdP.",
    ],
    agentic: [
      "Agents are workloads and get the same answer as CI and pods: their own role through federation and short-lived credentials, never a developer's access key or standing session. Google's SRE paper says this directly, and AWS AgentCore Identity and Google Cloud Agent Identity both model agents as workload identities.",
      "Design attribution into the trust policy: require `sts:SourceIdentity` set to the human who started the agent and pass a session tag naming the agent. Have your IdP or launcher set the value, never the agent itself. CloudTrail then shows who the agent acted for even after role chaining (not when an AWS service or service-linked role acts on a federated identity's behalf), and ABAC on `aws:PrincipalTag` can give the agent less than the human has.",
      "Agent identities follow the deployment: on Google Cloud, deleting and redeploying an agent creates a new principal whose bindings start empty, while the old grants linger until removed. Inventory and expire agent roles like any workload, or they become the next forgotten standing access.",
    ],
    code: [
      { lang: "json", label: "Role trust policy for GitHub OIDC", src: `{
  "Effect": "Allow",
  "Principal": { "Federated":
    "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": { "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub":
      "repo:my-org/deploy:ref:refs/heads/main"
  } }
}` },
      { lang: "yaml", label: "Workflow", src: `permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v6
    with:
      role-to-assume: arn:aws:iam::111122223333:role/deploy
      aws-region: eu-central-1` },
    ],
    codeNote: "No secret is stored in GitHub. `id-token: write` only lets the job request an OIDC token; what it can do in AWS is set by the role's permissions policy. The `sub` shown is the older name-only format; newer repositories emit `repo:my-org@<owner-id>/deploy@<repo-id>:ref:refs/heads/main`.",
    quiz: [
      { q: "What does `AssumeRole` return, and how long does it last by default?", a: "An access key ID, secret access key, session token and expiration. The default is 3,600 seconds (1 hour); it can range from 15 minutes up to the role's maximum session duration (1 to 12 hours)." },
      { q: "Why is IRSA harder to scale across many clusters than EKS Pod Identity?", a: "IRSA needs an IAM OIDC provider per cluster and a trust policy statement per cluster issuer, which runs into provider quotas and trust policy length. Pod Identity roles trust one service principal, `pods.eks.amazonaws.com`, so they can be reused across clusters unchanged." },
      { q: "A role is shared by 40 engineers. How do you find out who deleted a bucket?", a: "In CloudTrail, the `DeleteBucket` event shows the assumed-role session ARN and session context. If the trust policy requires a source identity, `sourceIdentity` names the original user even through role chaining; otherwise match the session name to the `AssumeRole` event." },
    ],
    incidents: ["browserstack-2014-shellshock-aws-key-theft", "bitly-2014-backup-storage-credential-leak", "circleci-2022-session-cookie-theft-secrets-exfil"],
    sources: [
      { title: "AssumeRole (AWS STS API Reference)", url: "https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html" },
      { title: "Create an OpenID Connect (OIDC) identity provider in IAM", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html" },
      { title: "Configuring OpenID Connect in Amazon Web Services (GitHub Docs)", url: "https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws" },
      { title: "IAM roles for service accounts", url: "https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html" },
      { title: "EKS Pod Identity", url: "https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html" },
      { title: "Pass session tags in AWS STS", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_session-tags.html" },
      { title: "Monitor and control actions taken with assumed roles", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_monitor.html" },
      { title: "Security best practices in IAM", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html" },
      { title: "IAM and AWS STS quotas", url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html" },
      { title: "Google SRE: AI in SRE (engineering reliable operations)", url: "https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/" },
      { title: "Amazon Bedrock AgentCore Identity", url: "https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html" },
      { title: "Google Cloud: Agent Identity overview", url: "https://docs.cloud.google.com/iam/docs/agent-identity-overview" },
    ],
  },
  {
    id: "tls-handshake",
    n: 3,
    title: "What happens in a TLS 1.3 handshake",
    question: "Your client opens `https://api.example.com`. What is exchanged before the first request byte, and how does the client decide to trust the server?",
    view: [940, 590],
    nodes: [
      { id: "client", label: "Client", sub: "browser / SDK", kind: "actor", x: 20, y: 30, w: 140, h: 466 },
      { id: "server", label: "Server", sub: "api.example.com", x: 780, y: 30, w: 150, h: 466 },
      { id: "m1", label: "ClientHello", sub: "SNI, key_share, sig algs", x: 300, y: 30, w: 340, h: 46 },
      { id: "m2", label: "ServerHello", sub: "chosen suite + key_share", x: 300, y: 100, w: 340, h: 46 },
      { id: "m3", label: "Certificate", sub: "{encrypted} leaf + chain", x: 300, y: 170, w: 340, h: 46 },
      { id: "m4", label: "CertificateVerify", sub: "signature over transcript", x: 300, y: 240, w: 340, h: 46 },
      { id: "m5", label: "Finished (server)", sub: "MAC over transcript", x: 300, y: 310, w: 340, h: 46 },
      { id: "m6", label: "Finished + data", sub: "client MAC, then request", x: 300, y: 380, w: 340, h: 46 },
      { id: "m7", label: "NewSessionTicket", sub: "PSK for resumption", x: 300, y: 450, w: 340, h: 46 },
      { id: "trust", label: "Trust store", sub: "root CAs", kind: "store", x: 20, y: 530, w: 140, h: 50 },
    ],
    edges: [
      { id: "e1a", from: "client", to: "m1", via: [[200, 53]] },
      { id: "e1b", from: "m1", to: "server", via: [[720, 53]] },
      { id: "e2a", from: "server", to: "m2", via: [[720, 123]] },
      { id: "e2b", from: "m2", to: "client", via: [[200, 123]] },
      { id: "e3a", from: "server", to: "m3", via: [[720, 193]] },
      { id: "e3b", from: "m3", to: "client", via: [[200, 193]] },
      { id: "e4a", from: "server", to: "m4", via: [[720, 263]] },
      { id: "e4b", from: "m4", to: "client", via: [[200, 263]] },
      { id: "e5a", from: "server", to: "m5", via: [[720, 333]] },
      { id: "e5b", from: "m5", to: "client", via: [[200, 333]] },
      { id: "e6a", from: "client", to: "m6", via: [[200, 403]] },
      { id: "e6b", from: "m6", to: "server", via: [[720, 403]] },
      { id: "e7a", from: "server", to: "m7", via: [[720, 473]] },
      { id: "e7b", from: "m7", to: "client", via: [[200, 473]] },
      { id: "e-trust", from: "client", to: "trust", bidir: true },
    ],
    steps: [
      { text: "A full TLS 1.3 handshake: one round trip before the client can send its request. Everything after ServerHello is encrypted. Press Next to step through it." },
      { text: "ClientHello: supported versions and cipher suites, a `key_share` (an ephemeral (EC)DHE public key, guessed for a likely group), `signature_algorithms`, and `server_name` (SNI) so a server hosting many names can pick the right certificate. SNI is sent in clear text unless the client uses Encrypted Client Hello (ECH).", on: ["client", "m1", "server"], flow: ["e1a", "e1b"] },
      { text: "ServerHello: the server picks the suite and sends its own key share. Both sides now derive handshake keys. If the client guessed a group the server won't use, the server sends HelloRetryRequest instead, costing an extra round trip.", on: ["server", "m2", "client"], flow: ["e2a", "e2b"] },
      { text: "EncryptedExtensions, then Certificate: the server's leaf certificate followed by the intermediates that chain toward a root. In TLS 1.3 this is encrypted, so on-path observers no longer see which certificate was sent.", on: ["server", "m3", "client"], flow: ["e3a", "e3b"] },
      { text: "The client validates the chain against its trust store: each signature checks against the issuer's key, every certificate is within notBefore and notAfter, intermediates are marked as CAs, and none is revoked. The hostname must match a subjectAltName DNS entry; the Common Name is not used.", on: ["client", "trust", "m3"], flow: ["e-trust"] },
      { text: "CertificateVerify: the server signs a hash of the whole handshake so far with the certificate's private key. This proves it holds the key, not just a copy of a public certificate.", on: ["server", "m4", "client"], flow: ["e4a", "e4b"] },
      { text: "Server Finished: an HMAC over the transcript using a key derived from the handshake secret. It confirms both sides saw the same messages, so nothing was tampered with or downgraded.", on: ["server", "m5", "client"], flow: ["e5a", "e5b"] },
      { text: "The client checks it, sends its own Finished, and can send the HTTP request right away. That's 1 round trip (TLS 1.2 needed 2). Because static RSA key exchange is gone, every full handshake has forward secrecy (PSK-only resumption and 0-RTT data don't).", on: ["client", "m6", "server"], flow: ["e6a", "e6b"] },
      { text: "After the handshake the server may send NewSessionTicket. Next time, the client offers it as a pre-shared key and skips certificate authentication. Tickets live at most 7 days. Optional 0-RTT data rides with the ClientHello but can be replayed.", on: ["server", "m7", "client"], flow: ["e7a", "e7b"] },
    ],
    say30: "TLS 1.3 takes one round trip. The ClientHello carries the supported versions and ciphers, an ephemeral key share, the signature algorithms it accepts, and SNI so the server picks the right certificate. The server answers with its key share, and from then on everything is encrypted. It sends its certificate chain, a CertificateVerify signature over the transcript proving it holds the private key, and a Finished MAC. The client validates the chain up to a trusted root: signatures, validity dates, CA flags, revocation, and that the hostname matches a SAN. Then it sends Finished and its request. Session tickets let later connections skip the certificate step.",
    gotchas: [
      "A certificate alone proves nothing: it's public. CertificateVerify, signed with the private key over this handshake's transcript, is what authenticates the server.",
      "Hostname checks use the subjectAltName DNS entries, not the Common Name, and `*.example.com` matches exactly one label: `a.example.com`, not `a.b.example.com`.",
      "0-RTT early data isn't forward secret and can be replayed across connections, so only send idempotent requests that way.",
      "Most expiry outages aren't the leaf: an expired intermediate, or a server sending the wrong chain, breaks clients while the leaf looks fine.",
    ],
    atScale: [
      "Certificate expiry is a fleet problem: Azure Storage (2013) lost HTTPS worldwide, MongoDB Cloud (2020) failed on an expired cross-signing intermediate, and Jamf (2025) renewed a cert that never reached every region. Probe what each endpoint actually serves, with the full chain, not what the inventory says.",
      "Automate renewal end to end. ACM renews DNS-validated certificates attached to AWS services automatically, but not imported ones, and each Region's certificate renews separately.",
      "Termination at the load balancer: an ALB decrypts with its certificate list (picked by SNI) and can re-encrypt to targets, but it does not validate target certificates. For end-to-end TLS with certificate checks, pass TLS through with an NLB TCP listener or use a service mesh; ALB mTLS verifies clients, not targets.",
      "Handshake CPU: a full handshake costs an (EC)DHE exchange plus a signature. Session resumption with tickets skips certificate authentication, and long-lived keep-alive connections avoid handshakes entirely, so connection reuse matters more than cipher choice.",
      "Root and intermediate changes ripple through every client trust store. Old devices or pinned roots fail when a CA's chain changes, so track which clients trust which roots before switching CAs.",
    ],
    agentic: [
      "Agents read `openssl s_client -showcerts` output well and explain a broken chain or SAN mismatch fast. The fundamentals still decide it: the human confirms what each endpoint actually serves, since an agent reasoning from a pasted cert or stale docs can call the wrong one healthy.",
      "The tempting agent fix for a handshake error is to switch verification off (`curl -k`, `verify=False`). HashiCorp's Terraform MCP deploy guide explicitly says keep `TFE_SKIP_TLS_VERIFY=false`; treat disabled verification in an agent diff as a hard blocker, because it silently drops server authentication.",
      "TLS proves which server you reached, not that its content is safe: a correctly authenticated page or API response can still carry an indirect prompt injection (LLM01:2025). Remote MCP servers need the same TLS and auth as any API, and HashiCorp recommends a gateway with both for remote hosting.",
    ],
    code: [
      { lang: "bash", label: "See the handshake and chain", src: `openssl s_client -connect api.example.com:443 \\
  -servername api.example.com -tls1_3 -showcerts </dev/null` },
      { lang: "bash", label: "Check expiry and names", src: `openssl s_client -connect api.example.com:443 \\
  -servername api.example.com </dev/null 2>/dev/null \\
  | openssl x509 -noout -subject -enddate -ext subjectAltName` },
    ],
    codeNote: "Always pass `-servername`: without SNI, a server hosting many names may hand you its default certificate, and you end up debugging the wrong one.",
    quiz: [
      { q: "Why is TLS 1.3 one round trip when TLS 1.2 needed two?", a: "The client sends its key share in the ClientHello, guessing the group, so the server can derive keys and send its certificate, CertificateVerify and Finished in its first reply. The client can send data after its own Finished." },
      { q: "What does the Finished message protect against?", a: "It's an HMAC over the whole handshake transcript. If an attacker altered or removed any message, for example to force weaker parameters, the transcripts differ and the check fails." },
      { q: "Clients report certificate errors but `openssl x509 -enddate` on the leaf shows it's valid for months. What do you check?", a: "The chain the server actually sends: an expired or missing intermediate, the wrong chain on some nodes or regions, a hostname not in the SAN list, or a client whose trust store doesn't have the root." },
    ],
    incidents: ["microsoft-azure-2013-storage-ssl-cert-expiry", "mongodb-2020-expired-cross-signed-ca", "jamf-2025-securedns-cert-expiry", "lootlocker-2025-db-provider-cert-expiry"],
    sources: [
      { title: "RFC 9846: The Transport Layer Security (TLS) Protocol Version 1.3", url: "https://www.rfc-editor.org/rfc/rfc9846.html" },
      { title: "RFC 5280: Internet X.509 PKI Certificate and CRL Profile (path validation)", url: "https://www.rfc-editor.org/rfc/rfc5280.html" },
      { title: "RFC 9525: Service Identity in TLS", url: "https://www.rfc-editor.org/rfc/rfc9525.html" },
      { title: "Create an HTTPS listener for your Application Load Balancer", url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html" },
      { title: "Target groups for your Application Load Balancers", url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html" },
      { title: "Managed certificate renewal in AWS Certificate Manager", url: "https://docs.aws.amazon.com/acm/latest/userguide/managed-renewal.html" },
      { title: "Deploy the Terraform MCP server", url: "https://developer.hashicorp.com/terraform/mcp-server/deploy" },
      { title: "OWASP LLM01:2025 Prompt Injection", url: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/" },
    ],
  },
  {
    id: "mtls-identity",
    n: 4,
    title: "mTLS and service identity",
    question: "How do two services prove who they are to each other, and how do you write policy on that identity instead of IP addresses?",
    view: [940, 470],
    groups: [
      { id: "g-pod-a", label: "Pod: frontend (sa/frontend)", x: 20, y: 210, w: 330, h: 110 },
      { id: "g-pod-b", label: "Pod: payments (sa/payments)", x: 590, y: 210, w: 330, h: 110 },
    ],
    nodes: [
      { id: "root", label: "Root CA", sub: "kept offline", kind: "store", x: 395, y: 20, w: 150, h: 50 },
      { id: "istiod", label: "istiod CA", sub: "intermediate", x: 380, y: 120, w: 180, h: 50 },
      { id: "appA", label: "frontend", sub: "plain HTTP", x: 35, y: 250, w: 130, h: 50 },
      { id: "proxyA", label: "Sidecar", sub: "Envoy + agent", x: 200, y: 250, w: 135, h: 50 },
      { id: "proxyB", label: "Sidecar", sub: "Envoy + agent", x: 605, y: 250, w: 135, h: 50 },
      { id: "appB", label: "payments", sub: "localhost", x: 775, y: 250, w: 130, h: 50 },
      { id: "svid", label: "X.509-SVID", sub: "SPIFFE ID in URI SAN", x: 30, y: 380, w: 190, h: 56 },
      { id: "bundle", label: "Trust bundle", sub: "root certs", kind: "store", x: 260, y: 380, w: 170, h: 56 },
      { id: "authz", label: "AuthorizationPolicy", sub: "rules on principal", kind: "q", x: 620, y: 380, w: 190, h: 56 },
    ],
    edges: [
      { id: "e-root", from: "root", to: "istiod", label: "signs" },
      { id: "e-csr-a", from: "proxyA", to: "istiod", label: "CSR → cert", bidir: true, labelPos: 0.4 },
      { id: "e-csr-b", from: "proxyB", to: "istiod", label: "CSR → cert", bidir: true, labelPos: 0.4 },
      { id: "e-bundle", from: "istiod", to: "bundle", label: "distributes", labelPos: 0.7 },
      { id: "e-holds", from: "proxyA", to: "svid", label: "holds" },
      { id: "e-app-a", from: "appA", to: "proxyA" },
      { id: "e-mtls", from: "proxyA", to: "proxyB", label: "mutual TLS", bidir: true },
      { id: "e-authz", from: "proxyB", to: "authz", label: "check principal", labelAt: [745, 345] },
      { id: "e-app-b", from: "proxyB", to: "appB" },
    ],
    steps: [
      { text: "Service-to-service mTLS in a mesh. Each workload gets its own short-lived certificate, both sides verify each other, and policy is written on identities. Press Next to follow one call from frontend to payments." },
      { text: "Identity first. SPIFFE names a workload with a URI, `spiffe://<trust-domain>/<path>`, carried as the single URI SAN of an X.509 certificate called an SVID. Istio derives it from the Kubernetes service account, as `<trust-domain>/ns/<ns>/sa/<sa>`.", on: ["svid", "proxyA"], flow: ["e-holds"] },
      { text: "Issuance: the agent in each pod creates a private key and a certificate signing request, and sends the CSR with the pod's credentials to istiod. istiod checks those credentials, signs, and Envoy loads the result over SDS. The key never leaves the pod.", on: ["proxyA", "proxyB", "istiod"], flow: ["e-csr-a", "e-csr-b"] },
      { text: "The CA hierarchy: by default istiod makes a self-signed root, but production setups keep the root offline and give each cluster's istiod an intermediate. Workloads get the root in their trust bundle to verify peers.", on: ["root", "istiod", "bundle"], flow: ["e-root", "e-bundle"] },
      { text: "Rotation: the agent watches the certificate's expiry and repeats the CSR before it runs out. Nobody files tickets to renew, and a stolen key is only useful until the certificate expires.", on: ["proxyA", "istiod", "svid"], flow: ["e-csr-a"] },
      { text: "The frontend app makes a plain HTTP call. Traffic redirection sends it to its own sidecar, so the application needs no TLS code at all.", on: ["appA", "proxyA"], flow: ["e-app-a"] },
      { text: "The two sidecars run a TLS handshake where the server also requests a client certificate. Each side validates the other's chain against the trust bundle and reads the SPIFFE ID. The client also checks the server's identity is allowed to run the service it called (secure naming).", on: ["proxyA", "proxyB", "bundle"], flow: ["e-mtls"] },
      { text: "The payments sidecar takes the peer's identity as `source.principal` and evaluates AuthorizationPolicy: CUSTOM, then DENY, then ALLOW. With no policies everything is allowed; once any ALLOW policy exists, unmatched requests are denied.", on: ["proxyB", "authz"], flow: ["e-authz"] },
      { text: "If allowed, the sidecar forwards the request to the payments container over localhost. The rule said `sa/frontend`, so it keeps working however often pods move and change IPs.", on: ["proxyB", "appB"], flow: ["e-app-b"] },
      { text: "Rolling it out: PeerAuthentication `PERMISSIVE` accepts both mTLS and plaintext, which lets you migrate without breaking clients outside the mesh. `STRICT` accepts only mTLS. Until you switch, plaintext still gets in.", on: ["proxyB", "proxyA"], flow: ["e-mtls"] },
    ],
    say30: "With mTLS both sides present certificates, so the server knows which workload is calling, not just which IP. Identity comes from SPIFFE: a URI like spiffe://trust-domain/ns/shop/sa/frontend in the certificate's URI SAN. In Istio, an agent in each pod generates a key and CSR, istiod signs it (with its own self-signed root by default, or in production with a cluster intermediate under an offline root), and the agent rotates it automatically before expiry. Sidecars do the handshake, validate each other against the trust bundle, and the server side evaluates AuthorizationPolicy on the caller's principal, deny before allow. You roll out in PERMISSIVE mode, then switch to STRICT so plaintext is refused.",
    gotchas: [
      "mTLS authenticates; it doesn't authorize. Without an AuthorizationPolicy, any workload in the mesh with a valid certificate can call payments.",
      "`PERMISSIVE` mode still accepts plaintext, so a cluster can look fully meshed while non-mesh callers bypass identity checks. Check for STRICT before claiming zero trust.",
      "Adding the first ALLOW policy to a workload flips it to default deny for everything that policy doesn't match, which can break health checkers and other callers you forgot.",
      "Short-lived certificates only help if renewal never stops. If the CA or the agent breaks, every workload fails as its certificate expires, often within hours.",
    ],
    atScale: [
      "Rotating certificates for thousands of workloads puts load on the mesh control plane. Istio says istiod's CPU grows with the number of connected proxies and the rate of change, and it scales horizontally: add istiod replicas.",
      "Expired internal certificates are a recurring outage: Render (2024), SCORM Cloud (2020) and TeamDynamix (2026) all broke when mTLS certificates between services expired. Alert on the remaining lifetime of certificates actually in use, and test renewal, not just issuance.",
      "CA hierarchy across clusters: an offline root with one intermediate per cluster means a compromised cluster CA can be replaced without re-rooting everything, and clusters sharing a root can verify each other's workloads.",
      "Mesh cost: in Istio 1.24 at 1,000 requests per second, a sidecar used about 0.20 vCPU and 60 MB, and an ambient-mode ztunnel about 0.06 vCPU and 12 MB. Multiply by thousands of pods, and remember sidecar memory grows with the number of routes and clusters it's configured with.",
      "Policy on identity survives pod churn: IP-based rules go stale as pods reschedule, while a principal like `cluster.local/ns/shop/sa/frontend` stays the same. That makes service accounts per workload, not one shared default, a prerequisite.",
    ],
    agentic: [
      "Give each agent its own workload identity instead of letting it ride the pod or user that launched it. Google Cloud Agent Identity issues a SPIFFE ID per agent with 24-hour X.509 certificates and binds access tokens to that certificate, so policy can name the agent the way `AuthorizationPolicy` names a service account.",
      "The MCP security best practices forbid token passthrough: a server MUST NOT accept tokens that weren't issued to it. Forwarding a user's token through an agent's tool server hides the real caller and bypasses downstream controls, so each hop should authenticate as itself.",
      "The OWASP Agentic Top 10 lists ASI03 Identity & Privilege Abuse and ASI07 Insecure Inter-Agent Communication: agents calling agents need the same mutual authentication and per-identity authorization as services. A single shared \"agent\" service account is the new default-account mistake, making per-agent policy and attribution impossible.",
    ],
    code: [
      { lang: "yaml", label: "Only frontend may call payments", src: `apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payments-allow-frontend
  namespace: payments
spec:
  selector:
    matchLabels: { app: payments }
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/shop/sa/frontend"]` },
      { lang: "yaml", label: "Refuse plaintext", src: `apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: payments
spec:
  mtls:
    mode: STRICT` },
    ],
    codeNote: "`principals` only works with mTLS on, because the identity comes from the peer certificate.",
    quiz: [
      { q: "What is a SPIFFE ID and where does it live in an X.509-SVID?", a: "A URI of the form `spiffe://<trust-domain>/<path>` naming a workload. It is the certificate's only URI subjectAltName; validators reject an SVID with more than one." },
      { q: "In Istio, who generates the workload's private key, and how does Envoy get its certificate?", a: "The Istio agent in the pod creates the key and a CSR, sends the CSR to istiod, which validates the workload's credentials and signs it. Envoy fetches the certificate and key from the agent over SDS, and the agent repeats this before expiry." },
      { q: "A workload has one AuthorizationPolicy that ALLOWs `sa/frontend`. What happens to a request from `sa/batch`?", a: "It is denied. Once a workload has any ALLOW policy, requests that match none of its rules are denied. With no policies at all, it would have been allowed." },
    ],
    incidents: ["render-2024-expired-mtls-certs", "scorm-cloud-2020-client-cert-expiry", "teamdynamix-2026-internal-tls-cert-expiry"],
    sources: [
      { title: "SPIFFE concepts", url: "https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/" },
      { title: "SPIFFE X.509-SVID standard", url: "https://github.com/spiffe/spiffe/blob/main/standards/X509-SVID.md" },
      { title: "Istio security concepts", url: "https://istio.io/latest/docs/concepts/security/" },
      { title: "Istio AuthorizationPolicy reference", url: "https://istio.io/latest/docs/reference/config/security/authorization-policy/" },
      { title: "Istio: plug in CA certificates", url: "https://istio.io/latest/docs/tasks/security/cert-management/plugin-ca-cert/" },
      { title: "Istio performance and scalability", url: "https://istio.io/latest/docs/ops/deployment/performance-and-scalability/" },
      { title: "Google Cloud: Agent Identity overview", url: "https://docs.cloud.google.com/iam/docs/agent-identity-overview" },
      { title: "MCP Security Best Practices (spec 2026-07-28)", url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices" },
      { title: "OWASP Top 10 for Agentic Applications (announcement, 2025-12-09)", url: "https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/" },
    ],
  },
];
