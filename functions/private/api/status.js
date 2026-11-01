import { statusApi } from "../../../worker/src/status.js";

// Behind Cloudflare Access on sre-lab-97p.pages.dev; statusApi also checks the Access identity header.
export const onRequestGet = ({ request, env }) => statusApi(request, env, true);
