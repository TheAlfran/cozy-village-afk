import './styles.css';
import {
  FISH,
  BAITS,
  EQUIPMENT,
  EQUIPMENT_SLOTS,
  GEAR_SETS,
  MATERIALS,
  MAX_ENHANCEMENT,
  RODS,
  createDefaultSave,
  sanitizeSave,
  type FishDefinition,
  type FishId,
  type BaitId,
  type EquipmentItemId,
  type EquipmentDefinition,
  type EnhanceableId,
  type MaterialId,
  type GearSetId,
  type RodId,
  type GameSaveV1,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  MAPS,
} from '../shared/model.js';
import { activeBait, awardCatch, buyBait, buyEquipment, buyGearSet, buyRod, chooseFish, consumeBait, effectiveInventoryCapacity, effectiveRodStats, enhanceItem, enhancementChance, enhancementCost, equipmentBonus, equipGearSet, equipRod, gearSetItems, inventoryCount, normalizedMovement, selectBait, sellAll, sellFish } from '../shared/rules.js';
import { catchZoneWidth, escapeWindowMs, FishingSession, markerCycleMs } from './fishing.js';
import { InputManager } from './input.js';
import { CozyPhaserGame } from './phaserGame.js';
import { AREA_ONE_SPAWN, BUILDINGS, LAKE, SAFE_SPAWN, ensureSafePosition, PortalEntryTracker, movePlayer, nearbyInteraction, type PortalKind } from './world.js';

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
context.imageSmoothingEnabled = false;
const input = new InputManager(window);
const fishing = new FishingSession();

let state = createDefaultSave();
let initialized = false;
let active = true;
let playerFacing: 'up' | 'down' | 'left' | 'right' = 'down';
let playerMoving = false;
let lastFrame = performance.now();
let lastAutoCatch = Date.now();
let lastPositionSave = 0;
let toastTimer = 0;
let overlay: 'inventory' | 'market' | 'rodShop' | 'equipmentShop' | 'blacksmith' | 'fishGuide' | 'catch' | 'fishingAreas' | undefined;
let shopTab: 'rods' | 'bait' = 'rods';
let equipmentTab: 'gear' | 'accessories' = 'gear';
let blacksmithTab: 'rods' | 'gear' | 'accessories' = 'rods';
let pendingFish: FishDefinition | undefined;
let catchResult: { fish: FishDefinition; stored: boolean; material?: MaterialId } | undefined;
const portalEntries = new PortalEntryTracker();
let interaction = nearbyInteraction(state.player);

const prompt = required<HTMLElement>('prompt');
const toast = required<HTMLElement>('toast');
const fishingControls = required<HTMLElement>('fishingControls');
const fishingStatus = required<HTMLElement>('fishingStatus');
const fishingMeter = required<HTMLElement>('fishingMeter');
const fishingTarget = required<HTMLElement>('fishingTarget');
const fishingMarker = required<HTMLElement>('fishingMarker');
const castButton = required<HTMLButtonElement>('castButton');
const autoButton = required<HTMLButtonElement>('autoButton');
const inventoryPanel = required<HTMLElement>('inventoryPanel');
const marketPanel = required<HTMLElement>('marketPanel');
const rodShopPanel = required<HTMLElement>('rodShopPanel');
const equipmentShopPanel = required<HTMLElement>('equipmentShopPanel');
const blacksmithPanel = required<HTMLElement>('blacksmithPanel');
const fishGuidePanel = required<HTMLElement>('fishGuidePanel');
const catchPanel = required<HTMLElement>('catchPanel');
const fishingAreasPanel = required<HTMLElement>('fishingAreasPanel');
const inactiveNotice = required<HTMLElement>('inactiveNotice');
const characterPortrait = required<HTMLCanvasElement>('characterPortrait');
const characterPortraitContext = characterPortrait.getContext('2d');
const portraitImage = new Image();

required('expandButton').addEventListener('click', () => {
  saveNow();
  vscode.postMessage({ type: 'openFullscreen' });
});
required('inventoryButton').addEventListener('click', () => toggleInventory());
required('blacksmithButton').addEventListener('click', () => openBlacksmith(false));
required('resetButton').addEventListener('click', () => vscode.postMessage({ type: 'resetState' }));
castButton.addEventListener('click', () => fishingAction());
autoButton.addEventListener('click', () => toggleAuto());
required('villageButton').addEventListener('click', () => enterVillage());
required('continueFishingButton').addEventListener('click', () => continueManualFishing());
required('areaOneButton').addEventListener('click', () => enterFishingAreaOne());
document.querySelectorAll<HTMLButtonElement>('[data-shop-tab]').forEach((button) => button.addEventListener('click', () => {
  shopTab = button.dataset.shopTab === 'bait' ? 'bait' : 'rods';
  renderShopTabs();
}));
document.querySelectorAll<HTMLButtonElement>('[data-equipment-tab]').forEach((button) => button.addEventListener('click', () => {
  equipmentTab = button.dataset.equipmentTab === 'accessories' ? 'accessories' : 'gear';
  renderEquipmentShopTabs();
}));
document.querySelectorAll<HTMLButtonElement>('[data-blacksmith-tab]').forEach((button) => button.addEventListener('click', () => {
  blacksmithTab = button.dataset.blacksmithTab as typeof blacksmithTab;
  updateUi();
}));
required('sellAllButton').addEventListener('click', () => {
  const earned = sellAll(state);
  showToast(earned ? `Sold everything for ${earned} coins!` : 'Your fishing bag is empty.');
  updateUi();
  saveNow();
});
document.querySelectorAll<HTMLElement>('[data-close]').forEach((button) => button.addEventListener('click', closeOverlay));
canvas.addEventListener('pointerdown', () => canvas.focus());

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  if (event.data.type === 'setActive') {
    active = event.data.active;
    lastAutoCatch = Date.now();
    input.clear();
    inactiveNotice.classList.toggle('hidden', active);
    if (active) canvas.focus();
    return;
  }
  if (event.data.type !== 'loadState' && event.data.type !== 'resetState') return;
  state = sanitizeSave(event.data.state);
  const safePosition = ensureSafePosition(state.player, state.location);
  const repairedPosition = safePosition.x !== state.player.x || safePosition.y !== state.player.y;
  state.player = { ...state.player, ...safePosition };
  interaction = nearbyInteraction(state.player, state.location);
  portalEntries.reset();
  input.clear();
  playerMoving = false;
  // Starting the clock here deliberately prevents closed-panel/offline rewards.
  lastAutoCatch = Date.now();
  fishing.reset();
  pendingFish = undefined;
  catchResult = undefined;
  overlay = undefined;
  initialized = true;
  vscode.setState(state);
  updateUi();
  if (event.data.type === 'resetState') showToast('Progress reset. A fresh adventure begins!');
  else if (repairedPosition) {
    showToast('Moved you to a safe path so movement works again.');
    saveNow();
  }
  if (active) canvas.focus();
});

const playerSpriteUrl = canvas.dataset.playerSprite;
if (!playerSpriteUrl) throw new Error('Player sprite URL is unavailable');
portraitImage.src = playerSpriteUrl;
portraitImage.addEventListener('load', renderCharacterPortrait);
const phaserGame = new CozyPhaserGame(canvas, playerSpriteUrl, {
  tick: (delta) => {
    if (!initialized || !active) return;
    handleInput();
    update(delta, performance.now());
  },
  snapshot: () => ({
    scene: state.scene,
    location: state.location,
    player: { x: state.player.x, y: state.player.y },
    facing: playerFacing,
    moving: playerMoving,
    fishingPhase: fishing.phase,
    autoFishing: state.fishing.autoEnabled,
  }),
  lakeClick: () => handleLakeClick(),
  fishGuideClick: () => handleFishGuideClick(),
  portalClick: () => handleFishingPortalClick(),
});
window.addEventListener('beforeunload', () => phaserGame.destroy(), { once: true });
vscode.postMessage({ type: 'webviewReady' });

function frame(now: number): void {
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (initialized && active) {
    handleInput();
    update(delta, now);
    render(now);
  }
  requestAnimationFrame(frame);
}

