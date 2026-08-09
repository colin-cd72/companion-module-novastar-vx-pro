# Novastar VX Pro

Bitfocus Companion module for **Novastar VX Pro-series** LED video processors (VX400 / VX600 / VX1000 / VX2000 Pro). Controls the device via its embedded Unico HTTP API on port 19999.

Tested on VX400 Pro (firmware V1.3.0, Unico V2.2.B1). Other VX Pro models likely work — reports welcome.

## Setup

1. Add a new **Novastar VX Pro** connection.
2. Fill in **Device IP** (e.g. `10.201.100.80`). Everything else can stay at defaults.
3. Save. The module logs in as `admin` (default password `123456`) and fetches the preset and screen lists automatically.

| Field | Default | Notes |
|---|---|---|
| Device IP | *(required)* | The processor's LAN address |
| Unico port | `19999` | Almost always 19999 |
| Username | `admin` | Default Unico admin |
| Password (base64) | `MTIzNDU2` | Base64 of `123456` (the default) |
| Device SN | *(auto)* | Auto-resolved; only set if you have multiple VX Pro units |

## Actions

- **Recall preset** — dropdown of live presets from the device
- **FTB (Fade to Black)** — On / Off / Toggle, per-screen or all, with fade time
- **Freeze** — On / Off / Toggle, per-screen or all
- **Set brightness** — 0–100%, per-screen or all
- **Refresh preset list** — manual re-fetch

## Feedbacks (button color reflects state)

- **FTB is active** — red when FTB is on
- **Freeze is active** — blue when Freeze is on
- **Preset is active** — green on the button of the last-recalled preset

State is tracked based on commands this module sends. If someone changes state from the Unico UI or a physical console, the feedbacks won't update until you send a new command from Companion.

## Variables

- `device_name`, `device_sn` — from the device
- `preset_count`, `screen_count`
- `ftb_state`, `freeze_state` — `on` / `off`
- `active_preset` — name of the last recalled preset
- `brightness` — last-set brightness percent

## Built-in preset templates (drag-and-drop)

Pre-built button templates appear under **Presets** in Companion:
- One button per preset defined on the device (with active-state feedback)
- FTB Toggle / On / Off (all screens)
- Freeze Toggle (all screens)
- Brightness 25% / 50% / 75% / 100%

## Known limitations

- **No live device polling.** Feedbacks reflect the last command this module sent, not the device's actual state.
- **Cut / Take, Source select, Layer on-off** are not exposed as single-endpoint actions on the VX Pro Unico API. Achieve them via preset recall.
- **Multi-controller setups** (multiple VX Pro units on one network) are not tested.

## Reporting issues

Please include the Companion log (Log tab) and the exact action + preset / screen involved. Repo: [github.com/colin-cd72/companion-module-novastar-vx-pro](https://github.com/colin-cd72/companion-module-novastar-vx-pro).
