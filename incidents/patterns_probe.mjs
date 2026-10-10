// Score incidents against each pattern description; print the top matches for review.
// Usage: node patterns_probe.mjs <incidents dir> <patterns.src.json> [only-ids.txt]
import { readFile } from "node:fs/promises";
import { pipeline } from "@huggingface/transformers";
const [dir, pfile, onlyFile] = process.argv.slice(2);
const incidents = JSON.parse(await readFile(`${dir}/data/incidents.json`, "utf8"));
const index = JSON.parse(await readFile(`${dir}/data/index.json`, "utf8"));
const vec = new Float32Array((await readFile(`${dir}/data/embeddings.bin`)).buffer.slice(0));
const byId = new Map(incidents.map((d) => [d.id, d]));
const patterns = JSON.parse(await readFile(pfile, "utf8"));
const only = onlyFile ? new Set((await readFile(onlyFile, "utf8")).split(/\r?\n/).filter(Boolean)) : null;
const ex = await pipeline("feature-extraction", index.model, { dtype: index.dtype });
for (const p of patterns) {
  const q = (await ex(p.describe, { pooling: "mean", normalize: true })).data;
  const scored = index.ids
    .map((id, i) => { let s = 0; for (let j = 0; j < index.dim; j++) s += q[j] * vec[i * index.dim + j]; return [id, s]; })
    .filter(([id]) => !only || only.has(id))
    .sort((a, b) => b[1] - a[1]);
  console.log(`\n## ${p.id}`);
  for (const [id, s] of scored.slice(0, 14)) console.log(`${s.toFixed(3)}  ${id}  | ${byId.get(id).title}`);
}
