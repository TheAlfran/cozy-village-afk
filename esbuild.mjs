import * as esbuild from 'esbuild';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const watchMode = args.has('--watch');
if (args.has('--clean')) {
  await rm(join(projectRoot, 'dist'), { recursive: true, force: true });
  process.exit(0);
}

const shared = { bundle: true, sourcemap: true, minify: !watchMode, logLevel: 'info', absWorkingDir: projectRoot };
const extension = {
  ...shared,
  entryPoints: [join(projectRoot, 'src', 'extension', 'extension.ts')],
  outfile: join(projectRoot, 'dist', 'extension.js'),
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
};
const webview = {
  ...shared,
  entryPoints: [join(projectRoot, 'src', 'webview', 'main.ts')],
  outfile: join(projectRoot, 'dist', 'webview.js'),
  platform: 'browser',
  format: 'iife',
};

if (watchMode) {
  console.log('[watch] starting');
  // Make the F5 background task wait for one verified build before launching.
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(webview)]);
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('[watch] ready');
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