function handleInput(): void {
  // Consume every action edge, including while a modal is open, so nothing fires later.
  const escape = input.consume('escape');
  const space = input.consume(' ');
  const interactKey = input.consume('e');
  const inventoryAlias = input.consume('i');
  const auto = input.consume('f');
  if (escape) {
    if (overlay && overlay !== 'catch') {
      closeOverlay();
      return;
    }
    if (state.scene === 'fishing') {
      enterVillage();
      return;
    }
    if (overlay) closeOverlay();
    return;
  }
  if (overlay === 'catch') {
    if (space) continueManualFishing();
    return;
  }
  if (overlay === 'fishingAreas') return;
  if (state.scene === 'village' && interactKey && nearbyInteraction(state.player, state.location)?.kind === 'rodShop') {
    openRodShop();
    return;
  }
  if (state.scene === 'village' && interactKey && nearbyInteraction(state.player, state.location)?.kind === 'equipmentShop') {
    openEquipmentShop();
    return;
  }
  if (state.scene === 'village' && interactKey && nearbyInteraction(state.player, state.location)?.kind === 'blacksmith') {
    openBlacksmith(true);
    return;
  }
  if (state.scene === 'village' && interactKey && nearbyInteraction(state.player, state.location)?.kind === 'fishGuide') {
    openFishGuide();
    return;
  }
  if (interactKey || inventoryAlias) {
    toggleInventory();
    return;
  }
  if (overlay) return;
  if (state.scene === 'village') {
    if (space) interact();
  } else {
    if (space) fishingAction();
    if (auto) toggleAuto();
  }
}

