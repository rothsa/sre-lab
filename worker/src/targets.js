// Public demo targets: popular, generic services. Committed to the public repo.
// The owner's private list is NOT in this repo: it's loaded at runtime from the
// PRIVATE_TARGETS secret (a JSON array with the same shape). Private entries stay off the
// public board unless they set "public": true; their hosts and URLs are never published.
export const PUBLIC_TARGETS = [
  { id: "github", name: "GitHub", kind: "http", url: "https://github.com", public: true },
  { id: "aws", name: "AWS", kind: "http", url: "https://aws.amazon.com", public: true },
  { id: "cloudflare", name: "Cloudflare", kind: "http", url: "https://www.cloudflare.com", public: true },
  { id: "slack", name: "Slack", kind: "http", url: "https://slack.com", public: true },
  { id: "google", name: "Google", kind: "http", url: "https://www.google.com/generate_204", expectStatus: [204], public: true },
];

export function allTargets(env) {
  let priv = [];
  try {
    priv = env.PRIVATE_TARGETS ? JSON.parse(env.PRIVATE_TARGETS) : [];
  } catch (e) {
    console.error("PRIVATE_TARGETS is not valid JSON");
  }
  return [...PUBLIC_TARGETS, ...priv.map((t) => ({ ...t, public: t.public === true }))];
}
