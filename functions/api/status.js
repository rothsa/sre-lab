import { statusApi } from "../../worker/src/status.js";

export const onRequestGet = ({ request, env }) => statusApi(request, env, false);
