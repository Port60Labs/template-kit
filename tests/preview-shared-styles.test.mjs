import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';

const css = readFileSync(new URL('../src/vendor/validator/platform-base.css', import.meta.url), 'utf8');
const document = new JSDOM(`<style>${css}</style>`).window.document;
const rules = Array.from(document.styleSheets[0].cssRules);
const rule = selector => {
  const match = rules.find(candidate => candidate.selectorText?.split(',').map(value => value.trim()).includes(selector));
  assert.ok(match, `Missing shared rule: ${selector}`);
  return match.style;
};

test('preview chrome and map copy preserve theme contrast without opacity reductions', () => {
  assert.equal(rule('.footer-note').getPropertyValue('color'), 'var(--muted)');
  for (const selector of ['.impact-map-intro', '.impact-map-card-summary']) {
    assert.equal(rule(selector).getPropertyValue('opacity'), '');
  }
});

test('preview styles target the accessible live event and donation heading hierarchy', () => {
  assert.equal(rule('.event-card-body h2').getPropertyValue('font-size'), '1.15rem');
  assert.equal(rule('.event-schedule h2').getPropertyValue('font-size'), '1.3rem');
  assert.equal(rule('.event-register-card > h2').getPropertyValue('font-size'), '1.3rem');
  assert.equal(rule('.donate-success h2').getPropertyValue('font-size'), '1.5rem');
});

test('course sign-in preview has independent spacing, wrapping and keyboard focus', () => {
  const gate = rule('.course-enrol-gate');
  assert.equal(gate.getPropertyValue('display'), 'grid');
  assert.equal(gate.getPropertyValue('gap'), '1rem');
  assert.equal(gate.getPropertyValue('border'), '');
  assert.equal(rule('.course-enrol-gate > p').getPropertyValue('overflow-wrap'), 'anywhere');
  assert.equal(rule('.course-enrol-gate > .button').getPropertyValue('min-block-size'), '2.75rem');
  assert.equal(rule('.course-enrol-gate > .button').getPropertyValue('white-space'), 'normal');
  assert.equal(rule('.course-enrol-gate > .button:focus-visible').getPropertyValue('outline-offset'), '3px');
});

test('biographies remain plain text and map selectors retain a usable focus target', () => {
  const biography = rule('.people-statement');
  assert.equal(biography.getPropertyValue('white-space'), 'pre-line');
  assert.equal(biography.getPropertyValue('overflow-wrap'), 'anywhere');
  assert.equal(biography.getPropertyValue('font-style'), '');
  assert.equal(rule('.impact-map-pin').getPropertyValue('pointer-events'), 'none');
  assert.equal(rule('.impact-map-location-picker select').getPropertyValue('min-height'), '44px');
  assert.equal(rule('.impact-map-location-picker select:focus-visible').getPropertyValue('outline-offset'), '2px');
});

test('v1 and v2 previews embed the shared stylesheet unchanged', async () => {
  for (const format of ['port60-liquid@1', 'port60-liquid@2']) {
    const files = {
      'manifest.json': JSON.stringify({ format, name: 'shared-style-proof', label: 'Shared style proof',
        version: '1.0.0', supports: { pages: ['home'], sections: [] } })
    };
    const html = await renderStudioPreview(files);
    assert.ok(html.includes(`<style>${css}</style>`), `${format} retains the shared platform styles`);
  }
});
