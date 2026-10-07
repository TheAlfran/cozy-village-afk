import './styles.css';
import {
  FISH,
  createDefaultSave,
  sanitizeSave,
  type FishDefinition,
  type FishId,
  type GameSaveV1,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
} from '../shared/model.js';
import { awardCatch, chooseFish, inventoryCount, normalizedMovement, sellAll, sellFish } from '../shared/rules.js';
import { FishingSession } from './fishing.js';
import { InputManager } from './input.js';
import { BUILDINGS, LAKE, movePlayer, nearbyInteraction } from './world.js';

declare function acquireVsCodeApi<T = unknown>(): {
  postMessage(message: WebviewToHostMessage): void;
  getState(): T | undefined;
  setState(state: T): void;
};

const vscode = acquireVsCodeApi<GameSaveV1>();
const canvas = required<HTMLCanvasElement>('gameCanvas');
const canvasContext = canvas.getContext('2d');
if (!canvasContext) throw new Error('Canvas 2D is unavailable');
const context: CanvasRenderingContext2D = canvasContext;
const input = new InputManager(window);
const fishing = new FishingSession();

let state = createDefaultSave();
let initialized = false;
let lastFrame = performance.now();
let lastAutoCatch = Date.now();
let lastPositionSave = 0;
let toastTimer = 0;
let overlay: 'inventory' | 'market' | undefined;
let interaction = nearbyInteraction(state.player);

const prompt = required<HTMLElement>('prompt');
const toast = required<HTMLElement>('toast');
const fishingControls = required<HTMLElement>('fishingControls');
const fishingStatus = required<HTMLElement>('fishingStatus');
const fishingMeter = required<HTMLElement>('fishingMeter');
const castButton = required<HTMLButtonElement>('castButton');
const autoButton = required<HTMLButtonElement>('autoButton');
const inventoryPanel = required<HTMLElement>('inventoryPanel');
const marketPanel = required<HTMLElement>('marketPanel');

required('inventoryButton').addEventListener('click', () => toggleInventory());
required('resetButton').addEventListener('click', () => vscode.postMessage({ type: 'resetState' }));
castButton.addEventListener('click', () => fishingAction());
autoButton.addEventListener('click', () => toggleAuto());
required('villageButton').addEventListener('click', () => enterVillage());
required('sellAllButton').addEventListener('click', () => {
  const earned = sellAll(state);
  showToast(earned ? `Sold everything for ${earned} coins!` : 'Your fishing bag is empty.');
  updateUi();
  saveNow();
});
document.querySelectorAll<HTMLElement>('[data-close]').forEach((button) => button.addEventListener('click', closeOverlay));
canvas.addEventListener('pointerdown', () => canvas.focus());

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  if (event.data.type !== 'loadState' && event.data.type !== 'resetState') return;
  state = sanitizeSave(event.data.state);
  // Starting the clock here deliberately prevents closed-panel/offline rewards.
  lastAutoCatch = Date.now();
  fishing.reset();
  overlay = undefined;
  initialized = true;
  vscode.setState(state);
  updateUi();
  if (event.data.type === 'resetState') showToast('Progress reset. A fresh adventure begins!');
  canvas.focus();
});

vscode.postMessage({ type: 'webviewReady' });
requestAnimationFrame(frame);

function frame(now: number): void {
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (initialized) {
    handleInput();
    update(delta, now);
    render(now);
  }
  requestAnimationFrame(frame);
}

function handleInput(): void {
  if (input.consume('escape')) {
    if (overlay) closeOverlay();
    else if (state.scene === 'fishing') enterVillage();
  }
  if (input.consume('i')) toggleInventory();
  if (overlay) return;
  if (state.scene === 'village' && input.consume('e')) interact();
  if (state.scene === 'fishing' && input.consume(' ')) fishingAction();
}

