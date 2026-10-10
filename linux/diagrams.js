// Collects chapter specs from parts/ and orders them by chapter number.
// Spec format: see README.md.
import { CHAPTERS as A } from "./parts/a.js";
import { CHAPTERS as B } from "./parts/b.js";
import { CHAPTERS as C } from "./parts/c.js";

export const CHAPTERS = [...A, ...B, ...C].sort((x, y) => x.n - y.n);
