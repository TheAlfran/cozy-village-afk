import * as vscode from 'vscode';
import { GameViewProvider } from './gameView.js';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GameViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GameViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('cozyVillage.openGame', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.cozyVillage');
      await vscode.commands.executeCommand(`${GameViewProvider.viewType}.focus`);
    }),
    vscode.commands.registerCommand('cozyVillage.openFullscreen', () => provider.openFullscreen()),
  );

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    enableDevelopmentReload(context, provider);
  }
}

export function deactivate(): void {}

function enableDevelopmentReload(context: vscode.ExtensionContext, provider: GameViewProvider): void {
  const webviewWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(context.extensionUri.fsPath, 'dist/{webview.js,webview.css}'),
  );
  const extensionWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(context.extensionUri.fsPath, 'dist/extension.js'),
  );
  let webviewTimer: NodeJS.Timeout | undefined;
  let extensionTimer: NodeJS.Timeout | undefined;

  const refreshWebview = (): void => {
    clearTimeout(webviewTimer);
    webviewTimer = setTimeout(() => {
      provider.refresh();
      void vscode.window.setStatusBarMessage('Cozy Village: game refreshed', 1500);
    }, 150);
  };
  const reloadExtensionHost = (): void => {
    clearTimeout(extensionTimer);
    extensionTimer = setTimeout(() => {
      void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }, 300);
  };

  webviewWatcher.onDidChange(refreshWebview);
  webviewWatcher.onDidCreate(refreshWebview);
  extensionWatcher.onDidChange(reloadExtensionHost);
  extensionWatcher.onDidCreate(reloadExtensionHost);
  context.subscriptions.push(
    webviewWatcher,
    extensionWatcher,
    new vscode.Disposable(() => {
      clearTimeout(webviewTimer);
      clearTimeout(extensionTimer);
    }),
  );
}
