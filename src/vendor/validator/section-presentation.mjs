import { SECTION_PRESENTATION_CONTROLS, SECTION_ROOT_TAGS } from '../engine/section-presentation.mjs';
import { headingAlignmentFixture } from './heading-alignment.mjs';
import { parsePresentationMarkup, presentationText, presentationVisible, presentationSignature } from './presentation-proof.mjs';
import { proveImageOverlay } from './image-overlay.mjs';
import { colourTreatmentCssErrors, inspectColourTreatment } from './colour-treatment.mjs';
import { sectionLayoutCssErrors, inspectSectionLayout } from './section-layout.mjs';

const ATTRIBUTE = 'data-p60-heading-scale';
const normalise = value => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Structural proof: scale belongs on the real heading and may not change any other markup. */
export function inspectHeadingScale(html, expected, heading, required = true) {
  const parsed = parsePresentationMarkup(html);
  const hooks = parsed.nodes.filter(node => Object.hasOwn(node.attrs, ATTRIBUTE));
  const errors = [];
  if (required && !hooks.length) errors.push('a permanent data-p60-heading-scale hook is required on the actual section heading');
  for (const node of hooks) {
    if (!/^h[1-6]$/.test(node.tag) || !presentationVisible(node) || !normalise(heading)
      || presentationText(node) !== normalise(heading)) errors.push('headingScale must target the visible section heading, not an eyebrow, group, card, body or island');
    if (node.attrs[ATTRIBUTE] !== (expected ?? '')) errors.push(`headingScale '${expected ?? 'default'}' must render its exact token, or an empty inherited hook`);
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.tag === 'astro-island') errors.push('headingScale cannot target a platform island');
    }
  }
  return { errors: [...new Set(errors)], signature: presentationSignature(parsed.root, () => [ATTRIBUTE]) };
}

/** This is a CSS declaration gate, not a substitute for computed browser-size conformance. */
export function headingScaleCssErrors(css, options) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return options.flatMap(option => {
    const selector = new RegExp(`\\[data-p60-heading-scale\\s*=\\s*(?:"${option}"|'${option}'|${option})\\s*\\]`);
    return rules.some(([, selectors, body]) => selector.test(selectors)
      && /(?:^|;)\s*font-size\s*:\s*[^;\s][^;]*(?:;|$)/i.test(body)) ? []
      : [`headingScale '${option}' needs an authored font-size rule for its data-p60-heading-scale token, not only a changing marker`];
  });
}

/** Spacing belongs to the existing single outer root, regardless of heading visibility. */
export function inspectSectionSpacing(html, expected, _heading, required = true) {
  const parsed = parsePresentationMarkup(html);
  const attribute = SECTION_PRESENTATION_CONTROLS.sectionSpacing.attribute;
  const hooks = parsed.nodes.filter(node => Object.hasOwn(node.attrs, attribute));
  const roots = parsed.root.children.filter(child => typeof child !== 'string');
  const errors = [];
  if (required && hooks.length !== 1) errors.push('one permanent data-p60-section-spacing hook is required on the natural outer section root');
  for (const node of hooks) {
    if (roots.length !== 1 || node !== roots[0] || !SECTION_ROOT_TAGS.includes(node.tag)
      || !presentationVisible(node) || parsed.root.children.some(child => typeof child === 'string' && child.trim())) {
      errors.push('sectionSpacing must target the single visible natural outer section root, not an inner wrapper, heading, card or island');
    }
    if (node.attrs[attribute] !== (expected ?? '')) errors.push(`sectionSpacing '${expected ?? 'default'}' must render its exact token, or an empty inherited hook`);
  }
  return { errors: [...new Set(errors)], signature: presentationSignature(parsed.root, () => [attribute]) };
}

/** Every token rule targets the root itself and changes only block-axis padding. */
export function sectionSpacingCssErrors(css, options) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const attribute = SECTION_PRESENTATION_CONTROLS.sectionSpacing.attribute;
  const errors = [];
  for (const [, selectors, body] of rules.filter(([, selectors]) => selectors.includes(attribute))) {
    const declarations = body.split(';').map(part => part.trim()).filter(Boolean);
    if (declarations.some(part => !/^padding-(?:block(?:-start|-end)?|top|bottom)\s*:\s*\S/i.test(part))) {
      errors.push('sectionSpacing CSS may change only block-axis padding, never horizontal gutters, gaps, height, typography or island internals');
    }
    for (const selector of selectors.split(',')) {
      if (!new RegExp(`\\[${attribute}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\]\\s]+)\\s*\\]\\s*$`).test(selector)) {
        errors.push('sectionSpacing CSS must target the root hook itself, not descendants, siblings, pseudo-elements or unrelated targets');
      }
    }
  }
  for (const option of options) {
    const selector = new RegExp(`\\[${attribute}\\s*=\\s*(?:"${option}"|'${option}'|${option})\\s*\\]`);
    if (!rules.some(([, selectors, body]) => selector.test(selectors)
      && /(?:^|;)\s*padding-(?:block(?:-start|-end)?|top|bottom)\s*:\s*[^;\s][^;]*(?:;|$)/i.test(body))) {
      errors.push(`sectionSpacing '${option}' needs an authored block-axis padding rule for its data-p60-section-spacing token, not only a changing marker`);
    }
  }
  return [...new Set(errors)];
}

