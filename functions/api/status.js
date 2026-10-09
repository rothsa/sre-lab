import { statusApi } from "../../worker/src/status.js";

// Edge-cache the public board for 60s so bot traffic is served from cache, not D1.
export async function onRequestGet({ request, env, waitUntil }) {
  const key = new Request(new URL("/api/status", request.url).toString());
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await statusApi(request, env, false);
  if (res.ok) waitUntil(cache.put(key, res.clone()));
  return res;
}
