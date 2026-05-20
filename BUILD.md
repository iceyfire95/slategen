# Build

All builds run from macOS arm64 (M-series).

## One-time setup

```
npm install
```

## Outputs land in `dist/`

| Command | Produces |
|---|---|
| `npm run mac:build` | `SlateGen-1.0.0-arm64.dmg`, `SlateGen-1.0.0-x64.dmg` (+ zips) |
| `npm run win:build` | `SlateGen-1.0.0-win-x64.exe` (portable, single file) + zip |
| `npm run linux:build` | `SlateGen_1.0.0_amd64.deb`, `SlateGen_1.0.0_arm64.deb` |
| `npm run release:all` | All of the above in one shot |

## Notes

- **Unsigned.** Mac users right-click → Open the first time. Windows shows SmartScreen warning, click "More info" → "Run anyway".
- **Linux deb** built natively on macOS — electron-builder bundles `fpm` to produce the .deb. Tested on Debian Bookworm. Install with `sudo apt install ./SlateGen_1.0.0_amd64.deb`.
- **Windows exe** built from macOS without Wine — `portable` target is supported cross-platform. No installer, just the exe.
- **Intel Mac dmg** is the `x64` one; rename to `-intelmac.dmg` if releasing for clarity.
- **Icons:** placeholders in `build/icon.{icns,ico,png}`. Replace with real artwork later — same filenames, no config change needed.

## Release flow

1. Bump `version` in `package.json`
2. `npm run release:all`
3. Commit (`dist/` is gitignored)
4. `git tag v1.0.x && git push --tags`
5. GitHub Release → drag everything from `dist/` → mark pre-release if testing
