# Drawn explainer engine

Shared renderer for the SRE Lab step-through explainers (`k8s/`, `linux/`, `terraform/`, and the rest).
Each explainer directory has an `index.html` built from `page-template.html`, a `diagrams.js` that collects
chapter specs from `parts/`, and a `check.mjs` that validates them.

Chapter spec format: see `../k8s/README.md`. In addition, a chapter may have:

- `code`: up to 3 entries `{ lang, label, src }`, shown side by side (stacked on phones) under the diagram.
- `codeNote`: one or two sentences shown under the code.

Pages accept `?only=<chapter id>` to render a single chapter.
- `atScale`: retired (Oct 2026). Scale is the main event of each chapter, so it lives in the question, steps and `say30`; checkers error if the field is present.
- `compare`: up to 3 entries `{ lang, idiom, good: [], bad: [] }`, shown under the code as "How the languages
  differ": the structure each language reaches for, and its strengths and weaknesses for this task.
- `agentic`: 2-4 short items shown as "What changes in the agentic era": what agents now change about this
  mechanism, what a human still verifies or owns, and the new failure mode. Every item must be backed by a
  source in the chapter's `sources`. Required in every explainer except `agentic/`.
