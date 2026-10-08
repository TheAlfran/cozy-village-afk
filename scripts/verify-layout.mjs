// Browser smoke check using the actual WebView HTML and production bundle.
// Run on Windows after compile: node scripts/verify-layout.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = mkdtempSync(join(tmpdir(), 'cozy-layout-'));
const source = readFileSync(join(root, 'src/extension/gameView.ts'), 'utf8');
const template = source.slice(source.indexOf('<!doctype html>'), source.indexOf('</html>') + 7);
const assets = {
  scriptUri: pathToFileURL(join(root, 'dist/webview.js')).href,
  styleUri: pathToFileURL(join(root, 'dist/webview.css')).href,
  playerSpriteUri: pathToFileURL(join(root, 'media/player-medieval-spritesheet.png')).href,
  nonce: 'preview',
};
const bootstrap = `<script>
window.acquireVsCodeApi = () => ({getState(){},setState(){},postMessage(message){
  if(message.type === 'webviewReady') setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data:{type:'loadState',state:{}}})), 10);
}});
window.addEventListener('error', e => {document.documentElement.dataset.error = e.message;});
setTimeout(() => {
  document.getElementById('inventoryButton').click();
  const hud = document.getElementById('hud');
  const panel = document.getElementById('inventoryPanel');
  const rect = panel.getBoundingClientRect();
  const failures = [];
  const check = (condition, message) => {if(!condition) failures.push(message);};
  check(!document.documentElement.dataset.error, document.documentElement.dataset.error);
  check(getComputedStyle(hud).position === 'absolute', 'HUD must overlay the map');
  check(document.getElementById('gameShell').clientHeight === innerHeight, 'Map must fill viewport height');
  check(hud.scrollWidth <= hud.clientWidth, 'HUD overflow');
  check(panel.scrollWidth <= panel.clientWidth, 'Inventory overflow');
  check(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, 'Inventory outside viewport');
  check(Math.abs((rect.top + rect.bottom)/2 - innerHeight/2) < 2, 'Inventory not vertically centered');
  check(document.querySelectorAll('.equipmentSlot').length === 6, 'Missing equipment');
  check(document.querySelectorAll('.itemSlot').length === 5, 'Missing fish slots');
  const button = document.querySelector('[data-equip="apprenticeHood"]');
  button.click();
  check(document.querySelector('[data-equip="apprenticeHood"]').getAttribute('aria-pressed') === 'true', 'Equip failed');
  const result = document.createElement('pre');
  result.id = 'layout-result';
  result.hidden = true;
  result.textContent = JSON.stringify({width:innerWidth,height:innerHeight,inventory:[rect.width,rect.height],failures});
  document.body.append(result);
  parent.postMessage(result.textContent, '*');
}, 2200);
</script>`;
const html = template.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace(/\$\{(\w+)\}/g, (_, key) => assets[key] ?? '')
  .replace('<head>', '<head>' + bootstrap);
const fixture = join(output, 'preview.html');
writeFileSync(fixture, html);
let failed = false;
for (const [width, height] of [[1280, 800], [480, 900], [320, 700], [600, 360]]) {
  // Edge enforces a minimum outer window width; an iframe guarantees the
  // actual game viewport is exactly the requested narrow sidebar size.
  const wrapper = join(output, `viewport-${width}.html`);
  writeFileSync(wrapper, `<html><body style="margin:0;background:#101a14"><iframe src="${pathToFileURL(fixture).href}" style="border:0;width:${width}px;height:${height}px"></iframe><script>addEventListener('message',event=>{const p=document.createElement('pre');p.id='layout-result';p.hidden=true;p.textContent=event.data;document.body.append(p);});</script></body></html>`);
  const result = spawnSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--user-data-dir=' + join(output, `profile-${width}`),
    `--window-size=${width + 24},${height + 92}`, '--virtual-time-budget=4000',
    '--screenshot=' + join(output, `${width}x${height}.png`), '--dump-dom', pathToFileURL(wrapper).href,
  ], {encoding: 'utf8', timeout: 45000, windowsHide: true, maxBuffer: 5 * 1024 * 1024});
  const match = result.stdout?.match(/<pre id="layout-result"[^>]*>(.*?)<\/pre>/s);
  if (!match) {console.error(result.error ?? result.stderr); failed = true; continue;}
  const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  console.log(report);
  if (report.failures.length) failed = true;
}
console.log('Screenshots:', output);
process.exitCode = failed ? 1 : 0;
