# Audiobook Studio — Desktop shell (planned)

This folder will hold the **Electron** wrapper that:

- Starts the Next.js web app and folder watcher as child processes
- Opens a dedicated window (no separate browser tab)
- Reads/writes user config from `%LOCALAPPDATA%\AudiobookStudio\`
- Runs the first-time setup wizard when `WATCH_FOLDER` is not configured

For now, use `npm run dev` + `npm run dev:watcher` or `launchers\Start-Audiobook-Studio.bat`.