function update(delta: number, now: number): void {
  if (state.scene === 'village' && !overlay) {
    const direction = normalizedMovement(
      Number(input.isHeld('d')) - Number(input.isHeld('a')),
      Number(input.isHeld('s')) - Number(input.isHeld('w')),
    );
    playerMoving = false;
    if (direction.x || direction.y) {
      if (Math.abs(direction.x) > Math.abs(direction.y)) playerFacing = direction.x > 0 ? 'right' : 'left';
      else playerFacing = direction.y > 0 ? 'down' : 'up';
      const previousPosition = state.player;
      const speed = 155 * (1 + equipmentBonus(state, 'speed'));
      const nextPosition = movePlayer(state.player, direction.x * speed * delta, direction.y * speed * delta, state.location);
      playerMoving = Math.abs(nextPosition.x - previousPosition.x) > 0.01
        || Math.abs(nextPosition.y - previousPosition.y) > 0.01;
      state.player = { ...state.player, ...nextPosition };
      interaction = nearbyInteraction(state.player, state.location);
      if (Date.now() - lastPositionSave > 1500) {
        lastPositionSave = Date.now();
        saveNow();
      }
    }
  } else {
    playerMoving = false;
  }

  if (state.scene === 'village' && !overlay) {
    const entered = portalEntries.update(state.player, state.location);
    if (entered) activatePortal(entered);
  }
  updatePrompt();

  if (state.scene === 'fishing' && !state.fishing.autoEnabled) {
    if (fishing.update(now) === 'escape') {
      pendingFish = undefined;
      showToast('The fish got away!');
    }
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
  if (fishing.phase === 'waiting') {
    const hookedFish = pendingFish;
    pendingFish = undefined;
    if (fishing.reel(now)) {
      catchFish(false, hookedFish);
    }
    else {
      showToast('Missed the catch zone - try again!');
      updateFishingUi(now);
    }
  } else {
    startManualRound(now);
  }
}

function startManualRound(now: number): void {
  const hookedFish = chooseFish(Math.random(), activeBait(state), equipmentBonus(state, 'luck'), state.equippedRod);
  const rod = effectiveRodStats(state);
  if (!fishing.cast(
    now,
    Math.random,
    catchZoneWidth(hookedFish.rarity) + rod.zoneBonus + equipmentBonus(state, 'zone'),
    markerCycleMs(hookedFish.rarity) + rod.cycleBonusMs,
    escapeWindowMs(hookedFish.rarity) + rod.escapeBonusMs,
  )) return;
  consumeBait(state);
  pendingFish = hookedFish;
  updateFishingUi(now);
  updateUi();
  saveNow();
}

function catchFish(auto: boolean, hookedFish?: FishDefinition): void {
  const fish = hookedFish ?? chooseFish(Math.random(), auto ? activeBait(state) : undefined, equipmentBonus(state, 'luck'), state.equippedRod);
  if (auto) consumeBait(state);
  const result = awardCatch(state, fish);
  const rod = effectiveRodStats(state);
  if (!auto) {
    catchResult = { fish, stored: result.stored, material: result.material };
    overlay = 'catch';
  }
  const prefix = auto ? 'Auto caught' : 'Caught';
  const foundMaterial = result.material ? ` Found ${MATERIALS.find((item) => item.id === result.material)?.name}!` : '';
  showToast(result.stored ? `${prefix} a ${fish.name}! +${fish.xp + rod.xpBonus + equipmentBonus(state, 'xp')} XP, +1 coin.${foundMaterial}` : `${fish.name} released — bag full! XP and coin awarded.`);
  if (result.leveled) window.setTimeout(() => showToast(`Level up! Player ${state.player.level} · Fishing ${state.fishing.level}`), 900);
  updateUi();
  saveNow();
}

function continueManualFishing(): void {
  if (overlay !== 'catch' || state.scene !== 'fishing') return;
  overlay = undefined;
  catchResult = undefined;
  updateUi();
  startManualRound(performance.now());
  canvas.focus();
}

function toggleAuto(): void {
  if (state.scene !== 'fishing') return;
  state.fishing.autoEnabled = !state.fishing.autoEnabled;
  lastAutoCatch = Date.now();
  fishing.reset();
  pendingFish = undefined;
  catchResult = undefined;
  showToast(state.fishing.autoEnabled ? 'Auto fishing started — one catch every 10 seconds.' : 'Auto fishing stopped.');
  updateUi();
  saveNow();
}

function interact(): void {
  interaction = nearbyInteraction(state.player, state.location);
  if (!interaction) return;
  if (interaction.kind === 'lake') {
    // Space at the shore equips the rod and immediately starts the timing bar.
    startFishing(true);
  } else if (interaction.kind === 'fishingPortal') {
    activatePortal('fishingPortal');
  } else if (interaction.kind === 'returnPortal') {
    activatePortal('returnPortal');
  } else if (interaction.kind === 'fishGuide') {
    openFishGuide();
  } else if (interaction.kind === 'equipmentShop') {
    openEquipmentShop();
  } else if (interaction.kind === 'blacksmith') {
    openBlacksmith(true);
  } else {
    showToast(interaction.label);
  }
}

function enterFishingAreaOne(): void {
  if (overlay !== 'fishingAreas' || state.location !== 'hub') return;
  teleportPlayer('area1', AREA_ONE_SPAWN, 'Entered Fishing Area 1.');
}

function handleFishingPortalClick(): void {
  if (!initialized || !active || overlay || state.scene !== 'village') return;
  interaction = nearbyInteraction(state.player, state.location);
  if (interaction?.kind !== 'fishingPortal' && interaction?.kind !== 'returnPortal') {
    showToast('Walk closer to the portal.');
    return;
  }
  activatePortal(interaction.kind);
}

function activatePortal(kind: PortalKind): void {
  if (overlay || state.scene !== 'village') return;
  if (kind === 'fishingPortal' && state.location === 'hub') {
    portalEntries.update(state.player, state.location);
    overlay = 'fishingAreas';
    playerMoving = false;
    input.clear();
    updateUi();
    required('areaOneButton').focus();
  } else if (kind === 'returnPortal' && state.location === 'area1') {
    teleportPlayer('hub', SAFE_SPAWN, 'Returned to the village hub.');
  }
}

function teleportPlayer(location: GameSaveV1['location'], destination: { x: number; y: number }, message: string): void {
  state.scene = 'village';
  state.location = location;
  state.fishing.autoEnabled = false;
  fishing.reset();
  pendingFish = undefined;
  catchResult = undefined;
  overlay = undefined;
  state.player = { ...state.player, ...ensureSafePosition(destination, location) };
  interaction = nearbyInteraction(state.player, state.location);
  portalEntries.reset();
  input.clear();
  playerMoving = false;
  playerFacing = 'down';
  updateUi();
  saveNow();
  showToast(message);
  canvas.focus();
}

function handleLakeClick(): void {
  if (overlay) return;
  if (state.scene === 'fishing') {
    fishingAction();
    return;
  }
  interaction = nearbyInteraction(state.player, state.location);
  if (interaction?.kind !== 'lake') {
    showToast('Walk closer to the lake to fish.');
    return;
  }
  startFishing(true);
}

function handleFishGuideClick(): void {
  if (!initialized || !active || overlay || state.scene !== 'village' || state.location !== 'area1') return;
  if (nearbyInteraction(state.player, state.location)?.kind !== 'fishGuide') {
    showToast('Walk closer to the fish guide sign.');
    return;
  }
  openFishGuide();
}

function startFishing(castImmediately: boolean): void {
  if (state.location !== 'area1') return;
  state.scene = 'fishing';
  fishing.reset();
  pendingFish = undefined;
  catchResult = undefined;
  lastAutoCatch = Date.now();
  faceLake();
  updateUi();
  if (castImmediately) fishingAction();
  saveNow();
}

function faceLake(): void {
  const lakeCenterX = LAKE.x + LAKE.width / 2;
  const lakeCenterY = LAKE.y + LAKE.height / 2;
  const dx = lakeCenterX - state.player.x;
  const dy = lakeCenterY - state.player.y;
  playerFacing = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
}

function enterVillage(): void {
  state.scene = 'village';
  state.fishing.autoEnabled = false;
  fishing.reset();
  pendingFish = undefined;
  catchResult = undefined;
  overlay = undefined;
  interaction = nearbyInteraction(state.player, state.location);
  updateUi();
  saveNow();
  canvas.focus();
}

function toggleInventory(): void {
  if (overlay === 'fishingAreas') return;
  overlay = overlay === 'inventory' ? undefined : 'inventory';
  updateUi();
}

function openRodShop(): void {
  if (state.scene !== 'village' || state.location !== 'hub') return;
  if (nearbyInteraction(state.player, state.location)?.kind !== 'rodShop') return;
  overlay = 'rodShop';
  input.clear();
  updateUi();
  rodShopPanel.querySelector<HTMLButtonElement>('button[data-close]')?.focus();
}

function openEquipmentShop(): void {
  if (state.scene !== 'village' || state.location !== 'hub') return;
  if (nearbyInteraction(state.player, state.location)?.kind !== 'equipmentShop') return;
  overlay = 'equipmentShop';
  input.clear();
  updateUi();
  equipmentShopPanel.querySelector<HTMLButtonElement>('button[data-close]')?.focus();
}

function openBlacksmith(requireNearby: boolean): void {
  if (overlay === 'fishingAreas' || overlay === 'catch') return;
  if (requireNearby && (state.scene !== 'village' || state.location !== 'hub'
    || nearbyInteraction(state.player, state.location)?.kind !== 'blacksmith')) return;
  overlay = overlay === 'blacksmith' ? undefined : 'blacksmith';
  input.clear();
  updateUi();
  if (overlay === 'blacksmith') blacksmithPanel.querySelector<HTMLButtonElement>('button[data-close]')?.focus();
  else canvas.focus();
}

function openFishGuide(): void {
  if (state.scene !== 'village' || state.location !== 'area1') return;
  if (nearbyInteraction(state.player, state.location)?.kind !== 'fishGuide') return;
  overlay = 'fishGuide';
  input.clear();
  updateUi();
  fishGuidePanel.querySelector<HTMLButtonElement>('button[data-close]')?.focus();
}

function closeOverlay(): void {
  overlay = undefined;
  input.clear();
  updateUi();
  canvas.focus();
}

function saveNow(): void {
  const clean = sanitizeSave(state);
  vscode.setState(clean);
  vscode.postMessage({ type: 'saveState', state: clean });
}

function updateUi(): void {
  required('mapName').textContent = MAPS[state.location].name;
  const playerThreshold = state.player.level * 100;
  const fishingThreshold = state.fishing.level * 75;
  const inventoryUsed = inventoryCount(state);
  required('levelStat').textContent = String(state.player.level);
  required('xpStat').textContent = `${state.player.xp} / ${playerThreshold} XP`;
  required('xpBar').style.width = `${Math.min(100, state.player.xp / playerThreshold * 100)}%`;
  required('fishingStat').textContent = `Fishing Lv. ${state.fishing.level}`;
  required('fishingXpStat').textContent = `${state.fishing.xp} / ${fishingThreshold} XP`;
  required('fishingXpBar').style.width = `${Math.min(100, state.fishing.xp / fishingThreshold * 100)}%`;
  required('coinStat').textContent = String(state.coins);
  required('bagStat').textContent = `${inventoryUsed}/${effectiveInventoryCapacity(state)}`;
  const bait = activeBait(state);
  required('baitStatus').textContent = bait ? `${bait.name}: ${state.baitInventory[bait.id]} left · boosts ${bait.minRarity}+ fish` : 'No bait selected';
  fishingControls.classList.toggle('hidden', state.scene !== 'fishing' || Boolean(overlay));
  inventoryPanel.classList.toggle('hidden', overlay !== 'inventory');
  marketPanel.classList.toggle('hidden', overlay !== 'market');
  rodShopPanel.classList.toggle('hidden', overlay !== 'rodShop');
  equipmentShopPanel.classList.toggle('hidden', overlay !== 'equipmentShop');
  blacksmithPanel.classList.toggle('hidden', overlay !== 'blacksmith');
  fishGuidePanel.classList.toggle('hidden', overlay !== 'fishGuide');
  catchPanel.classList.toggle('hidden', overlay !== 'catch');
  fishingAreasPanel.classList.toggle('hidden', overlay !== 'fishingAreas');
  updatePrompt();
  autoButton.innerHTML = `Auto Fish: ${state.fishing.autoEnabled ? 'On' : 'Off'} <kbd>F</kbd>`;
  autoButton.classList.toggle('primary', state.fishing.autoEnabled);
  castButton.disabled = state.fishing.autoEnabled;
  renderCatchResult();
  renderInventory();
  renderMarket();
  renderRodShop();
  renderBaitShop();
  renderShopTabs();
  renderEquipmentShop();
  renderEquipmentShopTabs();
  renderBlacksmith();
  renderFishGuide();
}

function updatePrompt(): void {
  prompt.classList.toggle('visible', state.scene === 'village' && !overlay && Boolean(interaction));
  prompt.textContent = interaction?.label ?? '';
}

function renderCatchResult(): void {
  if (!catchResult) return;
  const { fish, stored, material } = catchResult;
  required('caughtFishName').textContent = fish.name;
  required('caughtFishRarity').textContent = fish.rarity;
  required('caughtFishRarity').className = `rarity-${fish.rarity}`;
  required('caughtFishValue').textContent = `${fish.value} coins`;
  required('caughtFishXp').textContent = `+${fish.xp + effectiveRodStats(state).xpBonus + equipmentBonus(state, 'xp')} XP`;
  required('caughtFishQuantity').textContent = stored ? `${state.inventory[fish.id]} stored` : 'Bag full';
  required('caughtFishOutcome').textContent = stored
    ? `Added to your inventory.${material ? ` Found ${MATERIALS.find((item) => item.id === material)?.name}!` : ''}`
    : 'Released because your fishing bag is full.';
}

function updateFishingUi(now: number): void {
  if (state.scene !== 'fishing') return;
  if (state.fishing.autoEnabled) {
    const progress = Math.min(1, (Date.now() - lastAutoCatch) / 10_000);
    fishingStatus.textContent = `Auto fishing… next catch in ${Math.max(1, Math.ceil((10_000 - (Date.now() - lastAutoCatch)) / 1000))}s`;
    fishingMeter.style.width = `${progress * 100}%`;
    fishingTarget.style.opacity = '0';
    fishingMarker.style.opacity = '0';
    castButton.innerHTML = 'Auto Fishing Active <kbd>F</kbd>';
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
    const speed = pendingFish && ['Rare', 'Epic', 'Legendary'].includes(pendingFish.rarity) ? 'Fast marker. ' : 'Slow marker. ';
    const rarity = pendingFish ? `${pendingFish.rarity} fish - ${speed}` : '';
    const secondsLeft = Math.max(0, (fishing.escapeAfterMs - (now - fishing.phaseStarted)) / 1000).toFixed(1);
    fishingStatus.textContent = `${rarity}${secondsLeft}s before it escapes. Press Space inside the catch zone!`;
  } else if (fishing.phase === 'missed') {
    fishingStatus.textContent = 'Missed the catch zone - press Space to try again.';
  }
  if (fishing.phase === 'waiting') {
    fishingMeter.style.width = '0%';
    fishingTarget.style.left = `${(fishing.targetCenter - fishing.targetWidth / 2) * 100}%`;
    fishingTarget.style.width = `${fishing.targetWidth * 100}%`;
    fishingTarget.style.opacity = '1';
    fishingMarker.style.left = `${fishing.markerPosition(now) * 100}%`;
    fishingMarker.style.opacity = '1';
  } else {
    fishingMeter.style.width = '0%';
    fishingTarget.style.opacity = '0';
    fishingMarker.style.opacity = '0';
  }
  castButton.innerHTML = fishing.phase === 'waiting'
    ? 'Catch <kbd>Space</kbd>'
    : 'Fish <kbd>Space</kbd>';
  castButton.disabled = false;
}

function renderInventory(): void {
  const used = inventoryCount(state);
  required('characterLevel').textContent = String(state.player.level);
  required('characterFishing').textContent = String(state.fishing.level);
  required('characterCapacity').textContent = String(effectiveInventoryCapacity(state));
  required('inventoryUsage').textContent = `Fish ${used} / ${effectiveInventoryCapacity(state)}`;
  const loadout = EQUIPMENT.filter((item) => state.equipment[item.slot] === item.id).map((item) => item.name);
  required('characterLoadout').textContent = loadout.length ? loadout.join(' · ') : 'No equipment selected';
  const equippedRod = RODS.find((rod) => rod.id === state.equippedRod);
  required('equippedRodName').textContent = `${equippedRod?.name ?? 'Old Bamboo Pole'}${state.enhancements[state.equippedRod] ? ` +${state.enhancements[state.equippedRod]}` : ''}`;
  renderCharacterPortrait();
  renderEquipment();
  const inventoryList = required('inventoryList');
  const storedFish = FISH.filter((fish) => state.inventory[fish.id] > 0);
  const unequippedItems = EQUIPMENT.filter((item) =>
    state.ownedEquipment.includes(item.id) && state.equipment[item.slot] !== item.id);
  const stockedBait = BAITS.filter((bait) => state.baitInventory[bait.id] > 0);
  const foundMaterials = MATERIALS.filter((material) => state.materials[material.id] > 0);
  inventoryList.innerHTML = [
    ...unequippedItems.map((item) => `<button class="itemSlot inventoryEquipment" data-equip="${item.id}" aria-pressed="false" title="Equip ${item.name}">
      <span class="equipmentItemIcon">${item.symbol}</span><strong>${item.name}${state.enhancements[item.id] ? ` +${state.enhancements[item.id]}` : ''}</strong><span class="itemRarity">${item.slot}</span><span class="inventoryAction">Equip</span>
    </button>`),
    ...stockedBait.map((bait) => `<button class="itemSlot inventoryBait" data-inventory-bait="${bait.id}" title="Select ${bait.name}">
      <span class="itemIcon">&#x1FAB1;</span><strong>${bait.name}</strong><span class="itemRarity">${state.selectedBait === bait.id ? 'Selected' : 'Bait'}</span><b class="itemQuantity">${state.baitInventory[bait.id]}</b>
    </button>`),
    ...foundMaterials.map((material) => `<div class="itemSlot" title="Lake material for Blacksmith enhancements"><span class="equipmentItemIcon">${material.symbol}</span><strong>${material.name}</strong><span class="itemRarity">Material</span><b class="itemQuantity">${state.materials[material.id]}</b></div>`),
    ...storedFish.map((fish) => fishRow(fish, false)),
  ].join('') || '<p class="emptyInventory">No stored fish or unequipped equipment.</p>';
  inventoryList.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.equip as EquipmentItemId;
      const item = EQUIPMENT.find((candidate) => candidate.id === id);
      if (!item || !state.ownedEquipment.includes(id)) return;
      state.equipment[item.slot] = id;
      showToast(`${item.name} equipped.`);
      updateUi();
      saveNow();
    });
  });
  inventoryList.querySelectorAll<HTMLButtonElement>('[data-inventory-bait]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.inventoryBait as BaitId;
    if (!selectBait(state, id)) return;
    showToast(`${BAITS.find((bait) => bait.id === id)?.name ?? 'Bait'} selected.`);
    updateUi();
    saveNow();
  }));
}

