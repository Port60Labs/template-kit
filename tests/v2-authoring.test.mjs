import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { agentsMd } from '../src/lib/agentsMd.mjs';

const CLI = resolve(import.meta.dirname, '../bin/cli.mjs');
const run = args => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('kit model and generated briefing use v2 envelopes and explicit historical support', () => {
  const model = JSON.parse(run(['model', '--json']).stdout);
  assert.equal(model.version, '2.0');
  assert.equal(model.collections.events.shape, 'envelope');
  assert.equal(model.collections.schedules.shape, 'array');
  assert.deepEqual(model.collections.courses.item.audience.enumOpen, ['EVERYONE', 'CHILD']);
  assert.match(agentsMd('test'), /port60-liquid@2/);
  assert.match(agentsMd('test'), /Existing v1 platform pins retain/);
  assert.match(agentsMd('test'), /events_carousel, whats_on_strip and latest_articles islands are v1-only and rejected by v2/);
});

test('new CLI authoring rejects a v1 manifest without overwriting its local briefing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p60kit-v1-'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ format: 'port60-liquid@1', name: 'old-design', version: '1.0.0' }));
  writeFileSync(join(dir, 'AGENTS.md'), 'Author notes stay here.');
  for (const command of ['validate', 'package', 'refresh', 'dev']) {
    const result = run([command, dir]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /port60-liquid@2/);
  }
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), 'Author notes stay here.');
});
