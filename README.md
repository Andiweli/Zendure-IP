# ioBroker.zendure-ip

Simple local ioBroker adapter that polls Zendure devices via IP and mirrors the JSON from `http://<ip>/properties/report` into states.

## Features

- Up to 10 devices configurable
- Per device: name, IP address, polling interval in seconds
- Default polling interval: 10 seconds
- Creates one folder per device under `zendure-ip`
- Replaces spaces in names with `-`
- Reads the complete JSON structure recursively and creates states for primitive values
- Stores device status in `info.*`

## State layout

Examples for a device named `Zendure 2400 Pro`:

- `zendure-ip.0.zendure-ip.zendure-2400-pro.info.online`
- `zendure-ip.0.zendure-ip.zendure-2400-pro.properties.electricLevel`
- `zendure-ip.0.zendure-ip.zendure-2400-pro.packData.0.socLevel`

## Configuration

In the adapter config, add devices with:

- `Name`
- `IP address`
- `Interval (s)`

Only the first 10 configured devices are used.

## Notes

- This adapter polls only the local JSON endpoint `http://<ip>/properties/report`.
- The adapter does not write any values back to Zendure devices.
- `null` JSON values are skipped until a real primitive value appears.

## Development notes

The adapter follows the standard ioBroker adapter structure with `package.json`, `io-package.json`, `main.js`, and JSON admin configuration.

## Changelog

### 0.1.0
- Initial version
