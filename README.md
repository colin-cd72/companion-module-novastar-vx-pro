# companion-module-novastar-vx-pro

Bitfocus Companion module for **Novastar VX Pro-series** LED video processors — controls the device via its embedded Unico HTTP API on port 19999.

Tested on **VX400 Pro** (firmware V1.3.0, Unico V2.2.B1). Likely works on **VX600 Pro / VX1000 Pro / VX2000 Pro** since they share the Unico stack, but this is unverified — reports welcome.

## Features

**Actions**
- **Recall preset** — dropdown of live presets fetched from the device
- **FTB (Fade to Black)** — On / Off / Toggle, per-screen or all, with fade time
- **Freeze** — On / Off / Toggle, per-screen or all
- **Set brightness** — 0–100%, per-screen or all
- **Refresh preset list** — manual re-fetch

**Feedbacks** (button color reflects state)
- `FTB is active` — red when FTB is on
- `Freeze is active` — blue when Freeze is on
- `Preset is active` — green on the button of the last-recalled preset

**Variables**
- `$(VX_Pro:device_name)` — friendly device name from Unico
- `$(VX_Pro:device_sn)` — device serial number
- `$(VX_Pro:preset_count)` / `$(VX_Pro:screen_count)`
- `$(VX_Pro:ftb_state)` / `$(VX_Pro:freeze_state)` — `on` / `off`
- `$(VX_Pro:active_preset)` — name of last recalled preset
- `$(VX_Pro:brightness)` — last-set brightness percent

**Built-in preset templates** (drag from the Presets panel)
- Preset buttons — one per preset defined on the device, with active-state feedback
- FTB Toggle / On / Off (all screens)
- Freeze Toggle (all screens)
- Brightness 25% / 50% / 75% / 100%

## Configuration

| Field | Default | Notes |
|---|---|---|
| Device IP | *(required)* | e.g. `10.201.100.80` |
| Unico port | `19999` | Almost always 19999 |
| Username | `admin` | Default Unico admin user |
| Password (base64) | `MTIzNDU2` | = `"123456"`. Default admin password |
| Device SN | *(auto)* | Auto-resolved from `/ucenter/device-list` — override only if the device isn't in the list |

## Installing (developer / pre-release)

This module isn't in the Bitfocus module store yet. To install manually:

1. Download the latest `novastar-vx-pro-*.tgz` from the [Releases page](https://github.com/deford/companion-module-novastar-vx-pro/releases).
2. In Companion (v5.1+) go to **Modules** → **Import module package** → pick the tarball.
3. Under **Connections**, click **+ Add connection** → search for `Novastar VX Pro` → add it.
4. Set the **Device IP** field and Save. Preset list populates automatically.

## Building from source

```bash
npm install
npm run build          # bundles src/ → pkg/
npm run pack           # produces novastar-vx-pro.tgz for Companion import
```

The build uses `esbuild` directly (see `build.mjs`) and produces the layout Companion expects: `main.js` at root, `companion/manifest.json`, and a minimal `package.json`.

## How it works — protocol notes

The VX Pro doesn't expose an official public API. Everything here was reverse-engineered from the Unico web UI running on the device at port 19999.

- The web UI is a single-page app (`unico`, versioned V2.2.B1 as of Feb 2026)
- Most JSON REST endpoints live under `/unico/v1/…`; the ones under `/ucenter/…` don't need auth. Others require a JWT from `POST /unico/v1/system/auth/login`.
- Auth'd endpoints need four **lowercase** proxy headers: `ip: <device-ip>`, `port: 8088`, `protocol: http`, `clienttype: 0`. Without those, endpoints return `请在headers中传入你要代理的IP` (`"please pass the IP you want to proxy in headers"`).
- The device also runs a WebSocket at `ws://<host>:19999/unico/v1/ucenter/ws` using a binary NOVA-framed protocol (magic `4E4F5641` + 22-byte header + TLV payloads, CRC-16 reflected CCITT). This module doesn't use the WebSocket — the REST API covers everything currently implemented.

Key endpoints in use:

| Method | Path | Auth | Body / Purpose |
|---|---|---|---|
| POST | `/unico/v1/system/auth/login` | proxy headers | `{username, password}` → returns JWT |
| GET | `/unico/v1/ucenter/device-list?clientType=0` | none | List devices (SN, name, IP) |
| GET | `/unico/v1/ucenter/screen/normal-screen?projectId=defaultProject-vx` | none | List screens (guid, name) |
| GET | `/unico/v1/preset` | proxy + token | Preset list (guid, serial, name, sourceRegion, currentRegion) |
| POST | `/unico/v1/ucenter/preset/apply` | none | Recall preset by guid |
| POST | `/unico/v1/ucenter/screen/ftb` | none | Fade to black |
| POST | `/unico/v1/ucenter/screen/freeze` | none | Freeze |
| POST | `/unico/v1/ucenter/cabinet/brightness` | none | Set brightness (ratio 0–10000) |

## Limitations

- **State polling not implemented.** FTB / Freeze / active-preset feedbacks reflect the last command *this module sent*. If you change state from the Unico UI or a physical console, the module doesn't notice. Adding either WebSocket subscription or periodic REST polling would fix this.
- **Cut / Take, Source select, Layer on-off**: none of these mapped to a single endpoint on the VX400 Pro I tested. They're done through preset recall or the layer editor (multi-step) — recall a preset instead.
- **Multi-controller setups** (multiple VX Pro units on one network): not tested. The `sn` field per action would need to reflect the intended device.

## License

MIT. See [LICENSE](LICENSE).
