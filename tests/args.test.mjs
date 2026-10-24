import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/lib/args.mjs';

test('--key value and --key=value mean the same thing', () => {
  assert.deepEqual(parseArgs(['--host', '0.0.0.0']), { _: [], host: '0.0.0.0' });
  assert.deepEqual(parseArgs(['--host=0.0.0.0']), { _: [], host: '0.0.0.0' });
  assert.deepEqual(parseArgs(['--port=4400', '--host', '::1']), { _: [], port: '4400', host: '::1' });
});

test('a bare --flag is true, and a following --option is never taken as its value', () => {
  assert.deepEqual(parseArgs(['--json']), { _: [], json: true });
  assert.deepEqual(parseArgs(['--host', '--json']), { _: [], host: true, json: true });
});

test('the joined form splits on the first equals sign only and keeps an empty value empty', () => {
  assert.deepEqual(parseArgs(['--content=a=b.json']), { _: [], content: 'a=b.json' });
  assert.deepEqual(parseArgs(['--host=']), { _: [], host: '' });
});

test('positionals keep their order around options of either form', () => {
  assert.deepEqual(parseArgs(['my-site', '--name=Hope', 'extra', '--json']), { _: ['my-site', 'extra'], name: 'Hope', json: true });
});
