// Production-webview integration check. Run after compile: node scripts/verify-portals.mjs
// Uses an isolated Edge profile and mock VS Code storage; never touches real game progress.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const output = mkdtempSync(join(tmpdir(), 'cozy-portals-'));
const source = readFileSync(join(root, 'src/extension/gameView.ts'), 'utf8');
const template = source.slice(source.indexOf('<!doctype html>'), source.indexOf('</html>') + 7);
const assets = {
  scriptUri: pathToFileURL(join(root, 'dist/webview.js')).href,
  styleUri: pathToFileURL(join(root, 'dist/webview.css')).href,
  playerSpriteUri: pathToFileURL(join(root, 'media/player-medieval-spritesheet.png')).href,
  nonce: 'preview',
};
const bootstrap = `<script>
window.testErrors = [];
addEventListener('error', e => testErrors.push(e.message));
window.testSave = {player:{x:1750,y:780,level:5,xp:15},coins:101,inventory:{salmon:3}};
window.acquireVsCodeApi = () => ({getState(){return testSave},setState(s){testSave=structuredClone(s)},postMessage(m){
  if(m.type==='webviewReady') setTimeout(()=>dispatchEvent(new MessageEvent('message',{data:{type:'loadState',state:testSave}})),10);
  if(m.type==='saveState') testSave=structuredClone(m.state);
}});
</script>`;
const fixture = join(output, 'preview.html');
writeFileSync(fixture, template.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace(/\$\{(\w+)\}/g, (_, key) => assets[key] ?? '').replace('<head>', '<head>' + bootstrap));
const profile = join(output, 'profile');
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error('Timed out: ' + label);
}
let socket;
let cdp;
try {
  await until(() => existsSync(join(profile, 'DevToolsActivePort')), 'Edge startup');
  const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
  };
  cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const visible = id => evaluate(`!document.getElementById('${id}').classList.contains('hidden')`);
  const key = (key, down) => cdp('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp', key, code: key === ' ' ? 'Space' : key === 'Escape' ? key : 'Key' + key.toUpperCase(),
    windowsVirtualKeyCode: key === ' ' ? 32 : key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0),
  });
  const press = async value => { await key(value, true); await sleep(80); await key(value, false); await sleep(100); };
  const walk = async (value, duration) => { await key(value, true); await sleep(duration); await key(value, false); };
  const waitMap = map => until(() => evaluate(`document.getElementById('gameCanvas').dataset.scene === '${map}'`), 'map ' + map);
  const clickWorld = async (x, y) => {
    await sleep(700);
    const point = await evaluate(`(()=>{
      const [w,h]=document.getElementById('gameCanvas').dataset.mapSize.split('x').map(Number);
      const z=Math.max(1,innerWidth/w,innerHeight/h);
      const halfW=innerWidth/(2*z),halfH=innerHeight/(2*z);
      const cx=Math.max(halfW,Math.min(w-halfW,testSave.player.x));
      const cy=Math.max(halfH,Math.min(h-halfH,testSave.player.y));
      return {x:innerWidth/2+(${x}-cx)*z,y:innerHeight/2+(${y}-cy)*z};
    })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const screenshot = async name => {
    await sleep(350);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(output, name + '.png'), Buffer.from(data, 'base64'));
  };
  const load = async state => {
    await evaluate(`dispatchEvent(new MessageEvent('message',{data:{type:'loadState',state:${JSON.stringify(state)}}}))`);
    await sleep(400);
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: pathToFileURL(fixture).href });
  await waitMap('hub');
  await until(() => evaluate(`window.testSave?.mapLayoutVersion === 1`), 'save migration');
  assert.equal(await evaluate(`testSave.coins`), 101);
  assert.equal(await evaluate(`testSave.inventory.salmon`), 3);
  assert.equal(await evaluate(`document.getElementById('gameCanvas').dataset.mapSize`), '960x800');
  await screenshot('hub');

  await key('w', true);
  await until(() => visible('fishingAreasPanel'), 'walk into hub portal');
  await key('w', false);
  assert.equal(await evaluate(`document.querySelectorAll('#fishingAreasPanel button:disabled').length`), 2);
  await screenshot('area-selector');
  await evaluate(`document.querySelector('#fishingAreasPanel button:disabled').click()`);
  assert.equal(await visible('fishingAreasPanel'), true);
  await press('Escape');
  await sleep(250);
  assert.equal(await visible('fishingAreasPanel'), false, 'dismiss must not immediately reopen');
  await walk('s', 450);
  await key('w', true);
  await until(() => visible('fishingAreasPanel'), 'portal re-entry');
  await key('w', false);
  await evaluate(`document.getElementById('areaOneButton').click()`);
  await waitMap('area1');
  assert.equal(await evaluate(`document.getElementById('gameCanvas').dataset.mapSize`), '1200x900');
  await screenshot('area1');
  const areaSave = await evaluate('testSave');
  await load(areaSave);
  await waitMap('area1');
  await press(' ');
  assert.equal(await visible('fishingControls'), true, 'Space starts fishing');
  await press('f');
  assert.equal(await evaluate('testSave.fishing.autoEnabled'), true);
  await press('Escape');
  assert.equal(await visible('fishingControls'), false);
  assert.equal(await evaluate('testSave.location'), 'area1', 'cancel fishing stays on area map');
  await walk('s', 700);
  await key('a', true);
  await waitMap('hub');
  await key('a', false);
  assert.equal(await evaluate('testSave.fishing.autoEnabled'), false);
  assert.equal(await visible('fishingAreasPanel'), false);
  await screenshot('returned-hub');
  console.log('PASS migration, walk-in chooser, locked areas, dismissal/re-entry, separate scenes, fishing, reload, walk-in return');

  // Repeated scene starts, click interactions, and a narrow sidebar viewport.
  for (let round = 0; round < 2; round++) {
    const hubSave = await evaluate('testSave');
    await load({ ...hubSave, player: { ...hubSave.player, x: 480, y: 300 } });
    await clickWorld(480, 235);
    await until(() => visible('fishingAreasPanel'), 'click hub portal');
    await evaluate(`document.getElementById('areaOneButton').click()`);
    await waitMap('area1');
    const current = await evaluate('testSave');
    await load({ ...current, player: { ...current.player, x: 230, y: 735 } });
    await clickWorld(230, 685);
    await waitMap('hub');
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 480, height: 900, deviceScaleFactor: 1, mobile: false });
  await key('w', true);
  await until(() => visible('fishingAreasPanel'), 'sidebar walk-in portal');
  await key('w', false);
  await screenshot('sidebar-selector');
  assert.equal(await evaluate(`(()=>{const r=document.getElementById('fishingAreasPanel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`), true);
  await evaluate(`document.getElementById('areaOneButton').click()`);
  await waitMap('area1');
  await screenshot('sidebar-area1');
  for (const [width,height] of [[480,1280],[1280,900],[320,700]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await screenshot(`full-height-${width}x${height}`);
    assert.equal(await evaluate(`(()=>{
      const c=document.getElementById('gameCanvas'),ctx=c.getContext('2d');
      return [2,c.height-3].every(y=>{
        const p=ctx.getImageData(Math.floor(c.width/2),y,1,1).data;
        return !(p[0]===20&&p[1]===32&&p[2]===25);
      });
    })()`),true,'map must cover top and bottom of viewport');
  }
  assert.deepEqual(await evaluate('testErrors'), []);
  console.log('PASS repeated portal clicks, scene restarts, sidebar modal/transition, no runtime errors');
  console.log('Screenshots:', output);
} finally {
  if (cdp) await cdp('Browser.close').catch(() => {});
  socket?.close();
  browser.kill();
}
