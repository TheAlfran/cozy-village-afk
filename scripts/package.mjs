import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const output = join('releases', `${manifest.name}-${manifest.version}.vsix`);
const vsceCli = join(projectRoot, 'node_modules', '@vscode', 'vsce', 'vsce');

const result = spawnSync(process.execPath, [vsceCli, 'package', '--out', output], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
