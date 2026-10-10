# Drawn explainer engine

Shared renderer for the SRE Lab step-through explainers (`k8s/`, `linux/`, `terraform/`, and the rest).
Each explainer directory has an `index.html` built from `page-template.html`, a `diagrams.js` that collects
chapter specs from `parts/`, and a `check.mjs` that validates them.

Chapter spec format: see `../k8s/README.md`. In addition, a chapter may have:

- `code`: up to 3 entries `{ lang, label, src }`, shown side by side (stacked on phones) under the diagram.
- `codeNote`: one or two sentences shown under the code.

Pages accept `?only=<chapter id>` to render a single chapter.
- `atScale`: 3-6 short items, each a concrete thing that breaks at 1000+ nodes, services, series, teams or
  requests per second, and what people do about it (shown as "What breaks at scale").
- `compare`: up to 3 entries `{ lang, idiom, good: [], bad: [] }`, shown under the code as "How the languages
  differ": the structure each language reaches for, and its strengths and weaknesses for this task.