function renderEquipment(): void {
  const grid = required('equipmentGrid');
  grid.innerHTML = '<div class="loadoutColumnTitle gearColumn">Gear</div><div class="loadoutColumnTitle accessoryColumn">Accessories</div>' + EQUIPMENT_SLOTS.map((slot) => {
    const equippedId = state.equipment[slot];
    const item = EQUIPMENT.find((candidate) => candidate.id === equippedId);
    if (!item) return `<button class="equipmentSlot slot-${slot} empty" disabled aria-label="Empty ${slot} slot">
      <span class="slotSymbol">+</span><span class="slotCopy"><strong>Empty ${slot}</strong></span>
    </button>`;
    return `<button class="equipmentSlot slot-${slot} equipped" data-equip="${item.id}" aria-pressed="true" aria-label="Unequip ${item.name} from ${slot}" title="${item.bonusLabel ?? item.description} · Click to unequip">
      <span class="slotSymbol">${item.symbol}</span><span class="slotCopy"><strong>${item.name}${state.enhancements[item.id] ? ` +${state.enhancements[item.id]}` : ''}</strong></span>
    </button>`;
  }).join('') + `<div class="equipmentSlot slot-bait selectedBaitSlot" title="Choose bait from Stored Items below">
    <span class="slotSymbol">BA</span><span class="slotCopy"><strong>${activeBait(state)?.name ?? 'No Bait'}</strong></span>
  </div>`;
  grid.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.equip as EquipmentItemId;
    const item = EQUIPMENT.find((candidate) => candidate.id === id);
    if (!item || !state.ownedEquipment.includes(id)) return;
    if (state.equipment[item.slot] !== id) return;
    state.equipment[item.slot] = null;
    showToast(`${item.name} moved to inventory.`);
    updateUi();
    saveNow();
  }));
}

function renderCharacterPortrait(): void {
  if (!characterPortraitContext || !portraitImage.complete || !portraitImage.naturalWidth) return;
  characterPortraitContext.clearRect(0, 0, characterPortrait.width, characterPortrait.height);
  characterPortraitContext.imageSmoothingEnabled = false;
  characterPortraitContext.drawImage(portraitImage, 228, 4, 200, 264, 4, 4, 96, 127);
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

function renderRodShop(): void {
  required('shopCoinStat').textContent = String(state.coins);
  const list = required('rodShopList');
  list.innerHTML = RODS.map((rod) => {
    const owned = state.ownedRods.includes(rod.id);
    const equipped = state.equippedRod === rod.id;
    const enhancement = state.enhancements[rod.id] ?? 0;
    const action = equipped ? 'Equipped' : owned ? 'Equip' : `Buy · ${rod.price} coins`;
    return `<div class="rodRow rarityBorder-${rod.grade}">
      <div class="rodInfo"><strong>${rod.name}${state.enhancements[rod.id] ? ` +${state.enhancements[rod.id]}` : ''}</strong><span class="rarity-${rod.grade}">${rod.grade}</span>
        <small>${rod.description}</small>
        <small>Catch zone +${((rod.zoneBonus + enhancement * 0.005) * 100).toFixed(1)}% · Reel +${rod.cycleBonusMs + enhancement * 30} ms · Escape +${rod.escapeBonusMs + enhancement * 80} ms · Catch XP +${rod.xpBonus + enhancement}</small></div>
      <button data-rod="${rod.id}" ${equipped || (!owned && state.coins < rod.price) ? 'disabled' : ''}>${action}</button>
    </div>`;
  }).join('');
  list.querySelectorAll<HTMLButtonElement>('[data-rod]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.rod as RodId;
    const rod = RODS.find((item) => item.id === id);
    if (!rod) return;
    if (state.ownedRods.includes(id)) {
      if (equipRod(state, id)) showToast(`${rod.name} equipped.`);
    } else {
      const result = buyRod(state, id);
      showToast(result === 'bought' ? `${rod.name} purchased and equipped!` : result === 'insufficient' ? 'Not enough gold coins.' : 'Rod unavailable.');
    }
    updateUi();
    saveNow();
  }));
}

