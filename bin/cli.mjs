#!/usr/bin/env node
// @port60/template-kit — build Port60 site templates locally. AI-agent ready: `create` scaffolds
// an AGENTS.md-briefed project; `validate --json` is the machine feedback loop; `dev` is the
// human's live preview; `package` produces the uploadable artifact.
import { create } from '../src/commands/create.mjs';
import { validate } from '../src/commands/validate.mjs';
import { dev } from '../src/commands/dev.mjs';
import { packageCmd } from '../src/commands/packageCmd.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

switch (command) {
  case 'create':
    create(args);
    break;
  case 'validate':
    await validate(args);
    break;
  case 'dev':
    await dev(args);
    break;
  case 'package':
    await packageCmd(args);
    break;
  default:
    console.log(`@port60/template-kit — build Port60 site templates locally

usage:
  p60-template-kit create <dir> [--name my-template] [--label "My Template"]
  p60-template-kit dev [dir] [--port 4400]     live preview over the contract fixtures
  p60-template-kit validate [dir] [--json]     the platform's exact conformance checks
  p60-template-kit package [dir]               validate + build the uploadable zip

AI agents: the scaffold's AGENTS.md is your briefing; iterate with \`validate --json\`.
Docs: https://developers.port60.com (agents: /llms-full.txt)`);
    process.exit(command ? 2 : 0);
}
