import test from 'node:test';
import assert from 'node:assert/strict';
import { designerPalette } from '../src/lib/designerPalette.mjs';
import { JSDOM } from 'jsdom';

test('author palette follows active selectors, inherited aliases and nested variable fallbacks', () => {
  const page = new JSDOM(`<html><head><style>
    :root:root, body { --brand:#123; --paper:#fff; --highlight:#dcb; --primary:var(--brand); --bg:var(--paper); --accent:var(--p60s-accent, var(--highlight)); }
    body[data-look="Meadow"] { --brand:#224c40; --paper:#fafbf5; --highlight:#d9e4b2; }
    body[data-look="Other"] { --brand:#ff0000; }
    .card { --primary:#000; }
  </style></head><body data-look="Meadow"></body></html>`);
  try { assert.deepEqual(designerPalette(page.window.document), ['#224c40', '#fafbf5', '#d9e4b2']); }
  finally { page.window.close(); }
});
test('duplicate accent uses the real secondary highlight, not an invented fallback', () => {
  const page = new JSDOM('<style>:root {--primary:#123;--bg:#fff;--accent:#112233;--gold:#c9db8a}</style>');
  try { assert.deepEqual(designerPalette(page.window.document), ['#112233', '#ffffff', '#c9db8a']); }
  finally { page.window.close(); }
});
test('unresolved or cyclic colours never become a guessed palette', () => {
  const page = new JSDOM('<style>:root{--primary:var(--loop);--loop:var(--primary);--bg:#fff}</style>');
  try { assert.throws(() => designerPalette(page.window.document), /resolved authored colours/); }
  finally { page.window.close(); }
});
