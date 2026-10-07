import * as vscode from 'vscode';
import { type HostToWebviewMessage, type WebviewToHostMessage } from '../shared/model.js';
import { SaveStore } from './saveStore.js';

export class GameViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'cozyVillage.gameView';

  private view: vscode.WebviewView | undefined;
  private saveChain: Promise<void> = Promise.resolve();
  private readonly store: SaveStore;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new SaveStore(context.globalState);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: WebviewToHostMessage) => this.onMessage(message));
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  private async onMessage(message: WebviewToHostMessage): Promise<void> {
    if (message.type === 'webviewReady') {
      await this.post({ type: 'loadState', state: this.store.load() });
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
        await this.post({ type: 'resetState', state: await this.store.reset() });
      }
    }
  }

  private post(message: HostToWebviewMessage): Thenable<boolean> {
    return this.view?.webview.postMessage(message) ?? Promise.resolve(false);
  }

  private html(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'));
    const nonce = getNonce();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Cozy Village AFK</title>
</head>
<body>
  <main id="app" aria-label="Cozy Village game">
    <header id="hud">
      <div class="brand"><span>&#9670;</span> Cozy Village</div>
      <div class="stats">
        <span id="levelStat">Lv. 1</span><span id="xpStat">XP 0/100</span>
        <span id="fishingStat">Fishing 1</span><span id="coinStat">Coins 0</span>
        <span id="bagStat">Bag 0/20</span>
      </div>
      <div class="toolbar">
        <button id="inventoryButton" title="Inventory (I)">Inventory</button>
        <button id="resetButton" class="danger">Reset</button>
      </div>
    </header>
    <section id="gameShell">
      <canvas id="gameCanvas" width="960" height="540" tabindex="0" aria-label="Cozy Village game canvas"></canvas>
      <div id="prompt" role="status"></div>
      <div id="toast" role="status"></div>
      <section id="fishingControls" class="panel hidden" aria-label="Fishing controls">
        <h2>Willow Lake</h2>
        <p id="fishingStatus">The water is calm.</p>
        <div class="meter"><div id="fishingMeter"></div></div>
        <div class="buttonRow">
          <button id="castButton" class="primary">Cast Line <kbd>Space</kbd></button>
          <button id="autoButton">Auto Fish: Off</button>
          <button id="villageButton">Back <kbd>Esc</kbd></button>
        </div>
      </section>
      <section id="inventoryPanel" class="panel modal hidden" aria-label="Inventory">
        <div class="panelHeader"><h2>Fishing Bag</h2><button data-close="inventory">&times;</button></div>
        <div id="inventoryList"></div>
      </section>
      <section id="marketPanel" class="panel modal hidden" aria-label="Market">
        <div class="panelHeader"><div><h2>Riverside Market</h2><p>Fresh fish fetch a fair price.</p></div><button data-close="market">&times;</button></div>
        <div id="marketList"></div>
        <button id="sellAllButton" class="primary wide">Sell All Fish</button>
      </section>
    </section>
    <footer><span>WASD Move</span><span>E Interact</span><span>I Bag</span></footer>
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
