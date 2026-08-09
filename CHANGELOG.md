# Changelog

## 0.6.0
- Add feedbacks: `FTB is active`, `Freeze is active`, `Preset is active` (button color reflects state)
- New variables: `active_preset`, `brightness`
- Built-in preset button templates (drag-and-drop) now include their feedback

## 0.5.0
- Add action: `Freeze` (On / Off / Toggle, per-screen or all)
- Add action: `Set brightness` (0–100%, per-screen or all)
- Add drag-and-drop templates: Freeze Toggle, Brightness 25/50/75/100

## 0.4.0
- Add action: `FTB (Fade to Black)` with mode dropdown (On / Off / Toggle) and fade time
- Auto-fetch screens list; screen picker in FTB action (individual or "All screens")
- Add drag-and-drop templates: FTB Toggle / On / Off

## 0.3.0
- Auto-discover presets after login; `Recall preset` dropdown is now populated live
- Automatic re-login retry on token expiry
- Add `Refresh preset list` action

## 0.2.0
- Simplified auth-free preset recall using device SN from `/ucenter/device-list`

## 0.1.0
- Initial: `Recall preset` action with manual GUID list
