import type { BuildContext, BuildPreset } from 'unbuild';

import fs from 'node:fs';
import path from 'node:path';

import { execa } from 'execa';
import { platform } from 'node:os';
import { lightRed } from '@breadc/color';

import type { SeaOptions } from './types';

import { bundle as rawBundle } from './bundle';

export type { SeaOptions };

export function Sea(_options: Partial<SeaOptions> = {}): BuildPreset {
  return {
    hooks: {
      'build:before'(ctx) {
        if (ctx.options.stub) {
          return;
        }

        // Setup config
        ctx.options.rollup.inlineDependencies = true;
        ctx.options.rollup.emitCJS = true;
        if (!ctx.options.rollup.esbuild) {
          ctx.options.rollup.esbuild = {
            minify: true
          };
        } else {
          ctx.options.rollup.esbuild.minify = true;
        }

        const deps = new Set([...ctx.options.dependencies, ...ctx.options.devDependencies]);
        ctx.options.externals = ctx.options.externals.filter(
          (dep) => typeof dep !== 'string' || !deps.has(dep)
        );
        ctx.options.devDependencies.push(...ctx.options.dependencies);
        ctx.options.dependencies = [];
      },
      async 'build:done'(ctx) {
        if (ctx.options.stub) {
          return;
        }

        const options = await resolveOptions(ctx, _options);
        if (options) {
          await rawBundle(options);
        }
      }
    }
  };
}

async function resolveOptions(
  ctx: BuildContext,
  options: Partial<SeaOptions>
): Promise<SeaOptions | undefined> {
  const inferred = inferBinary(ctx.options.rootDir);
  const node = options.node ?? process.argv[0];

  const version = (await execa(node, ['--version'])).stdout;
  const match = /^v(\d+)/.exec(version);
  if (!match || +match[1] < 20) {
    console.log(
      lightRed(`× Your node version ${version} may not support single executable applications`)
    );
    return undefined;
  }

  return {
    binary: options.binary ?? inferred?.name ?? 'cli',
    main: options.main ?? inferred?.main ?? ctx.buildEntries[0].path,
    node,
    sign: false,
    outDir: options.outDir ?? ctx.options.outDir,
    warning: options.warning === true ? true : false,
    postject: {
      machoSegmentName:
        options.postject?.machoSegmentName ?? platform() === 'darwin' ? 'NODE_SEA' : undefined,
      overwrite: options.postject?.overwrite ?? true,
      sentinelFuse:
        options.postject?.sentinelFuse ?? 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
    }
  };
}

export async function bundle(rootDir: string, options: Partial<Omit<SeaOptions, 'postject'>> = {}) {
  const inferred = inferBinary(rootDir);
  const node = options.node ?? process.argv[0];

  const version = (await execa(node, ['--version'])).stdout;
  const match = /^v(\d+)/.exec(version);
  if (!match || +match[1] < 20) {
    console.log(
      lightRed(`× Your node version ${version} may not support single executable applications`)
    );
    return undefined;
  }

  const main = options.main ?? inferred?.main;
  if (main === undefined) {
    throw new Error('You should provide a script');
  }

  const config: SeaOptions = {
    binary: options.binary ?? inferred?.name ?? 'cli',
    main,
    node,
    sign: options.sign ?? false,
    outDir: options.outDir ?? path.join(rootDir, './dist'),
    warning: options.warning === true ? true : false,
    postject: {
      machoSegmentName: platform() === 'darwin' ? 'NODE_SEA' : undefined,
      overwrite: true,
      sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
    }
  };

  return await rawBundle(config);
}

export function inferBinary(root: string) {
  try {
    const p = path.join(root, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (pkg.bin) {
      const [bin] = Object.entries(pkg.bin);
      const name = bin[0];
      const main = bin[1];
      if (name && main && typeof name === 'string' && typeof main === 'string') {
        const mainPath = path.join(root, main);
        if (fs.existsSync(mainPath)) {
          return {
            name,
            main: mainPath
          };
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