function renderShopTabs(): void {
  required('rodShopList').classList.toggle('hidden', shopTab !== 'rods');
  required('baitShopList').classList.toggle('hidden', shopTab !== 'bait');
  for (const [id, tab] of [['rodsTab', 'rods'], ['baitTab', 'bait']] as const) {
    const button = required<HTMLButtonElement>(id);
    button.setAttribute('aria-selected', String(shopTab === tab));
    button.classList.toggle('primary', shopTab === tab);
  }
}

function renderBaitShop(): void {
  const list = required('baitShopList');
  list.innerHTML = `<p class="baitNote">One bait is used per cast or auto catch. Bait improves the odds of rarer fish and does not guarantee a catch.</p>` +
    BAITS.map((bait) => {
      const stock = state.baitInventory[bait.id];
      return `<div class="baitRow"><div class="baitInfo"><strong>${bait.name}</strong><small>${bait.rarityMultiplier}× encounter weight for ${bait.minRarity} and higher · ${stock} owned</small></div>
        <button data-buy-bait="${bait.id}" ${state.coins < bait.price ? 'disabled' : ''}>Buy ${bait.packSize} · ${bait.price} coins</button>
        <button data-select-bait="${bait.id}" ${stock === 0 || state.selectedBait === bait.id ? 'disabled' : ''}>${state.selectedBait === bait.id ? 'Selected' : 'Select'}</button></div>`;
    }).join('') + `<button id="clearBaitButton" class="wide" ${state.selectedBait ? '' : 'disabled'}>Fish without bait</button>`;
  list.querySelectorAll<HTMLButtonElement>('[data-buy-bait]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.buyBait as BaitId;
    const bait = BAITS.find((item) => item.id === id);
    const result = buyBait(state, id);
    showToast(result === 'bought' ? `Bought ${bait?.packSize} ${bait?.name}!` : 'Not enough gold coins.');
    updateUi();
    saveNow();
  }));
  list.querySelectorAll<HTMLButtonElement>('[data-select-bait]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.selectBait as BaitId;
    if (!selectBait(state, id)) return;
    showToast(`${BAITS.find((bait) => bait.id === id)?.name ?? 'Bait'} selected.`);
    updateUi();
    saveNow();
  }));
  required<HTMLButtonElement>('clearBaitButton').addEventListener('click', () => {
    selectBait(state, null);
    updateUi();
    saveNow();
  });
}

function renderEquipmentShopTabs(): void {
  required('gearShopList').classList.toggle('hidden', equipmentTab !== 'gear');
  required('accessoryShopList').classList.toggle('hidden', equipmentTab !== 'accessories');
  for (const [id, tab] of [['gearTab', 'gear'], ['accessoryTab', 'accessories']] as const) {
    const button = required<HTMLButtonElement>(id);
    button.setAttribute('aria-selected', String(equipmentTab === tab));
    button.classList.toggle('primary', equipmentTab === tab);
  }
}

function renderEquipmentShop(): void {
  required('equipmentShopCoins').textContent = String(state.coins);
  for (const [listId, accessories] of [['gearShopList', false], ['accessoryShopList', true]] as const) {
    const list = required(listId);
    const inCategory = (item: EquipmentDefinition): boolean =>
      (item.slot === 'jewelry' || item.slot === 'ring' || item.slot === 'utility') === accessories;
    list.innerHTML = GEAR_SETS.map((set) => {
      const setItems = EQUIPMENT.filter((item) => item.setId === set.id);
      const owned = setItems.filter((item) => state.ownedEquipment.includes(item.id)).length;
      const equipped = setItems.filter((item) => state.equipment[item.slot] === item.id).length;
      const remainingPrice = setItems.reduce((total, item) => total +
        (state.ownedEquipment.includes(item.id) ? 0 : item.price ?? 0), 0);
      const action = owned === setItems.length ? equipped === setItems.length ? 'Set Equipped' : 'Equip Set'
        : `Buy Remaining · ${remainingPrice} coins`;
      return `<section class="gearSetGroup rarityBorder-${set.grade}">
        <div class="gearSetHeader"><div><strong class="rarity-${set.grade}">${set.name} Set · ${set.grade}</strong><small>${owned}/6 owned · ${equipped}/6 equipped · Full set: +${set.completionXpBonus} XP per catch</small></div>
          <button data-shop-set="${set.id}" ${equipped === setItems.length || (remainingPrice > 0 && state.coins < remainingPrice) ? 'disabled' : ''}>${action}</button></div>
        ${setItems.filter(inCategory).map(equipmentShopRow).join('')}
      </section>`;
    }).join('') + `<section class="gearSetGroup"><div class="gearSetHeader"><strong>Individual Items</strong></div>
      ${EQUIPMENT.filter((item) => (item.price ?? 0) > 0 && !item.setId && inCategory(item)).map(equipmentShopRow).join('')}</section>`;
    list.querySelectorAll<HTMLButtonElement>('[data-shop-set]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.shopSet as GearSetId;
      const set = GEAR_SETS.find((candidate) => candidate.id === id);
      if (!set) return;
      const allOwned = gearSetItems(id).every((itemId) => state.ownedEquipment.includes(itemId));
      if (allOwned) {
        if (equipGearSet(state, id)) showToast(`${set.name} set equipped!`);
      } else {
        const result = buyGearSet(state, id);
        showToast(result === 'bought' ? `${set.name} set purchased and equipped!` : result === 'insufficient' ? 'Not enough gold coins.' : 'Set unavailable.');
      }
      updateUi();
      saveNow();
    }));
    list.querySelectorAll<HTMLButtonElement>('[data-shop-equipment]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.shopEquipment as EquipmentItemId;
      const item = EQUIPMENT.find((candidate) => candidate.id === id);
      if (!item) return;
      if (state.ownedEquipment.includes(id)) {
        state.equipment[item.slot] = id;
        showToast(`${item.name} equipped.`);
      } else {
        const result = buyEquipment(state, id);
        showToast(result === 'bought' ? `${item.name} purchased and equipped!` : result === 'insufficient' ? 'Not enough gold coins.' : 'Equipment unavailable.');
      }
      updateUi();
      saveNow();
    }));
  }
}

function equipmentShopRow(item: EquipmentDefinition): string {
  const owned = state.ownedEquipment.includes(item.id);
  const equipped = state.equipment[item.slot] === item.id;
  const action = equipped ? 'Equipped' : owned ? 'Equip' : `Buy · ${item.price} coins`;
  return `<div class="equipmentShopRow"><span class="equipmentShopIcon">${item.symbol}</span>
    <div class="equipmentShopInfo"><strong>${item.name}${state.enhancements[item.id] ? ` +${state.enhancements[item.id]}` : ''}</strong><small>${item.slot} · ${item.description}</small><em>${item.bonusLabel ?? ''}</em></div>
    <button data-shop-equipment="${item.id}" ${equipped || (!owned && state.coins < (item.price ?? 0)) ? 'disabled' : ''}>${action}</button></div>`;
}