function update(delta: number, now: number): void {
  if (state.scene === 'village' && !overlay) {
    const direction = normalizedMovement(
      Number(input.isHeld('d')) - Number(input.isHeld('a')),
      Number(input.isHeld('s')) - Number(input.isHeld('w')),
    );
    if (direction.x || direction.y) {
      state.player = { ...state.player, ...movePlayer(state.player, direction.x * 155 * delta, direction.y * 155 * delta) };
      interaction = nearbyInteraction(state.player);
      if (Date.now() - lastPositionSave > 1500) {
        lastPositionSave = Date.now();
        saveNow();
      }
    }
  }

  if (state.scene === 'fishing' && !state.fishing.autoEnabled) {
    const event = fishing.update(now);
    if (event === 'bite') showToast('A fish is biting! Reel it in!');
    if (event === 'miss') showToast('The fish got away.');
  }

  if (state.scene === 'fishing' && state.fishing.autoEnabled) {
    const elapsed = Date.now() - lastAutoCatch;
    if (elapsed >= 10_000) {
      const catches = Math.min(10, Math.floor(elapsed / 10_000));
      lastAutoCatch += catches * 10_000;
      for (let index = 0; index < catches; index += 1) catchFish(true);
    }
  }
  updateFishingUi(now);
}

function fishingAction(): void {
  if (overlay || state.scene !== 'fishing' || state.fishing.autoEnabled) return;
  const now = performance.now();
  if (fishing.phase === 'bite') {
    if (fishing.reel(now)) catchFish(false);
  } else if (fishing.cast(now, Math.random)) {
    updateFishingUi(now);
  }
}

function catchFish(auto: boolean): void {
  const fish = chooseFish(Math.random());
  const result = awardCatch(state, fish);
  const prefix = auto ? 'Auto caught' : 'Caught';
  showToast(result.stored ? `${prefix} a ${fish.name}! +${fish.xp} XP, +1 coin` : `${fish.name} released — bag full! XP and coin awarded.`);
  if (result.leveled) window.setTimeout(() => showToast(`Level up! Player ${state.player.level} · Fishing ${state.fishing.level}`), 900);
  updateUi();
  saveNow();
}

function toggleAuto(): void {
  if (state.scene !== 'fishing') return;
  state.fishing.autoEnabled = !state.fishing.autoEnabled;
  lastAutoCatch = Date.now();
  fishing.reset();
  showToast(state.fishing.autoEnabled ? 'Auto fishing started — one catch every 10 seconds.' : 'Auto fishing stopped.');
  updateUi();
  saveNow();
}

function interact(): void {
  interaction = nearbyInteraction(state.player);
  if (!interaction) return;
  if (interaction.kind === 'lake') {
    state.scene = 'fishing';
    fishing.reset();
    lastAutoCatch = Date.now();
    updateUi();
    saveNow();
  } else if (interaction.kind === 'market') {
    overlay = 'market';
    updateUi();
  } else {
    showToast(interaction.label);
  }
}

function enterVillage(): void {
  state.scene = 'village';
  state.fishing.autoEnabled = false;
  fishing.reset();
  overlay = undefined;
  interaction = nearbyInteraction(state.player);
  updateUi();
  saveNow();
  canvas.focus();
}

function toggleInventory(): void {
  overlay = overlay === 'inventory' ? undefined : 'inventory';
  updateUi();
}

function closeOverlay(): void {
  overlay = undefined;
  updateUi();
  canvas.focus();
}

function saveNow(): void {
  const clean = sanitizeSave(state);
  vscode.setState(clean);
  vscode.postMessage({ type: 'saveState', state: clean });
}

function updateUi(): void {
  required('levelStat').textContent = `Lv. ${state.player.level}`;
  required('xpStat').textContent = `XP ${state.player.xp}/${state.player.level * 100}`;
  required('fishingStat').textContent = `Fishing ${state.fishing.level}`;
  required('coinStat').textContent = `Coins ${state.coins}`;
  required('bagStat').textContent = `Bag ${inventoryCount(state)}/${state.inventoryCapacity}`;
  fishingControls.classList.toggle('hidden', state.scene !== 'fishing' || Boolean(overlay));
  inventoryPanel.classList.toggle('hidden', overlay !== 'inventory');
  marketPanel.classList.toggle('hidden', overlay !== 'market');
  prompt.classList.toggle('visible', state.scene === 'village' && !overlay && Boolean(interaction));
  prompt.textContent = interaction?.label ?? '';
  autoButton.textContent = `Auto Fish: ${state.fishing.autoEnabled ? 'On' : 'Off'}`;
  autoButton.classList.toggle('primary', state.fishing.autoEnabled);
  castButton.disabled = state.fishing.autoEnabled || fishing.phase === 'waiting';
  renderInventory();
  renderMarket();
}

