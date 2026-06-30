# Fork changes

This is a fork of [gormanb/homebridge-connector-hub](https://github.com/gormanb/homebridge-connector-hub) (based on v1.1.9), with additional reliability and visibility improvements made while debugging large-scene shade failures on a ~25-device installation.

## Background

The original symptom: triggering a HomeKit scene with many shades at once caused some shades to lag or never reach their target position, with HomeKit showing accessories stuck on "Opening.../Closing..." indefinitely. Investigation traced this to a few distinct, compounding issues — not a single root cause.

## Changes

### Reliability

- **`commandSpacingMs` (new config option, default 150ms)** — staggers every outgoing UDP command across all accessories, so a large scene doesn't fire commands at every shade simultaneously and overwhelm the physical hub's processing/radio. Implemented as a serialized promise queue in `connectorHubClient.ts`.
- **TDBU position fallback fix** — previously, if a device read was missing position data entirely (some TDBU units intermittently or permanently omit one motor's fields from a hub response), the plugin reset that accessory's position to a hardcoded "half-open" placeholder (50). This caused affected accessories to get stuck reporting a meaningless fixed value forever, even once good data resumed. Now the last known real position is preserved instead, so the accessory holds its last-known-good state through gaps rather than flapping back to a fake value.
- **Jittered retry timeouts** — retry attempts now use a randomized ±20% timeout instead of a fixed delay, so if several devices end up retrying around the same moment (e.g. the hub was briefly overwhelmed during a scene), their retries don't re-converge and re-trigger the same congestion.
- **Staggered background polling** — every accessory's periodic refresh timer used to start at the same instant (plugin startup), so background status polling for ~25+ devices burst in lockstep every refresh cycle, competing with scene commands landing in the same window. Each accessory's timer now starts with an offset derived from `commandSpacingMs`, spreading background polling continuously across the refresh interval instead of bursting.

### Visibility

- **Single-line debug logs** — the debug logger previously passed JS objects directly to the underlying logger, which pretty-printed them across many lines; Docker/journald then split each line into its own separate timestamped log entry, making debug output unreadable and hard to grep. Objects are now flattened to compact single-line JSON before logging.
- **Scene batch summary** — `setTargetPosition` calls landing within ~1.5s of each other (e.g. all the commands from one HomeKit scene) are now tracked together and summarized in one line once the burst goes quiet:
  ```
  Scene batch: 24/24 acked, 0 failed, 5.0s
  ```
  This answers "did the scene actually work" without cross-referencing one log line per accessory.
- **Low signal / low battery warnings** — RSSI and battery level are now checked on every refresh and logged as a `warn` (throttled to at most once per 30 minutes per accessory) when they cross an unhealthy threshold (RSSI ≤ -95 dBm, battery ≤ 15%). Previously this data only existed buried in debug-only state dumps. Both turned out to be leading indicators of a device silently going unresponsive — acking commands but never actually moving — well before that became visible as a failed scene.
- **Friendly device names (`deviceNames`)** — the plugin generates accessory names like `Honeycomb Blinds 09-08f9e02da0e4` purely from device model + MAC, since the hub protocol doesn't carry a custom name field. `deviceNames` lets you override this per device, by Serial Number, with a friendly name — applied to the Homekit accessory *and* every log line (not just a cosmetic Home-app rename, which never reaches the logs). TDBU devices automatically get the Top-Down/Bottom-Up suffix appended so both halves stay distinguishable.

## New config options

| Option | Default | Description |
|---|---|---|
| `commandSpacingMs` | `150` | Minimum delay (ms) enforced between consecutive outgoing commands to the hub. |
| `deviceNames` | `[]` | Array of `{mac, name}` entries overriding the generated name for specific devices, by Serial Number. |

## Operational note for maintainers

This Homebridge Docker image runs `npm install` automatically on every container restart. npm does **not** re-resolve a `#main` git-branch dependency if the package folder already exists in `node_modules` — it reports "up to date" and skips the fetch. After pushing new commits to this fork, `node_modules/homebridge-connector-hub` must be deleted manually before the next restart, or the update will not take effect.
