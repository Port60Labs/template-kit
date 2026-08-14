// The kit's own layer (node --test): the scaffold validates out of the box, the packaged zip is
// readable and contract-shaped, the JSON loop carries proven supports — and the DRIFT GUARD:
// the vendored contract/engine/validator must be byte-identical to charity-site's authoritative
// copy, or `npm run sync-vendor` is overdue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildZip } from '../src/lib/zip.mjs';
import { loadArtifactDir } from '../src/lib/artifactFiles.mjs';
import { renderStudioPreview } from '../src/vendor/validator/preview.mjs';

const CLI = resolve(import.meta.dirname, '../bin/cli.mjs');
const KIT_PACKAGE = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));

function run(args, opts = {}) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });
}

test('create → validate → package: the full loop on a fresh scaffold', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'p60kit-')), 'my-ai-theme');
  try {
    run(['create', dir, '--name', 'my-ai-theme', '--label', 'My AI Theme']);

    // The AI briefing ships in both conventions, and the scaffold is a working npm project.
    for (const f of ['AGENTS.md', 'CLAUDE.md', 'README.md', 'package.json', 'manifest.json']) {
      assert.ok(existsSync(join(dir, f)), `${f} missing`);
    }
    assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /validate:json/);
    const scaffoldPackage = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.equal(
      scaffoldPackage.devDependencies['@port60/template-kit'],
      `^${KIT_PACKAGE.version}`,
      'a fresh scaffold must accept the same kit version that generated it'
    );

    const json = JSON.parse(run(['validate', dir, '--json']));
    assert.equal(json.ok, true, JSON.stringify(json.errors));
    assert.equal(json.manifest.name, 'my-ai-theme');
    assert.ok(json.provenSupports.sections.length > 0);

    run(['package', dir]);
    const zip = join(dir, 'my-ai-theme-0.1.0.zip');
    assert.ok(existsSync(zip));
    assert.ok(statSync(zip).size > 1000);
  } finally {
    rmSync(resolve(dir, '..'), { recursive: true, force: true });
  }
});

test('validate --json reports errors as a machine-readable loop', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'p60kit-')), 'broken');
  try {
    run(['create', dir, '--name', 'broken-theme']);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    manifest.supports.islands = [];
    require_write(join(dir, 'manifest.json'), JSON.stringify(manifest));

    let out;
    try {
      out = run(['validate', dir, '--json']);
    } catch (e) {
      out = e.stdout; // exit 1 carries the JSON on stdout
    }
    const json = JSON.parse(out);
    assert.equal(json.ok, false);
    assert.ok(json.errors.some((x) => x.includes('not declared in manifest.supports.islands')));
    assert.equal(json.provenSupports, null);
  } finally {
    rmSync(resolve(dir, '..'), { recursive: true, force: true });
  }
});

function require_write(path, content) {
  // fs.writeFileSync via import at top would be tidier; kept local to the one mutation test.
  // eslint-disable-next-line no-undef
  return process.getBuiltinModule('node:fs').writeFileSync(path, content);
}

test('the zip writer produces archives the platform intake reads', async () => {
  const zip = buildZip([
    { path: 'manifest.json', content: '{"name":"x"}' },
    { path: 'sections/hero.liquid', content: '<h1>hi</h1>' }
  ]);
  // Round-trip through a real unzip: node has no reader, so verify the container markers.
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('sections/hero.liquid')));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test('preview renders realistic, non-interactive island skeletons', async () => {
  const starter = resolve(import.meta.dirname, '../starter');
  const html = await renderStudioPreview(loadArtifactDir(starter));

  assert.match(html, /class="donate-card"/);
  assert.match(html, /class="nav-p60-signin"/);
  // The starter's standard hero is now the BEHAVIOUR carousel (engine-wired data-p60-* markup,
  // docs/template-behaviours.md) rather than the hero_carousel island — the preview shows the
  // complete static slide stack.
  assert.match(html, /data-p60-carousel/);
  assert.match(html, /data-p60-slide/);
  assert.doesNotMatch(html, />island:/);
  assert.match(html, /default-src 'none'/);
});

test('the dev preview inlines ONLY the platform behaviour runtime; studio stays script-free', async () => {
  const starter = resolve(import.meta.dirname, '../starter');
  const runtime = readFileSync(resolve(import.meta.dirname, '../src/vendor/validator/behaviors-runtime.js'), 'utf8');

  const withRuntime = await renderStudioPreview(loadArtifactDir(starter), { behaviorsRuntime: runtime });
  assert.match(withRuntime, /p60Behaviors\.initBehaviors\(\)/);
  assert.match(withRuntime, /script-src 'unsafe-inline'/);

  const studio = await renderStudioPreview(loadArtifactDir(starter));
  assert.doesNotMatch(studio, /<script/);
  assert.match(studio, /default-src 'none'; style-src 'unsafe-inline'; img-src data:;"/);
});

test('preview passes section data fixtures to widget section renderers', async () => {
  const html = await renderStudioPreview({
    'manifest.json': JSON.stringify({
      name: 'fixture-preview',
      label: 'Fixture preview',
      supports: { pages: ['home'], sections: ['events'], islands: [] }
    }),
    'sections/events.liquid': '{% for e in events %}<h2>{{ e.name }}</h2>{% endfor %}',
    'assets/theme.css': ''
  });

  assert.match(html, /Fixture Lantern Gala/);
});

test('DRIFT GUARD: vendored contract/engine/validator match charity-site byte for byte', () => {
  const site = resolve(import.meta.dirname, '../../../frontends/charity-site/src/templates');
  if (!existsSync(site)) {
    return; // published package outside the monorepo — the guard runs in-repo only
  }
  const vendor = resolve(import.meta.dirname, '../src/vendor');
  const pairs = [
    ['contract/v1', 'contract/v1'],
    ['engine/dialect.mjs', 'engine/dialect.mjs'],
    ['engine/budgets.mjs', 'engine/budgets.mjs'],
    ['validator/validate.mjs', 'validator/validate.mjs'],
    ['validator/preview.mjs', 'validator/preview.mjs'],
    ['validator/behaviors-runtime.js', 'validator/behaviors-runtime.js'],
    ['validator/platform-base.css', 'validator/platform-base.css']
  ];
  for (const [srcRel, venRel] of pairs) {
    const src = join(site, srcRel);
    const ven = join(vendor, venRel);
    if (statSync(src).isDirectory()) {
      for (const f of readdirSync(src)) {
        assert.equal(readFileSync(join(ven, f), 'utf8'), readFileSync(join(src, f), 'utf8'),
          `${venRel}/${f} drifted — run npm run sync-vendor`);
      }
    } else {
      assert.equal(readFileSync(ven, 'utf8'), readFileSync(src, 'utf8'),
        `${venRel} drifted — run npm run sync-vendor`);
    }
  }

  // The starter must match the source starter artifact (versionless source dir — version in manifest).
  const starterRoot = resolve(import.meta.dirname, '../../../frontends/charity-site/template-artifacts/starter');
  const starterManifest = readFileSync(join(starterRoot, 'manifest.json'), 'utf8');
  assert.equal(readFileSync(resolve(import.meta.dirname, '../starter/manifest.json'), 'utf8'),
    starterManifest, 'starter drifted — run npm run sync-vendor');
});
