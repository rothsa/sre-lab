import { statusApi } from "../../../worker/src/status.js";
import { withSpan } from "../../../worker/src/telemetry.js";

// Behind Cloudflare Access on sre-lab-97p.pages.dev; statusApi also checks the Access identity header.
export async function onRequestGet({ request, env }) {
  return withSpan("http.get.private_status", { route: "/private/api/status", scope: "private" }, async (span) => {
    const res = await statusApi(request, env, true);
    span.setAttribute("http_status", res.status);
    return res;
  });
}
