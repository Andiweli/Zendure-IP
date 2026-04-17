# ioBroker.zendure-ip

Simple local polling adapter for Zendure devices.

## Features

- Up to 10 devices
- Per device: name, IP, poll interval, `Device is in HEMS`
- Device names become channel names under the adapter namespace
- Spaces in names are converted to `-`
- Polls `http://<ip>/properties/report`
- Stores a curated device state set based on the user's working scripts
- Creates an additional `HEMS` object tree when at least one device is marked as `Device is in HEMS`

## Device states

Per device the adapter writes curated states such as:

- `soc`
- `acPowerW`
- `acDirectionW`
- `acChargingW`
- `acDischargingW`
- `solarInputPower`
- `solarPower1..4`
- `outputPackPower`
- `packInputPower`
- `minSocRaw`, `minSocPct`
- `socSetRaw`, `socSetPct`
- `online`, `lastUpdate`, `ageSec`, `stale`, `rssi`, `rawJson`

Excluded on purpose:

- `inHems`
- `smartMode`
- `socLimit`
- `wearLevelPct`

## HEMS aggregation

If at least one configured device has `Device is in HEMS` enabled, the adapter creates `HEMS.*` states with aggregated values like:

- `socAvg`
- `acChargingW`
- `acDischargingW`
- `acDirectionW`
- `acPowerW`
- `solarInputPower`
- `batteryChargeTotalW`
- `batteryDischargeTotalW`
- `batteryNetPowerW`
- `batteryNetModeText`
- `minSocPct`
- `socSetPct`

## Install

Install from GitHub as a custom adapter, for example:

```bash
 iobroker url https://github.com/Andiweli/ioBroker.zendure-ip
```


## Daily counters

The adapter creates per-device daily counters under `<device>.today` and aggregated HEMS daily counters under `HEMS.today`.
