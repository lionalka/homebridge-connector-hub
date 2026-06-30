"use strict";
/*
 * Various helper functions for the plugin, to facilitate communication with the
 * hub and to aid in interpreting its responses.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xor = exports.spliceIndexOf = exports.isLowBattery = exports.getBatteryPercent = exports.makeDeviceName = exports.extractHubMac = exports.getDeviceModel = exports.isWifiBridge = exports.isInvalidAck = exports.tryParse = exports.makeWriteDeviceRequest = exports.makeReadDeviceRequest = exports.makeGetDeviceListRequest = exports.makeMsgId = exports.computeAccessToken = exports.TDBUType = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
/* eslint-disable indent */
const aesjs = __importStar(require("aes-js"));
const log_1 = require("../util/log");
const connector_hub_api_1 = require("./connector-hub-api");
const connector_hub_constants_1 = require("./connector-hub-constants");
//
// Special types used internally by the plugin.
//
var TDBUType;
(function (TDBUType) {
    TDBUType["kNone"] = "";
    TDBUType["kTopDown"] = " Top-Down";
    TDBUType["kBottomUp"] = " Bottom-Up";
})(TDBUType = exports.TDBUType || (exports.TDBUType = {}));
//
// Helpers which facilitate communication with the hub.
//
function computeAccessToken(connectorKey, hubToken) {
    const aesEcb = new aesjs.ModeOfOperation.ecb(aesjs.utils.utf8.toBytes(connectorKey));
    const tokenEnc = aesEcb.encrypt(aesjs.utils.utf8.toBytes(hubToken));
    return aesjs.utils.hex.fromBytes(tokenEnc).toUpperCase();
}
exports.computeAccessToken = computeAccessToken;
function makeMsgId() {
    // The ID is the current timestamp with all non-numeric chars removed.
    return (new Date()).toJSON().replaceAll(/\D/g, '');
}
exports.makeMsgId = makeMsgId;
function makeGetDeviceListRequest() {
    return { msgType: 'GetDeviceList', msgID: makeMsgId() };
}
exports.makeGetDeviceListRequest = makeGetDeviceListRequest;
// A ReadDevice request only updates the position after each movement of the
// device is complete. In order to obtain the real-time state, we must issue a
// WriteDevice request for a 'status' operation. However, polling with this
// method causes the responsiveness of the devices to degrade over time; there
// may be some kind of rate-limiting mechanism in the hub. ReadDevice has no
// such issues, possibly because it reads a cached value from the hub itself.
function makeReadDeviceRequest(deviceInfo, accessToken) {
    return {
        msgType: 'ReadDevice',
        mac: deviceInfo.mac,
        deviceType: deviceInfo.deviceType,
        accessToken: accessToken,
        msgID: makeMsgId(),
    };
}
exports.makeReadDeviceRequest = makeReadDeviceRequest;
function makeWriteDeviceRequest(deviceInfo, accessToken, command) {
    return {
        msgType: 'WriteDevice',
        mac: deviceInfo.mac,
        deviceType: deviceInfo.deviceType,
        accessToken: accessToken,
        msgID: makeMsgId(),
        data: command,
    };
}
exports.makeWriteDeviceRequest = makeWriteDeviceRequest;
//
// Helpers which assist in interpreting the responses from the hub.
//
// Helper function to safely parse a possibly-invalid JSON response.
function tryParse(jsonStr) {
    try {
        return JSON.parse(jsonStr);
    }
    catch (ex) {
        log_1.Log.debug('Received invalid response:', [jsonStr, ex.message]);
        return undefined;
    }
}
exports.tryParse = tryParse;
// Check whether a response received from the hub is invalid.
function isInvalidAck(ack) {
    return (!ack.data || ack.actionResult);
}
exports.isInvalidAck = isInvalidAck;
// Helper function to determine whether the given deviceType is a WiFi bridge.
// A given hub may report one of several valid device type codes.
function isWifiBridge(deviceType) {
    return deviceType === connector_hub_api_1.DeviceType.kWiFiBridge ||
        deviceType === connector_hub_api_1.DeviceType.kWiFiBridgeAlt;
}
exports.isWifiBridge = isWifiBridge;
// The 'type' is the 'deviceType' field from the ReadDeviceAck response.
// The 'subType' is the 'data.type' field from the ReadDeviceAck response.
function getDeviceModel(type, subType, tdbuType = TDBUType.kNone) {
    // For some devices, such as a Wifi curtain motor, there is no device subtype
    // and the model is determined by the type. For other devices, generally RF
    // motors connected to a hub, look up the device subtype.
    const basicModel = subType ? connector_hub_constants_1.deviceModels[subType] || 'Unidentified Device' :
        connector_hub_constants_1.deviceTypes[type];
    // Append the TDBU type to the model name.
    return basicModel + tdbuType;
}
exports.getDeviceModel = getDeviceModel;
// Given a device's MAC, extract the MAC of its parent hub.
function extractHubMac(deviceMac) {
    return deviceMac.slice(0, connector_hub_constants_1.kMacAddrLength);
}
exports.extractHubMac = extractHubMac;
function makeDeviceName(devInfo) {
    // The format of a device's MAC is [hub_mac][device_num] where the former is a
    // 12-character hex string and the latter is a 4-digit hex string. If this is
    // a WiFi motor which does not have a hub, device_num can be empty.
    const macAddr = devInfo.mac.slice(0, connector_hub_constants_1.kMacAddrLength);
    const devNumHex = devInfo.mac.slice(connector_hub_constants_1.kMacAddrLength);
    // Parse the hex devNum string into a decimal representation.
    const devNum = parseInt(devNumHex || '0001', 16).toString().padStart(2, '0');
    // Get the device model based on its type, sub-type, and TDBU type.
    const deviceModel = getDeviceModel(devInfo.deviceType, devInfo.subType, devInfo.tdbuType);
    // Construct and return the final device name as '[model] [device_num]-[mac]'
    return `${deviceModel} ${devNum}-${macAddr}`;
}
exports.makeDeviceName = makeDeviceName;
// Estimate battery charge percentage from reported voltage.
// Calculation uses thresholds defined by the Connector app.
function getBatteryPercent(batteryLevel) {
    if (batteryLevel === undefined) {
        return -1;
    }
    const voltageLevel = batteryLevel / 100.0;
    if (voltageLevel >= 15.9 || (voltageLevel >= 11.9 && voltageLevel < 13.2) ||
        (voltageLevel >= 7.9 && voltageLevel < 8.8)) {
        return 100;
    }
    if ((voltageLevel >= 14.5 && voltageLevel < 15.9) ||
        (voltageLevel >= 10.9 && voltageLevel < 11.9) ||
        (voltageLevel >= 7.3 && voltageLevel < 7.9)) {
        return 50;
    }
    if ((voltageLevel >= 14.2 && voltageLevel < 14.5) ||
        (voltageLevel >= 10.6 && voltageLevel < 10.9) ||
        (voltageLevel >= 7.1 && voltageLevel < 7.3)) {
        return 20;
    }
    if ((voltageLevel >= 14.0 && voltageLevel < 14.2) ||
        (voltageLevel >= 10.5 && voltageLevel < 10.6) ||
        (voltageLevel >= 7.0 && voltageLevel < 7.1)) {
        return 10;
    }
    if ((voltageLevel >= 13.2 && voltageLevel < 14.0) ||
        (voltageLevel >= 8.8 && voltageLevel < 10.5) ||
        (voltageLevel >= 6.8 && voltageLevel < 7.0)) {
        return 0;
    }
    return 100;
}
exports.getBatteryPercent = getBatteryPercent;
function isLowBattery(batteryLevel) {
    return getBatteryPercent(batteryLevel) <= connector_hub_constants_1.kLowBatteryPercent;
}
exports.isLowBattery = isLowBattery;
//
// General-purpose helper functions.
//
// Safe indexOf for use with splice. If the element does not exist in the array,
// returns the array length, which will cause splice to remove nothing.
function spliceIndexOf(arr, value) {
    const idx = arr.indexOf(value);
    return (idx >= 0 ? idx : arr.length);
}
exports.spliceIndexOf = spliceIndexOf;
// Helper to implement a logical XOR.
function xor(foo, bar) {
    return foo ? !bar : bar;
}
exports.xor = xor;
//# sourceMappingURL=connector-hub-helpers.js.map