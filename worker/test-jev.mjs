// One-off smoke test: sends a single tiny classification to Jev and prints the answer.
// Reads the key from ~/.secrets/.jev_api_key and never prints it. Cost: a few hundred input tokens.
//   node worker/test-jev.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const key = readFileSync(`${homedir()}/.secrets/.jev_api_key`, "utf8").trim();
const res = await fetch("https://api.typesafe.ai/v1/systemone", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "jev-latest",
    state: { service: "GitHub", latest_result: { ok: false, status: "503" }, other_services_failing_right_now: "0 of 15", recent_checks: ["ok 200", "ok 200", "FAIL 503", "FAIL 503"] },
    questions: {
      cause: { type: "choice", instructions: "What most likely explains this monitoring result?", criteria: { real_outage: "The service is down.", checker_side: "The monitor's own network is the problem.", transient_blip: "A brief blip." } },
      notify: { type: "noul", instructions: "Should the owner get an email right now?" },
    },
  }),
});
console.log("HTTP", res.status, res.headers.get("x-typesafe-request-id") ? "(request id present)" : "");
const text = await res.text();
console.log(text.slice(0, 1500));
