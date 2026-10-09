import * as vscode from 'vscode';
import { type HostToWebviewMessage, type WebviewToHostMessage } from '../shared/model.js';
import { SaveStore } from './saveStore.js';

export class GameViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'cozyVillage.gameView';

  private view: vscode.WebviewView | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private saveChain: Promise<void> = Promise.resolve();
  private readonly store: SaveStore;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new SaveStore(context.globalState);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: WebviewToHostMessage) => this.onMessage(message, view.webview));
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  refresh(): void {
    if (this.view) this.view.webview.html = this.html(this.view.webview);
    if (this.panel) this.panel.webview.html = this.html(this.panel.webview);
  }

  openFullscreen(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'cozyVillage.fullscreen',
      'Cozy Village AFK',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
      },
    );
    this.panel = panel;
    void this.view?.webview.postMessage({ type: 'setActive', active: false } satisfies HostToWebviewMessage);
    panel.webview.html = this.html(panel.webview);
    panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => this.onMessage(message, panel.webview));
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
      void this.saveChain.then(async () => {
        await this.view?.webview.postMessage({ type: 'loadState', state: this.store.load() } satisfies HostToWebviewMessage);
        await this.view?.webview.postMessage({ type: 'setActive', active: true } satisfies HostToWebviewMessage);
      });
    });
  }

  private async onMessage(message: WebviewToHostMessage, source: vscode.Webview): Promise<void> {
    if (message.type === 'webviewReady') {
      await this.saveChain;
      await source.postMessage({ type: 'loadState', state: this.store.load() } satisfies HostToWebviewMessage);
      if (this.panel && source === this.view?.webview) {
        await source.postMessage({ type: 'setActive', active: false } satisfies HostToWebviewMessage);
      }
      return;
    }
    if (message.type === 'saveState') {
      this.saveChain = this.saveChain.then(() => this.store.save(message.state).then(() => undefined));
      await this.saveChain;
      return;
    }
    if (message.type === 'resetState') {
      const answer = await vscode.window.showWarningMessage(
        'Reset all Cozy Village progress? This cannot be undone.',
        { modal: true },
        'Reset Progress',
      );
      if (answer === 'Reset Progress') {
        const reset = { type: 'resetState', state: await this.store.reset() } satisfies HostToWebviewMessage;
        await Promise.all([
          this.view?.webview.postMessage(reset) ?? Promise.resolve(false),
          this.panel?.webview.postMessage(reset) ?? Promise.resolve(false),
        ]);
      }
      return;
    }
    if (message.type === 'openFullscreen') {
      await this.saveChain;
      this.openFullscreen();
    }
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'));
    const playerSpriteUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'player-medieval-spritesheet.png'));
    const nonce = getNonce();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; connect-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Cozy Village AFK</title>
