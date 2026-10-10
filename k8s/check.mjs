// Integrity checks for Kubernetes, Drawn chapter specs.
//   node check.mjs            check every chapter
//   node check.mjs apply dns  check only these chapter ids
// Exits non-zero on errors; warnings don't fail.
import { readFile } from "node:fs/promises";
import { CHAPTERS } from "./diagrams.js";

const only = new Set(process.argv.slice(2));
let incidents = new Set();
try {
  const list = JSON.parse(await readFile(new URL("../incidents/data/incidents.json", import.meta.url), "utf8"));
  incidents = new Set(list.map((d) => d.id));
} catch { console.warn("warning: incidents.json not found; skipping incident id checks"); }

// Rough text widths at the rendered sizes (13px semibold label, 10.5px mono sub, 10.5px mono edge label).
const labelW = (s) => Math.max(...String(s).split("\n").map((l) => l.length)) * 7.4;
const subW = (s) => Math.max(...String(s).split("\n").map((l) => l.length)) * 6.4;
const overlap = (a, b, pad = 4) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;


// Same edge geometry as index.html, so layout problems can be caught without a browser.
const center = (n) => [n.x + n.w / 2, n.y + n.h / 2];
function exitPoint(n, tx, ty) {
  const [cx, cy] = center(n); const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx === 0 ? Infinity : (n.w / 2) / Math.abs(dx), sy = dy === 0 ? Infinity : (n.h / 2) / Math.abs(dy);
  const k = Math.min(sx, sy); return [cx + dx * k, cy + dy * k];
}
function edgePoints(e, byId) {
  const a = byId[e.from], b = byId[e.to], via = e.via || [];
  const first = via.length ? via[0] : center(b), last = via.length ? via[via.length - 1] : center(a);
  return [exitPoint(a, ...first), ...via, exitPoint(b, ...last)];
}
function pointAlong(pts, f = 0.5) {
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  let t = total * f;
  for (let i = 0; i < segs.length; i++) { if (t <= segs[i]) { const r = t / segs[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r]; } t -= segs[i]; }
  return pts[0];
}
const polyLen = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
// Does segment p->q pass through the interior of box n (shrunk by 3px)?
function segHitsBox(p, q, n) {
  const x0 = n.x + 3, x1 = n.x + n.w - 3, y0 = n.y + 3, y1 = n.y + n.h - 3;
  let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1;
}

let errors = 0, warnings = 0;
const err = (ch, m) => { errors++; console.log(`ERROR  ${ch}: ${m}`); };
const warn = (ch, m) => { warnings++; console.log(`warn   ${ch}: ${m}`); };

