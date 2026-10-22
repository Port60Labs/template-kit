export const STYLE_BREAKOUT = /<\/style/i;

export function inertInlineCss(css) {
  return css.replace(/<\//g, '<\\/');
}
