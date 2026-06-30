"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorDeviceHandler = void 0;
const log_1 = require("../util/log");
const connector_hub_api_1 = require("./connector-hub-api");
const connector_hub_constants_1 = require("./connector-hub-constants");
const connector_hub_helpers_1 = require("./connector-hub-helpers");
/**
 * This class exposes methods for handling all conversions between Homekit and
 * Connector co-ordinate systems. Generally, Connector positions are the inverse
 * of Homekit values, but in certain cases this does not hold true.
 */
class ConnectorDeviceHandler {
    constructor(deviceInfo, config) {
        this.deviceInfo = deviceInfo;
        this.config = config;
        // By default, a value of 100 is fully closed for connector blinds.
        this.kClosedValue = 100;
        // Map of canonical field names to their (variable) effective field names. For
        // a TDBU device, these fields will be suffixed with _T or _B.
        this.fields = {
            currentPosition: 'currentPosition',
            currentState: 'currentState',
            currentAngle: 'currentAngle',
            targetPosition: 'targetPosition',
            targetAngle: 'targetAngle',
            batteryLevel: 'batteryLevel',
            operation: 'operation',
        };
        // Unlike hub devices, a WiFi curtain's position and target percentages are
        // the same as Homekit, and the inverse of other Connector devices. This is
        // also true of the top-down component of a TDBU blind.
        if (deviceInfo.deviceType === connector_hub_api_1.DeviceType.kWiFiCurtain ||
            deviceInfo.tdbuType === connector_hub_helpers_1.TDBUType.kTopDown) {
            this.kClosedValue = this.invertPC(this.kClosedValue);
        }
        // If the user reversed this device's direction, invert the closed state.
        const reverseDevice = config.reverseDirection.includes(deviceInfo.mac);
        if ((0, connector_hub_helpers_1.xor)(reverseDevice, config.invertReverseList)) {
            this.kClosedValue = this.invertPC(this.kClosedValue);
        }
        // Update the field names used in the device data if this is a TDBU blind.
        if (deviceInfo.tdbuType !== connector_hub_helpers_1.TDBUType.kNone) {
            const suffix = (deviceInfo.tdbuType === connector_hub_helpers_1.TDBUType.kTopDown ? '_T' : '_B');
            for (const field in this.fields) {
                this.fields[field] = `${this.fields[field]}${suffix}`;
            }
        }
    }
    // Return an array containing the Hub target corresponding to the input
    // Homekit value, and a command to implement the targeting request.
    makeTargetRequest(homekitTarget) {
        const hubTarget = this.fromHomekitPercent(homekitTarget);
        if (this.usesBinaryState()) {
            return [
                this.binarizeTargetPosition(hubTarget),
                this.makeOpenCloseRequest(hubTarget),
            ];
        }
        return [hubTarget, this.makeTargetPositionRequest(hubTarget)];
    }
    // Given a hub target value, constructs a binary open/close request.
    makeOpenCloseRequest(hubTarget) {
        return {
            [this.fields.operation]: this.positionToOpCode(this.binarizeTargetPosition(hubTarget)),
        };
    }
    // Given a hub target value, constructs a percentage targeting request.
    makeTargetPositionRequest(hubTarget) {
        return { [this.fields.targetPosition]: hubTarget };
    }
    // Convert a percentage position into a binary open / closed state. Note that
    // the input is a Connector hub position, not an inverted Homekit position.
    positionToOpCode(hubPos) {
        return Math.abs(this.kClosedValue - hubPos) < 50 ? connector_hub_api_1.DeviceOpCode.kClose :
            connector_hub_api_1.DeviceOpCode.kOpen;
    }
    // Given a kOpen or kClose opcode, return the equivalent position.
    opCodeToPosition(opCode) {
        return opCode === connector_hub_api_1.DeviceOpCode.kClose ? this.kClosedValue :
            this.invertPC(this.kClosedValue);
    }
    // Helper function to convert between Hub and Homekit percentages.
    invertPC(percent) {
        return (100 - percent);
    }
    toHomekitPercent(hubPC) {
        return this.kClosedValue === 100 ? this.invertPC(hubPC) : hubPC;
    }
    fromHomekitPercent(homekitPC) {
        return this.kClosedValue === 100 ? this.invertPC(homekitPC) : homekitPC;
    }
    // Determine whether this device uses binary open/close commands.
    usesBinaryState() {
        var _a;
        return ((_a = (this.currentState || this.lastState)) === null || _a === void 0 ? void 0 : _a.data.wirelessMode) ===
            connector_hub_api_1.WirelessMode.kUniDirectional;
    }
    // Helper function which ensures that the device state received from the hub
    // is in the format expected by the plugin. Mutates and returns the input.
    sanitizeDeviceState(deviceState) {
        var _a;
        // Convert a TDBU reading into a generic device reading.
        if (this.deviceInfo.tdbuType !== connector_hub_helpers_1.TDBUType.kNone) {
            deviceState = this.tdbuToGenericState(deviceState);
        }
        // Depending on the device type, the hub may return an explicit position or
        // a simple open / closed state. In the former case, don't change anything.
        if (deviceState.data.currentPosition !== undefined) {
            return deviceState;
        }
        // Otherwise, convert the open / closed state into a currentPosition.
        if (deviceState.data.operation <= connector_hub_api_1.DeviceOpCode.kOpen) {
            deviceState.data.currentPosition =
                this.opCodeToPosition(deviceState.data.operation);
            return deviceState;
        }
        // If the operation is "stopped" then check if we have a target position.
        const target = (deviceState.data.targetPosition);
        if (deviceState.data.operation === connector_hub_api_1.DeviceOpCode.kStopped && target >= 0) {
            deviceState.data.currentPosition = target;
            return deviceState;
        }
        // If we reach here, then no exact position information can be deduced.
        log_1.Log.debug('No explicit position data in device state:', deviceState);
        // Prefer the last known real position over a guess, since the hub
        // sometimes omits position fields entirely on a given read (e.g. TDBU
        // devices that report only one half of their state at a time). Using the
        // last known position avoids overwriting good data with a meaningless
        // half-open placeholder, which previously caused affected accessories to
        // get stuck reporting a fixed, incorrect position indefinitely.
        if (((_a = this.lastState) === null || _a === void 0 ? void 0 : _a.data.currentPosition) !== undefined) {
            deviceState.data.currentPosition = this.lastState.data.currentPosition;
            return deviceState;
        }
        // No prior state to fall back on either; approximate as half-open.
        deviceState.data.currentPosition = connector_hub_constants_1.kHalfOpenValue;
        return deviceState;
    }
    // Convert a TDBU device state to generic format. If the current state does
    // not have an entry for a particular field, merge it from the last state;
    // some devices may report only partial state on each refresh.
    tdbuToGenericState(deviceState) {
        var _a;
        for (const field in this.fields) {
            if (deviceState.data[this.fields[field]] !== undefined) {
                deviceState.data[field] = deviceState.data[this.fields[field]];
            }
            else {
                deviceState.data[field] = (_a = this.lastState) === null || _a === void 0 ? void 0 : _a.data[this.fields[field]];
            }
        }
        return deviceState;
    }
    // Homekit may set a percentage position for a device that only supports
    // binary open and close. This function is used to handle this scenario. Note
    // that the input targetPos is a Connector hub position.
    binarizeTargetPosition(hubTarget) {
        return hubTarget >= 50 ? 100 : 0;
    }
    // Determines the direction in which the window covering is moving, given
    // current position and target.
    getDirection(hubPos, hubTarget) {
        const targetOffset = Math.abs(this.kClosedValue - hubTarget);
        const posOffset = Math.abs(this.kClosedValue - hubPos);
        return posOffset < targetOffset ?
            connector_hub_constants_1.OperationState.OPEN_OPENING :
            (posOffset > targetOffset ? connector_hub_constants_1.OperationState.CLOSED_CLOSING :
                connector_hub_constants_1.OperationState.STOPPED);
    }
}
exports.ConnectorDeviceHandler = ConnectorDeviceHandler;
//# sourceMappingURL=connectorDeviceHandler.js.map