const proofs = {
  sectionLayout: {
    inspect: (html, expected, _heading, required, css, declaration, content) => inspectSectionLayout(html, expected, required, css, declaration, { imageUrl: content.imageUrl }),
    css: (css, _values, declaration) => sectionLayoutCssErrors(css, declaration), boundary: 'layout root'
  },
  headingScale: { inspect: inspectHeadingScale, css: headingScaleCssErrors, boundary: 'heading' },
  sectionSpacing: { inspect: inspectSectionSpacing, css: sectionSpacingCssErrors, boundary: 'root' },
  colourTreatment: {
    inspect: (html, expected, _heading, required, css, declaration) => inspectColourTreatment(html, expected, required, css, declaration),
    css: (css, _values, declaration) => colourTreatmentCssErrors(css, declaration), boundary: 'colour root'
  }
};

/** Pairwise inheritance plus every all-active interaction for the current bounded registry.
 * At most four controls may be combined. New controls must deliberately revisit this budget. */
export function presentationCombinations(controls, declaration) {
  if (controls.length > 4) throw new Error('Presentation proof supports at most four independent controls');
  const cases = new Map();
  const add = value => cases.set(JSON.stringify(value), value);
  add({});
  for (let first = 0; first < controls.length; first++) {
    const key = controls[first][0];
    for (const value of declaration[key].options) add({ [key]: value });
    for (let second = first + 1; second < controls.length; second++) {
      const other = controls[second][0];
      for (const value of declaration[key].options) for (const next of declaration[other].options) add({ [key]: value, [other]: next });
    }
  }
  // Preserve all three-way cases currently possible and all-active four-way combinations.
  // Partial fourth-control interactions stay pairwise, rather than growing a full power set.
  for (const value of controls.reduce((rows, [key]) => rows.flatMap(row => declaration[key].options.map(option => ({ ...row, [key]: option }))), [{}])) add(value);
  return [...cases.values()];
}

/** Registered choices remain bounded: include partial inheritance and reset across controls. */
async function proveCombinations(render, fixtures, declaration) {
  const controls = Object.entries(SECTION_PRESENTATION_CONTROLS).filter(([control]) => Array.isArray(declaration?.[control]?.options));
  if (controls.length < 2) return [];
  const combinations = presentationCombinations(controls, declaration);
  const attributes = controls.map(([, descriptor]) => descriptor.attribute);
  const errors = [];
  for (const fixture of fixtures) {
    let baseline;
    for (const presentation of [...combinations, {}]) {
      const label = Object.entries(presentation).map(([key, value]) => `${key}=${value}`).join(', ') || 'inherited/reset';
      try {
        const html = await render({ ...fixture.content, ...(Object.keys(presentation).length ? { presentation } : {}) });
        const parsed = parsePresentationMarkup(html);
        for (const [control, descriptor] of controls) {
          // Individual probes prove placement. Here every existing hook must keep its own
          // exact token, including empty-heading and wholly omitted section fixtures.
          for (const node of parsed.nodes.filter(node => Object.hasOwn(node.attrs, descriptor.attribute))) {
            if (node.attrs[descriptor.attribute] !== (presentation[control] ?? '')) {
              errors.push(`combined ${fixture.name} ${label}: ${control} must retain its independent exact token`);
            }
          }
        }
        // Ignore values only, not hook existence: adding/removing either hook is a mutation.
        for (const node of parsed.nodes) for (const attribute of attributes) {
          if (Object.hasOwn(node.attrs, attribute)) node.attrs[attribute] = '';
        }
        const signature = presentationSignature(parsed.root);
        baseline ??= signature;
        if (signature !== baseline) errors.push(`combined ${fixture.name} ${label}: presentation controls must not change content, heading levels, hook placement or markup together`);
      } catch (error) {
        errors.push(`combined ${fixture.name} ${label}: failed rendering presentation fixture, ${error.message}`);
        return errors;
      }
    }
  }
  return errors;
}