function renderBlacksmith(): void {
  required('blacksmithResources').textContent = `Gold: ${state.coins} · ${MATERIALS.map((material) => `${material.name}: ${state.materials[material.id]}`).join(' · ')}`;
  document.querySelectorAll<HTMLButtonElement>('[data-blacksmith-tab]').forEach((button) => {
    const selected = button.dataset.blacksmithTab === blacksmithTab;
    button.classList.toggle('primary', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  const gearSlots = ['head', 'torso', 'hands', 'feet'];
  const items: { id: EnhanceableId; name: string; symbol: string; description: string }[] = blacksmithTab === 'rods'
    ? RODS.filter((rod) => state.ownedRods.includes(rod.id)).map((rod) => ({
      id: rod.id, name: rod.name, symbol: 'RD', description: 'Each level improves catch control and adds +1 XP per catch.',
    }))
    : EQUIPMENT.filter((item) => state.ownedEquipment.includes(item.id)
      && (blacksmithTab === 'gear' ? gearSlots.includes(item.slot) : !gearSlots.includes(item.slot)))
      .map((item) => ({
        id: item.id, name: item.name, symbol: item.symbol,
        description: item.bonusKind ? `Strengthens ${item.futureBonus.toLowerCase()} while equipped.` : 'Adds a small fishing bonus while equipped.',
      }));
  const list = required('blacksmithList');
  list.innerHTML = items.map((item) => {
    const level = state.enhancements[item.id] ?? 0;
    const cost = enhancementCost(state, item.id);
    const materials = cost ? Object.entries(cost.materials).map(([id, amount]) =>
      `${amount} ${MATERIALS.find((material) => material.id === id)?.name}`).join(' · ') : '';
    const affordable = cost && state.coins >= cost.coins && Object.entries(cost.materials).every(([id, amount]) =>
      state.materials[id as MaterialId] >= amount);
    return `<div class="equipmentShopRow"><span class="equipmentShopIcon">${item.symbol}</span>
      <div class="equipmentShopInfo"><strong>${item.name} +${level}</strong><small>${item.description}</small><em>${cost ? `+${level + 1}: ${Math.round(enhancementChance(level + 1) * 100)}% success · ${cost.coins} coins · ${materials}` : 'Maximum enhancement reached'}</em></div>
      <button data-enhance="${item.id}" ${affordable ? '' : 'disabled'}>${level >= MAX_ENHANCEMENT ? 'Maxed' : `Enhance +${level + 1}`}</button></div>`;
  }).join('') || '<p class="emptyInventory">No owned items in this category yet.</p>';
  list.querySelectorAll<HTMLButtonElement>('[data-enhance]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.enhance as EnhanceableId;
    const result = enhanceItem(state, id);
    showToast(result === 'enhanced' ? `Enhancement successful! +${state.enhancements[id]}`
      : result === 'failed' ? `Enhancement failed. Item stays at +${state.enhancements[id] ?? 0}; materials and coins were spent.`
        : result === 'materials' ? 'Not enough lake materials.' : result === 'coins' ? 'Not enough gold coins.' : 'Cannot enhance this item.');
    updateUi();
    saveNow();
  }));
}

function renderFishGuide(): void {
  required('fishGuideProgress').textContent = `${state.discoveredFish.length} / ${FISH.length} discovered`;
  required('fishGuideList').innerHTML = FISH.map((fish) => {
    const discovered = state.discoveredFish.includes(fish.id);
    return `<div class="fishGuideEntry ${discovered ? `rarityBorder-${fish.rarity}` : 'undiscovered'}" aria-label="${discovered ? fish.name : 'Unknown fish'}">
      <span class="fishGuideIcon ${discovered ? '' : 'unknown'}" aria-hidden="true">&#x1F41F;</span>
      <span class="fishGuideIdentity"><strong>${discovered ? fish.name : '???'}</strong><small class="${discovered ? `rarity-${fish.rarity}` : ''}">${discovered ? fish.rarity : 'Not yet caught'}</small></span>
      <span class="fishGuideValue">${discovered ? `${fish.value} coins` : '???'}</span>
    </div>`;
  }).join('');
}

function fishRow(fish: FishDefinition, market: boolean): string {
  const quantity = state.inventory[fish.id];
  if (!market) return `<div class="itemSlot rarityBorder-${fish.rarity}" title="${fish.name} — ${fish.rarity}, ${fish.value} coins each"><span class="itemIcon">&#x1F41F;</span><strong>${fish.name}</strong><span class="itemRarity rarity-${fish.rarity}">${fish.rarity}</span><b class="itemQuantity">${quantity}</b></div>`;
  return `<div class="fishRow"><div><strong>${fish.name}</strong><div class="fishMeta rarity-${fish.rarity}">${fish.rarity} · ${fish.value} coins each</div></div><strong>× ${quantity}</strong><button data-sell="${fish.id}" ${quantity ? '' : 'disabled'}>Sell ${quantity ? quantity * fish.value : ''}</button></div>`;
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function render(now: number): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (state.scene === 'village') renderVillageEnhanced(now);
  else renderFishingEnhanced(now);
}

function renderVillage(now: number): void {
  const cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, state.player.x - canvas.width / 2));
  const cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, state.player.y - canvas.height / 2));
  context.save();
  context.translate(-cameraX, -cameraY);
  context.fillStyle = '#75a85f'; context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // Soft checker tiles create texture without external assets.
  for (let y = 0; y < WORLD_HEIGHT; y += 64) for (let x = 0; x < WORLD_WIDTH; x += 64) {
    if ((x / 64 + y / 64) % 2 === 0) { context.fillStyle = '#79ad63'; context.fillRect(x, y, 64, 64); }
  }
  context.fillStyle = '#c8aa72';
  context.fillRect(0, 650, WORLD_WIDTH, 78);
  context.fillRect(275, 0, 74, WORLD_HEIGHT);
  context.fillRect(720, 0, 74, WORLD_HEIGHT);
  context.fillRect(1350, 0, 74, WORLD_HEIGHT);
  context.fillRect(1880, 0, 74, WORLD_HEIGHT);
  context.fillStyle = '#9cb868'; context.fillRect(1710, 930, 370, 310);
  context.strokeStyle = '#d5c47c'; context.lineWidth = 4;
  for (let y = 950; y < 1220; y += 32) { context.beginPath(); context.moveTo(1725, y); context.lineTo(2065, y); context.stroke(); }
  drawLake(now);
  BUILDINGS.forEach(drawBuilding);
  for (let x = 18; x < WORLD_WIDTH; x += 46) { drawTree(x, 22); drawTree(x, WORLD_HEIGHT - 18); }
  for (let y = 65; y < WORLD_HEIGHT; y += 50) { drawTree(18, y); drawTree(WORLD_WIDTH - 18, y); }
  for (let x = 80; x <= 2200; x += 170) {
    if (x < 800 || x > 1350) drawTree(x, 820 + (x % 3) * 35);
  }
  drawPlayer(state.player.x, state.player.y, now);
  context.fillStyle = '#fff7d7'; context.font = 'bold 14px Segoe UI'; context.textAlign = 'center';
  context.fillText('WILLOW LAKE', LAKE.x + LAKE.width / 2, LAKE.y - 12);
  context.restore();
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

function renderVillageEnhanced(now: number): void {
  const cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, state.player.x - canvas.width / 2));
  const cameraY = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, state.player.y - canvas.height / 2));
  context.save();
  context.translate(-cameraX, -cameraY);
  drawTerrainEnhanced(cameraX, cameraY);
  drawRoadNetwork();
  drawFarmEnhanced(now);
  drawLakeEnhanced(now);
  BUILDINGS.forEach(drawBuildingEnhanced);
  for (let x = 18; x < WORLD_WIDTH; x += 46) { drawTreeEnhanced(x, 22); drawTreeEnhanced(x, WORLD_HEIGHT - 18); }
  for (let y = 65; y < WORLD_HEIGHT; y += 50) { drawTreeEnhanced(18, y); drawTreeEnhanced(WORLD_WIDTH - 18, y); }
  for (let x = 80; x <= 2200; x += 170) if (x < 800 || x > 1350) drawTreeEnhanced(x, 820 + (x % 3) * 35);
  drawVillageDetails(now);
  drawPlayerEnhanced(state.player.x, state.player.y, now);
  context.restore();
  drawMinimap();
  drawVignette();
}

function drawTerrainEnhanced(cameraX: number, cameraY: number): void {
  context.fillStyle = '#6e9f59'; context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  const startX = Math.max(0, Math.floor(cameraX / 48) * 48 - 48);
  const startY = Math.max(0, Math.floor(cameraY / 48) * 48 - 48);
  const endX = Math.min(WORLD_WIDTH, cameraX + canvas.width + 48);
  const endY = Math.min(WORLD_HEIGHT, cameraY + canvas.height + 48);
  for (let y = startY; y < endY; y += 48) for (let x = startX; x < endX; x += 48) {
    const tone = hash(x, y) % 3;
    context.fillStyle = tone === 0 ? '#73a65c' : tone === 1 ? '#76a95f' : '#709e59';
    context.fillRect(x, y, 48, 48);
    if (hash(x + 9, y + 5) % 4 === 0) {
      context.fillStyle = '#4f813f'; context.fillRect(x + 9, y + 13, 2, 6); context.fillRect(x + 13, y + 15, 2, 4);
    }
  }
}

