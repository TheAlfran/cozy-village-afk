import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH, type SceneId } from '../shared/model.js';
import { BUILDINGS, LAKE } from './world.js';
import type { FishingPhase } from './fishing.js';

export interface PhaserSnapshot {
  scene: SceneId;
  player: { x: number; y: number };
  facing: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
  fishingPhase: FishingPhase;
  autoFishing: boolean;
}

export interface PhaserHooks {
  tick(deltaSeconds: number, now: number): void;
  snapshot(): PhaserSnapshot;
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
      scene: [new VillageScene(hooks, playerSpriteUrl), new FishingScene(hooks)],
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

  constructor(private readonly hooks: PhaserHooks, private readonly playerSpriteUrl: string) {
    super({ key: 'VillageScene' });
  }

  preload(): void {
    if (!this.textures.exists('player-medieval-sheet')) this.load.image('player-medieval-sheet', this.playerSpriteUrl);
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setRoundPixels(true);
    this.staticLayer = this.add.graphics().setDepth(0);
    this.animatedLayer = this.add.graphics().setDepth(3);
    this.actorLayer = this.add.graphics().setDepth(10);
    this.mapLayer = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.drawWorld();
    const player = this.hooks.snapshot().player;
    this.createPlayerFrames();
    this.createPlayerAnimations();
    this.playerSprite = this.add.sprite(player.x, player.y, 'player-medieval-sheet', '0')
      .setOrigin(.5, .96)
      .setScale(PLAYER_SCALE)
      .setDepth(11);
    this.cameras.main.centerOn(player.x, player.y);
  }

