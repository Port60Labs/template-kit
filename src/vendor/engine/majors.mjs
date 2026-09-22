// The CONTRACT MAJORS registry (roadmap 8.6, multi-major engine support): the engine resolves a
// template's declared `format` to the contract set that renders it, so `port60-liquid@1` keeps
// rendering after `@2` ships. Today one major exists; when `@2` arrives it gets its own entry
// (own dialect/catalogues, own configured Liquid instance) and @1 artifacts keep resolving here
// untouched, with the published deprecation window governing how long.
import dialect from '../contract/v1/dialect.json' with { type: 'json' };
import sections from '../contract/v1/sections.json' with { type: 'json' };
import islands from '../contract/v1/islands.json' with { type: 'json' };
import context from '../contract/v1/context.json' with { type: 'json' };
import dialectV2 from '../contract/v2/dialect.json' with { type: 'json' };
import sectionsV2 from '../contract/v2/sections.json' with { type: 'json' };
import islandsV2 from '../contract/v2/islands.json' with { type: 'json' };
import contextV2 from '../contract/v2/context.json' with { type: 'json' };

const MAJORS = {
  1: { format: dialect.format, dialect, sections, islands, context },
  2: { format: dialectV2.format, dialect: dialectV2, sections: sectionsV2, islands: islandsV2, context: contextV2 }
};

/** Parse "port60-liquid@N" → N, or null when the string isn't even format-shaped. */
export function parseFormatMajor(format) {
  const m = /^port60-liquid@(\d+)$/.exec(String(format ?? ''));
  return m ? Number(m[1]) : null;
}

/**
 * Resolve the contract set for a declared format. Throws a NAMED error for unknown majors,
 * callers (the artifact loader) let that ride their normal artifact-failure fallback, so a
 * template declaring a future major degrades the site to the built-in chrome, never downs it.
 */
export function resolveMajor(format) {
  const major = parseFormatMajor(format);
  const entry = major === null ? undefined : MAJORS[major];
  if (!entry) {
    throw new Error(
      `unsupported template format '${format}', this engine speaks major(s) [${Object.keys(MAJORS).join(', ')}]`
    );
  }
  return entry;
}

export const SUPPORTED_MAJORS = Object.freeze(Object.keys(MAJORS).map(Number));