</head>
<body>
  <main id="app" aria-label="Cozy Village game">
    <section id="gameShell">
      <canvas id="gameCanvas" width="960" height="540" tabindex="0" aria-label="Cozy Village game canvas" data-player-sprite="${playerSpriteUri}"></canvas>
    <header id="hud">
      <div class="brandBlock"><div class="brand"><span>&#9670;</span> Cozy Village</div><small id="mapName">Village Hub</small></div>
      <div class="characterHud">
        <div class="levelMedallion" aria-label="Player level"><small>LV</small><b id="levelStat">1</b></div>
        <div class="progressGroup"><div class="progressLabel"><span>Adventurer</span><span id="xpStat">0 / 100 XP</span></div><div class="hudBar"><div id="xpBar"></div></div></div>
        <div class="progressGroup fishingProgress"><div class="progressLabel"><span id="fishingStat">Fishing Lv. 1</span><span id="fishingXpStat">0 / 75 XP</span></div><div class="hudBar fishingBar"><div id="fishingXpBar"></div></div></div>
      </div>
      <div class="resources">
        <div class="resource"><b id="coinStat">0</b><small>Coins</small></div>
        <div class="resource"><b id="bagStat">0/20</b><small>Fish Bag</small></div>
      </div>
      <div class="toolbar">
        <button id="expandButton" title="Open in a wide editor tab">Expand</button>
        <button id="inventoryButton" title="Inventory (E)">Inventory <kbd>E</kbd></button>
        <button id="blacksmithButton" title="Enhance your gear">Blacksmith</button>
        <button id="resetButton" class="danger">Reset</button>
      </div>
    </header>
      <div id="prompt" role="status"></div>
      <div id="toast" role="status"></div>
      <div id="inactiveNotice" class="hidden">Game opened in the editor tab</div>
      <section id="fishingControls" class="panel hidden" aria-label="Fishing controls">
        <h2>Willow Lake</h2>
        <p id="baitStatus">No bait selected</p>
        <p id="fishingStatus">The water is calm.</p>
        <div class="meter" aria-label="Fishing timing bar">
          <div id="fishingMeter"></div>
          <div id="fishingTarget" title="Catch zone"></div>
          <div id="fishingMarker" title="Moving fishing marker"></div>
        </div>
        <div class="buttonRow">
          <button id="castButton" class="primary">Fish <kbd>Space</kbd></button>
          <button id="autoButton">Auto Fish: Off <kbd>F</kbd></button>
          <button id="villageButton">Cancel <kbd>Esc</kbd></button>
        </div>
      </section>
      <section id="catchPanel" class="panel modal catchModal hidden" aria-label="Caught fish information" role="dialog" aria-modal="true">
        <small class="catchEyebrow">Catch successful</small>
        <div class="catchFishIcon" aria-hidden="true">&#x1F41F;</div>
        <h2 id="caughtFishName">Fish</h2>
        <strong id="caughtFishRarity">Common</strong>
        <p id="caughtFishOutcome">Added to your inventory.</p>
        <div class="catchDetails">
          <span><small>Value</small><b id="caughtFishValue">0 coins</b></span>
          <span><small>Experience</small><b id="caughtFishXp">+0 XP</b></span>
          <span><small>Inventory</small><b id="caughtFishQuantity">1 stored</b></span>
        </div>
        <button id="continueFishingButton" class="primary wide">Continue Fishing <kbd>Space</kbd></button>
      </section>
      <section id="fishingAreasPanel" class="panel modal areaSelectModal hidden" aria-label="Choose fishing area" role="dialog" aria-modal="true">
        <div class="panelHeader"><div><small>Fishing portal</small><h2>Choose an Area</h2><p>Travel to a separate fishing map. Esc to cancel.</p></div><button data-close="fishingAreas" aria-label="Close area selection">&times;</button></div>
        <button id="areaOneButton" class="areaChoice primary">
          <span><strong>Area 1</strong><small>Willow Lake</small></span><b>Enter</b>
        </button>
        <button class="areaChoice" disabled aria-label="Area 2 locked, coming in a future update">
          <span><strong>Area 2</strong><small>Coming in a future update</small></span><b>Locked</b>
        </button>
        <button class="areaChoice" disabled aria-label="Area 3 locked, coming in a future update">
          <span><strong>Area 3</strong><small>Coming in a future update</small></span><b>Locked</b>
        </button>
      </section>
      <section id="inventoryPanel" class="panel modal hidden" aria-label="Inventory">
        <div class="inventoryCrest">&#9670;</div>
        <div class="panelHeader inventoryHeader"><div><small>Character &amp; belongings</small><h2>Adventurer Inventory</h2></div><button data-close="inventory" aria-label="Close inventory">&times;</button></div>
        <div class="inventoryLayout">
          <section class="loadoutSection">
            <div class="sectionTitle"><h3>Equipment</h3><span>Select a slot to equip or remove</span></div>
            <div class="loadoutBoard">
              <div id="equipmentGrid" class="equipmentGrid"></div>
              <aside class="characterCard">
                <div class="characterTitle"><span>Level <b id="characterLevel">1</b></span><small>Novice</small></div>
                <canvas id="characterPortrait" width="104" height="136" aria-label="Character preview"></canvas>
                <strong id="characterName">Village Adventurer</strong>
                <small id="characterLoadout">Villager Tunic equipped</small>
                <small>Rod: <b id="equippedRodName">Old Bamboo Pole</b></small>
                <div class="miniStats"><span>Fishing <b id="characterFishing">1</b></span><span>Capacity <b id="characterCapacity">20</b></span></div>
              </aside>
            </div>
          </section>
          <section class="bagSection"><div class="sectionTitle"><h3>Stored Items</h3><span id="inventoryUsage">Fish 0 / 20</span></div><div id="inventoryList" class="itemGrid"></div></section>
        </div>
        <div class="inventoryFooter"><span>Traveler's belongings</span><span>Equipment &amp; fish</span></div>
      </section>
      <section id="marketPanel" class="panel modal hidden" aria-label="Market">
        <div class="panelHeader"><div><h2>Riverside Market</h2><p>Fresh fish fetch a fair price.</p></div><button data-close="market">&times;</button></div>
        <div id="marketList"></div>
        <button id="sellAllButton" class="primary wide">Sell All Fish</button>
      </section>
      <section id="rodShopPanel" class="panel modal rodShopModal hidden" aria-label="Fishing Supply Shop" role="dialog" aria-modal="true">
        <div class="panelHeader"><div><h2>Fishing Supply Shop</h2><p>Rods and bait for your next trip to Willow Lake.</p></div><button data-close="rodShop" aria-label="Close fishing supply shop">&times;</button></div>
        <p class="shopBalance">Your gold: <strong id="shopCoinStat">0</strong> coins</p>
        <div class="shopTabs" role="tablist" aria-label="Shop category"><button id="rodsTab" data-shop-tab="rods" role="tab" aria-controls="rodShopList">Rods</button><button id="baitTab" data-shop-tab="bait" role="tab" aria-controls="baitShopList">Bait</button></div>
        <div id="rodShopList" class="rodShopList" role="tabpanel"></div>
        <div id="baitShopList" class="rodShopList hidden" role="tabpanel"></div>
      </section>
      <section id="equipmentShopPanel" class="panel modal equipmentShopModal hidden" aria-label="Equipment Shop" role="dialog" aria-modal="true">
        <div class="panelHeader"><div><h2>Equipment Shop</h2><p>Gear and accessories for your fishing adventures. Purchases equip automatically.</p></div><button data-close="equipmentShop" aria-label="Close equipment shop">&times;</button></div>
        <p class="shopBalance">Your gold: <strong id="equipmentShopCoins">0</strong> coins</p>
        <div class="shopTabs" role="tablist" aria-label="Equipment category"><button id="gearTab" data-equipment-tab="gear" role="tab" aria-controls="gearShopList">Gear</button><button id="accessoryTab" data-equipment-tab="accessories" role="tab" aria-controls="accessoryShopList">Accessories</button></div>
        <div id="gearShopList" class="equipmentShopList" role="tabpanel"></div>
        <div id="accessoryShopList" class="equipmentShopList hidden" role="tabpanel"></div>
      </section>
      <section id="blacksmithPanel" class="panel modal equipmentShopModal hidden" aria-label="Blacksmith" role="dialog" aria-modal="true">
        <div class="panelHeader"><div><h2>Blacksmith</h2><p>Enhance owned rods, equipment, and accessories with lake materials. +1 to +6 are guaranteed; later attempts can fail and still spend their cost.</p></div><button data-close="blacksmith" aria-label="Close blacksmith">&times;</button></div>
        <p id="blacksmithResources" class="shopBalance"></p>
        <div class="shopTabs" role="tablist" aria-label="Enhancement category"><button data-blacksmith-tab="rods">Rods</button><button data-blacksmith-tab="gear">Gear</button><button data-blacksmith-tab="accessories">Accessories</button></div>
        <div id="blacksmithList" class="equipmentShopList"></div>
      </section>
      <section id="fishGuidePanel" class="panel modal fishGuideModal hidden" aria-label="Willow Lake fish guide" role="dialog" aria-modal="true">
        <div class="panelHeader"><div><h2>Willow Lake Fish Guide</h2><p id="fishGuideProgress">0 / 20 discovered</p></div><button data-close="fishGuide" aria-label="Close fish guide">&times;</button></div>
        <div id="fishGuideList" class="fishGuideList"></div>
      </section>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
}
