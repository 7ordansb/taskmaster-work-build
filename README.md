# Taskmaster

A local-first Windows task tracker with a shared task board and hierarchy mind map.

## Development

Prerequisites: Node.js, pnpm, Rust (stable MSVC toolchain), Microsoft C++ Build Tools, and WebView2.

```powershell
pnpm install
pnpm dev
```

For the desktop shell during development, run `pnpm tauri dev` in a terminal with the Rust toolchain installed.

## Build a portable Windows release

```powershell
pnpm install
pnpm build
pnpm portable:win
pnpm portable:stage
```

`pnpm portable:stage` creates a `release` folder with `Taskmaster.exe`, `WebView2Loader.dll`, a launcher, and an `installer` subfolder containing the optional setup package for environments that prefer it. Launch the EXE or CMD directly from that folder; the EXE does not install the app. Task data lives in the current Windows user's local app-data directory so replacing the release files does not overwrite data. The command file displays troubleshooting guidance if WebView2 is missing.

The app uses the shared WebView2 runtime. It is included with Windows 11 and present on most supported Windows 10 systems. If Windows reports a missing WebView2 runtime, install the Microsoft Edge WebView2 Evergreen Runtime and relaunch. This is a runtime prerequisite, not an app installer.

## Build online with GitHub Actions

The repository includes a Windows cloud build workflow at `.github/workflows/build-windows.yml`. After pushing this project to GitHub, open **Actions → Build portable Windows app → Run workflow**. When the run completes, download the `Taskmaster-Windows-x64` artifact and extract it. The workflow builds on Microsoft's hosted Windows runner, so Rust and C++ build tools do not need to be installed on your PC.

## Data behavior

The browser preview uses local storage. The desktop app uses SQLite, creates its database on first launch, and starts with example tasks so both views can be explored immediately. Reset or delete preview data through browser storage if you want a clean browser demo.
