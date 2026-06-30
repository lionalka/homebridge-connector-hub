"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorAccessory = void 0;
const connector_hub_constants_1 = require("./connectorhub/connector-hub-constants");
const connector_hub_helpers_1 = require("./connectorhub/connector-hub-helpers");
const connectorDeviceHandler_1 = require("./connectorhub/connectorDeviceHandler");
const connectorHubClient_1 = require("./connectorhub/connectorHubClient");
const log_1 = require("./util/log");
/**
 * An instance of this class is created for each accessory. Exposes both the
 * WindowCovering and Battery services for the device.
 */
class ConnectorAccessory extends connectorDeviceHandler_1.ConnectorDeviceHandler {
    constructor(platform, accessory) {
        // Initialize the superclass constructor.
        super(accessory.context.device, platform.config);
        this.platform = platform;
        this.accessory = accessory;
        this.performActiveRead = true;
        // Current target position for this device.
        this.currentTargetPos = -1;
        // Timestamps of the last low-signal / low-battery warnings logged for this
        // accessory, used to avoid repeating the same warning every refresh cycle.
        this.lastRssiWarningTime = 0;
        this.lastLowBatteryWarningTime = 0;
        // Create a new client connection for this device.
        this.client = new connectorHubClient_1.ConnectorHubClient(this.platform.config, this.deviceInfo, this.deviceInfo.hubIp, this.deviceInfo.hubToken);
        // Get the WindowCovering service if it exists, otherwise create one.
        this.wcService =
            this.accessory.getService(this.platform.Service.WindowCovering) ||
                this.accessory.addService(this.platform.Service.WindowCovering);
        // Add a service to report the battery level.
        this.batteryService =
            this.accessory.getService(this.platform.Service.Battery) ||
                this.accessory.addService(this.platform.Service.Battery);
        // Initialize the device state immediately, but stagger the start of this
        // accessory's periodic refresh timer relative to its siblings. Without
        // this, every accessory's timer is created within the same instant at
        // startup, so background polling bursts all devices at once every
        // refresh cycle instead of spreading smoothly across it. We reuse
        // commandSpacingMs as the per-device offset unit so the spread scales
        // with whatever the hub has already been tuned to tolerate.
        this.updateDeviceStatus();
        const staggerOffsetMs = connector_hub_constants_1.kNetworkSettings.refreshIntervalMs > 0 ?
            (ConnectorAccessory.instanceCount++ * connector_hub_constants_1.kNetworkSettings.commandSpacingMs) %
                connector_hub_constants_1.kNetworkSettings.refreshIntervalMs :
            0;
        setTimeout(() => {
            this.periodicRefreshTimer = setInterval(() => this.updateDeviceStatus(), connector_hub_constants_1.kNetworkSettings.refreshIntervalMs);
        }, staggerOffsetMs);
        // Set up a timer to indicate when we should perform active reads.
        this.activeReadTimer = setInterval(() => {
            this.performActiveRead = true;
        }, ConnectorAccessory.kActiveReadInterval);
        // Register handlers for the CurrentPosition Characteristic.
        this.wcService
            .getCharacteristic(this.platform.Characteristic.CurrentPosition)
            .onGet(this.getCurrentPosition.bind(this));
        // Register handlers for the PositionState Characteristic.
        this.wcService.getCharacteristic(this.platform.Characteristic.PositionState)
            .onGet(this.getPositionState.bind(this));
        // Register handlers for the TargetPosition Characteristic
        this.wcService
            .getCharacteristic(this.platform.Characteristic.TargetPosition)
            .onGet(this.getTargetPosition.bind(this))
            .onSet(this.setTargetPosition.bind(this));
    }
    // Update the device information displayed in Homekit. Only called once.
    setAccessoryInformation(deviceState) {
        const Characteristic = this.platform.Characteristic;
        // Update the accessory display name, in case it wasn't set already.
        this.accessory.displayName = (0, connector_hub_helpers_1.makeDeviceName)(this.deviceInfo);
        this.platform.api.updatePlatformAccessories([this.accessory]);
        // Set the service names. These are the default names displayed by Homekit.
        this.wcService.setCharacteristic(Characteristic.Name, this.accessory.displayName);
        this.batteryService.setCharacteristic(Characteristic.Name, `${this.accessory.displayName} Battery`);
        // Update default accessory name and additional information in Homekit.
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.accessory.displayName)
            .setCharacteristic(Characteristic.Manufacturer, 'Dooya')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceInfo.mac)
            .setCharacteristic(Characteristic.Model, (0, connector_hub_helpers_1.getDeviceModel)(deviceState.deviceType, deviceState.data.type));
    }
    /**
     * This function is the main driver of the plugin. It periodically reads the
     * current device state from the hub and, if relevant values have changed,
     * pushes the new state to Homekit. This approach is taken because pulling the
     * status from the hub whenever Homekit requests it is too slow. It also means
     * that Homekit will stay in sync with any external changes to the device
     * state, e.g. if the device is moved using a physical remote.
     *
     * Note that the hub does not report real-time values; it only updates the
     * device state when a movement completes.
     */
    async updateDeviceStatus() {
        var _a, _b;
        // Determine whether we should perform an active or passive read, obtain the
        // latest status from the device, and reset the active read tracker.
        let newState = (await this.client.getDeviceState(this.performActiveRead ? connector_hub_constants_1.ReadDeviceType.kActive :
            connector_hub_constants_1.ReadDeviceType.kPassive));
        this.performActiveRead = false;
        // Check whether the response from the hub is valid.
        if (newState && (0, connector_hub_helpers_1.isInvalidAck)(newState)) {
            // Read reply with 'actionResult' implies the device has been removed.
            if (newState.msgType === 'ReadDeviceAck' && newState.actionResult) {
                log_1.Log.info('Stale device response received:', newState);
                this.platform.unregisterDevice(this.accessory);
                clearInterval(this.periodicRefreshTimer);
                clearInterval(this.activeReadTimer);
                return;
            }
            // Otherwise, we may have a write reply error due to invalid access token.
            log_1.Log.error('Error received from hub. App key may be invalid:', newState);
            return;
        }
        // Update the cached current and last-good copies of the device status.
        this.lastState = (this.currentState || this.lastState);
        this.currentState = newState;
        // If we didn't hear back from the device, exit early.
        if (!newState) {
            log_1.Log.debug('Periodic refresh failed:', this.accessory.displayName);
            return;
        }
        // Log a debug message showing the new device state received from the hub.
        log_1.Log.debug(`Latest ${this.accessory.displayName} state:`, newState);
        // Sanitize the device state for the specific device that we are handling.
        this.currentState = newState = this.sanitizeDeviceState(newState);
        // The first time we read the device, we update the accessory details.
        if (!this.lastState) {
            this.setAccessoryInformation(newState);
        }
        // We extract 'lastPos' as below because lastState will be undefined on the
        // first iteration, so we wish to force an update.
        const lastPos = ((_a = this.lastState) === null || _a === void 0 ? void 0 : _a.data.currentPosition);
        if (newState.data.currentPosition !== lastPos) {
            // Log a message for the user to signify that the position has changed.
            const newPos = this.toHomekitPercent(newState.data.currentPosition);
            log_1.Log.info('Updating position:', [this.accessory.displayName, newPos]);
            // The hub updates only after completing each movement. Update the target
            // position to match the new currentPosition. Usually this is a no-op, but
            // it will keep Homekit in sync if the device is moved externally.
            this.currentTargetPos = newState.data.currentPosition;
            // Push the new state of the window covering properties to Homekit.
            this.updateWindowCoveringService();
        }
        // Update the battery level if it has changed since the last refresh.
        const lastBatteryPC = (0, connector_hub_helpers_1.getBatteryPercent)((_b = this.lastState) === null || _b === void 0 ? void 0 : _b.data.batteryLevel);
        const batteryPC = (0, connector_hub_helpers_1.getBatteryPercent)(newState === null || newState === void 0 ? void 0 : newState.data.batteryLevel);
        if (batteryPC !== lastBatteryPC) {
            // Log a message for the user, then push the new battery state to Homekit.
            log_1.Log.info('Updating battery:', [this.accessory.displayName, batteryPC]);
            this.updateBatteryService();
        }
        // Surface weak signal / low battery at info level, not just buried in
        // debug logs, since both are leading indicators of a device going fully
        // unresponsive (acking commands but never actually moving). Repeated
        // warnings for the same condition are throttled so a persistently weak
        // device doesn't spam the log every refresh cycle.
        this.maybeWarnDeviceHealth(newState, batteryPC);
    }
    // Logs a warning if this device's signal strength or battery level looks
    // unhealthy, throttled to at most once per kHealthWarningRepeatMs.
    maybeWarnDeviceHealth(state, batteryPC) {
        var _a;
        const now = Date.now();
        const rssi = state === null || state === void 0 ? void 0 : state.data.RSSI;
        if (rssi !== undefined && rssi <= connector_hub_constants_1.kLowRssiThreshold &&
            now - this.lastRssiWarningTime >= connector_hub_constants_1.kHealthWarningRepeatMs) {
            log_1.Log.warn('Weak signal:', [this.accessory.displayName, `${rssi} dBm`]);
            this.lastRssiWarningTime = now;
        }
        if ((0, connector_hub_helpers_1.isLowBattery)((_a = state === null || state === void 0 ? void 0 : state.data.batteryLevel) !== null && _a !== void 0 ? _a : 100) &&
            now - this.lastLowBatteryWarningTime >= connector_hub_constants_1.kHealthWarningRepeatMs) {
            log_1.Log.warn('Low battery:', [this.accessory.displayName, `${batteryPC}%`]);
            this.lastLowBatteryWarningTime = now;
        }
    }
    // Push the current status of the window covering properties to Homekit.
    updateWindowCoveringService() {
        // We only update if we have an up-to-date device state. Note that the hub
        // reports 0 as fully open and 100 as closed, but Homekit expects the
        // opposite. Correct the values before reporting.
        if (this.currentState) {
            this.wcService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, this.toHomekitPercent(this.currentState.data.currentPosition));
            this.wcService.updateCharacteristic(this.platform.Characteristic.TargetPosition, this.toHomekitPercent(this.currentTargetPos));
            this.wcService.updateCharacteristic(this.platform.Characteristic.PositionState, this.getDirection(this.currentState.data.currentPosition, this.currentTargetPos));
        }
    }
    // Push the current values of the battery service properties to Homekit.
    updateBatteryService() {
        // We only update if we have an up-to-date device state.
        if (this.currentState) {
            this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, (0, connector_hub_helpers_1.getBatteryPercent)(this.currentState.data.batteryLevel));
            this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, (0, connector_hub_helpers_1.isLowBattery)(this.currentState.data.batteryLevel));
            this.batteryService.updateCharacteristic(this.platform.Characteristic.ChargingState, this.currentState.data.chargingState ||
                this.platform.Characteristic.ChargingState.NOT_CHARGING);
        }
    }
    /**
     * Handle "set TargetPosition" requests from HomeKit. These are sent when the
     * user changes the state of the device. Throws SERVICE_COMMUNICATION_FAILURE
     * if the hub cannot be contacted.
     */
    async setTargetPosition(targetVal) {
        // Adjust the target value from Homekit to Hub values, and construct a
        // target request appropriate to this device.
        const [hubTarget, targetReq] = this.makeTargetRequest(targetVal);
        // Send the targeting request in the appropriate format for this device.
        const ack = await (() => {
            return this.client.setDeviceState(targetReq);
        })();
        // If we didn't receive an ack, or if the ack reports an exception from the
        // hub, or if the ack is invalid, throw a communications error to Homekit.
        if (!ack || (0, connector_hub_helpers_1.isInvalidAck)(ack)) {
            log_1.Log.error(`Failed to set ${this.accessory.displayName} to ${targetVal}:`, (ack || 'No response from hub'));
            ConnectorAccessory.recordSceneBatchResult(false);
            throw new this.platform.api.hap.HapStatusError(-70402 /* SERVICE_COMMUNICATION_FAILURE */);
        }
        // Record the current targeted position, and inform Homekit.
        this.currentTargetPos = hubTarget;
        this.updateWindowCoveringService();
        // Log the result of the operation for the user.
        log_1.Log.info('Targeted:', [this.accessory.displayName, targetVal]);
        log_1.Log.debug('Target response:', (ack || 'None'));
        ConnectorAccessory.recordSceneBatchResult(true);
    }
    /**
     * Tracks setTargetPosition calls landing close together in time (e.g. all
     * the commands fired by a single Homekit scene) and logs one summary line
     * once the burst goes quiet, instead of requiring the user to count
     * individual "Targeted:" lines to know whether a scene fully succeeded.
     * Single, isolated commands (not part of a burst) are not summarized,
     * since the per-accessory "Targeted:" line already covers that case.
     */
    static recordSceneBatchResult(success) {
        const batch = ConnectorAccessory.sceneBatch;
        if (!batch.flushTimer) {
            batch.count = 0;
            batch.failed = 0;
            batch.startTime = Date.now();
        }
        else {
            clearTimeout(batch.flushTimer);
        }
        batch.count++;
        if (!success) {
            batch.failed++;
        }
        batch.flushTimer = setTimeout(() => {
            if (batch.count > 1) {
                const elapsedSec = ((Date.now() - batch.startTime) / 1000).toFixed(1);
                const succeeded = batch.count - batch.failed;
                log_1.Log.info('Scene batch:', `${succeeded}/${batch.count} acked, ${batch.failed} failed, ${elapsedSec}s`);
            }
            batch.flushTimer = undefined;
        }, ConnectorAccessory.kSceneBatchQuietPeriodMs);
    }
    async getTargetPosition() {
        // If a target position hasn't been set yet, report a communication error.
        if (this.currentTargetPos < 0) {
            throw new this.platform.api.hap.HapStatusError(-70402 /* SERVICE_COMMUNICATION_FAILURE */);
        }
        // Target is cached in Connector hub format, convert to Homekit format.
        const currentTarget = this.toHomekitPercent(this.currentTargetPos);
        log_1.Log.debug('Returning target:', [this.accessory.displayName, currentTarget]);
        return currentTarget;
    }
    /**
     * Handle "get CurrentPosition" requests from HomeKit. Returns the most recent
     * value cached by the periodic updater; throws SERVICE_COMMUNICATION_FAILURE
     * if the most recent attempt to contact the hub failed.
     */
    async getCurrentPosition() {
        if (!this.currentState) {
            log_1.Log.debug('Failed to get position:', this.accessory.displayName);
            throw new this.platform.api.hap.HapStatusError(-70402 /* SERVICE_COMMUNICATION_FAILURE */);
        }
        // Position is cached in Connector hub format, convert to Homekit format.
        const currentPos = this.toHomekitPercent(this.currentState.data.currentPosition);
        log_1.Log.debug('Returning position:', [this.accessory.displayName, currentPos]);
        return currentPos;
    }
    /**
     * In theory, the value of 'currentState.data.operation' would provide us with
     * the correct PositionState. However, real-time polling of the devices causes
     * severe degradation of responsiveness over time; we therefore use passive
     * read requests, which only update the state after each movement is complete.
     * This means that only the position ever changes, while the PositionState is
     * always in the STOPPED state.
     *
     * Conversely, for devices which only use binary open/close commands, the op
     * state is *never* STOPPED; it is always opening/open or closing/closed. But
     * it is not possible to tell whether the motion is still in progress, or
     * whether the operation code represents the current resting state.
     *
     * For these reasons, we compute the PositionState manually using the current
     * and target positions.
     */
    async getPositionState() {
        // If we don't know the current or target position, throw an exception.
        if (this.currentTargetPos < 0 || !this.currentState) {
            throw new this.platform.api.hap.HapStatusError(-70402 /* SERVICE_COMMUNICATION_FAILURE */);
        }
        const posState = this.getDirection(this.currentState.data.currentPosition, this.currentTargetPos);
        log_1.Log.debug('Returning pos state:', [this.accessory.displayName, posState]);
        return posState;
    }
}
exports.ConnectorAccessory = ConnectorAccessory;
// Interval at which we actively rather than passively read the device state.
ConnectorAccessory.kActiveReadInterval = 60 * 60 * 1000;
// Tracks how many ConnectorAccessory instances have been constructed so
// far, used only to stagger each accessory's periodic refresh start time
// (see below). Not reset between discovery passes, which is fine since we
// only use it to compute a spread offset, not an identity.
ConnectorAccessory.instanceCount = 0;
// Tracks an in-flight "batch" of setTargetPosition calls landing close
// together in time (e.g. all the commands from a single Homekit scene), so
// we can log one summary line instead of one line per accessory. Static
// because a scene spans many ConnectorAccessory instances.
ConnectorAccessory.sceneBatch = { count: 0, failed: 0, startTime: 0 };
ConnectorAccessory.kSceneBatchQuietPeriodMs = 1500;
//# sourceMappingURL=connectorAccessory.js.map