  update(time: number, delta: number): void {
    this.hooks.tick(Math.min(delta / 1000, 0.05), time);
    const snapshot = this.hooks.snapshot();
    if (snapshot.scene !== 'village') {
      this.scene.start('FishingScene');
      return;
    }
    const camera = this.cameras.main;
    const targetX = Phaser.Math.Clamp(snapshot.player.x - camera.width / 2, 0, Math.max(0, WORLD_WIDTH - camera.width));
    const targetY = Phaser.Math.Clamp(snapshot.player.y - camera.height / 2, 0, Math.max(0, WORLD_HEIGHT - camera.height));
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, 0.12);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetY, 0.12);
    this.drawAnimatedWorld(time);
    this.drawPlayer(snapshot);
    this.drawMinimap(snapshot);
  }

  private drawWorld(): void {
    const g = this.staticLayer;
    g.fillStyle(COLORS.grass).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let y = 0; y < WORLD_HEIGHT; y += 48) for (let x = 0; x < WORLD_WIDTH; x += 48) {
      const shade = hash(x, y) % 3;
      g.fillStyle(shade === 0 ? 0x73a65c : shade === 1 ? COLORS.grassLight : 0x6d9b56).fillRect(x, y, 48, 48);
      if (hash(x + 11, y + 7) % 5 === 0) {
        g.fillStyle(0x4f813f).fillRect(x + 9, y + 13, 2, 7).fillRect(x + 13, y + 16, 2, 4);
      }
    }
    this.drawRoads(g);
    this.drawFarm(g);
    BUILDINGS.forEach((building) => this.drawBuilding(g, building));
    for (let x = 18; x < WORLD_WIDTH; x += 46) { this.drawTree(g, x, 22); this.drawTree(g, x, WORLD_HEIGHT - 18); }
    for (let y = 65; y < WORLD_HEIGHT; y += 50) { this.drawTree(g, 18, y); this.drawTree(g, WORLD_WIDTH - 18, y); }
    for (let x = 80; x <= 2200; x += 170) if (x < 800 || x > 1350) this.drawTree(g, x, 820 + (x % 3) * 35);
    this.drawDetails(g);
  }

  private drawRoads(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(COLORS.roadEdge).fillRect(0, 644, WORLD_WIDTH, 90);
    for (const x of [269, 714, 1344, 1874]) g.fillRect(x, 0, 86, WORLD_HEIGHT);
    g.fillStyle(COLORS.road).fillRect(0, 650, WORLD_WIDTH, 78);
    for (const x of [275, 720, 1350, 1880]) g.fillRect(x, 0, 74, WORLD_HEIGHT);
    g.fillStyle(0xa98a5b);
    for (let x = 20; x < WORLD_WIDTH; x += 92) g.fillRect(x, 687 + (x % 3), 17, 3);
    for (const roadX of [305, 750, 1380, 1910]) for (let y = 35; y < WORLD_HEIGHT; y += 86) g.fillRect(roadX + (y % 5), y, 3, 15);
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
    for (const [x, y] of [[410, 380], [520, 760], [1510, 540], [2080, 690], [1450, 1190], [820, 1020]] as const) {
      for (let index = 0; index < 7; index += 1) {
        const fx = x + (index % 4) * 12; const fy = y + Math.floor(index / 4) * 14;
        g.fillStyle(0x3f733e).fillRect(fx, fy, 2, 7);
        g.fillStyle(index % 2 ? 0xf2a4af : 0xf5d66d).fillRect(fx - 2, fy - 3, 6, 5);
      }
    }
    for (const x of [390, 820, 1305, 1750, 2230]) {
      g.fillStyle(0x49382c).fillRect(x - 3, 620, 6, 35);
      g.fillStyle(0x2d2927).fillRect(x - 9, 612, 18, 12);
      g.fillStyle(0xffda78).fillRect(x - 6, 615, 12, 7);
    }
  }

  private drawAnimatedWorld(time: number): void {
    const g = this.animatedLayer.clear();
    g.fillStyle(0xbea66d).fillRoundedRect(LAKE.x - 14, LAKE.y - 14, LAKE.width + 28, LAKE.height + 28, 58);
    g.fillStyle(COLORS.water).fillRoundedRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 48);
    g.lineStyle(4, COLORS.waterLight).strokeRoundedRect(LAKE.x, LAKE.y, LAKE.width, LAKE.height, 48);
    for (let row = 0; row < 7; row += 1) for (let column = 0; column < 4; column += 1) {
      const shift = Math.sin(time / 650 + row * 1.7) * 22;
      g.lineStyle(3, row % 2 ? 0x63afbd : 0xa3d7d1, row % 2 ? .6 : .4);
      const x = LAKE.x + 28 + column * 118 + shift; const y = LAKE.y + 30 + row * 43;
      g.lineBetween(x, y, x + 54, y);
    }
    for (const [x, y] of [[930, 475], [1190, 590], [1040, 640]] as const) {
      g.fillStyle(0x4b8b4c).fillEllipse(x, y, 30, 16); g.fillStyle(0xf4a6b6).fillRect(x - 2, y - 5, 5, 5);
    }
    g.fillStyle(0x5e422d).fillRect(780, 535, 155, 38);
    g.fillStyle(0x99704a); for (let x = 785; x < 930; x += 20) g.fillRect(x, 539, 15, 30);
    g.fillStyle(0x4b3426).fillRect(800, 570, 10, 55).fillRect(910, 570, 10, 55);
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
    const height = compact ? 61 : 94;
    const x = Math.max(8, this.cameras.main.width - width - 16);
    const y = Math.max(8, this.cameras.main.height - height - 16);
    g.fillStyle(0x17201b, .9).fillRect(x - 5, y - 5, width + 10, height + 10);
    g.lineStyle(2, 0xd6b875).strokeRect(x - 5, y - 5, width + 10, height + 10);
    g.fillStyle(COLORS.grass).fillRect(x, y, width, height);
    const sx = width / WORLD_WIDTH; const sy = height / WORLD_HEIGHT;
    g.fillStyle(COLORS.water).fillRect(x + LAKE.x * sx, y + LAKE.y * sy, LAKE.width * sx, LAKE.height * sy);
    for (const building of BUILDINGS) g.fillStyle(building.locked ? 0x694e43 : 0xe1a25d).fillRect(x + building.x * sx, y + building.y * sy, Math.max(3, building.width * sx), Math.max(3, building.height * sy));
    g.fillStyle(0xfff2a1).fillCircle(x + snapshot.player.x * sx, y + snapshot.player.y * sy, 3.5);
  }
}

class FishingScene extends Phaser.Scene {
  private staticLayer!: Phaser.GameObjects.Graphics;
  private animatedLayer!: Phaser.GameObjects.Graphics;
  private actorLayer!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private playerSprite!: Phaser.GameObjects.Sprite;

