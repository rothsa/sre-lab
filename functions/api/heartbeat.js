import { heartbeatIntake } from "../../worker/src/heartbeat.js";

// Hosts the worker can't reach report in here; see worker/src/heartbeat.js.
export const onRequestPost = ({ request, env }) => heartbeatIntake(request, env);