const ids = new Set(), nums = new Set();
for (const ch of CHAPTERS) {
  if (ids.has(ch.id)) err(ch.id, "duplicate chapter id");
  ids.add(ch.id);
  if (nums.has(ch.n)) err(ch.id, `duplicate chapter number ${ch.n}`);
  nums.add(ch.n);
  if (only.size && !only.has(ch.id)) continue;
  const c = ch.id;
  for (const f of ["title", "question", "view", "nodes", "edges", "steps", "say30", "gotchas", "quiz", "sources"]) if (!ch[f]) err(c, `missing ${f}`);
  if (!ch.nodes) continue;
  const [W, H] = ch.view;
  const elIds = new Set();
  const all = [...(ch.groups || []), ...ch.nodes, ...ch.edges];
  for (const x of all) { if (elIds.has(x.id)) err(c, `duplicate element id ${x.id}`); elIds.add(x.id); }
  const byId = Object.fromEntries(ch.nodes.map((n) => [n.id, n]));
  for (const n of [...(ch.groups || []), ...ch.nodes]) {
    if (n.x < 0 || n.y < 0 || n.x + n.w > W || n.y + n.h > H) err(c, `${n.id} is outside the ${W}x${H} view`);
  }
  for (const n of ch.nodes) {
    if (n.kind !== "note" && labelW(n.label) > n.w - 10) warn(c, `label of ${n.id} may not fit (${n.w}px wide)`);
    if (n.sub && subW(n.sub) > n.w - 10) warn(c, `sub of ${n.id} may not fit (${n.w}px wide)`);
    const lines = String(n.label).split("\n").length + (n.sub ? String(n.sub).split("\n").length : 0);
    if (lines * 15 > n.h - 6) warn(c, `${n.id} may be too short for ${lines} lines`);
  }
  for (let i = 0; i < ch.nodes.length; i++) for (let j = i + 1; j < ch.nodes.length; j++) {
    if (overlap(ch.nodes[i], ch.nodes[j])) err(c, `${ch.nodes[i].id} overlaps ${ch.nodes[j].id}`);
  }
  for (const e of ch.edges) {
    if (!byId[e.from]) err(c, `edge ${e.id} from unknown node ${e.from}`);
    if (!byId[e.to]) err(c, `edge ${e.id} to unknown node ${e.to}`);
    if (e.label && e.label.length > 22) warn(c, `edge label on ${e.id} is long (${e.label.length} chars)`);
  }
  // Edge routing: no edge may pass through a box it doesn't connect; labels shouldn't collide.
  const labelBoxes = [];
  for (const e of ch.edges) {
    if (!byId[e.from] || !byId[e.to]) continue;
    const pts = edgePoints(e, byId);
    for (const n of ch.nodes) {
      if (n.id === e.from || n.id === e.to || n.kind === "note") continue;
      for (let i = 1; i < pts.length; i++) if (segHitsBox(pts[i - 1], pts[i], n)) { err(c, `edge ${e.id} passes through ${n.id}; add via points to route around it`); break; }
    }
    if (e.label) {
      const len = polyLen(pts);
      if (len < e.label.length * 6.4 + 16 && !e.labelAt && e.labelPos == null) warn(c, `edge ${e.id} (${Math.round(len)}px) is too short for its label; drop the label or use labelAt`);
      const [mx, my] = e.labelAt || pointAlong(pts, e.labelPos ?? 0.5);
      const w = e.label.length * 6.4 + 6;
      const box = { id: e.id, x: mx - w / 2, y: my - 15, w, h: 13 };
      for (const o of labelBoxes) if (overlap(box, o, 0)) warn(c, `labels of ${e.id} and ${o.id} overlap; use labelPos or labelAt`);
      for (const n of ch.nodes) if (n.kind !== "note" && overlap(box, n, 0)) warn(c, `label of ${e.id} overlaps node ${n.id}`);
      labelBoxes.push(box);
    }
  }
  if (!ch.steps.length) err(c, "no steps");
  if (ch.steps[0] && ((ch.steps[0].on || []).length || (ch.steps[0].flow || []).length)) warn(c, "first step should be the unlit overview");
  ch.steps.forEach((s, i) => {
    for (const id of [...(s.on || []), ...(s.flow || [])]) if (!elIds.has(id)) err(c, `step ${i + 1} references unknown id ${id}`);
    for (const id of s.flow || []) if (!ch.edges.some((e) => e.id === id)) err(c, `step ${i + 1} flow ${id} is not an edge`);
    if (s.text.length > 330) warn(c, `step ${i + 1} text is long (${s.text.length} chars)`);
  });
  const used = new Set(ch.steps.flatMap((s) => [...(s.on || []), ...(s.flow || [])]));
  for (const n of ch.nodes) if (n.kind !== "note" && !used.has(n.id)) warn(c, `node ${n.id} is never highlighted`);
  if ((ch.gotchas || []).length < 2) err(c, "needs at least 2 gotchas");
  if ((ch.quiz || []).length !== 3) err(c, "needs exactly 3 quiz questions");
  if (!(ch.sources || []).length) err(c, "needs at least one source");
  for (const s of ch.sources || []) if (!/^https:\/\/kubernetes\.io\//.test(s.url) && !/^https:\/\/(github\.com\/kubernetes|karpenter\.sh|gateway-api\.sigs\.k8s\.io|www\.cni\.dev|man7\.org|kubectl\.docs\.kubernetes\.io)/.test(s.url)) warn(c, `non-official source ${s.url}`);
  for (const id of ch.incidents || []) if (incidents.size && !incidents.has(id)) err(c, `unknown incident id ${id}`);
  const words = (ch.say30 || "").split(/\s+/).length;
  if (words > 120) warn(c, `30-second answer is ${words} words (aim for 120 or fewer)`);
}
console.log(`${CHAPTERS.length} chapters, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
