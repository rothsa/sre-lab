# Kubernetes, Drawn

How Kubernetes works, in 18 step-through diagrams, at [lab.sallyroth.dev/k8s](https://lab.sallyroth.dev/k8s/).

Static page: `index.html` renders chapter specs into inline SVG. No build step, no runtime dependencies.

## Files

| File | What |
|---|---|
| `index.html` | Page shell, styles, and the renderer (SVG drawing, stepping, study aids) |
| `diagrams.js` | Collects the chapters from `parts/` and sorts them by number |
| `parts/*.js` | Chapter specs (data only) |
| `check.mjs` | Integrity and layout checks: `node check.mjs [chapter-id ...]` |

## Chapter spec

```js
{
  id: "apply",                 // URL anchor: lab.sallyroth.dev/k8s/#apply
  n: 3,                        // chapter number (order)
  title: "What happens on kubectl apply",
  question: "The question this diagram answers. `code` spans allowed.",
  view: [920, 510],            // SVG viewBox width, height
  groups: [{ id, label, x, y, w, h }],               // dashed regions: control plane, node, namespace
  nodes:  [{ id, label, sub, kind, x, y, w, h }],    // boxes; kind: store | actor | pod | q | note
  edges:  [{ id, from, to, label, via, labelPos, labelAt, dashed, bidir }],
  steps:  [{ text, on: [ids], flow: [edge ids] }],   // step 1 is the unlit overview
  say30: "A ready-to-say interview answer, about 120 words or fewer.",
  gotchas: ["2-4 traps interviewers probe"],
  quiz: [{ q, a }, { q, a }, { q, a }],               // exactly 3
  incidents: ["ids from ../incidents/data/incidents.json"],
  sources: [{ title, url }],                          // kubernetes.io pages the chapter is based on
}
```

- **Boxes** are drawn from their top-left corner. `label` and `sub` may contain `\n`. Kinds: `store` (etcd, volumes), `actor` (a person or kubectl), `pod` (rounded), `q` (a question in a decision tree), `note` (text only, no border).
- **Edges** run between box centers and are clipped at the box borders. `via` adds bend points so an edge can route around boxes. `bidir` draws arrowheads on both ends. Labels sit at the middle of the edge, or at `labelPos` (0–1, measured from `from`), or exactly at `labelAt`.
- **Steps** light up the listed boxes and edges and dim everything else; edges in `flow` also animate (off under reduced motion). Step text is one or two plain sentences.

## Layout conventions

- Lay out on a 10px grid, with roughly 30px gaps between boxes and about 60px between rows.
- Boxes are usually 110–160px wide and 46–56px tall. Labels run 1–3 words.
- Flows read left to right; layers read top to bottom.
- Keep edge labels to 18 characters or fewer, and drop the label on edges shorter than about 70px.
- `check.mjs` fails when an edge passes through a box it doesn't connect, and warns about overlapping labels, labels that won't fit, and boxes no step ever highlights.

## Accuracy

Every chapter is written from the official Kubernetes documentation and lists the pages in `sources`. Prefer stable behavior over version-specific details, and name a version only when it matters.