  constructor(private readonly hooks: PhaserHooks) {
    super({ key: 'FishingScene' });
  }

  create(): void {
    this.staticLayer = this.add.graphics(); this.animatedLayer = this.add.graphics(); this.actorLayer = this.add.graphics();
    this.drawBackdrop();
    this.title = this.add.text(this.cameras.main.width / 2, 42, 'Willow Lake', { fontFamily: 'Georgia', fontSize: '32px', fontStyle: 'bold', color: '#fff2c9' }).setOrigin(.5);
    this.subtitle = this.add.text(this.cameras.main.width / 2, 78, 'Listen to the water. Wait for the bite.', { fontFamily: 'Georgia', fontSize: '13px', fontStyle: 'italic', color: '#f8ddb0' }).setOrigin(.5);
    this.playerSprite = this.add.sprite(190, 355, 'player-medieval-sheet', String(IDLE_FRAME.right)).setOrigin(.5, .96).setScale(PLAYER_SCALE).setDepth(3);
  }

  update(time: number, delta: number): void {
    this.hooks.tick(Math.min(delta / 1000, .05), time);
    const snapshot = this.hooks.snapshot();
    if (snapshot.scene !== 'fishing') { this.scene.start('VillageScene'); return; }
    this.title.x = this.cameras.main.width / 2;
    this.subtitle.x = this.cameras.main.width / 2;
    this.drawWater(snapshot, time);
  }

  private drawBackdrop(): void {
    const g = this.staticLayer;
    g.fillStyle(0x24556c).fillRect(0, 0, this.scale.width, this.scale.height);
    g.fillGradientStyle(0x315f83, 0x315f83, 0xdfa96f, 0xdfa96f).fillRect(0, 0, 960, 300);
    g.fillStyle(0xf4c978).fillCircle(770, 115, 48);
    g.fillStyle(0x304e48).fillTriangle(0, 300, 170, 165, 360, 310).fillTriangle(250, 310, 455, 135, 650, 310).fillTriangle(570, 310, 790, 170, 960, 300);
    g.fillStyle(0x263d38).fillTriangle(0, 330, 230, 240, 440, 330).fillTriangle(350, 330, 620, 225, 860, 330).fillTriangle(720, 330, 900, 245, 960, 330);
    g.fillStyle(0x24556c).fillRect(0, 300, 960, 240);
    g.fillStyle(0x3c2e28).fillRect(45, 375, 310, 43); g.fillStyle(0x745339);
    for (let x = 52; x < 350; x += 25) g.fillRect(x, 380, 19, 33);
    g.fillStyle(0x332821).fillRect(82, 415, 19, 110).fillRect(295, 415, 19, 110);
  }

  private drawWater(snapshot: PhaserSnapshot, time: number): void {
    const g = this.animatedLayer.clear();
    g.lineStyle(3, 0x73b6c2);
    for (let y = 330; y < 540; y += 28) for (let x = -30; x < 960; x += 240) {
      const shift = Math.sin(time / 450 + y) * 25; g.lineBetween(x + shift, y, x + 110 + shift, y);
    }
    this.actorLayer.clear().fillStyle(0x202631, .27).fillEllipse(190, 357, 29, 9);
    this.playerSprite.setPosition(190, 355);
    this.playerSprite.setScale(PLAYER_SCALE).setAngle(0);
    g.lineStyle(3, 0x292526).lineBetween(205, 345, 525, 300);
    g.lineStyle(1, 0xddd4bb).lineBetween(525, 300, 580, 382);
    g.fillStyle(0xef6b55).fillRect(575, 377 + Math.sin(time / 320) * 2, 10, 9);
    if (snapshot.fishingPhase === 'bite' && !snapshot.autoFishing) {
      g.lineStyle(3, 0xe9f4e8);
      for (let ring = 0; ring < 3; ring += 1) g.strokeEllipse(580, 390, 36 + ring * 20, 14 + ring * 8);
      this.cameras.main.shake(80, .002);
    }
  }

}

function hash(x: number, y: number): number {
  return Math.abs(((x * 73856093) ^ (y * 19349663)) | 0);
}

