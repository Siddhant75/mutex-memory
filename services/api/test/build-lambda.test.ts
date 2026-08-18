import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('Lambda bundle', () => {
  it('builds one loadable ESM artifact exporting the Lambda handler', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'mutex-lambda-'));
    temporaryDirectories.push(outputDirectory);

    const { stderr } = await execFileAsync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/build-lambda.ts',
        '--outdir',
        outputDirectory,
      ],
      { cwd: resolve('.') },
    );

    expect(stderr).toBe('');
    const artifactPath = join(outputDirectory, 'index.mjs');
    expect((await stat(artifactPath)).size).toBeGreaterThan(0);

    const artifact = (await import(pathToFileURL(artifactPath).href)) as {
      handler?: unknown;
    };
    expect(artifact.handler).toBeTypeOf('function');
  });
});
