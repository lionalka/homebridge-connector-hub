"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateModes = exports.voltageModes = exports.wirelessModes = exports.deviceModels = exports.deviceTypes = exports.hubStats = exports.opCodes = exports.ReadDeviceType = exports.OperationState = exports.kNetworkSettings = exports.kHalfOpenValue = exports.kMacAddrLength = exports.kHealthWarningRepeatMs = exports.kLowRssiThreshold = exports.kLowBatteryPercent = exports.kSendPort = exports.kMulticastIp = void 0;
const connector_hub_api_1 = require("./connector-hub-api");
/*
 * Constants defined by the Connector hub protocol and by this plugin.
 */
exports.kMulticastIp = '238.0.0.18';
exports.kSendPort = 32100;
// Battery level constants.
exports.kLowBatteryPercent = 15;
// RSSI (dBm) at or below which we log a warning about a weak signal. Devices
// at or below this level are at meaningfully higher risk of dropped commands
// and stale state.
exports.kLowRssiThreshold = -95;
// Minimum time between repeated low-signal/low-battery warnings for the same
// accessory, so a persistently weak device doesn't spam the log every
// refresh cycle.
exports.kHealthWarningRepeatMs = 30 * 60 * 1000;
// Length of a hub's MAC address, excluding colons.
exports.kMacAddrLength = 12;
// The value at which devices are half-open, regardless of direction.
exports.kHalfOpenValue = 50;
// Network settings used when sending requests to the hub.
exports.kNetworkSettings = {
    maxRetries: 2,
    retryDelayMs: 250,
    refreshIntervalMs: 10000,
    // Minimum delay enforced between consecutive outgoing commands, regardless
    // of which accessory they belong to. Avoids overwhelming the physical hub
    // when many devices are commanded at once (e.g. by a scene).
    commandSpacingMs: 150,
    // Minimum delay enforced between two commands sent to the *same physical
    // device* (matched by mac), on top of commandSpacingMs. Relevant for TDBU
    // blinds, which expose two accessories (Top-Down, Bottom-Up) sharing one
    // motor controller; some controllers ignore a second command that arrives
    // too soon after the first, even if the first was a same-position no-op.
    sameDeviceSpacingMs: 1200,
};
// Operation states that the hub may report.
var OperationState;
(function (OperationState) {
    OperationState[OperationState["CLOSED_CLOSING"] = 0] = "CLOSED_CLOSING";
    OperationState[OperationState["OPEN_OPENING"] = 1] = "OPEN_OPENING";
    OperationState[OperationState["STOPPED"] = 2] = "STOPPED";
})(OperationState = exports.OperationState || (exports.OperationState = {}));
// Used to determine the type of read request to send.
var ReadDeviceType;
(function (ReadDeviceType) {
    ReadDeviceType[ReadDeviceType["kPassive"] = 0] = "kPassive";
    ReadDeviceType[ReadDeviceType["kActive"] = 1] = "kActive"; // Read real-time values from the device.
})(ReadDeviceType = exports.ReadDeviceType || (exports.ReadDeviceType = {}));
// Discrete commands that can be sent to the hub.
exports.opCodes = ['close', 'open', 'stop', undefined, undefined, 'status'];
// States that the Connector hub can be in.
exports.hubStats = [undefined, 'Working', 'Pairing', 'Updating'];
// Device types. Can be either the hub itself or a connected device.
exports.deviceTypes = {
    [connector_hub_api_1.DeviceType.k433MHzRadioMotor]: '433Mhz Radio Motor',
    [connector_hub_api_1.DeviceType.kWiFiCurtain]: 'Wi-Fi Curtain',
    [connector_hub_api_1.DeviceType.kWiFiBridge]: 'Wi-Fi Bridge',
    [connector_hub_api_1.DeviceType.kWiFiBridgeAlt]: 'Wi-Fi Bridge',
    [connector_hub_api_1.DeviceType.kWiFiTubularMotor]: 'Wi-Fi Tubular Motor',
    [connector_hub_api_1.DeviceType.kWiFiReceiver]: 'Wi-Fi Receiver',
};
// Recognised device models that can be connected to the hub.
exports.deviceModels = [
    undefined,
    'Roller Blinds',
    'Venetian Blinds',
    'Roman Blinds',
    'Honeycomb Blinds',
    'Shangri-La Blinds',
    'Roller Shutter',
    'Roller Gate',
    'Awning',
    'TDBU Blinds',
    'Day & Night Blinds',
    'Dimming Blinds',
    'Curtain',
    'Curtain Left',
    'Curtain Right',
];
exports.wirelessModes = [
    'Uni-Directional',
    'Bi-Directional',
    'Bi-Directional, Mechanical Limits',
    'Other',
];
// Motor type for the given device.
exports.voltageModes = ['AC Motor', 'DC Motor'];
// Discrete states that the devices can be in.
exports.stateModes = [
    'Not at any limit',
    'Top Limit',
    'Bottom Limit',
    'Limits Detected',
    '3rd Limit Detected',
];
//# sourceMappingURL=connector-hub-constants.js.map