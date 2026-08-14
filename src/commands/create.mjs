import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { agentsMd } from '../lib/agentsMd.mjs';

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,48}[a-z0-9]$/;
const KIT_PACKAGE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
);

/** `create <dir> [--name x] [--label "X"]` — a working, validating template from the starter,
 *  briefed for AI agents (AGENTS.md + CLAUDE.md) and wired with the kit's npm scripts. */
export function create(args) {
  const dir = args._[0];
  if (!dir) {
    console.error('usage: p60-template-kit create <dir> [--name my-template] [--label "My Template"]');
    process.exit(2);
  }
  const target = resolve(dir);
  const name = (args.name ?? basename(target)).toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    console.error(`✗ '${name}' is not a valid template name (lowercase letters, digits, hyphens, `
        + '3–50 chars, starting with a letter). Pass --name.');
    process.exit(1);
  }
  if (existsSync(join(target, 'manifest.json'))) {
    console.error(`✗ ${target} already contains a template.`);
    process.exit(1);
  }
  const label = args.label ?? name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

  mkdirSync(target, { recursive: true });
  cpSync(resolve(import.meta.dirname, '../../starter'), target, { recursive: true });

  const manifest = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'));
  manifest.name = name;
  manifest.version = '0.1.0';
  manifest.label = label;
  manifest.description = `${label} — a Port60 site template.`;
  manifest.changelog = 'First cut from the starter.';
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const briefing = agentsMd(name);
  writeFileSync(join(target, 'AGENTS.md'), briefing);
  writeFileSync(join(target, 'CLAUDE.md'), briefing);
  writeFileSync(join(target, '.gitignore'), 'node_modules/\n*.zip\n');
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: `${name}-template`,
    private: true,
    scripts: {
      dev: 'p60-template-kit dev .',
      validate: 'p60-template-kit validate .',
      'validate:json': 'p60-template-kit validate . --json',
      package: 'p60-template-kit package .'
    },
    devDependencies: {
      '@port60/template-kit': `^${KIT_PACKAGE.version}`
    }
  }, null, 2) + '\n');
  writeFileSync(join(target, 'README.md'), `# ${label}

A Port60 site template. Start with \`npm install\`, then:

- \`npm run dev\` — live preview at http://localhost:4400
- \`npm run validate\` — conformance against the platform contract
- \`npm run package\` — the uploadable zip

**Working with an AI agent?** Point it at this directory — \`AGENTS.md\` (and \`CLAUDE.md\`)
brief it on the contract, the rules and the validate loop.

Docs: https://developers.port60.com
`);

  console.log(`✓ ${label} scaffolded at ${target}`);
  console.log('  npm install && npm run dev   → preview at http://localhost:4400');
  console.log('  AGENTS.md briefs your AI agent; `npm run validate:json` is its feedback loop.');
}
