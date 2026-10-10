import { planbApi, json } from "../../worker/src/planb.js";

// Plan B failover demo. POST only; every other method gets a 405 from planbApi.
// Never cached: each run is a real gateway request (Cache-Control: no-store).
export async function onRequest({ request, env }) {
  try {
    return await planbApi(request, env);
  } catch (e) {
    console.log("planb: unhandled", String(e?.message || e).slice(0, 160));
    return json({ error: { code: "internal", message: "Something went wrong on our side. Try again in a minute." } }, 503);
  }
}
