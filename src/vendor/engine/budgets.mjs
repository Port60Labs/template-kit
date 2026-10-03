export const LIQUID_BUDGETS = {
  /** Max characters parsed per parse() call (dialect docs: a typical PC handles 1e8). */
  parseLimit: 1e6,
  /** Max wall-clock ms per render() call. */
  renderLimit: 1000,
  /** Max object creations per render (arrays, concats, strftime …). */
  memoryLimit: 5e7
};
