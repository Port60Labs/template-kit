// LiquidJS DoS budgets — ONE definition for the production engine, the validator and the studio
// preview, so "validated ⇒ renders in production" includes the resource ceiling. Third-party
// templates run in the shared SSR process (developer program T1.3): without these, an untrusted
// `{% for %}`/`{% capture %}` burns CPU/memory for every tenant on the box. The numbers are far
// above anything a legitimate template needs (the largest internal artifact parses ~80KB and
// renders in single-digit ms) and far below what hurts the process.
export const LIQUID_BUDGETS = {
  /** Max characters parsed per parse() call (dialect docs: a typical PC handles 1e8). */
  parseLimit: 1e6,
  /** Max wall-clock ms per render() call. */
  renderLimit: 1000,
  /** Max object creations per render (arrays, concats, strftime …). */
  memoryLimit: 5e7
};
