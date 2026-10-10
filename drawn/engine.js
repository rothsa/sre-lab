// Shared engine for the SRE Lab "Drawn" explainers: renders chapter specs (see k8s/README.md)
// into step-through SVG diagrams with study aids. Each explainer page calls mountExplainer().
let KEY = "drawn";


const SVGNS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Inline formatting for prose fields: `code` only.
const fmt = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
};

// ---------- geometry ----------
const center = (n) => [n.x + n.w / 2, n.y + n.h / 2];
// Point where the segment from the box center toward (tx, ty) leaves the box.
function exitPoint(n, tx, ty) {
  const [cx, cy] = center(n);
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx === 0 ? Infinity : (n.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (n.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}
function edgePoints(e, byId) {
  const a = byId[e.from], b = byId[e.to];
  const via = e.via || [];
  const first = via.length ? via[0] : center(b);
  const last = via.length ? via[via.length - 1] : center(a);
  return [exitPoint(a, ...first), ...via, exitPoint(b, ...last)];
}
const pathD = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
function pointAlong(pts, f = 0.5) {
  // Point at fraction f of the polyline's length, measured from its start (the edge's "from" node).
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  let t = total * f;
  for (let i = 0; i < segs.length; i++) {
    if (t <= segs[i]) { const f = t / segs[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
    t -= segs[i];
  }
  return pts[0];
}
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

// ---------- render one diagram ----------
function renderSVG(ch) {
  const [W, H] = ch.view;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${ch.title}: ${ch.question}` });
  const defs = el("defs");
  for (const [id, color] of [["arw", "currentColor"], ["arw-on", "var(--accent)"]]) {
    const m = el("marker", { id: `${ch.id}-${id}`, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    m.appendChild(el("path", { d: "M0,0 L10,5 L0,10 z", fill: color, style: color.startsWith("var") ? `fill:${color}` : null }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);
  const byId = Object.fromEntries((ch.nodes || []).map((n) => [n.id, n]));
  for (const g of ch.groups || []) {
    const grp = el("g", { class: "d-el d-group", "data-id": g.id });
    grp.appendChild(el("rect", { x: g.x, y: g.y, width: g.w, height: g.h, rx: 10 }));
    grp.appendChild(el("text", { x: g.x + 10, y: g.y + 16 }, g.label));
    svg.appendChild(grp);
  }
  for (const e of ch.edges || []) {
    const pts = edgePoints(e, byId);
    const g = el("g", { class: `d-el d-edge${e.dashed ? " dashed" : ""}`, "data-id": e.id });
    const p = el("path", { d: pathD(pts), "marker-end": `url(#${ch.id}-arw)` });
    if (e.bidir) p.setAttribute("marker-start", `url(#${ch.id}-arw)`);
    g.appendChild(p);
    if (e.label) {
      const [mx, my] = e.labelAt || pointAlong(pts, e.labelPos ?? 0.5);
      g.appendChild(el("text", { x: mx, y: my - 4 }, e.label));
    }
    svg.appendChild(g);
  }
  for (const n of ch.nodes || []) {
    const g = el("g", { class: `d-el d-node ${n.kind || ""}`, "data-id": n.id });
    g.appendChild(el("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: n.kind === "pod" ? 14 : 8 }));
    const lines = String(n.label).split("\n");
    const subLines = n.sub ? String(n.sub).split("\n") : [];
    const total = lines.length * 15 + subLines.length * 13;
    let y = n.y + n.h / 2 - total / 2 + 11;
    for (const l of lines) { g.appendChild(el("text", { class: "lbl", x: n.x + n.w / 2, y }, l)); y += 15; }
    for (const s of subLines) { g.appendChild(el("text", { class: "sub", x: n.x + n.w / 2, y: y - 1 }, s)); y += 13; }
    svg.appendChild(g);
  }
  return svg;
}

function applyStep(svg, ch, i, caption, count, prev, next) {
  const step = ch.steps[i];
  const on = new Set([...(step.on || []), ...(step.flow || [])]);
  const flow = new Set(step.flow || []);
  svg.classList.toggle("stepping", on.size > 0);
  for (const g of svg.querySelectorAll(".d-el")) {
    const id = g.dataset.id;
    const isOn = on.has(id);
    g.classList.toggle("on", isOn);
    g.classList.toggle("flow", flow.has(id));
    g.classList.toggle("dim", on.size > 0 && !isOn);
    const p = g.querySelector("path[marker-end]");
    if (p) p.setAttribute("marker-end", `url(#${ch.id}-${isOn ? "arw-on" : "arw"})`);
  }
  caption.innerHTML = fmt(step.text);
  count.textContent = `Step ${i + 1} of ${ch.steps.length}`;
  prev.disabled = i === 0;
  next.disabled = i === ch.steps.length - 1;
  store.set(`${KEY}-step-${ch.id}`, String(i));
}

// ---------- page ----------
let incidents = new Map();
async function loadIncidents() {
  try {
    const list = await fetch("../incidents/data/incidents.json").then((r) => r.json());
    incidents = new Map(list.map((d) => [d.id, d]));
  } catch { /* links simply won't render */ }
}

// Side-by-side code (used by explainers that compare languages or show config).
function compareHTML(ch) {
  if (!ch.compare || !ch.compare.length) return "";
  const cols = ch.compare.map((c) => `<div class="cmp">
      <h4>${esc(c.lang)}</h4>
      <p class="cmp-idiom">${fmt(c.idiom)}</p>
      <ul class="cmp-good">${(c.good || []).map((g) => `<li>${fmt(g)}</li>`).join("")}</ul>
      <ul class="cmp-bad">${(c.bad || []).map((g) => `<li>${fmt(g)}</li>`).join("")}</ul>
    </div>`).join("");
  return `<div class="aid compare"><h3>How the languages differ</h3><div class="cmps" style="--cols:${ch.compare.length}">${cols}</div></div>`;
}

function codeHTML(ch) {
  if (!ch.code || !ch.code.length) return "";
  const cols = ch.code.map((c) => `<div class="code-col"><div class="code-head">${esc(c.label || c.lang)}</div><pre><code class="lang-${esc(c.lang)}">${esc(c.src)}</code></pre></div>`).join("");
  return `<div class="codes" style="--cols:${ch.code.length}">${cols}</div>${ch.codeNote ? `<p class="code-note">${fmt(ch.codeNote)}</p>` : ""}`;
}

function chapterHTML(ch) {
  return `<section class="chapter" id="${ch.id}" aria-labelledby="h-${ch.id}">
    <h2 id="h-${ch.id}"><span class="n">${ch.n}.</span>${esc(ch.title)}</h2>
    <p class="q">${fmt(ch.question)}</p>
    <figure class="diagram" tabindex="0" aria-label="${esc(ch.title)} diagram. Use the left and right arrow keys to step through.">
      <div class="frame"></div>
      <div class="controls">
        <button type="button" class="prev">← Back</button>
        <button type="button" class="next">Next →</button>
        <span class="count"></span>
        <span class="hint">or use ← → keys</span>
      </div>
      <figcaption aria-live="polite"></figcaption>
      <details class="steps-text"><summary>All steps as text</summary><ol>${ch.steps.map((s) => `<li>${fmt(s.text)}</li>`).join("")}</ol></details>
    </figure>
    ${codeHTML(ch)}
    ${compareHTML(ch)}
    <div class="aids">
      <div class="aid say"><h3>Say it in 30 seconds</h3><p>${fmt(ch.say30)}</p></div>
      ${ch.atScale && ch.atScale.length ? `<div class="aid scale"><h3>What breaks at scale</h3><ul>${ch.atScale.map((g) => `<li>${fmt(g)}</li>`).join("")}</ul></div>` : ""}
      ${ch.agentic && ch.agentic.length ? `<div class="aid agentic"><h3>What changes in the agentic era</h3><ul>${ch.agentic.map((g) => `<li>${fmt(g)}</li>`).join("")}</ul></div>` : ""}
      <div class="aid"><h3>Gotchas</h3><ul>${ch.gotchas.map((g) => `<li>${fmt(g)}</li>`).join("")}</ul></div>
      <div class="aid"><h3>Quiz yourself</h3>${ch.quiz.map((x) => `<details><summary>${fmt(x.q)}</summary><p>${fmt(x.a)}</p></details>`).join("")}</div>
      <div class="aid more" data-more="${ch.id}"></div>
    </div>
  </section>`;
}

function fillMore(ch) {
  const box = document.querySelector(`[data-more="${ch.id}"]`);
  const seen = (ch.incidents || []).map((id) => incidents.get(id)).filter(Boolean);
  const parts = [];
  if (seen.length) parts.push(`<h3>Seen in the wild</h3>${seen.map((d) => `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.company)}: ${esc(d.title)}</a></p>`).join("")}`);
  parts.push(`<h3>Read more</h3>${ch.sources.map((s) => `<p><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></p>`).join("")}`);
  box.innerHTML = parts.join("");
}

function mount(ch) {
  const sec = document.getElementById(ch.id);
  const fig = sec.querySelector("figure");
  const svg = renderSVG(ch);
  sec.querySelector(".frame").appendChild(svg);
  const caption = fig.querySelector("figcaption"), count = fig.querySelector(".count");
  const prev = fig.querySelector(".prev"), next = fig.querySelector(".next");
  let i = Math.min(Number(store.get(`${KEY}-step-${ch.id}`)) || 0, ch.steps.length - 1);
  const go = (j) => { i = Math.max(0, Math.min(ch.steps.length - 1, j)); applyStep(svg, ch, i, caption, count, prev, next); };
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i + 1));
  fig.addEventListener("keydown", (e) => {
    if (e.target.closest("details")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  });
  go(i);
}


export async function mountExplainer(CHAPTERS, { key = "drawn" } = {}) {
  KEY = key;
  // ?only=<chapter id> renders a single chapter (handy for sharing one diagram, and for screenshots).
  const only = new URLSearchParams(location.search).get("only");
  const LIST = only ? CHAPTERS.filter((c) => c.id === only) : CHAPTERS;
  document.getElementById("toc").innerHTML = CHAPTERS.map((c) => `<li><a href="#${c.id}">${esc(c.title)}</a></li>`).join("");
  document.getElementById("chapters").innerHTML = LIST.map(chapterHTML).join("");
  LIST.forEach(mount);
  if (matchMedia("(max-width: 999px)").matches) document.getElementById("tocBox").open = false;
  document.getElementById("toc").addEventListener("click", () => { if (matchMedia("(max-width: 999px)").matches) document.getElementById("tocBox").open = false; });
  // Highlight the chapter in view in the table of contents.
  const links = new Map([...document.querySelectorAll("#toc a")].map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { for (const a of links.values()) a.removeAttribute("aria-current"); links.get(en.target.id)?.setAttribute("aria-current", "true"); }
  }, { rootMargin: "-20% 0px -70% 0px" });
  document.querySelectorAll(".chapter").forEach((s) => io.observe(s));
  await loadIncidents();
  LIST.forEach(fillMore);
}
