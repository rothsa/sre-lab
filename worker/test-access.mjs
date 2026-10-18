// Offline tests for the private board's Cloudflare Access check (verifyAccess). No network: a fake
// fetch serves the team's JWKS, and tokens are signed with a throwaway RSA key made here.
//   node worker/test-access.mjs
import assert from "node:assert/strict";
import { verifyAccess, statusApi } from "./src/status.js";

const TEAM = "example.cloudflareaccess.com";
const AUD = "test-aud-tag";
const OWNER = "owner@example.com";
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, OWNER_EMAIL: OWNER };

const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "RS256" };
let certCalls = 0;
const fakeFetch = async (url) => { certCalls++; assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`); return new Response(JSON.stringify({ keys: [jwk] })); };

async function token(claims = {}, { key = kp.privateKey, kid = "k1", alg = "RS256" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = enc({ alg, kid, typ: "JWT" });
  const p = enc({ iss: `https://${TEAM}`, aud: [AUD], email: OWNER, exp: now + 300, iat: now, ...claims });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`))).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const req = (headers) => new Request("https://lab.example/private/api/status", { headers });

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log("ok -", name); }

await t("valid owner token passes", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token() }), env, fakeFetch), OWNER);
});
await t("forged email header alone is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-authenticated-user-email": OWNER }), env, fakeFetch), null);
});
await t("fails closed when Access env vars are missing", async () => {
  const tok = await token();
  for (const k of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "OWNER_EMAIL"]) {
    const e = { ...env }; delete e[k];
    assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": tok }), e, fakeFetch), null, k);
  }
});
await t("wrong audience is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({ aud: ["other-app"] }) }), env, fakeFetch), null);
});
await t("wrong issuer is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({ iss: "https://evil.cloudflareaccess.com" }) }), env, fakeFetch), null);
});
await t("expired token is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({ exp: Math.floor(Date.now() / 1000) - 10 }) }), env, fakeFetch), null);
});
await t("token signed by another key is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({}, { key: other.privateKey }) }), env, fakeFetch), null);
});
await t("unknown kid and non-RS256 alg are rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({}, { kid: "nope" }) }), env, fakeFetch), null);
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({}, { alg: "none" }) }), env, fakeFetch), null);
});
await t("valid token for a different email is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": await token({ email: "someone@else.com" }) }), env, fakeFetch), null);
});
await t("tampered payload is rejected", async () => {
  const [h, , s] = (await token()).split(".");
  const p = enc({ iss: `https://${TEAM}`, aud: [AUD], email: OWNER, exp: Math.floor(Date.now() / 1000) + 9999 });
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": `${h}.${p}.${s}` }), env, fakeFetch), null);
});
await t("garbage token is rejected", async () => {
  assert.equal(await verifyAccess(req({ "cf-access-jwt-assertion": "a.b.c" }), env, fakeFetch), null);
});
await t("JWKS is cached between requests", async () => {
  const before = certCalls;
  await verifyAccess(req({ "cf-access-jwt-assertion": await token() }), env, fakeFetch);
  assert.equal(certCalls, before);
});
await t("statusApi private returns 403 no-store for a forged header", async () => {
  const res = await statusApi(req({ "cf-access-authenticated-user-email": OWNER }), env, true);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
});

console.log(`${passed} passed`);
