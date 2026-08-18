import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

function outputDirectory(args: string[]): string {
  if (args.length === 0) return resolve('dist/lambda');
  if (args.length !== 2 || args[0] !== '--outdir' || !args[1]) {
    throw new Error('Usage: build-lambda.ts [--outdir <directory>]');
  }
  return resolve(args[1]);
}

const outdir = outputDirectory(process.argv.slice(2));
await mkdir(outdir, { recursive: true });

await build({
  absWorkingDir: resolve('.'),
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  bundle: true,
  entryPoints: ['services/api/src/lambda.ts'],
  external: ['pg-native'],
  format: 'esm',
  legalComments: 'none',
  logLevel: 'silent',
  outfile: join(outdir, 'index.mjs'),
  platform: 'node',
  target: 'node22',
  treeShaking: true,
});

process.stdout.write(`${join(outdir, 'index.mjs')}\n`);