function drawRoadNetwork(): void {
  context.fillStyle = '#a78355'; context.fillRect(0, 644, WORLD_WIDTH, 90);
  for (const x of [269, 714, 1344, 1874]) context.fillRect(x, 0, 86, WORLD_HEIGHT);
  context.fillStyle = '#c7a76e'; context.fillRect(0, 650, WORLD_WIDTH, 78);
  for (const x of [275, 720, 1350, 1880]) context.fillRect(x, 0, 74, WORLD_HEIGHT);
  context.fillStyle = '#a98a5b';
  for (let x = 20; x < WORLD_WIDTH; x += 92) context.fillRect(x, 687 + (x % 3), 17, 3);
  for (const roadX of [305, 750, 1380, 1910]) for (let y = 35; y < WORLD_HEIGHT; y += 86) context.fillRect(roadX + (y % 5), y, 3, 15);
}

function drawFarmEnhanced(now: number): void {
  context.fillStyle = '#755537'; context.fillRect(1700, 920, 390, 325);
  context.fillStyle = '#9b7445'; context.fillRect(1712, 932, 366, 301);
  for (let y = 952; y < 1220; y += 34) {
    context.fillStyle = '#5f432d'; context.fillRect(1722, y, 346, 8);
    for (let x = 1732; x < 2060; x += 28) {
      const sway = Math.sin(now / 600 + x + y) * 1.5;
      context.fillStyle = '#315f35'; context.fillRect(x, y - 10, 3, 12);
      context.fillStyle = '#dfb74d'; context.fillRect(x - 3 + sway, y - 12, 8, 5);
    }
  }
  context.fillStyle = '#765238';
  context.fillRect(1688, 906, 414, 6); context.fillRect(1688, 1250, 414, 6);
  for (let x = 1688; x <= 2102; x += 38) { context.fillRect(x, 899, 7, 20); context.fillRect(x, 1243, 7, 20); }
}

function drawLakeEnhanced(now: number): void {
  context.fillStyle = '#bea66d'; roundRect(LAKE.x - 14, LAKE.y - 14, LAKE.width + 28, LAKE.height + 28, 58); context.fill();
  const water = context.createLinearGradient(0, LAKE.y, 0, LAKE.y + LAKE.height);
  water.addColorStop(0, '#4d91a5'); water.addColorStop(1, '#276278');
  context.fillStyle = water; roundRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 48); context.fill();
  context.strokeStyle = '#79c2cc'; context.lineWidth = 4; context.stroke();
  context.save(); roundRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 48); context.clip();
  for (let row = 0; row < 7; row += 1) for (let column = 0; column < 4; column += 1) {
    const shift = Math.sin(now / 650 + row * 1.7) * 22;
    context.strokeStyle = row % 2 ? '#63afbd99' : '#a3d7d166'; context.lineWidth = 3;
    const x = LAKE.x + 28 + column * 118 + shift; const y = LAKE.y + 30 + row * 43;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + 54, y); context.stroke();
  }
  for (const [x, y] of [[930, 475], [1190, 590], [1040, 640]] as const) {
    context.fillStyle = '#4b8b4c'; context.beginPath(); context.ellipse(x, y, 15, 8, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#f4a6b6'; context.fillRect(x - 2, y - 5, 5, 5);
  }
  context.restore();
  context.fillStyle = '#5e422d'; context.fillRect(780, 535, 155, 38);
  context.fillStyle = '#99704a'; for (let x = 785; x < 930; x += 20) context.fillRect(x, 539, 15, 30);
  context.fillStyle = '#4b3426'; context.fillRect(800, 570, 10, 55); context.fillRect(910, 570, 10, 55);
  drawLocationSign('WILLOW LAKE', LAKE.x + LAKE.width / 2, LAKE.y - 32, '#315f76');
}

function drawBuildingEnhanced(building: typeof BUILDINGS[number]): void {
  const center = building.x + building.width / 2;
  context.fillStyle = '#27332b55'; context.fillRect(building.x + 12, building.y + building.height, building.width, 12);
  context.fillStyle = building.color; context.fillRect(building.x, building.y, building.width, building.height);
  context.fillStyle = '#ffffff18'; context.fillRect(building.x + 7, building.y + 8, 7, building.height - 15);
  context.fillStyle = '#51372b'; context.beginPath(); context.moveTo(building.x - 14, building.y + 9); context.lineTo(center, building.y - 53); context.lineTo(building.x + building.width + 14, building.y + 9); context.closePath(); context.fill();
  context.fillStyle = '#744b36';
  for (let x = building.x; x < building.x + building.width; x += 24) context.fillRect(x - 7, building.y - 2, 17, 9);
  context.fillStyle = '#573a29'; context.fillRect(center - 16, building.y + building.height - 43, 32, 43);
  context.fillStyle = '#d7ae62'; context.fillRect(center + 8, building.y + building.height - 23, 4, 4);
  drawWindowEnhanced(building.x + 22, building.y + 35); drawWindowEnhanced(building.x + building.width - 48, building.y + 35);
  context.fillStyle = '#514137'; context.fillRect(building.x + building.width - 43, building.y - 48, 20, 40);
  context.fillStyle = '#f4ead0aa'; context.fillRect(building.x + building.width - 40, building.y - 58, 13, 8);
  drawLocationSign(building.name, center, building.y - 72, building.locked ? '#594941' : '#376449');
  if (building.locked) {
    context.fillStyle = '#342a25e6'; context.fillRect(center - 29, building.y + 52, 58, 44);
    context.strokeStyle = '#c5a55f'; context.lineWidth = 5; context.beginPath(); context.arc(center, building.y + 57, 12, Math.PI, 0); context.stroke();
    context.fillStyle = '#d5b76b'; context.fillRect(center - 13, building.y + 56, 26, 21);
    context.fillStyle = '#473627'; context.fillRect(center - 2, building.y + 63, 4, 8);
  }
}

function drawWindowEnhanced(x: number, y: number): void {
  context.fillStyle = '#4d382e'; context.fillRect(x - 3, y - 3, 32, 30);
  context.fillStyle = '#f4d987'; context.fillRect(x, y, 26, 24);
  context.fillStyle = '#fff5bd'; context.fillRect(x + 3, y + 3, 8, 7);
  context.fillStyle = '#78573a'; context.fillRect(x + 12, y, 3, 24); context.fillRect(x, y + 11, 26, 3);
}

function drawLocationSign(label: string, x: number, y: number, color: string): void {
  context.font = '700 13px Segoe UI'; context.textAlign = 'center';
  const width = context.measureText(label).width + 22;
  context.fillStyle = '#271f1a77'; context.fillRect(x - width / 2 + 3, y - 9, width, 24);
  context.fillStyle = color; context.fillRect(x - width / 2, y - 12, width, 24);
  context.strokeStyle = '#e4c98a'; context.lineWidth = 2; context.strokeRect(x - width / 2, y - 12, width, 24);
  context.fillStyle = '#fff1c9'; context.fillText(label, x, y + 5);
}

