/** The kit's command line: `--key value`, `--key=value` and a bare `--flag` (true); anything else
 *  is a positional under `_`. A value that itself starts with `--` is never consumed as a value. */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }
    const body = a.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[body] = next;
      i++;
    } else {
      args[body] = true;
    }
  }
  return args;
}
