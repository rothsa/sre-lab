import { statusApi } from "../../../worker/src/status.js";

// Behind Cloudflare Access on sre-lab.pages.dev; statusApi also checks the Access identity header.
export const onRequestGet = ({ request, env }) => statusApi(request, env, true);