function drawPlayerEnhanced(x: number, y: number, now: number): void {
  const step = playerMoving ? Math.sin(now / 75) : 0;
  const bob = playerMoving ? Math.abs(step) * 2 : Math.sin(now / 700) * .5;
  context.fillStyle = '#20263155'; context.beginPath(); context.ellipse(x, y + 15, 16, 7, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#283e55'; context.fillRect(x - 9, y + 8 + bob + step * 2, 7, 10); context.fillRect(x + 2, y + 8 + bob - step * 2, 7, 10);
  context.fillStyle = '#d8a45d'; context.fillRect(x - 10, y + 16 + bob + step * 2, 8, 4); context.fillRect(x + 2, y + 16 + bob - step * 2, 8, 4);
  context.fillStyle = '#376b58'; context.fillRect(x - 12, y - 7 + bob, 24, 20);
  context.fillStyle = '#568a6d'; context.fillRect(x - 9, y - 4 + bob, 7, 14);
  context.fillStyle = '#e9bb91'; context.fillRect(x - 10, y - 23 + bob, 20, 17);
  context.fillStyle = '#59372b'; context.fillRect(x - 12, y - 27 + bob, 24, 8); context.fillRect(x - 10, y - 21 + bob, 4, 7);
  context.fillStyle = '#2a2524';
  if (playerFacing === 'left') context.fillRect(x - 6, y - 15 + bob, 3, 3);
  else if (playerFacing === 'right') context.fillRect(x + 3, y - 15 + bob, 3, 3);
  else if (playerFacing === 'down') { context.fillRect(x - 6, y - 15 + bob, 3, 3); context.fillRect(x + 4, y - 15 + bob, 3, 3); }
  context.fillStyle = '#d6b066'; context.fillRect(x - 14, y - 28 + bob, 28, 4);
}

function drawTreeEnhanced(x: number, y: number): void {
  context.fillStyle = '#233d2f55'; context.beginPath(); context.ellipse(x + 4, y + 13, 22, 8, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#60452d'; context.fillRect(x - 6, y - 5, 12, 28);
  context.fillStyle = '#254d37'; context.beginPath(); context.arc(x + 7, y - 7, 18, 0, Math.PI * 2); context.fill(); context.beginPath(); context.arc(x - 8, y - 5, 20, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#3f7545'; context.beginPath(); context.arc(x - 2, y - 16, 18, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#64934f'; context.beginPath(); context.arc(x - 8, y - 21, 7, 0, Math.PI * 2); context.fill();
}

function drawVillageDetails(now: number): void {
  for (const [x, y] of [[410, 380], [520, 760], [1510, 540], [2080, 690], [1450, 1190], [820, 1020]] as const) {
    for (let index = 0; index < 7; index += 1) {
      const fx = x + (index % 4) * 12; const fy = y + Math.floor(index / 4) * 14;
      context.fillStyle = '#3f733e'; context.fillRect(fx, fy, 2, 7);
      context.fillStyle = index % 2 ? '#f2a4af' : '#f5d66d'; context.fillRect(fx - 2, fy - 3, 6, 5);
    }
  }
  for (const x of [390, 820, 1305, 1750, 2230]) {
    context.fillStyle = '#49382c'; context.fillRect(x - 3, 620, 6, 35);
    context.fillStyle = '#2d2927'; context.fillRect(x - 9, 612, 18, 12);
    context.fillStyle = `rgba(255,218,120,${.72 + Math.sin(now / 300 + x) * .08})`; context.fillRect(x - 6, 615, 12, 7);
  }
}

function drawMinimap(): void {
  const x = canvas.width - 178; const y = 16; const width = 160; const height = 94;
  context.fillStyle = '#17201be6'; context.fillRect(x - 5, y - 5, width + 10, height + 10);
  context.strokeStyle = '#d6b875'; context.lineWidth = 2; context.strokeRect(x - 5, y - 5, width + 10, height + 10);
  context.fillStyle = '#6f9f59'; context.fillRect(x, y, width, height);
  const sx = width / WORLD_WIDTH; const sy = height / WORLD_HEIGHT;
  context.fillStyle = '#39778c'; context.fillRect(x + LAKE.x * sx, y + LAKE.y * sy, LAKE.width * sx, LAKE.height * sy);
  for (const building of BUILDINGS) {
    context.fillStyle = building.locked ? '#694e43' : '#e1a25d';
    context.fillRect(x + building.x * sx, y + building.y * sy, Math.max(3, building.width * sx), Math.max(3, building.height * sy));
  }
  context.fillStyle = '#fff2a1'; context.beginPath(); context.arc(x + state.player.x * sx, y + state.player.y * sy, 3.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#f7e7c3'; context.font = '700 9px Segoe UI'; context.textAlign = 'left'; context.fillText('VILLAGE MAP', x + 4, y + 11);
}

function drawVignette(): void {
  const vignette = context.createRadialGradient(480, 270, 180, 480, 270, 570);
  vignette.addColorStop(.55, '#00000000'); vignette.addColorStop(1, '#10201866');
  context.fillStyle = vignette; context.fillRect(0, 0, canvas.width, canvas.height);
}

function renderFishingEnhanced(now: number): void {
  const sky = context.createLinearGradient(0, 0, 0, 540); sky.addColorStop(0, '#315f83'); sky.addColorStop(.48, '#dfa96f'); sky.addColorStop(.55, '#497f82'); sky.addColorStop(1, '#153e58');
  context.fillStyle = sky; context.fillRect(0, 0, 960, 540);
  context.fillStyle = '#f4c978'; context.beginPath(); context.arc(770, 115, 48, 0, Math.PI * 2); context.fill();
  drawCloud(170 + (now / 80) % 1100, 100, .9); drawCloud(570 + (now / 120) % 1100, 170, .65);
  context.fillStyle = '#304e48'; context.beginPath(); context.moveTo(0, 300); context.lineTo(130, 185); context.lineTo(260, 290); context.lineTo(430, 145); context.lineTo(605, 285); context.lineTo(790, 175); context.lineTo(960, 275); context.lineTo(960, 325); context.lineTo(0, 325); context.fill();
  context.fillStyle = '#263d38'; context.beginPath(); context.moveTo(0, 320); context.lineTo(210, 245); context.lineTo(360, 315); context.lineTo(600, 230); context.lineTo(790, 312); context.lineTo(960, 250); context.lineTo(960, 340); context.lineTo(0, 340); context.fill();
  context.strokeStyle = '#73b6c2'; context.lineWidth = 3;
  for (let y = 330; y < 540; y += 28) for (let x = -30; x < 960; x += 240) {
    const shift = Math.sin(now / 450 + y) * 25; context.beginPath(); context.moveTo(x + shift, y); context.lineTo(x + 110 + shift, y); context.stroke();
  }
  context.fillStyle = '#3c2e28'; context.fillRect(45, 375, 310, 43);
  context.fillStyle = '#745339'; for (let x = 52; x < 350; x += 25) context.fillRect(x, 380, 19, 33);
  context.fillStyle = '#332821'; context.fillRect(82, 415, 19, 110); context.fillRect(295, 415, 19, 110);
  drawPlayerEnhanced(190, 355, now);
  context.strokeStyle = '#292526'; context.lineWidth = 3; context.beginPath(); context.moveTo(205, 345); context.lineTo(525, 300); context.stroke();
  context.strokeStyle = '#ddd4bb'; context.lineWidth = 1; context.beginPath(); context.moveTo(525, 300); context.lineTo(580, 382); context.stroke();
  context.fillStyle = '#ef6b55'; context.fillRect(575, 377 + Math.sin(now / 320) * 2, 10, 9);
  context.fillStyle = '#fff2c9'; context.font = 'bold 32px Georgia'; context.textAlign = 'center'; context.fillText('Willow Lake', 480, 62);
  context.fillStyle = '#f8ddb0'; context.font = 'italic 13px Georgia'; context.fillText('Listen to the water. Wait for the bite.', 480, 86);
  if (fishing.phase === 'bite' && !state.fishing.autoEnabled) {
    context.strokeStyle = '#e9f4e8'; context.lineWidth = 3;
    for (let ring = 0; ring < 3; ring += 1) { context.beginPath(); context.ellipse(580, 390, 18 + ring * 10, 7 + ring * 4, 0, 0, Math.PI * 2); context.stroke(); }
    context.fillStyle = '#ffdc6a'; context.font = 'bold 48px Segoe UI'; context.fillText('!', 610, 345 + Math.sin(now / 60) * 8);
  }
  drawVignette();
}

function drawCloud(x: number, y: number, scale: number): void {
  const wrappedX = (x % 1150) - 100;
  context.fillStyle = '#fff4dfaa'; context.beginPath();
  context.arc(wrappedX, y, 28 * scale, 0, Math.PI * 2); context.arc(wrappedX + 32 * scale, y - 12 * scale, 35 * scale, 0, Math.PI * 2); context.arc(wrappedX + 70 * scale, y, 27 * scale, 0, Math.PI * 2); context.fill();
}

function hash(x: number, y: number): number {
  return Math.abs(((x * 73856093) ^ (y * 19349663)) | 0);
}

function roundRect(x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
}

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}
