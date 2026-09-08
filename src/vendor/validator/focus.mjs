// The site focus for the PREVIEW: a JavaScript twin of charity-site's lib/focus.ts, kept in step by
// hand (the validator is plain JS and is vendored into the kit). Same rules: the leading action is
// the widget in the hero; the other action is the one button in the header and beside the hero; the
// leading action never appears twice. The preview assumes volunteering is OPEN, so the pairing shows.
export const FOCUS_CHOICES = ['donate', 'volunteer', 'none'];

const ACTION = {
  donate: { kind: 'donate', label: 'Donate', href: '/donate' },
  volunteer: { kind: 'volunteer', label: 'Volunteer', href: '/volunteer' }
};

/** `?focus=` from the dev server, or nothing: 'donate' is the platform default. */
export function normaliseFocus(value) {
  return FOCUS_CHOICES.includes(value) ? value : 'donate';
}

/** The resolved surfaces for one preview render, the shape of site.actions on a live site. */
export function previewActions(focus) {
  if (focus === 'volunteer') {
    return { primary: ACTION.volunteer, secondary: ACTION.donate, widget: 'volunteer', header: ACTION.donate, hero: ACTION.donate };
  }
  if (focus === 'none') {
    // Buttons only (a Custom setting with no widget): the hero button leads with giving.
    return { primary: ACTION.donate, secondary: ACTION.volunteer, widget: null, header: ACTION.donate, hero: ACTION.donate };
  }
  return { primary: ACTION.donate, secondary: ACTION.volunteer, widget: 'donate', header: ACTION.volunteer, hero: ACTION.volunteer };
}

/** The home hero's resolved fields, as the platform computes them (lib/focus.ts withResolvedActions). */
export function withResolvedActions(content, actions) {
  const style = content.actionStyle ?? content.givingStyle;
  const buttonMode = style === 'button' || actions.widget === null;
  return {
    ...content,
    actionStyle: buttonMode ? 'button' : 'widget',
    primary: actions.primary,
    secondary: actions.secondary,
    action: buttonMode && actions.hero === null && style === 'button' ? actions.primary : actions.hero
  };
}

/** The site tree with the focus applied: site.focus, site.actions, and the nav's one button. */
export function applyFocus(site, actions) {
  const swapCta = (items) => Array.isArray(items)
    ? items.map((item) => (item && item.cta ? (actions.header ? { ...item, label: actions.header.label, href: actions.header.href } : null) : item)).filter(Boolean)
    : items;
  const nav = site.nav ? { ...site.nav, items: swapCta(site.nav.items), derived: swapCta(site.nav.derived) } : site.nav;
  return { ...site, focus: actions.widget ?? 'none', actions, nav };
}
