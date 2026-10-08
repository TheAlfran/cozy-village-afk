# Cozy Village AFK

A Phaser 3 fishing and idle game that runs in a Visual Studio Code WebView, with a large explorable village, manual and AFK fishing, progression, and local saves.

## Live development

1. Open the `cozy-village-afk` folder itself in VS Code.
2. Press `F5` and choose **Run Cozy Village Extension** if prompted.
3. In the Extension Development Host window, click the Cozy Village Activity Bar icon.

The watcher rebuilds changed files automatically. Game and CSS changes refresh the sidebar in place; extension-host changes reload the development window. You do not need to build or reinstall a VSIX while developing.

## Commands

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd run compile
```

Build an installable package with `npm.cmd run package:vsix`. Versioned packages are written to `releases/`.
