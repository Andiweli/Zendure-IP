'use strict';

const utils = require('@iobroker/adapter-core');
const http = require('http');

class ZendureIpAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'zendure-ip',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));

        this.pollTimers = [];
        this.objectCache = new Set();
        this.slugCounts = new Map();
    }

    async onReady() {
        const configured = Array.isArray(this.config.devices) ? this.config.devices : [];
        const devices = configured
            .slice(0, 10)
            .map((device, index) => this.normalizeDevice(device, index))
            .filter(Boolean);

        if (configured.length > 10) {
            this.log.warn(`Es sind ${configured.length} Geräte konfiguriert. Es werden nur die ersten 10 verwendet.`);
        }

        if (!devices.length) {
            this.log.warn('Keine Geräte konfiguriert. Bitte in den Adaptereinstellungen mindestens ein Gerät eintragen.');
            return;
        }

        await this.ensureChannel('zendure-ip', 'Zendure IP');

        for (const device of devices) {
            await this.initializeDeviceObjects(device);
            await this.pollDevice(device);
            const timer = this.setInterval(() => this.pollDevice(device), device.intervalSec * 1000);
            this.pollTimers.push(timer);
        }

        this.log.info(`Zendure-IP gestartet mit ${devices.length} Gerät(en).`);
    }

    onUnload(callback) {
        try {
            for (const timer of this.pollTimers) {
                this.clearInterval(timer);
            }
            this.pollTimers = [];
            callback();
        } catch (error) {
            callback();
        }
    }

    normalizeDevice(device, index) {
        const rawName = String(device?.name || '').trim();
        const ip = String(device?.ip || '').trim();
        const intervalSec = this.normalizeInterval(device?.intervalSec);

        if (!rawName || !ip) {
            this.log.warn(`Gerät #${index + 1} ist unvollständig und wird ignoriert.`);
            return null;
        }

        const slugBase = this.slugify(rawName) || `device-${index + 1}`;
        const seen = this.slugCounts.get(slugBase) || 0;
        this.slugCounts.set(slugBase, seen + 1);
        const slug = seen === 0 ? slugBase : `${slugBase}-${seen + 1}`;

        return {
            name: rawName,
            slug,
            ip,
            intervalSec,
        };
    }

    normalizeInterval(value) {
        const interval = Number(value);
        if (!Number.isFinite(interval) || interval < 1) {
            return 10;
        }
        return Math.round(interval);
    }

    slugify(name) {
        return String(name)
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
    }

    sanitizeSegment(segment) {
        return String(segment)
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'value';
    }

    async initializeDeviceObjects(device) {
        const root = `zendure-ip.${device.slug}`;
        await this.ensureDevice(root, device.name);
        await this.ensureChannel(`${root}.info`, 'Info');

        await this.ensureState(`${root}.info.name`, device.name, {
            name: 'Configured name',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        });
        await this.ensureState(`${root}.info.ip`, device.ip, {
            name: 'Configured IP',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        });
        await this.ensureState(`${root}.info.intervalSec`, device.intervalSec, {
            name: 'Configured polling interval',
            type: 'number',
            role: 'value.interval',
            unit: 's',
            read: true,
            write: false,
        });
        await this.ensureState(`${root}.info.online`, false, {
            name: 'Device reachable',
            type: 'boolean',
            role: 'indicator.reachable',
            read: true,
            write: false,
        });
        await this.ensureState(`${root}.info.lastUpdate`, 0, {
            name: 'Last successful update',
            type: 'number',
            role: 'value.time',
            unit: 'ms',
            read: true,
            write: false,
        });
        await this.ensureState(`${root}.info.error`, '', {
            name: 'Last error',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        });
        await this.ensureState(`${root}.info.rawJson`, '', {
            name: 'Last raw JSON',
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        });
    }

    async pollDevice(device) {
        const root = `zendure-ip.${device.slug}`;
        try {
            const json = await this.httpGetJson(device.ip, 80, '/properties/report', 6000);
            await this.setStateAsync(`${root}.info.online`, true, true);
            await this.setStateAsync(`${root}.info.lastUpdate`, Date.now(), true);
            await this.setStateAsync(`${root}.info.error`, '', true);
            await this.setStateAsync(`${root}.info.rawJson`, this.safeJsonStringify(json, 4000), true);
            await this.writeJsonTree(root, json);
        } catch (error) {
            await this.setStateAsync(`${root}.info.online`, false, true);
            await this.setStateAsync(`${root}.info.error`, error.message || String(error), true);
            this.log.warn(`Polling fehlgeschlagen für ${device.name} (${device.ip}): ${error.message || error}`);
        }
    }

    httpGetJson(host, port, path, timeoutMs = 6000) {
        return new Promise((resolve, reject) => {
            const req = http.request(
                {
                    host,
                    port,
                    path,
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    timeout: timeoutMs,
                },
                res => {
                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => (data += chunk));
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 400) {
                            return reject(new Error(`HTTP ${res.statusCode}`));
                        }
                        try {
                            resolve(JSON.parse(data));
                        } catch (error) {
                            reject(new Error('JSON parse failed'));
                        }
                    });
                },
            );
            req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
            req.on('error', reject);
            req.end();
        });
    }

    safeJsonStringify(value, maxLength = 4000) {
        try {
            const json = JSON.stringify(value);
            return json.length > maxLength ? `${json.slice(0, maxLength)}…` : json;
        } catch (error) {
            return '';
        }
    }

    async writeJsonTree(root, value, pathSegments = []) {
        if (value === null || value === undefined) {
            return;
        }

        if (Array.isArray(value)) {
            const path = pathSegments.length ? `${root}.${pathSegments.join('.')}` : root;
            await this.ensureChannel(path, pathSegments[pathSegments.length - 1] || 'Array');
            for (let i = 0; i < value.length; i++) {
                await this.writeJsonTree(root, value[i], [...pathSegments, String(i)]);
            }
            return;
        }

        if (typeof value === 'object') {
            const path = pathSegments.length ? `${root}.${pathSegments.join('.')}` : root;
            if (path !== root) {
                await this.ensureChannel(path, pathSegments[pathSegments.length - 1]);
            }
            for (const [key, nestedValue] of Object.entries(value)) {
                await this.writeJsonTree(root, nestedValue, [...pathSegments, this.sanitizeSegment(key)]);
            }
            return;
        }

        const stateId = `${root}.${pathSegments.join('.')}`;
        const leafName = pathSegments[pathSegments.length - 1] || 'value';
        const common = this.getStateCommon(leafName, value);
        await this.ensureState(stateId, value, common);
        await this.setStateAsync(stateId, value, true);
    }

    getStateCommon(name, value) {
        const t = typeof value;
        if (t === 'number') {
            return {
                name,
                type: 'number',
                role: this.guessNumberRole(name),
                read: true,
                write: false,
            };
        }
        if (t === 'boolean') {
            return {
                name,
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            };
        }
        return {
            name,
            type: 'string',
            role: t === 'string' ? 'text' : 'json',
            read: true,
            write: false,
        };
    }

    guessNumberRole(name) {
        const n = String(name).toLowerCase();
        if (n.includes('power')) return 'value.power';
        if (n.includes('volt') || n === 'v') return 'value.voltage';
        if (n.includes('curr') || n.includes('amp')) return 'value.current';
        if (n.includes('temp')) return 'value.temperature';
        if (n.includes('soc') || n.includes('level')) return 'value';
        if (n.includes('time') || n === 'ts' || n.includes('timestamp')) return 'value.time';
        return 'value';
    }

    async ensureDevice(id, name) {
        if (this.objectCache.has(id)) return;
        await this.setObjectNotExistsAsync(id, {
            type: 'device',
            common: { name },
            native: {},
        });
        this.objectCache.add(id);
    }

    async ensureChannel(id, name) {
        if (this.objectCache.has(id)) return;
        await this.setObjectNotExistsAsync(id, {
            type: 'channel',
            common: { name },
            native: {},
        });
        this.objectCache.add(id);
    }

    async ensureState(id, initialValue, common) {
        if (!this.objectCache.has(id)) {
            await this.setObjectNotExistsAsync(id, {
                type: 'state',
                common: {
                    ...common,
                    def: initialValue,
                },
                native: {},
            });
            this.objectCache.add(id);
        }
    }
}

if (module.parent) {
    module.exports = options => new ZendureIpAdapter(options);
} else {
    (() => new ZendureIpAdapter())();
}