function updateFishingUi(now: number): void {
  if (state.scene !== 'fishing') return;
  if (state.fishing.autoEnabled) {
    const progress = Math.min(1, (Date.now() - lastAutoCatch) / 10_000);
    fishingStatus.textContent = `Auto fishing… next catch in ${Math.max(1, Math.ceil((10_000 - (Date.now() - lastAutoCatch)) / 1000))}s`;
    fishingMeter.style.width = `${progress * 100}%`;
    castButton.textContent = 'Auto Fishing Active';
    return;
  }
  const labels = {
    ready: 'The water is calm. Cast when ready.',
    waiting: 'Keep still… watch the float.',
    bite: 'BITE! Press Space or Reel now!',
    caught: 'Nice catch!',
    missed: 'Too slow — try another cast.',
  };
  fishingStatus.textContent = labels[fishing.phase];
  if (fishing.phase === 'waiting') {
    const total = fishing.biteAt - fishing.phaseStarted;
    fishingMeter.style.width = `${Math.min(94, ((now - fishing.phaseStarted) / total) * 94)}%`;
  } else if (fishing.phase === 'bite') {
    fishingMeter.style.width = `${Math.max(0, 100 - ((now - fishing.phaseStarted) / 1200) * 100)}%`;
  } else fishingMeter.style.width = '0%';
  castButton.textContent = fishing.phase === 'bite' ? 'Reel Now! Space' : 'Cast Line Space';
  castButton.disabled = fishing.phase === 'waiting';
}

function renderInventory(): void {
  required('inventoryList').innerHTML = FISH.map((fish) => fishRow(fish, false)).join('') || '<p>Your bag is empty.</p>';
}

function renderMarket(): void {
  const list = required('marketList');
  list.innerHTML = FISH.map((fish) => fishRow(fish, true)).join('');
  list.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.sell as FishId;
      const earned = sellFish(state, id);
      showToast(earned ? `Sold the stack for ${earned} coins!` : 'You have none to sell.');
      updateUi();
      saveNow();
    });
  });
}

function fishRow(fish: FishDefinition, market: boolean): string {
  const quantity = state.inventory[fish.id];
  return `<div class="fishRow"><div><strong>${fish.name}</strong><div class="fishMeta rarity-${fish.rarity}">${fish.rarity} · ${fish.value} coins each</div></div><strong>× ${quantity}</strong>${market ? `<button data-sell="${fish.id}" ${quantity ? '' : 'disabled'}>Sell ${quantity ? quantity * fish.value : ''}</button>` : '<span></span>'}</div>`;
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function render(now: number): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (state.scene === 'village') renderVillage(now);
  else renderFishing(now);
}

function renderVillage(now: number): void {
  context.fillStyle = '#75a85f'; context.fillRect(0, 0, 960, 540);
  // Soft checker tiles create texture without external assets.
  for (let y = 0; y < 540; y += 32) for (let x = 0; x < 960; x += 32) {
    if ((x / 32 + y / 32) % 2 === 0) { context.fillStyle = '#79ad63'; context.fillRect(x, y, 32, 32); }
  }
  context.fillStyle = '#c8aa72'; context.fillRect(260, 0, 70, 540); context.fillRect(630, 0, 70, 540); context.fillRect(0, 255, 960, 55);
  drawLake(now);
  BUILDINGS.forEach(drawBuilding);
  for (let x = 18; x < 960; x += 42) { drawTree(x, 18); drawTree(x, 520); }
  for (let y = 55; y < 520; y += 48) { drawTree(18, y); drawTree(942, y); }
  drawPlayer(state.player.x, state.player.y, now);
  context.fillStyle = '#fff7d7'; context.font = 'bold 14px Segoe UI'; context.textAlign = 'center';
  context.fillText('WILLOW LAKE', LAKE.x + LAKE.width / 2, LAKE.y - 12);
}

function drawLake(now: number): void {
  context.fillStyle = '#315f76'; roundRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 42); context.fill();
  context.strokeStyle = '#72bdd0'; context.lineWidth = 4; context.stroke();
  context.strokeStyle = '#5ba3bb'; context.lineWidth = 2;
  for (let row = 0; row < 4; row += 1) {
    const shift = Math.sin(now / 700 + row) * 12;
    context.beginPath(); context.moveTo(LAKE.x + 35 + shift, LAKE.y + 38 + row * 35); context.lineTo(LAKE.x + 100 + shift, LAKE.y + 38 + row * 35); context.stroke();
  }
}

