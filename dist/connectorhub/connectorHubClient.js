"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorHubClient = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
/* eslint-disable indent */
const dgram_as_promised_1 = require("dgram-as-promised");
const log_1 = require("../util/log");
const connector_hub_api_1 = require("./connector-hub-api");
const connector_hub_constants_1 = require("./connector-hub-constants");
const connector_hub_helpers_1 = require("./connector-hub-helpers");
// Stagger outgoing UDP sends across all accessories so we don't overwhelm
// the physical hub when many devices are commanded at once (e.g. during a
// scene). Implemented as a serialized promise chain that enforces a minimum
// delay between the start of each send, configurable via commandSpacingMs.
let lastSendTime = 0;
let sendChain = Promise.resolve();
function throttleSend() {
    const scheduled = sendChain.then(() => new Promise((resolve) => {
        const spacingMs = connector_hub_constants_1.kNetworkSettings.commandSpacingMs || 0;
        const wait = Math.max(0, spacingMs - (Date.now() - lastSendTime));
        setTimeout(() => {
            lastSendTime = Date.now();
            resolve();
        }, wait);
    }));
    sendChain = scheduled;
    return scheduled;
}
// Function to send a request to the hub and receive a sequence of responses.
async function sendCommandMultiResponse(cmdObj, ip, expectSingleResponse = false) {
    // Array of responses received from the hub(s).
    const responses = [];
    // Wait for our turn in the global send queue before issuing this command.
    await throttleSend();
    // Extract the retry settings specified in the plugin configuration.
    const [maxRetries, socketTimeoutMs] = [connector_hub_constants_1.kNetworkSettings.maxRetries, connector_hub_constants_1.kNetworkSettings.retryDelayMs];
    // Retry up to kMaxRetries times to overcome any transient network issues.
    for (let attempt = 0; attempt <= maxRetries && !responses.length; ++attempt) {
        try {
            // Create a socket to service this request.
            const socket = dgram_as_promised_1.DgramAsPromised.createSocket('udp4');
            // Convert the command to a string representation.
            const sendMsg = JSON.stringify(cmdObj);
            // Send the message. We'll wait for confirmation that it was sent later.
            const sendResult = socket.send(sendMsg, connector_hub_constants_1.kSendPort, ip);
            // Holds the message parsed from the hub response.
            let response;
            do {
                // Set a maximum timeout for the request. If we get a response within
                // the timeout, clear the timeout for the next iteration. Add up to
                // 20% random jitter so that if several devices end up retrying at
                // once (e.g. the hub was briefly overwhelmed during a large scene),
                // their retries don't all land back on the hub in lockstep and
                // re-trigger the same congestion.
                const jitteredTimeoutMs = socketTimeoutMs + Math.floor(Math.random() * socketTimeoutMs * 0.2);
                const timer = setTimeout(() => socket.close(), jitteredTimeoutMs);
                const recvMsg = await sendResult && await socket.recv();
                // Try to parse the response and add it to the list of responses.
                if ((response = recvMsg && (0, connector_hub_helpers_1.tryParse)(recvMsg.msg.toString()))) {
                    responses.push(response);
                }
                // Clear the timeout if we still need to read from the socket.
                if (response && !expectSingleResponse) {
                    clearTimeout(timer);
                }
            } while (response && !expectSingleResponse);
        }
        catch (ex) {
            log_1.Log.error('Network error:', ex.message);
        }
    }
    // Return a series of responses, or an empty array if the op was unsuccessful.
    return responses;
}
// Function to send a request to the hub and receive a single response.
async function sendCommand(cmdObj, ip) {
    // Delegate to the generic function with the expectation of a single response.
    const response = await sendCommandMultiResponse(cmdObj, ip, true);
    return response ? response[0] : response;
}
class ConnectorHubClient {
    constructor(config, deviceInfo, hubIp, hubToken) {
        this.config = config;
        this.deviceInfo = deviceInfo;
        this.hubIp = hubIp;
        this.hubToken = hubToken;
        this.accessToken =
            (0, connector_hub_helpers_1.computeAccessToken)(this.config.connectorKey, this.hubToken);
    }
    static getDeviceList(hubIp) {
        return sendCommandMultiResponse((0, connector_hub_helpers_1.makeGetDeviceListRequest)(), hubIp);
    }
    static readDeviceState(deviceInfo, hubIp, hubToken, connectorKey) {
        const accessToken = (0, connector_hub_helpers_1.computeAccessToken)(connectorKey, hubToken);
        return sendCommand((0, connector_hub_helpers_1.makeReadDeviceRequest)(deviceInfo, accessToken), hubIp);
    }
    getDeviceState(readType) {
        if (readType === connector_hub_constants_1.ReadDeviceType.kActive) {
            const activeReq = (0, connector_hub_helpers_1.makeWriteDeviceRequest)(this.deviceInfo, this.accessToken, { operation: connector_hub_api_1.DeviceOpCode.kStatusQuery });
            return sendCommand(activeReq, this.hubIp);
        }
        return sendCommand((0, connector_hub_helpers_1.makeReadDeviceRequest)(this.deviceInfo, this.accessToken), this.hubIp);
    }
    setOpenCloseState(op) {
        return this.setDeviceState({ operation: op });
    }
    setTargetPosition(position) {
        return this.setDeviceState({ targetPosition: position });
    }
    setTargetAngle(angle) {
        return this.setDeviceState({ targetAngle: angle });
    }
    setDeviceState(command) {
        const request = (0, connector_hub_helpers_1.makeWriteDeviceRequest)(this.deviceInfo, this.accessToken, command);
        return sendCommand(request, this.hubIp);
    }
}
exports.ConnectorHubClient = ConnectorHubClient;
//# sourceMappingURL=connectorHubClient.js.map