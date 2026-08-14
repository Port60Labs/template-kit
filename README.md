# @port60/template-kit

[![npm](https://img.shields.io/npm/v/%40port60%2Ftemplate-kit)](https://www.npmjs.com/package/@port60/template-kit)
[![CI](https://github.com/Port60Labs/template-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Port60Labs/template-kit/actions/workflows/ci.yml)

The official toolkit for building [Port60](https://port60.com) site templates, scaffold from
the starter, preview locally against the platform contract, validate with the exact checks the
platform runs at upload, and package for review.

Templates are small, versioned artifacts of [Liquid](https://liquidjs.com) renderers and CSS.
They contain no application code: the platform owns data, payments and compliance; your template
owns how a site looks.

## Quickstart

```bash
npx @port60/template-kit create my-template   # the folder name IS the template name
cd my-template && npm install
npm run dev        # live preview at http://localhost:4400
npm run validate   # the platform's conformance checks
npm run package    # the uploadable <name>-<version>.zip
```

Already building? `npx @port60/template-kit@latest upgrade` moves an existing template onto
the latest kit and contract, regenerates the agent briefing, and reports what (if anything) the
newer contract asks of you.

## Commands

| Command | What it does |
| --- | --- |
| `create <dir>` | A working template from the platform starter, npm scripts wired. |
| `dev [dir]` | Live preview over the contract's sample fixtures; validation re-runs on save. |
| `validate [dir] [--json]` | The exact checks the platform runs at upload. `--json` emits `{ok, errors, warnings, provenSupports}`. |
| `package [dir]` | Validate, then build the contract-shaped zip the studio accepts as-is. |
| `model [--json]` | The content model, in hand; `--json` for agents. |
| `content [dir]` | Eject the model's data as your editable copy; render it with `dev --content`. |
| `upgrade [dir]` | Latest kit + contract for an existing template; re-briefs and re-validates. |

## Building with an AI agent

Every scaffold ships `AGENTS.md` (and an identical `CLAUDE.md`) briefing any coding agent on
the contract rules and the iteration loop; `validate --json` is the machine feedback loop to
iterate against until `ok: true`. The full documentation is also published as a single
agent-consumable file at [developers.port60.com/llms-full.txt](https://developers.port60.com/llms-full.txt).

See the [AI quickstart](https://developers.port60.com/guides/ai-quickstart/).

## The contract

The vendored contract in `src/vendor/contract` is the **Charity Platform contract v1**, the
platform's first product surface. The dialect, validation rules and this toolchain are
platform-wide; future Port60 products ship their own contract packs for the same kit.

Full documentation: [developers.port60.com](https://developers.port60.com)

## Licence

[MIT](LICENSE) © PORT 60 LTD. Publishing a template on the Port60 marketplace is governed by the
[Developer Agreement](https://port60.com/developers/agreement/).