export async function proveSectionPresentation(render, entry, declaration, css, { inheritedHeading, heroImageLimit = 6 } = {}) {
  // A control's required authored inputs must exist in the canonical section contract.
  const layoutFields = SECTION_PRESENTATION_CONTROLS.sectionLayout.contentFields;
  if (declaration?.sectionLayout && Object.entries(layoutFields).some(([name, kind]) => !entry.fields.some(field => field.name === name && field.kind === kind))) {
    return [`section '${entry.type}' sectionLayout requires canonical ${Object.entries(layoutFields).map(([name, kind]) => `${name} (${kind})`).join(' and ')} fields in this section's catalogue entry`];
  }
  const fixture = headingAlignmentFixture(entry);
  delete fixture.content.presentation;
  const fixtures = [{ ...fixture, name: 'authored' }];
  if (typeof inheritedHeading === 'string' && inheritedHeading) {
    const content = { ...fixture.content };
    delete content.title;
    fixtures.push({ content, heading: inheritedHeading, name: 'inherited' });
  }
  const controls = Object.entries(SECTION_PRESENTATION_CONTROLS).filter(([control]) => control !== 'imageOverlay').map(([control, descriptor]) => {
    const choice = declaration?.[control];
    const values = Array.isArray(choice?.options) ? choice.options.filter(value => descriptor.options.includes(value)) : [];
    return { control, descriptor, values, proof: proofs[control] };
  });
  // Collect inexpensive declaration diagnostics before rendering. A failed render may be
  // budget-exhausting input; stop all presentation probes immediately without losing these.
  const errors = controls.flatMap(({ control, values, proof }) => proof.css(css, values, declaration?.[control]).map(error => `${control}: ${error}`));
  const report = () => [...new Set(errors)].map(error => `section '${entry.type}' ${error}`);
  for (const { control, descriptor, values, proof } of controls) {
    const cases = control === 'sectionLayout' && values.length
      ? fixtures.flatMap(fixture => [fixture,
        { ...fixture, content: { ...fixture.content, imageUrl: 'https://example.invalid/p60-layout-photo.jpg', imageAlt: 'Layout fixture' }, name: `${fixture.name} with photograph` },
        { ...fixture, content: { ...fixture.content, title: '', heading: '', imageUrl: 'https://example.invalid/p60-layout-photo.jpg', imageAlt: 'Layout fixture' }, name: `${fixture.name} hidden heading with photograph` },
        { ...fixture, content: { ...fixture.content, imageUrl: '', imageAlt: '' }, name: `${fixture.name} without photograph` }])
      : ['sectionSpacing', 'colourTreatment'].includes(control)
      ? [...fixtures, { ...fixture, content: { ...fixture.content, title: '', heading: '' }, name: 'hidden heading' }]
      : fixtures;
    for (const fixture of cases) {
      let baseline;
      let required = values.length > 0;
      // Repeating inheritance proves resetting restores exactly the authored markup.
      for (const requested of [undefined, ...descriptor.options, 'unknown', undefined]) {
        const content = { ...fixture.content, ...(requested === undefined ? {} : { presentation: { [control]: requested } }) };
        try {
          const html = await render(content);
          // Some authored sections omit their entire root when copy is explicitly cleared.
          // Only that empty inherited baseline may omit the hook; the signature comparison
          // still requires every choice and reset to preserve the same complete omission.
          if (control === 'sectionSpacing' && fixture.name === 'hidden heading' && baseline === undefined
            && parsePresentationMarkup(html).root.children.every(node => typeof node === 'string' && !node.trim())) required = false;
          const result = proof.inspect(html, values.includes(requested) ? requested : undefined,
            fixture.heading, required, css, declaration?.[control], fixture.content);
          errors.push(...result.errors.map(error => `${control} ${fixture.name} ${requested ?? 'default'}: ${error}`));
          baseline ??= result.signature;
          if (baseline !== result.signature) errors.push(`${control} ${fixture.name} ${requested ?? 'default'}: ${control} must not change content, heading levels or markup outside its ${proof.boundary} hook`);
        } catch (error) {
          errors.push(`${control} ${fixture.name} ${requested ?? 'default'}: failed rendering ${control} fixture, ${error.message}`);
          return report();
        }
      }
    }
  }
  if (entry.type === 'homeHero') {
    const overlay = await proveImageOverlay(render, fixture, declaration?.imageOverlay, css, heroImageLimit);
    errors.push(...overlay.errors.map(error => `imageOverlay: ${error}`));
    if (overlay.failed) return report();
  }
  const combinedFixtures = [...fixtures, { ...fixture, content: { ...fixture.content, title: '', heading: '' }, name: 'hidden heading' }];
  if (declaration?.sectionLayout) combinedFixtures.push(...combinedFixtures.map(value => ({ ...value,
    content: { ...value.content, imageUrl: 'https://example.invalid/p60-layout-photo.jpg', imageAlt: 'Layout fixture' }, name: `${value.name} with photograph` })));
  errors.push(...await proveCombinations(render, combinedFixtures, declaration));
  return report();
}
