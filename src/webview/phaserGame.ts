import Phaser from 'phaser';
import { MAPS, type MapId, type SceneId } from '../shared/model.js';
import { BUILDINGS, FISHING_PORTAL, FISH_GUIDE_SIGN, LAKE, RETURN_PORTAL, SAFE_SPAWN } from './world.js';
import type { FishingPhase } from './fishing.js';

export interface PhaserSnapshot {
  scene: SceneId;
  location: MapId;
  player: { x: number; y: number };
  facing: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
  fishingPhase: FishingPhase;
  autoFishing: boolean;
}

export interface PhaserHooks {
  tick(deltaSeconds: number, now: number): void;
  snapshot(): PhaserSnapshot;
  lakeClick(): void;
  fishGuideClick(): void;
  portalClick(): void;
}

const COLORS = {
  grass: 0x70a05a,
  grassLight: 0x78aa61,
  roadEdge: 0xa78355,
  road: 0xc7a76e,
  water: 0x34758a,
  waterLight: 0x72bdc8,
  cream: 0xffedc5,
};

const PLAYER_SCALE = .22;
const IDLE_FRAME: Record<PhaserSnapshot['facing'], number> = {
  down: 0,
  left: 4,
  right: 8,
  up: 12,
};

export class CozyPhaserGame {
  private readonly game: Phaser.Game;

  constructor(canvas: HTMLCanvasElement, playerSpriteUrl: string, hooks: PhaserHooks) {
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 960,
      height: 540,
      canvas,
      parent: 'gameShell',
      scale: {
        parent: 'gameShell',
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
      backgroundColor: '#142019',
      render: { antialias: false, pixelArt: true, roundPixels: true },
      banner: false,
      scene: [new VillageScene('hub', hooks, playerSpriteUrl), new VillageScene('area1', hooks, playerSpriteUrl)],
    });
  }

  destroy(): void {
    this.game.destroy(false);
  }
}

class VillageScene extends Phaser.Scene {
  private staticLayer!: Phaser.GameObjects.Graphics;
  private animatedLayer!: Phaser.GameObjects.Graphics;
  private actorLayer!: Phaser.GameObjects.Graphics;
  private mapLayer!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  constructor(private readonly location: MapId, private readonly hooks: PhaserHooks, private readonly playerSpriteUrl: string) {
    super({ key: location });
  }

  preload(): void {
    if (!this.textures.exists('player-medieval-sheet')) this.load.image('player-medieval-sheet', this.playerSpriteUrl);
  }

  create(): void {
    const map = MAPS[this.location];
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.game.canvas.dataset.map = this.location;
    this.game.canvas.dataset.scene = this.sys.settings.key;
    this.game.canvas.dataset.mapSize = `${map.width}x${map.height}`;
    this.cameras.main.setRoundPixels(true);
    this.staticLayer = this.add.graphics().setDepth(0);
    this.animatedLayer = this.add.graphics().setDepth(3);
    this.actorLayer = this.add.graphics().setDepth(10);
    this.mapLayer = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.drawWorld();
    const initialSnapshot = this.hooks.snapshot();
    const player = initialSnapshot.player;
    this.createPlayerFrames();
    this.createPlayerAnimations();
    this.playerSprite = this.add.sprite(player.x, player.y, 'player-medieval-sheet', '0')
      .setOrigin(.5, .96)
      .setScale(PLAYER_SCALE)
      .setDepth(11);
    // The world can zoom to fill tall panes without scaling the minimap HUD.
    this.cameras.main.ignore(this.mapLayer);
    this.hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.hudCamera.inputEnabled = false;
    this.hudCamera.ignore(this.children.list.filter((child) => child !== this.mapLayer));
    const onPointerDown = (pointer: Phaser.Input.Pointer): void => {
      const location = this.hooks.snapshot().location;
      if (location !== this.location) return;
      const portal = location === 'hub' ? FISHING_PORTAL : RETURN_PORTAL;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      if (location === 'area1' && Phaser.Geom.Rectangle.Contains(
        new Phaser.Geom.Rectangle(FISH_GUIDE_SIGN.x, FISH_GUIDE_SIGN.y, FISH_GUIDE_SIGN.width, FISH_GUIDE_SIGN.height),
        worldPoint.x,
        worldPoint.y,
      )) this.hooks.fishGuideClick();
      else if (location === 'area1' && Phaser.Geom.Rectangle.Contains(
        new Phaser.Geom.Rectangle(LAKE.x, LAKE.y, LAKE.width, LAKE.height),
        worldPoint.x,
        worldPoint.y,
      )) this.hooks.lakeClick();
      else if (Phaser.Geom.Rectangle.Contains(
        new Phaser.Geom.Rectangle(portal.x, portal.y, portal.width, portal.height),
        worldPoint.x,
        worldPoint.y,
      )) this.hooks.portalClick();
    };
    this.input.on('pointerdown', onPointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.off('pointerdown', onPointerDown));
    this.fitMapToViewport();
    this.cameras.main.centerOn(player.x, player.y);
  }

