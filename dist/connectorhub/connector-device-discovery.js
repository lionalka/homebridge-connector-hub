"use strict";
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
exports.identifyTdbuDevices = exports.removeStaleAccessories = exports.doDiscovery = void 0;
/* eslint-disable max-len */
/* eslint-disable indent */
const dgram = __importStar(require("dgram"));
const log_1 = require("../util/log");
const connector_hub_api_1 = require("./connector-hub-api");
const connector_hub_constants_1 = require("./connector-hub-constants");
const connector_hub_helpers_1 = require("./connector-hub-helpers");
const connectorHubClient_1 = require("./connectorHubClient");
// These constants determine how long each discovery period lasts for, and how
// often we send GetDeviceList requests during that period.
const kDiscoveryDurationMs = 15 * 1000;
const kDiscoveryFrequencyMs = 1000;
// Determines how frequently we perform discovery to find new devices.
const kDiscoveryIntervalMs = 5 * 60 * 1000;
// Mappings of hub MACs to IP addresses and tokens.
const hubMacToIp = {};
const hubTokens = {};
// Sends GetDeviceListReq every kDiscoveryFrequencyMs for kDiscoveryDurationMs.
async function doDiscovery(hubIp, platform) {
    log_1.Log.debug('Starting discovery for hub:', hubIp);
    const discoveredDevices = [];
    let deviceList;
    // Create a socket for this discovery session, and add listeners to it.
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg) => {
        const recvMsg = (0, connector_hub_helpers_1.tryParse)(msg.toString());
        if (recvMsg && recvMsg.msgType === 'GetDeviceListAck') {
            // Extract the device list and record the token associated with this hub.
            deviceList = (recvMsg);
            hubTokens[deviceList.mac] = deviceList.token;
            hubMacToIp[deviceList.mac] = hubIp;
            // Compute the accessToken for use with ReadDevice requests.
            const accessToken = (0, connector_hub_helpers_1.computeAccessToken)(platform.config.connectorKey, deviceList.token);
            // Filter out any devices that have already been discovered this session.
            const undiscoveredDevices = deviceList.data.filter((devInfo) => !discoveredDevices.includes(devInfo.mac));
            // For all as-yet undiscovered devices, request full device information.
            for (const devInfo of undiscoveredDevices) {
                // If this entry is the hub itself, skip over it and continue.
                if (!(0, connector_hub_helpers_1.isWifiBridge)(devInfo.deviceType)) {
                    const readDevReq = (0, connector_hub_helpers_1.makeReadDeviceRequest)(devInfo, accessToken);
                    socket.send(JSON.stringify(readDevReq), connector_hub_constants_1.kSendPort, hubIp);
                }
            }
        }
        else if (recvMsg && recvMsg.msgType === 'ReadDeviceAck') {
            if ((0, connector_hub_helpers_1.isInvalidAck)(recvMsg)) {
                log_1.Log.debug('Invalid device response during discovery:', recvMsg);
                return;
            }
            const hubToken = hubTokens[(0, connector_hub_helpers_1.extractHubMac)(recvMsg.mac)];
            platform.registerDevice(hubIp, recvMsg, hubToken);
            discoveredDevices.push(recvMsg.mac);
        }
        else if (recvMsg) {
            log_1.Log.debug('Unexpected message during discovery:', recvMsg);
        }
    });
    socket.on('error', (ex) => {
        log_1.Log.error('Network error:', ex.message);
    });
    let kStartTime = Date.now();
    const timer = setInterval(() => {
        // If the discovery period hasn't expired yet, send a message to the hub to
        // request the list of available devices.
        if (Date.now() - kStartTime < kDiscoveryDurationMs) {
            socket.send(JSON.stringify((0, connector_hub_helpers_1.makeGetDeviceListRequest)()), connector_hub_constants_1.kSendPort, hubIp);
            return;
        }
        // If we're here, then the discovery period is complete. If we didn't hear
        // back from the hub at all, reset the discovery period and keep going...
        if (!deviceList) {
            log_1.Log.warn(`Device discovery failed to reach hub ${hubIp}, retrying...`);
            kStartTime = Date.now();
            return;
        }
        // ... otherwise, end discovery and close the socket...
        log_1.Log.debug('Finished discovery for hub:', hubIp);
        clearInterval(timer);
        socket.close();
        // ... inform the platform that we have finished discovery...
        platform.onDiscoveryCompleteForHub(hubIp);
        // ... then schedule the next round of discovery.
        setTimeout(() => doDiscovery(hubIp, platform), kDiscoveryIntervalMs);
    }, kDiscoveryFrequencyMs);
}
exports.doDiscovery = doDiscovery;
// Determines whether it is safe to remove suspected stale accessories, and if
// so unregisters them from the plugin.
async function removeStaleAccessories(accessories, platform) {
    // Iterate over a copy of the accessories array, since it may be modified.
    for (const accessory of [...accessories]) {
        const deviceInfo = accessory.context.device;
        const hubIp = hubMacToIp[(0, connector_hub_helpers_1.extractHubMac)(deviceInfo.mac)];
        // If we don't know the device's hub IP but we did discovery in multicast
        // mode, conservatively decline to remove the device. Hub may be offline.
        if (!hubIp && platform.config.hubIps.includes(connector_hub_constants_1.kMulticastIp)) {
            log_1.Log.debug('Skip stale device, hub not found via multicast:', deviceInfo);
            continue;
        }
        // If we have a hub IP and the hub reports that the device exists, do not
        // unregsiter it. We missed it during discovery, wait until the next round.
        if (hubIp && await checkDeviceExists(deviceInfo, hubIp, platform.config)) {
            continue;
        }
        // If we're here, then either we don't have a hub IP, implying the device is
        // an orphan, or the hub reports that the device does not exist. Remove it.
        platform.unregisterDevice(accessory);
    }
}
exports.removeStaleAccessories = removeStaleAccessories;
// Check whether the given device exists on the specified hub. A read response
// with 'actionResult' implies the device does not exist. If we don't get any
// response, conservatively assume that the device exists.
async function checkDeviceExists(deviceInfo, hubIp, config) {
    var _a;
    const hubToken = hubTokens[(0, connector_hub_helpers_1.extractHubMac)(deviceInfo.mac)];
    const devReply = await connectorHubClient_1.ConnectorHubClient.readDeviceState(deviceInfo, hubIp, hubToken, config.connectorKey);
    if (!devReply) {
        log_1.Log.debug('No response when checking stale device:', [hubIp, deviceInfo]);
    }
    const deviceExists = !((_a = devReply) === null || _a === void 0 ? void 0 : _a.actionResult);
    if (!deviceExists) {
        log_1.Log.info('Stale device response received:', devReply);
    }
    return deviceExists;
}
// Function which returns an array of information about a possibly-TDBU device.
function identifyTdbuDevices(deviceState) {
    return (deviceState.data.type === connector_hub_api_1.DeviceModel.kTopDownBottomUp) ?
        [connector_hub_helpers_1.TDBUType.kTopDown, connector_hub_helpers_1.TDBUType.kBottomUp] :
        [connector_hub_helpers_1.TDBUType.kNone];
}
exports.identifyTdbuDevices = identifyTdbuDevices;
//# sourceMappingURL=connector-device-discovery.js.map