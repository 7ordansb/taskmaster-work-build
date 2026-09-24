import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release');
const binary = join(target, 'taskmaster.exe');
const runtime = join(target, 'WebView2Loader.dll');
const installer = join(target, 'bundle', 'nsis');
const output = join(root, 'release');
try { await stat(binary); } catch { console.error('Windows app executable is missing. Run pnpm portable:win first.'); process.exit(1); }
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(binary, join(output, 'Taskmaster.exe'));
try { await stat(runtime); await copyFile(runtime, join(output, 'WebView2Loader.dll')); } catch { /* MSVC builds link the loader without a companion DLL. */ }
const launcher = `@echo off\r\nsetlocal\r\n"%~dp0Taskmaster.exe" %*\r\nif errorlevel 1 (\r\n  echo Taskmaster could not start.\r\n  echo Check that Microsoft Edge WebView2 Runtime is installed.\r\n  echo Windows 11 includes WebView2. Most supported Windows 10 systems have it already.\r\n  echo Download: https://developer.microsoft.com/microsoft-edge/webview2/\r\n  pause\r\n)\r\n`;
await writeFile(join(output, 'Launch Taskmaster.cmd'), launcher, 'utf8');
const bundles = await import('node:fs/promises');
await mkdir(join(output, 'installer'), { recursive: true });
for (const entry of await bundles.readdir(installer, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
    await copyFile(join(installer, entry.name), join(output, 'installer', entry.name));
  }
}
console.log(`Portable release staged at ${output}`);
