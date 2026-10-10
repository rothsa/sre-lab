// Offline replica of the page's eval: same model, vectors, BM25 and tokenizer.
import { readFile } from "node:fs/promises";
import { pipeline } from "@huggingface/transformers";
const dir = process.argv[2];
const incidents = JSON.parse(await readFile(`${dir}/data/incidents.json`, "utf8"));
const index = JSON.parse(await readFile(`${dir}/data/index.json`, "utf8"));
const cases = JSON.parse(await readFile(`${dir}/data/eval.json`, "utf8"));
const vec = new Float32Array((await readFile(`${dir}/data/embeddings.bin`)).buffer.slice(0));
const byId = new Map(incidents.map((d) => [d.id, d]));
const docs = index.ids.map((id) => byId.get(id));
const dim = index.dim;
const docText = (d) => `${d.title}. ${d.trigger} ${d.impact} ${d.summary}`;
const STOP = new Set("a an and are as at be but by for from had has have in into is it its of on or that the their then there these this to was were when which while with after before during got went".split(" "));
const tokenize = (s) => s.toLowerCase().split(/[^a-z0-9_\-./]+/).map((t) => t.replace(/^[\-./]+|[\-./]+$/g, "")).filter((t) => t && !STOP.has(t));
const k1 = 1.2, b = 0.75;
const tfs = docs.map((d) => { const tf = new Map(); for (const t of tokenize(`${d.company} ${d.category.join(" ")} ${docText(d)} ${d.detection} ${d.fix}`)) tf.set(t, (tf.get(t) || 0) + 1); return tf; });
const lens = tfs.map((tf) => [...tf.values()].reduce((a, c) => a + c, 0));
const avg = lens.reduce((a, c) => a + c, 0) / lens.length;
const df = new Map(); for (const tf of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
const N = docs.length;
const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
const bm = (q) => { const terms = [...new Set(tokenize(q))]; return tfs.map((tf, i) => { let s = 0; for (const t of terms) { const f = tf.get(t); if (f) s += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * lens[i] / avg)); } return s; }); };
const ranked = (sc) => [...sc].map((s, i) => [i, s]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
const ex = await pipeline("feature-extraction", index.model, { dtype: index.dtype });
const rankOf = (rows, want) => { const r = rows.findIndex(([i]) => want.has(docs[i].id)); return r < 0 ? null : r + 1; };
let hs = 0, hk = 0, ms = 0, mk = 0, hh = 0, mh = 0;
const rrf = (a, b, k = 60) => { const sc = new Map(); for (const list of [a, b]) list.forEach(([i], r) => sc.set(i, (sc.get(i) || 0) + 1 / (k + r + 1))); return [...sc].sort((x, y) => y[1] - x[1]); };
for (const c of cases) {
  const want = new Set(c.expect);
  for (const id of c.expect) if (!byId.has(id)) console.log("UNKNOWN ID", id);
  const qv = (await ex(c.q, { pooling: "mean", normalize: true })).data;
  const sem = ranked(docs.map((_, i) => { let s = 0; for (let j = 0; j < dim; j++) s += qv[j] * vec[i * dim + j]; return s; }));
  const kwr = ranked(bm(c.q)); const rs = rankOf(sem, want), rk = rankOf(kwr, want), rh = rankOf(rrf(sem, kwr), want);
  if (rh && rh <= 5) hh++; mh += rh && rh <= 10 ? 1 / rh : 0;
  if (rs && rs <= 5) hs++; if (rk && rk <= 5) hk++;
  ms += rs && rs <= 10 ? 1 / rs : 0; mk += rk && rk <= 10 ? 1 / rk : 0;
  console.log(`${String(rs ?? "-").padStart(3)} ${String(rk ?? "-").padStart(3)} ${String(rh ?? "-").padStart(3)}  ${c.q}  [sem top: ${docs[sem[0][0]].id}]`);
}
console.log(`hit@5 semantic ${hs}/${cases.length}  keyword ${hk}/${cases.length}   MRR semantic ${(ms / cases.length).toFixed(2)} keyword ${(mk / cases.length).toFixed(2)}  | hybrid hit@5 ${hh}/${cases.length} MRR ${(mh / cases.length).toFixed(2)}`);