  update(time: number, delta: number): void {
    if (this.switchMapIfNeeded()) return;
    this.hooks.tick(Math.min(delta / 1000, 0.05), time);
    if (this.switchMapIfNeeded()) return;
    const snapshot = this.hooks.snapshot();
    const camera = this.cameras.main;
    this.fitMapToViewport();
    const targetX = camera.clampX(snapshot.player.x - camera.width / 2);
    const targetY = camera.clampY(snapshot.player.y - camera.height / 2);
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, 0.12);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetY, 0.12);
    this.drawAnimatedWorld(snapshot.location, time);
    this.drawPlayer(snapshot);
    this.drawMinimap(snapshot);
  }

  private fitMapToViewport(): void {
    const camera = this.cameras.main;
    const map = MAPS[this.location];
    // Cover the viewport without stretching sprites or enlarging the playable map.
    camera.setZoom(Math.max(1, camera.width / map.width, camera.height / map.height));
    camera.setBounds(0, 0, map.width, map.height);
    this.hudCamera.setSize(camera.width, camera.height);
  }

  private switchMapIfNeeded(): boolean {
    const destination = this.hooks.snapshot().location;
    if (destination === this.location) return false;
    // Stop/unload this scene's display list and input handlers, then start the destination.
    this.scene.start(destination);
    return true;
  }

  private drawWorld(): void {
    const { width: WORLD_WIDTH, height: WORLD_HEIGHT } = MAPS[this.location];
    const g = this.staticLayer;
    g.fillStyle(COLORS.grass).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let y = 0; y < WORLD_HEIGHT; y += 48) for (let x = 0; x < WORLD_WIDTH; x += 48) {
      const shade = hash(x, y) % 3;
      g.fillStyle(shade === 0 ? 0x73a65c : shade === 1 ? COLORS.grassLight : 0x6d9b56).fillRect(x, y, 48, 48);
      if (hash(x + 11, y + 7) % 5 === 0) {
        g.fillStyle(0x4f813f).fillRect(x + 9, y + 13, 2, 7).fillRect(x + 13, y + 16, 2, 4);
      }
    }
    if (this.location === 'hub') {
      this.drawRoads(g);
      BUILDINGS.forEach((building) => this.drawBuilding(g, building));
    }
    for (let x = 18; x < WORLD_WIDTH; x += 46) { this.drawTree(g, x, 22); this.drawTree(g, x, WORLD_HEIGHT - 18); }
    for (let y = 65; y < WORLD_HEIGHT; y += 50) { this.drawTree(g, 18, y); this.drawTree(g, WORLD_WIDTH - 18, y); }
    for (let x = 100; x < WORLD_WIDTH - 50; x += 180) {
      const treeY = WORLD_HEIGHT - 90;
      if (this.location === 'hub' && BUILDINGS.some((building) =>
        x >= building.x - 30 && x <= building.x + building.width + 30
        && treeY >= building.y - 35 && treeY <= building.y + building.height + 35)) continue;
      this.drawTree(g, x, treeY);
    }
    this.drawDetails(g);
    if (this.location === 'area1') {
      const sign = FISH_GUIDE_SIGN;
      g.fillStyle(0x4c3627).fillRect(sign.x + 13, sign.y + 34, 9, 35).fillRect(sign.x + sign.width - 22, sign.y + 34, 9, 35);
      g.fillStyle(0x6d4a2e).fillRoundedRect(sign.x, sign.y, sign.width, sign.height, 5);
      g.lineStyle(3, 0xd3ac6c).strokeRoundedRect(sign.x + 2, sign.y + 2, sign.width - 4, sign.height - 4, 4);
      this.add.text(sign.x + sign.width / 2, sign.y + sign.height / 2, 'FISH GUIDE\nE TO READ', {
        fontFamily: 'Segoe UI', fontSize: '11px', fontStyle: 'bold', color: '#fff0c5', align: 'center',
      }).setOrigin(.5).setDepth(4);
    }
    const portal = this.location === 'hub' ? FISHING_PORTAL : RETURN_PORTAL;
    this.add.text(portal.x + portal.width / 2, portal.y - 22, this.location === 'hub' ? 'FISHING PORTAL' : 'RETURN TO HUB', {
      fontFamily: 'Segoe UI', fontSize: '12px', fontStyle: 'bold', color: '#d9f9ff',
      backgroundColor: '#244d58', padding: { x: 8, y: 4 },
    }).setOrigin(.5).setDepth(4);
  }

  private drawRoads(g: Phaser.GameObjects.Graphics): void {
    // A compact central hub replaces the old village-wide street grid.
    const hubX = SAFE_SPAWN.x;
    const hubY = SAFE_SPAWN.y;
    const portalCenterX = FISHING_PORTAL.x + FISHING_PORTAL.width / 2;
    g.fillStyle(COLORS.roadEdge).fillRoundedRect(hubX - 185, hubY - 115, 370, 230, 68);
    g.fillRect(portalCenterX - 48, FISHING_PORTAL.y + FISHING_PORTAL.height, 96, hubY - FISHING_PORTAL.y - FISHING_PORTAL.height - 50);
    g.fillRect(hubX + 160, hubY - 70, 120, 82);
    g.fillStyle(COLORS.road).fillRoundedRect(hubX - 175, hubY - 105, 350, 210, 62);
    g.fillRect(portalCenterX - 38, FISHING_PORTAL.y + FISHING_PORTAL.height, 76, hubY - FISHING_PORTAL.y - FISHING_PORTAL.height - 50);
    g.fillRect(hubX + 160, hubY - 60, 120, 62);
    g.fillStyle(0xd9c28a).fillCircle(hubX, hubY, 64);
    g.lineStyle(4, 0xa98a5b).strokeCircle(hubX, hubY, 72);
    for (let y = FISHING_PORTAL.y + FISHING_PORTAL.height + 35; y < hubY - 100; y += 42) {
      g.fillStyle(0xa98a5b).fillRect(portalCenterX - 15, y, 30, 4);
    }
  }

  private drawFarm(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x755537).fillRect(1700, 920, 390, 325);
    g.fillStyle(0x9b7445).fillRect(1712, 932, 366, 301);
    for (let y = 952; y < 1220; y += 34) {
      g.fillStyle(0x5f432d).fillRect(1722, y, 346, 8);
      for (let x = 1732; x < 2060; x += 28) {
        g.fillStyle(0x315f35).fillRect(x, y - 10, 3, 12);
        g.fillStyle(0xdfb74d).fillRect(x - 3, y - 12, 8, 5);
      }
    }
    g.lineStyle(6, 0x765238).strokeRect(1688, 906, 414, 350);
    for (let x = 1688; x <= 2102; x += 38) g.fillStyle(0x765238).fillRect(x, 899, 7, 20).fillRect(x, 1243, 7, 20);
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, building: typeof BUILDINGS[number]): void {
    const center = building.x + building.width / 2;
    g.fillStyle(0x26332b, 0.35).fillRect(building.x + 12, building.y + building.height, building.width, 12);
    g.fillStyle(Number.parseInt(building.color.slice(1), 16)).fillRect(building.x, building.y, building.width, building.height);
    g.fillStyle(0x51372b).fillTriangle(building.x - 14, building.y + 9, center, building.y - 53, building.x + building.width + 14, building.y + 9);
    g.fillStyle(0x744b36);
    for (let x = building.x; x < building.x + building.width; x += 24) g.fillRect(x - 7, building.y - 2, 17, 9);
    g.fillStyle(0x573a29).fillRect(center - 16, building.y + building.height - 43, 32, 43);
    g.fillStyle(0xd7ae62).fillRect(center + 8, building.y + building.height - 23, 4, 4);
    this.drawWindow(g, building.x + 22, building.y + 35); this.drawWindow(g, building.x + building.width - 48, building.y + 35);
    if (building.id === 'blacksmith') {
      // A small anvil on the facade marks the forge even when its label is off-screen.
      g.fillStyle(0x2d3233).fillRoundedRect(center - 29, building.y + 42, 58, 9, 2);
      g.fillTriangle(center - 29, building.y + 49, center - 6, building.y + 49, center - 21, building.y + 64);
      g.fillRect(center - 9, building.y + 51, 18, 17);
      g.fillRect(center - 20, building.y + 67, 40, 6);
      g.fillStyle(0xf2a85b).fillCircle(building.x + 48, building.y + 96, 7);
    }
    g.fillStyle(0x514137).fillRect(building.x + building.width - 43, building.y - 48, 20, 40);
    const label = this.add.text(center, building.y - 72, building.name, {
      fontFamily: 'Segoe UI', fontSize: '13px', fontStyle: 'bold', color: '#fff1c9',
      backgroundColor: building.locked ? '#594941' : '#376449', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(4);
    label.setStroke('#4a3728', 2);
    if (building.locked) {
      g.fillStyle(0x342a25, 0.92).fillRect(center - 29, building.y + 52, 58, 44);
      g.lineStyle(5, 0xc5a55f).arc(center, building.y + 57, 12, Math.PI, Math.PI * 2).strokePath();
      g.fillStyle(0xd5b76b).fillRect(center - 13, building.y + 56, 26, 21);
      g.fillStyle(0x473627).fillRect(center - 2, building.y + 63, 4, 8);
    }
  }

  private drawWindow(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x4d382e).fillRect(x - 3, y - 3, 32, 30);
    g.fillStyle(0xf4d987).fillRect(x, y, 26, 24);
    g.fillStyle(0xfff5bd).fillRect(x + 3, y + 3, 8, 7);
    g.fillStyle(0x78573a).fillRect(x + 12, y, 3, 24).fillRect(x, y + 11, 26, 3);
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x233d2f, 0.35).fillEllipse(x + 4, y + 13, 44, 16);
    g.fillStyle(0x60452d).fillRect(x - 6, y - 5, 12, 28);
    g.fillStyle(0x254d37).fillCircle(x + 7, y - 7, 18).fillCircle(x - 8, y - 5, 20);
    g.fillStyle(0x3f7545).fillCircle(x - 2, y - 16, 18);
    g.fillStyle(0x64934f).fillCircle(x - 8, y - 21, 7);
  }

  private drawDetails(g: Phaser.GameObjects.Graphics): void {
    for (const [x, y] of [[110, 380], [600, 700], [850, 590]] as const) {
      for (let index = 0; index < 7; index += 1) {
        const fx = x + (index % 4) * 12; const fy = y + Math.floor(index / 4) * 14;
        g.fillStyle(0x3f733e).fillRect(fx, fy, 2, 7);
        g.fillStyle(index % 2 ? 0xf2a4af : 0xf5d66d).fillRect(fx - 2, fy - 3, 6, 5);
      }
    }
    for (const x of [320, 820]) {
      g.fillStyle(0x49382c).fillRect(x - 3, 620, 6, 35);
      g.fillStyle(0x2d2927).fillRect(x - 9, 612, 18, 12);
      g.fillStyle(0xffda78).fillRect(x - 6, 615, 12, 7);
    }
  }

  private drawAnimatedWorld(location: MapId, time: number): void {
    const g = this.animatedLayer.clear();
    if (location === 'hub') {
      this.drawPortal(g, FISHING_PORTAL, time, 0x63d7df);
      return;
    }
    g.fillStyle(0xbea66d).fillRoundedRect(LAKE.x - 14, LAKE.y - 14, LAKE.width + 28, LAKE.height + 28, 58);
    g.fillStyle(COLORS.water).fillRoundedRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 48);
    g.lineStyle(4, COLORS.waterLight).strokeRoundedRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 48);
    for (let row = 0; row < 7; row += 1) for (let column = 0; column < 4; column += 1) {
      const shift = Math.sin(time / 650 + row * 1.7) * 22;
      g.lineStyle(3, row % 2 ? 0x63afbd : 0xa3d7d1, row % 2 ? .6 : .4);
      const x = LAKE.x + 28 + column * 118 + shift; const y = LAKE.y + 30 + row * 43;
      g.lineBetween(x, y, x + 54, y);
    }
    for (const [dx, dy] of [[110, 110], [390, 210], [250, 290]] as const) {
      const x = LAKE.x + dx; const y = LAKE.y + dy;
      g.fillStyle(0x4b8b4c).fillEllipse(x, y, 30, 16); g.fillStyle(0xf4a6b6).fillRect(x - 2, y - 5, 5, 5);
    }
    const dockX = LAKE.x + LAKE.width / 2 - 75;
    const dockY = LAKE.y + LAKE.height - 35;
    g.fillStyle(0x5e422d).fillRect(dockX, dockY, 150, 36);
    g.fillStyle(0x99704a); for (let x = dockX + 5; x < dockX + 145; x += 20) g.fillRect(x, dockY + 4, 15, 28);
    g.fillStyle(0x4b3426).fillRect(dockX + 20, dockY + 33, 10, 35).fillRect(dockX + 125, dockY + 33, 10, 35);
    this.drawPortal(g, RETURN_PORTAL, time, 0x8bd18a);
  }

  private drawPortal(g: Phaser.GameObjects.Graphics, portal: typeof FISHING_PORTAL, time: number, color: number): void {
    const pulse = 0.72 + Math.sin(time / 280) * 0.18;
    const centerX = portal.x + portal.width / 2;
    const centerY = portal.y + portal.height / 2;
    g.fillStyle(0x19251f, .65).fillEllipse(centerX, portal.y + portal.height + 5, portal.width, 18);
    g.lineStyle(8, 0x355549).strokeEllipse(centerX, centerY, portal.width - 16, portal.height + 24);
    g.lineStyle(5, color, pulse).strokeEllipse(centerX, centerY, portal.width - 28, portal.height + 10);
    g.fillStyle(color, .18 + pulse * .16).fillEllipse(centerX, centerY, portal.width - 36, portal.height);
    g.fillStyle(0xe8fff4, pulse).fillCircle(centerX, centerY, 5);
  }

  private drawPlayer(snapshot: PhaserSnapshot): void {
    const g = this.actorLayer.clear(); const { x, y } = snapshot.player;
    g.fillStyle(0x202631, .27).fillEllipse(x, y + 2, 29, 9);
    this.playerSprite.setPosition(x, y);
    const animationKey = `walk-${snapshot.facing}`;
    if (snapshot.moving) {
      this.playerSprite.setScale(PLAYER_SCALE).setAngle(0);
      this.playerSprite.play(animationKey, true);
    }
    else {
      this.playerSprite.stop();
      this.playerSprite.setFrame(String(IDLE_FRAME[snapshot.facing]));
      this.playerSprite.setScale(PLAYER_SCALE).setAngle(0);
    }
    if (snapshot.location === 'area1' && snapshot.scene === 'fishing') this.drawFishingRod(g, snapshot);
  }

  private drawFishingRod(g: Phaser.GameObjects.Graphics, snapshot: PhaserSnapshot): void {
    const { x, y } = snapshot.player;
    const targetX = Phaser.Math.Clamp(x, LAKE.x + 34, LAKE.x + LAKE.width - 34);
    const targetY = Phaser.Math.Clamp(y, LAKE.y + 34, LAKE.y + LAKE.height - 34);
    const dx = targetX - x;
    const dy = targetY - y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const handX = x + nx * 7;
    const handY = y - 34 + ny * 4;
    const rodTipX = handX + nx * 54;
    const rodTipY = handY + ny * 54 - 20;

    // A warm wooden rod stays visibly attached to the character while fishing.
    g.lineStyle(6, 0x3c2518).lineBetween(handX, handY, rodTipX, rodTipY);
    g.lineStyle(3, 0xb77a3f).lineBetween(handX, handY - 1, rodTipX, rodTipY - 1);
    g.fillStyle(0xd5b267).fillCircle(handX, handY, 4);

    const lineIsCast = snapshot.autoFishing
      || snapshot.fishingPhase === 'waiting'
      || snapshot.fishingPhase === 'bite';
    if (!lineIsCast) return;
    g.lineStyle(1, 0xf3ead5, .95).lineBetween(rodTipX, rodTipY, targetX, targetY);
    g.fillStyle(snapshot.fishingPhase === 'bite' ? 0xffd65a : 0xef6656).fillCircle(targetX, targetY, 5);
    g.fillStyle(0xf7eee0).fillRect(targetX - 2, targetY - 7, 4, 5);
    if (snapshot.fishingPhase === 'bite' && !snapshot.autoFishing) {
      g.lineStyle(2, 0xd9f5ef, .85);
      g.strokeEllipse(targetX, targetY + 3, 24, 9);
      g.strokeEllipse(targetX, targetY + 3, 42, 15);
    }
  }

  private createPlayerAnimations(): void {
    const directions = [['down', 0], ['left', 4], ['right', 8], ['up', 12]] as const;
    for (const [direction, start] of directions) {
      const key = `walk-${direction}`;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          // Return to the planted pose between steps so each footfall remains
          // readable after the large source art is scaled down in the game.
          frames: [0, 1, 0, 2].map((offset) => ({
            key: 'player-medieval-sheet',
            frame: String(start + offset),
          })),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
  }

  private createPlayerFrames(): void {
    const texture = this.textures.get('player-medieval-sheet');
    if (texture.has('0')) return;
    const columns = [228, 488, 752, 1012];
    const rows = [4, 268, 542, 800];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        texture.add(String(row * 4 + column), 0, columns[column]!, rows[row]!, 200, 264);
      }
    }
  }

  private drawMinimap(snapshot: PhaserSnapshot): void {
    const g = this.mapLayer.clear();
    const compact = this.cameras.main.width < 680;
    const width = compact ? 104 : 160;
    const map = MAPS[this.location];
    const height = width * map.height / map.width;
    const x = Math.max(8, this.cameras.main.width - width - 16);
    const y = Math.max(8, this.cameras.main.height - height - 16);
    g.fillStyle(0x17201b, .9).fillRect(x - 5, y - 5, width + 10, height + 10);
    g.lineStyle(2, 0xd6b875).strokeRect(x - 5, y - 5, width + 10, height + 10);
    g.fillStyle(COLORS.grass).fillRect(x, y, width, height);
    const sx = width / map.width; const sy = height / map.height;
    if (snapshot.location === 'area1') {
      g.fillStyle(COLORS.water).fillRect(x + LAKE.x * sx, y + LAKE.y * sy, LAKE.width * sx, LAKE.height * sy);
      g.fillStyle(0x8fd28e).fillCircle(x + (RETURN_PORTAL.x + RETURN_PORTAL.width / 2) * sx, y + (RETURN_PORTAL.y + RETURN_PORTAL.height / 2) * sy, 3);
    } else {
      for (const building of BUILDINGS) g.fillStyle(building.locked ? 0x694e43 : 0xe1a25d).fillRect(x + building.x * sx, y + building.y * sy, Math.max(3, building.width * sx), Math.max(3, building.height * sy));
      g.fillStyle(0x7ee8e5).fillCircle(x + (FISHING_PORTAL.x + FISHING_PORTAL.width / 2) * sx, y + (FISHING_PORTAL.y + FISHING_PORTAL.height / 2) * sy, 3);
    }
    g.fillStyle(0xfff2a1).fillCircle(x + snapshot.player.x * sx, y + snapshot.player.y * sy, 3.5);
  }
}

function hash(x: number, y: number): number {
  return Math.abs(((x * 73856093) ^ (y * 19349663)) | 0);
}

