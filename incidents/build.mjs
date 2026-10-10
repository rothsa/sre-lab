// Build step for Find the Incident.
// Embeds every incident with the same model and settings the browser uses, so a query
// embedded in the browser can be compared to these vectors with a plain dot product.
//   node build.mjs           embed data/incidents.json -> data/embeddings.bin + data/index.json
//   node build.mjs --check   also verify every source URL still answers
import { readFile, writeFile } from "node:fs/promises";
import { pipeline } from "@huggingface/transformers";

export const MODEL = "Xenova/all-MiniLM-L6-v2";
export const DTYPE = "q8";

// Keep in sync with docText() in index.html.
const docText = (d) => `${d.title}. ${d.trigger} ${d.impact} ${d.summary}`;

const incidents = JSON.parse(await readFile(new URL("./data/incidents.json", import.meta.url), "utf8"));
const ids = new Set();
for (const d of incidents) {
  for (const f of ["id", "company", "date", "title", "url", "category", "trigger", "impact", "detection", "fix", "summary"]) {
    if (!d[f] || (Array.isArray(d[f]) && !d[f].length)) throw new Error(`${d.id ?? "?"}: missing ${f}`);
  }
  if (ids.has(d.id)) throw new Error(`duplicate id ${d.id}`);
  ids.add(d.id);
}

if (process.argv.includes("--check")) {
  let bad = 0;
  for (const d of incidents) {
    try {
      const res = await fetch(d.url, { method: "GET", redirect: "follow", headers: { "User-Agent": "sre-lab link check (lab.sallyroth.dev)" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { bad++; console.log(`${res.status}  ${d.id}  ${d.url}`); }
    } catch (e) {
      bad++; console.log(`ERR  ${d.id}  ${d.url}  ${e.message}`);
    }
  }
  console.log(`${incidents.length - bad}/${incidents.length} links OK`);
}

const embed = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });
const t0 = Date.now();
const out = await embed(incidents.map(docText), { pooling: "mean", normalize: true });
const [n, dim] = out.dims;
await writeFile(new URL("./data/embeddings.bin", import.meta.url), Buffer.from(new Float32Array(out.data).buffer));
await writeFile(new URL("./data/index.json", import.meta.url), JSON.stringify({ model: MODEL, dtype: DTYPE, dim, ids: incidents.map((d) => d.id) }) + "\n");
console.log(`embedded ${n} incidents (${dim} dims) in ${Date.now() - t0} ms`);
