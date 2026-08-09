import { InstanceBase, InstanceStatus, Regex, combineRgb, runEntrypoint } from '@companion-module/base'
import { UnicoApi } from './api.js'

class NovastarVxProInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.presets = []
		this.screens = []
		this.ftbState = false
		this.freezeState = false
		this.activePresetGuid = null
		this.brightnessPercent = null
		this.pollTimer = null
	}

	async init(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)
		await this.connect()
	}

	async destroy() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
	}

	async configUpdated(config) {
		this.config = config
		await this.destroy()
		await this.connect()
	}

	async connect() {
		if (!this.config?.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Host not set')
			return
		}
		this.api = new UnicoApi(this.config.host, this.config.port || 19999, this)

		try {
			// Resolve SN from device-list (unauth) unless overridden in config.
			const devices = await this.api.deviceList()
			let device = devices.find((d) => d.ip === this.config.host)
			if (!device && devices.length === 1) device = devices[0]

			this.deviceSn = this.config.sn?.trim() || device?.SN
			this.deviceName = device?.deviceName || ''
			if (!this.deviceSn) {
				this.updateStatus(InstanceStatus.BadConfig, 'SN not set and not in device-list')
				return
			}

			// Login for authenticated GETs (preset list, etc.).
			await this.api.login(this.config.username || 'admin', this.config.password || 'MTIzNDU2')

			this.log('info', `Ready. ${this.deviceName ? `Device: ${this.deviceName} ` : ''}SN=${this.deviceSn}`)
			this.updateStatus(InstanceStatus.Ok)

			this.setVariableDefinitions([
				{ variableId: 'device_name', name: 'Device name' },
				{ variableId: 'device_sn', name: 'Device serial' },
				{ variableId: 'preset_count', name: 'Preset count' },
				{ variableId: 'screen_count', name: 'Screen count' },
				{ variableId: 'ftb_state', name: 'FTB state (on/off)' },
				{ variableId: 'freeze_state', name: 'Freeze state (on/off)' },
				{ variableId: 'active_preset', name: 'Active preset name' },
				{ variableId: 'brightness', name: 'Last-set brightness %' },
			])
			this.setVariableValues({
				device_name: this.deviceName,
				device_sn: this.deviceSn,
				ftb_state: 'off',
				freeze_state: 'off',
				active_preset: '',
				brightness: '',
			})

			await this.refreshScreens()
			await this.refreshPresets()
			this.registerFeedbacks()
			this.pollTimer = setInterval(
				() => this.refreshPresets().catch((e) => this.log('warn', `refresh: ${e.message}`)),
				20000,
			)
		} catch (e) {
			this.log('error', `Connect failed: ${e.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, e.message)
		}
	}

	async refreshPresets() {
		const list = await this.api.listPresets()
		this.presets = list
		this.setVariableValues({ preset_count: list.length })
		this.log('debug', `Loaded ${list.length} preset(s)`)
		this.registerActions()
		this.registerPresets()
	}

	async refreshScreens() {
		try {
			this.screens = await this.api.listScreens()
			this.setVariableValues({ screen_count: this.screens.length })
			this.log('debug', `Loaded ${this.screens.length} screen(s): ${this.screens.map((s) => s.name).join(', ')}`)
		} catch (e) {
			this.log('warn', `refreshScreens: ${e.message}`)
		}
	}

	screenChoices() {
		if (!this.screens.length) return [{ id: '', label: '(no screens found)' }]
		return [
			{ id: '*', label: 'All screens' },
			...this.screens.map((s) => ({ id: s.guid, label: s.name || s.guid })),
		]
	}

	resolveScreenGuids(selection) {
		if (!selection || selection === '*') return this.screens.map((s) => s.guid)
		return [selection]
	}

	presetChoices() {
		if (!this.presets.length) return [{ id: '', label: '(no presets — create one on the device)' }]
		return this.presets.map((p) => ({
			id: p.guid,
			label: `${p.serial ?? '?'}: ${p.name || '(unnamed)'}`,
		}))
	}

	registerActions() {
		this.setActionDefinitions({
			recall_preset: {
				name: 'Recall preset',
				options: [
					{
						id: 'preset',
						type: 'dropdown',
						label: 'Preset',
						choices: this.presetChoices(),
						default: this.presets[0]?.guid ?? '',
						allowCustom: true,
					},
				],
				callback: async (action) => {
					const guid = action.options.preset
					const known = this.presets.find((p) => p.guid === guid)
					const preset = known ?? { guid }
					try {
						await this.api.applyPreset(this.deviceSn, preset)
						this.log('info', `Recalled preset ${known?.name || guid}`)
						this.activePresetGuid = guid
						this.setVariableValues({ active_preset: known?.name || guid })
						this.checkFeedbacks('preset_active')
					} catch (e) {
						this.log('error', `Recall failed: ${e.message}`)
						try {
							await this.api.login(this.config.username || 'admin', this.config.password || 'MTIzNDU2')
							await this.api.applyPreset(this.deviceSn, preset)
							this.log('info', `Recalled after re-login`)
							this.activePresetGuid = guid
							this.setVariableValues({ active_preset: known?.name || guid })
							this.checkFeedbacks('preset_active')
						} catch (e2) {
							this.log('error', `Retry failed: ${e2.message}`)
						}
					}
				},
			},
			refresh_presets: {
				name: 'Refresh preset list',
				options: [],
				callback: async () => {
					try { await this.refreshPresets() } catch (e) { this.log('warn', String(e)) }
				},
			},
			freeze: {
				name: 'Freeze',
				options: [
					{
						id: 'mode',
						type: 'dropdown',
						label: 'Mode',
						default: 'toggle',
						choices: [
							{ id: 'on', label: 'On' },
							{ id: 'off', label: 'Off' },
							{ id: 'toggle', label: 'Toggle' },
						],
					},
					{
						id: 'screen',
						type: 'dropdown',
						label: 'Screen',
						default: '*',
						choices: this.screenChoices(),
						allowCustom: true,
					},
				],
				callback: async (action) => {
					const guids = this.resolveScreenGuids(action.options.screen)
					if (!guids.length) { this.log('warn', 'Freeze: no screens'); return }
					let enable
					if (action.options.mode === 'on') enable = true
					else if (action.options.mode === 'off') enable = false
					else enable = !this.freezeState
					try {
						await this.api.freeze(guids, enable)
						this.freezeState = enable
						this.setVariableValues({ freeze_state: enable ? 'on' : 'off' })
						this.checkFeedbacks('freeze_active')
						this.log('info', `Freeze ${enable ? 'ON' : 'OFF'} on ${guids.length} screen(s)`)
					} catch (e) {
						this.log('error', `Freeze failed: ${e.message}`)
					}
				},
			},
			set_brightness: {
				name: 'Set brightness',
				options: [
					{
						id: 'percent',
						type: 'number',
						label: 'Brightness (%)',
						default: 50,
						min: 0,
						max: 100,
						step: 1,
					},
					{
						id: 'screen',
						type: 'dropdown',
						label: 'Screen',
						default: '*',
						choices: this.screenChoices(),
						allowCustom: true,
					},
				],
				callback: async (action) => {
					const guids = this.resolveScreenGuids(action.options.screen)
					if (!guids.length) { this.log('warn', 'Brightness: no screens'); return }
					const percent = Number(action.options.percent)
					try {
						await this.api.setBrightness(guids, percent)
						this.brightnessPercent = percent
						this.setVariableValues({ brightness: String(percent) })
						this.log('info', `Brightness ${percent}% on ${guids.length} screen(s)`)
					} catch (e) {
						this.log('error', `Brightness failed: ${e.message}`)
					}
				},
			},
			ftb: {
				name: 'FTB (Fade to Black)',
				options: [
					{
						id: 'mode',
						type: 'dropdown',
						label: 'Mode',
						default: 'toggle',
						choices: [
							{ id: 'on', label: 'On' },
							{ id: 'off', label: 'Off' },
							{ id: 'toggle', label: 'Toggle' },
						],
					},
					{
						id: 'screen',
						type: 'dropdown',
						label: 'Screen',
						default: '*',
						choices: this.screenChoices(),
						allowCustom: true,
						tooltip: 'Pick a screen or "All screens". You may also type a screen GUID.',
					},
					{
						id: 'time',
						type: 'number',
						label: 'Fade time (ms)',
						default: 700,
						min: 0,
						max: 10000,
					},
				],
				callback: async (action) => {
					const guids = this.resolveScreenGuids(action.options.screen)
					if (!guids.length) { this.log('warn', 'FTB: no screens'); return }
					let enable
					if (action.options.mode === 'on') enable = true
					else if (action.options.mode === 'off') enable = false
					else enable = !this.ftbState
					try {
						await this.api.ftb(guids, enable, Number(action.options.time) || 700)
						this.ftbState = enable
						this.setVariableValues({ ftb_state: enable ? 'on' : 'off' })
						this.checkFeedbacks('ftb_active')
						this.log('info', `FTB ${enable ? 'ON' : 'OFF'} on ${guids.length} screen(s)`)
					} catch (e) {
						this.log('error', `FTB failed: ${e.message}`)
					}
				},
			},
		})
	}

	registerFeedbacks() {
		this.setFeedbackDefinitions({
			ftb_active: {
				name: 'FTB is active',
				type: 'boolean',
				description: 'True when FTB is currently on (based on last command sent from Companion)',
				defaultStyle: { bgcolor: combineRgb(200, 0, 0), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => this.ftbState === true,
			},
			freeze_active: {
				name: 'Freeze is active',
				type: 'boolean',
				description: 'True when Freeze is currently on (based on last command sent from Companion)',
				defaultStyle: { bgcolor: combineRgb(0, 120, 200), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => this.freezeState === true,
			},
			preset_active: {
				name: 'Preset is active',
				type: 'boolean',
				description: 'True when the specified preset was the last one recalled from Companion',
				defaultStyle: { bgcolor: combineRgb(0, 160, 60), color: combineRgb(255, 255, 255) },
				options: [
					{
						id: 'preset',
						type: 'dropdown',
						label: 'Preset',
						choices: this.presetChoices(),
						default: this.presets[0]?.guid ?? '',
						allowCustom: true,
					},
				],
				callback: (feedback) => feedback.options.preset === this.activePresetGuid,
			},
		})
	}

	registerPresets() {
		const presets = {}
		for (const p of this.presets) {
			const key = `preset_${p.serial}_${p.guid.substring(0, 8)}`
			presets[key] = {
				type: 'button',
				category: 'Presets',
				name: p.name || `Preset ${p.serial}`,
				style: {
					text: p.name || `Preset ${p.serial}`,
					size: 'auto',
					color: 0xffffff,
					bgcolor: 0x1e5090,
				},
				steps: [{ down: [{ actionId: 'recall_preset', options: { preset: p.guid } }], up: [] }],
				feedbacks: [{ feedbackId: 'preset_active', options: { preset: p.guid } }],
			}
		}
		presets['ftb_toggle_all'] = {
			type: 'button',
			category: 'FTB',
			name: 'FTB Toggle (all screens)',
			style: { text: 'FTB', size: 'auto', color: 0xffffff, bgcolor: 0x000000 },
			steps: [{ down: [{ actionId: 'ftb', options: { mode: 'toggle', screen: '*', time: 700 } }], up: [] }],
			feedbacks: [{ feedbackId: 'ftb_active', options: {} }],
		}
		presets['ftb_on_all'] = {
			type: 'button',
			category: 'FTB',
			name: 'FTB On (all screens)',
			style: { text: 'FTB\\nON', size: 'auto', color: 0xffffff, bgcolor: 0x000000 },
			steps: [{ down: [{ actionId: 'ftb', options: { mode: 'on', screen: '*', time: 700 } }], up: [] }],
			feedbacks: [],
		}
		presets['ftb_off_all'] = {
			type: 'button',
			category: 'FTB',
			name: 'FTB Off (all screens)',
			style: { text: 'FTB\\nOFF', size: 'auto', color: 0xffffff, bgcolor: 0x404040 },
			steps: [{ down: [{ actionId: 'ftb', options: { mode: 'off', screen: '*', time: 700 } }], up: [] }],
			feedbacks: [],
		}
		presets['freeze_toggle_all'] = {
			type: 'button',
			category: 'Freeze',
			name: 'Freeze Toggle (all screens)',
			style: { text: 'FREEZE', size: 'auto', color: 0xffffff, bgcolor: 0x005570 },
			steps: [{ down: [{ actionId: 'freeze', options: { mode: 'toggle', screen: '*' } }], up: [] }],
			feedbacks: [{ feedbackId: 'freeze_active', options: {} }],
		}
		for (const percent of [25, 50, 75, 100]) {
			presets[`brightness_${percent}`] = {
				type: 'button',
				category: 'Brightness',
				name: `Brightness ${percent}%`,
				style: { text: `${percent}%`, size: 'auto', color: 0xffffff, bgcolor: 0x555555 },
				steps: [{ down: [{ actionId: 'set_brightness', options: { percent, screen: '*' } }], up: [] }],
				feedbacks: [],
			}
		}
		this.setPresetDefinitions(presets)
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Novastar VX Pro',
				value:
					'Controls VX Pro-series processors (VX400/600/1000/2000 Pro) running the Unico web UI at port 19999. Preset list is fetched automatically after login.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Device IP',
				width: 8,
				regex: Regex.IP,
				default: '',
			},
			{
				type: 'number',
				id: 'port',
				label: 'Unico port',
				width: 4,
				default: 19999,
				min: 1,
				max: 65535,
			},
			{
				type: 'textinput',
				id: 'username',
				label: 'Username',
				width: 6,
				default: 'admin',
			},
			{
				type: 'textinput',
				id: 'password',
				label: 'Password (base64)',
				width: 6,
				default: 'MTIzNDU2',
				tooltip: 'Base64-encoded password. Default MTIzNDU2 = "123456".',
			},
			{
				type: 'textinput',
				id: 'sn',
				label: 'Device SN (optional — auto-resolved if blank)',
				width: 12,
				default: '',
			},
		]
	}
}

runEntrypoint(NovastarVxProInstance, [])
