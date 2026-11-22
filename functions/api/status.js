import { statusApi } from "../../worker/src/status.js";
import { withSpan } from "../../worker/src/telemetry.js";

// Edge-cache the public board for 60s so bot traffic is served from cache, not D1.
export async function onRequestGet({ request, env, waitUntil }) {
  return withSpan("http.get.status", { route: "/api/status", scope: "public" }, async (span) => {
    const key = new Request(new URL("/api/status", request.url).toString());
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) {
      span.setAttributes({ cache_hit: true, http_status: hit.status });
      return hit;
    }
    const res = await statusApi(request, env, false);
    span.setAttributes({ cache_hit: false, http_status: res.status });
    if (res.ok) waitUntil(cache.put(key, res.clone()));
    return res;
  });
}