function drawBuilding(building: typeof BUILDINGS[number]): void {
  context.fillStyle = '#4c392e'; context.fillRect(building.x - 8, building.y - 17, building.width + 16, 27);
  context.fillStyle = building.color; context.fillRect(building.x, building.y, building.width, building.height);
  context.fillStyle = '#573a29'; context.fillRect(building.x + building.width / 2 - 14, building.y + building.height - 38, 28, 38);
  context.fillStyle = '#f4d987'; context.fillRect(building.x + 18, building.y + 28, 24, 23); context.fillRect(building.x + building.width - 42, building.y + 28, 24, 23);
  context.fillStyle = '#fff4d0'; context.font = 'bold 14px Segoe UI'; context.textAlign = 'center'; context.fillText(building.name, building.x + building.width / 2, building.y - 24);
  if (building.locked) {
    context.fillStyle = '#17151acc'; context.fillRect(building.x, building.y, building.width, building.height);
    context.fillStyle = '#dbc58c'; context.font = 'bold 25px Segoe UI'; context.fillText('🔒', building.x + building.width / 2, building.y + 63);
  }
}

function drawPlayer(x: number, y: number, now: number): void {
  const bob = Math.sin(now / 130) * (input.isHeld('w') || input.isHeld('a') || input.isHeld('s') || input.isHeld('d') ? 2 : .5);
  context.fillStyle = '#20263166'; context.beginPath(); context.ellipse(x, y + 13, 14, 6, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#46755a'; context.fillRect(x - 11, y - 4 + bob, 22, 22);
  context.fillStyle = '#f3c79f'; context.fillRect(x - 9, y - 20 + bob, 18, 17);
  context.fillStyle = '#5a352a'; context.fillRect(x - 11, y - 23 + bob, 22, 7);
  context.fillStyle = '#252026'; context.fillRect(x - 6, y - 14 + bob, 3, 3); context.fillRect(x + 4, y - 14 + bob, 3, 3);
}

function drawTree(x: number, y: number): void {
  context.fillStyle = '#56412d'; context.fillRect(x - 5, y - 2, 10, 20);
  context.fillStyle = '#315c3b'; context.beginPath(); context.arc(x, y - 4, 19, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#4b7c48'; context.beginPath(); context.arc(x - 6, y - 10, 11, 0, Math.PI * 2); context.fill();
}

function renderFishing(now: number): void {
  const sky = context.createLinearGradient(0, 0, 0, 540); sky.addColorStop(0, '#547e9a'); sky.addColorStop(.55, '#b8b87f'); sky.addColorStop(.56, '#376f77'); sky.addColorStop(1, '#173d52');
  context.fillStyle = sky; context.fillRect(0, 0, 960, 540);
  context.fillStyle = '#263f34'; context.beginPath(); context.moveTo(0, 290); context.lineTo(150, 165); context.lineTo(290, 285); context.lineTo(430, 130); context.lineTo(610, 280); context.lineTo(780, 160); context.lineTo(960, 275); context.lineTo(960, 320); context.lineTo(0, 320); context.fill();
  context.strokeStyle = '#72aab3'; context.lineWidth = 2;
  for (let y = 330; y < 520; y += 32) { const shift = Math.sin(now / 500 + y) * 22; context.beginPath(); context.moveTo(70 + shift, y); context.lineTo(300 + shift, y); context.stroke(); context.beginPath(); context.moveTo(550 - shift, y + 10); context.lineTo(810 - shift, y + 10); context.stroke(); }
  context.fillStyle = '#40342d'; context.fillRect(60, 375, 270, 38); context.fillRect(95, 410, 18, 90); context.fillRect(280, 410, 18, 90);
  drawPlayer(190, 355, now);
  context.fillStyle = '#f9e7b5'; context.font = 'bold 30px Georgia'; context.textAlign = 'center'; context.fillText('Willow Lake', 480, 62);
  if (fishing.phase === 'bite' && !state.fishing.autoEnabled) {
    context.fillStyle = '#ffdc6a'; context.font = 'bold 44px Segoe UI'; context.fillText('!', 590, 350 + Math.sin(now / 60) * 8);
  }
}

function roundRect(x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
}

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}
