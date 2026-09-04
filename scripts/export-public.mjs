#!/usr/bin/env node
// Produces the PUBLIC repository contents (github.com/Port60Labs/template-kit) from this
// package, the private-monorepo → public-mirror release model. One-way: the monorepo stays
// authoritative; this script refreshes the mirror's working tree (everything except .git),
// swaps in the public package.json fields, and writes the repo shell (README, LICENSE, CI).
//
//   node scripts/export-public.mjs <target-dir>
//
// The sync-vendor script is deliberately NOT exported (it references monorepo paths); the
// drift-guard test IS, it self-skips outside the monorepo.
import { cpSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const target = process.argv[2] ? resolve(process.argv[2]) : null;
if (!target) {
  console.error('usage: node scripts/export-public.mjs <target-dir>');
  process.exit(2);
}
const ROOT = resolve(import.meta.dirname, '..');

mkdirSync(target, { recursive: true });
for (const entry of readdirSync(target)) {
  if (entry === '.git') continue;
  rmSync(join(target, entry), { recursive: true, force: true });
}

for (const dir of ['bin', 'src', 'starter', 'tests']) {
  cpSync(join(ROOT, dir), join(target, dir), { recursive: true });
}
if (existsSync(join(ROOT, 'package-lock.json'))) {
  cpSync(join(ROOT, 'package-lock.json'), join(target, 'package-lock.json'));
}

// The public package.json: same artifact, plus the fields a public package owes its users.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
delete pkg.scripts['sync-vendor'];
pkg.license = 'MIT';
pkg.repository = { type: 'git', url: 'git+https://github.com/Port60Labs/template-kit.git' };
pkg.homepage = 'https://developers.port60.com';
pkg.bugs = { url: 'https://github.com/Port60Labs/template-kit/issues' };
// access only, provenance is NOT set here: it can only be generated inside CI (OIDC), and
// trusted publishing attaches it there automatically; set locally it breaks the first manual
// publish ('provider: null').
pkg.publishConfig = { access: 'public' };
writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

writeFileSync(join(target, 'LICENSE'), `MIT License

Copyright (c) 2026 PORT 60 LTD

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);

writeFileSync(join(target, 'README.md'), `# @port60/template-kit

[![npm](https://img.shields.io/npm/v/%40port60%2Ftemplate-kit)](https://www.npmjs.com/package/@port60/template-kit)
[![CI](https://github.com/Port60Labs/template-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Port60Labs/template-kit/actions/workflows/ci.yml)

The official toolkit for building [Port60](https://port60.com) site templates, scaffold from
the starter, preview locally against the platform contract, validate with the exact checks the
platform runs at upload, and package for review.

Templates are small, versioned artifacts of [Liquid](https://liquidjs.com) renderers and CSS.
They contain no application code: the platform owns data, payments and compliance; your template
owns how a site looks.

## Quickstart

\`\`\`bash
npx @port60/template-kit create my-template   # the folder name IS the template name
cd my-template && npm install
npm run dev        # live preview at http://localhost:4400
npm run validate   # the platform's conformance checks
npm run package    # the uploadable <name>-<version>.zip
\`\`\`

Already building? \`npx @port60/template-kit@latest upgrade\` moves an existing template onto
the latest kit and contract, regenerates the agent briefing, and reports what (if anything) the
newer contract asks of you.

## Commands

| Command | What it does |
| --- | --- |
| \`create <dir>\` | A working template from the platform starter, npm scripts wired. |
| \`dev [dir]\` | Live preview over the contract's sample fixtures; validation re-runs on save. |
| \`validate [dir] [--json]\` | The exact checks the platform runs at upload. \`--json\` emits \`{ok, errors, warnings, provenSupports}\`. |
| \`package [dir]\` | Validate, then build the contract-shaped zip the studio accepts as-is. |
| \`model [--json]\` | The content model, in hand; \`--json\` for agents. |
| \`content [dir]\` | Eject the model's data as your editable copy; render it with \`dev --content\`. |
| \`upgrade [dir]\` | Latest kit + contract for an existing template; re-briefs and re-validates. |

## Building with an AI agent

Every scaffold ships \`AGENTS.md\` (and an identical \`CLAUDE.md\`) briefing any coding agent on
the contract rules and the iteration loop; \`validate --json\` is the machine feedback loop to
iterate against until \`ok: true\`. The full documentation is also published as a single
agent-consumable file at [developers.port60.com/llms-full.txt](https://developers.port60.com/llms-full.txt).

See the [AI quickstart](https://developers.port60.com/guides/ai-quickstart/).

## The contract

The vendored contract in \`src/vendor/contract\` is the **Charity Platform contract v1**, the
platform's first product surface. The dialect, validation rules and this toolchain are
platform-wide; future Port60 products ship their own contract packs for the same kit.

Full documentation: [developers.port60.com](https://developers.port60.com)

## Licence

[MIT](LICENSE) © PORT 60 LTD. Publishing a template on the Port60 marketplace is governed by the
[Developer Agreement](https://port60.com/developers/agreement/).
`);

writeFileSync(join(target, 'CONTRIBUTING.md'), `# Contributing

This repository is the public release mirror of \`@port60/template-kit\`, published from
Port60's private monorepo, the vendored contract and engine are kept byte-identical to the
platform's authoritative copy by an automated sync with a drift-guard test.

- **Issues and discussions are very welcome here**, bug reports, contract questions, developer
  experience feedback.
- **Code changes** land in the monorepo first; small pull requests here may be ported across
  rather than merged directly, with credit. Open an issue before investing in a large change.

Publishing templates to the Port60 marketplace requires a developer account, see [developers.port60.com](https://developers.port60.com).
`);

writeFileSync(join(target, '.gitignore'), 'node_modules/\n*.zip\n');

mkdirSync(join(target, '.github/workflows'), { recursive: true });
writeFileSync(join(target, '.github/workflows/ci.yml'), `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm test
`);
writeFileSync(join(target, '.github/workflows/publish.yml'), `name: Publish to npm
# Publishes on a GitHub release via npm TRUSTED PUBLISHING (OIDC): no token exists anywhere, # npm trusts this exact repo + workflow file, GitHub proves the identity per run, and provenance
# attestation is attached automatically. Setup (once, after the package's first manual publish):
# npmjs.com → @port60/template-kit → Settings → Trusted Publisher →
#   GitHub Actions / Port60Labs / template-kit / publish.yml
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # the OIDC identity npm verifies
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      # Trusted publishing needs a current npm client.
      - run: npm install -g npm@latest
      - run: npm ci
      - run: npm test
      - run: npm publish
`);

console.log(`✓ public repo contents exported to ${target}`);
