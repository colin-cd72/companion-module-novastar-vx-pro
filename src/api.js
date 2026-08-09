// HTTP client for the Novastar Unico REST API (VX Pro series).
// The Unico controller at :19999 is a proxy in front of the device on port 8088.
// Most endpoints need proxy headers:  ip, port, protocol, clienttype  plus an
// authorization header carrying the JWT from POST /unico/v1/system/auth/login.
// Header names are lowercase (server appears case-sensitive).
import http from 'node:http';

export class UnicoApi {
	constructor(host, port = 19999, logger = console) {
		this.host = host
		this.port = port
		this.log = logger
		this.token = null
		this.devicePort = 8088 // Unico proxies to the device on 8088
	}

	proxyHeaders() {
		return {
			ip: this.host,
			port: String(this.devicePort),
			protocol: 'http',
			clienttype: '0',
		}
	}

	request(method, path, body, extra = {}) {
		const bodyStr = body ? JSON.stringify(body) : ''
		return new Promise((resolve, reject) => {
			const req = http.request(
				{
					host: this.host,
					port: this.port,
					path,
					method,
					timeout: 5000,
					headers: {
						'Content-Type': 'application/json',
						'Accept': 'application/json',
						'Content-Length': Buffer.byteLength(bodyStr),
						...(this.token ? { authorization: this.token } : {}),
						...extra,
					},
				},
				(res) => {
					let data = ''
					res.on('data', (c) => (data += c))
					res.on('end', () => {
						let parsed
						try { parsed = JSON.parse(data) } catch { parsed = null }
						resolve({ status: res.statusCode, body: data, json: parsed })
					})
				},
			)
			req.on('error', reject)
			req.on('timeout', () => { req.destroy(new Error('request timeout')) })
			if (bodyStr) req.write(bodyStr)
			req.end()
		})
	}

	// POST /unico/v1/system/auth/login. Default creds admin/base64("123456").
	async login(username = 'admin', password = 'MTIzNDU2') {
		this.token = null
		const r = await this.request('POST', '/unico/v1/system/auth/login',
			{ username, password }, this.proxyHeaders())
		if (!r.json || r.json.code !== 0) {
			throw new Error(`login failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		this.token = r.json.data?.token
		if (!this.token) throw new Error('login returned no token')
		return this.token
	}

	// GET /unico/v1/ucenter/device-list  (no proxy headers, no token required)
	async deviceList() {
		const r = await this.request('GET', '/unico/v1/ucenter/device-list?clientType=0')
		if (!r.json || r.json.code !== 0) {
			throw new Error(`deviceList failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json.data?.list ?? []
	}

	// GET /unico/v1/preset  (needs proxy headers + token)
	async listPresets() {
		const r = await this.request('GET', '/unico/v1/preset', null, this.proxyHeaders())
		if (!r.json || r.json.code !== 0) {
			throw new Error(`listPresets failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json.data?.list ?? []
	}

	// GET /unico/v1/ucenter/screen/normal-screen?projectId=defaultProject-vx
	// No proxy header / no token — returns screens with guids.
	async listScreens(projectId = 'defaultProject-vx') {
		const r = await this.request(
			'GET',
			`/unico/v1/ucenter/screen/normal-screen?projectId=${encodeURIComponent(projectId)}`,
		)
		if (!r.json || r.json.code !== 0) {
			throw new Error(`listScreens failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json.data?.list ?? []
	}

	// POST /unico/v1/ucenter/screen/ftb  — no proxy header, no token.
	// screenGuids: string[]  |  enable: 0|1  |  time: ms (fade duration)
	async ftb(screenGuids, enable, time = 700) {
		const body = {
			ftb: { enable: enable ? 1 : 0, time },
			screenGuidList: screenGuids,
		}
		const r = await this.request('POST', '/unico/v1/ucenter/screen/ftb', body)
		if (!r.json || r.json.code !== 0) {
			throw new Error(`ftb failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json
	}

	// POST /unico/v1/ucenter/screen/freeze — no proxy header, no token.
	async freeze(screenGuids, enable) {
		const body = { freeze: enable ? 1 : 0, screenGuidList: screenGuids }
		const r = await this.request('POST', '/unico/v1/ucenter/screen/freeze', body)
		if (!r.json || r.json.code !== 0) {
			throw new Error(`freeze failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json
	}

	// POST /unico/v1/ucenter/cabinet/brightness — no proxy header, no token.
	// percent: 0..100  (mapped to ratio 0..10000)
	async setBrightness(screenGuids, percent) {
		const ratio = Math.max(0, Math.min(10000, Math.round(percent * 100)))
		const body = {
			brightness: { ratio, ratioScale: 10000, nitType: 0 },
			guidList: screenGuids,
		}
		const r = await this.request('POST', '/unico/v1/ucenter/cabinet/brightness', body)
		if (!r.json || r.json.code !== 0) {
			throw new Error(`setBrightness failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json
	}

	// POST /unico/v1/ucenter/preset/apply — SN is in body, no proxy header needed.
	// Recall a preset. `preset` must have .guid; other fields (.serial,
	// .sourceRegion, .currentRegion, .switchEffect) come from listPresets() output.
	async applyPreset(sn, preset) {
		// The device apply command wants a *targetRegion*. Empirically:
		//   sourceRegion works reliably; currentRegion can be 0 (unassigned) which fails.
		const targetRegion = preset.targetRegion ?? preset.sourceRegion ?? preset.currentRegion ?? 2
		const body = [
			{
				sn,
				data: {
					presetId: preset.guid,
					serial: preset.serial ?? 1,
					targetRegion,
					auxiliary: {
						keyFrame: { enable: 1 },
						switchEffect: preset.switchEffect ?? { type: 0, time: 500 },
						swapEnable: 1,
						effect: { enable: 1 },
					},
				},
			},
		]
		const r = await this.request('POST', '/unico/v1/ucenter/preset/apply', body)
		if (!r.json || r.json.code !== 0) {
			throw new Error(`applyPreset failed: HTTP ${r.status} body=${r.body?.substring(0, 200)}`)
		}
		return r.json
	}
}
