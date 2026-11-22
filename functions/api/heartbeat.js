import { heartbeatIntake } from "../../worker/src/heartbeat.js";
import { withSpan } from "../../worker/src/telemetry.js";

// Hosts the worker can't reach report in here; see worker/src/heartbeat.js.
export async function onRequestPost({ request, env }) {
  return withSpan("http.post.heartbeat", { route: "/api/heartbeat" }, async (span) => {
    const res = await heartbeatIntake(request, env);
    span.setAttribute("http_status", res.status);
    return res;
  });
}
