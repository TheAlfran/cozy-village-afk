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
  );
}

export function deactivate(): void {}
