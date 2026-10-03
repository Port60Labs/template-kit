/** Marker protocol for island placement: the island tag emits these; the renderer splits on them. */
import { templateMessage, templateDate } from './locale.mjs';
import { colourRoles } from './colour-roles.mjs';

export const ISLAND_MARK_START = '\u0000P60_ISLAND:';
export const ISLAND_MARK_END = '\u0000';

/** The layout's {% content %} slot rides the island marker protocol under a reserved name, the
 *  slash makes collision with registry island names (snake_case words) impossible. */
export const CONTENT_SLOT = 'P60/content';

/**
 * Restrict a Liquid instance to the dialect: excluded tags become parse-time errors, excluded
 * filters become render-time errors (unknown filters already throw via strictFilters), and the
 * {% island %} tag is registered. `islandNames` is the platform island registry (a Set of names);
 * an unknown island renders to nothing (the validator rejects it at publish time).
 */
export function configureDialect(liquid, dialect, islandNames) {
  for (const tag of dialect.excluded?.tags ?? []) {
    liquid.registerTag(tag, {
      parse() {
        throw new Error(`The '${tag}' tag is not part of the Port60 dialect (${dialect.format}).`);
      },
      render() {
        return '';
      }
    });
  }
  const allowed = new Set(dialect.filters);
  if (allowed.has('t')) liquid.registerFilter('t', templateMessage);
  if (allowed.has('local_date')) liquid.registerFilter('local_date', templateDate);
  if (allowed.has('colour_roles')) liquid.registerFilter('colour_roles', colourRoles);
  for (const name of ['json', 'inspect', 'to_integer', 'normalize_whitespace', 'find', 'find_exp', 'group_by', 'group_by_exp', 'where_exp', 'sum']) {
    if (!allowed.has(name)) {
      liquid.registerFilter(name, () => {
        throw new Error(`The '${name}' filter is not part of the Port60 dialect (${dialect.format}).`);
      });
    }
  }
  liquid.registerTag('island', {
    parse(token) {
      this.args = token.args;
    },
    async render(ctx) {
      const name = String(await this.liquid.evalValue(this.args, ctx));
      if (!islandNames.has(name)) {
        return '';
      }
      return `${ISLAND_MARK_START}${name}${ISLAND_MARK_END}`;
    }
  });
  liquid.registerTag('content', {
    parse() {},
    render() {
      return `${ISLAND_MARK_START}${CONTENT_SLOT}${ISLAND_MARK_END}`;
    }
  });
}

/** Split rendered output into HTML fragments and island mount points. */
export function splitIslandParts(html) {
  const parts = [];
  const pieces = html.split(ISLAND_MARK_START);
  parts.push({ html: pieces[0] ?? '' });
  for (const piece of pieces.slice(1)) {
    const end = piece.indexOf(ISLAND_MARK_END);
    if (end === -1) {
      parts.push({ html: piece });
      continue;
    }
    parts.push({ island: piece.slice(0, end) }, { html: piece.slice(end + ISLAND_MARK_END.length) });
  }
  return parts;
}
