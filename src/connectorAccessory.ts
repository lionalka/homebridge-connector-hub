/* eslint-disable max-len */
/* eslint-disable indent */
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {ReadDeviceAck} from './connectorhub/connector-hub-api';
import {kHealthWarningRepeatMs, kLowRssiThreshold, kNetworkSettings, ReadDeviceType} from './connectorhub/connector-hub-constants';
import {ExtendedDeviceInfo, getBatteryPercent, getDeviceModel, isInvalidAck, isLowBattery, makeDeviceName, TDBUType} from './connectorhub/connector-hub-helpers';
import {ConnectorDeviceHandler, ReadDeviceResponse, WriteDeviceResponse} from './connectorhub/connectorDeviceHandler';
import {ConnectorHubClient} from './connectorhub/connectorHubClient';
import {ConnectorHubPlatform} from './platform';
import {Log} from './util/log';

/**
 * An instance of this class is created for each accessory. Exposes both the
 * WindowCovering and Battery services for the device.
 */
export class ConnectorAccessory extends ConnectorDeviceHandler {
  // Interval at which we actively rather than passively read the device state.
  private static readonly kActiveReadInterval = 60 * 60 * 1000;
  private performActiveRead = true;

  // Tracks how many ConnectorAccessory instances have been constructed so
  // far, used only to stagger each accessory's periodic refresh start time
  // (see below). Not reset between discovery passes, which is fine since we
  // only use it to compute a spread offset, not an identity.
  private static instanceCount = 0;

  // Tracks an in-flight "batch" of setTargetPosition calls landing close
  // together in time (e.g. all the commands from a single Homekit scene), so
  // we can log one summary line instead of one line per accessory. Static
  // because a scene spans many ConnectorAccessory instances.
  private static sceneBatch:
      {count: number; failed: number; startTime: number;
       flushTimer?: NodeJS.Timeout} = {count: 0, failed: 0, startTime: 0};
  private static readonly kSceneBatchQuietPeriodMs = 1500;

  // Network client used to communicate with the hub.
  private client: ConnectorHubClient;

  // Window covering and battery services exposed to Homekit.
  private batteryService: Service;
  private wcService: Service;

  // Current target position for this device.
  private currentTargetPos = -1;

  // Handlers for the periodic refresh and active read timers.
  // Assigned shortly after construction, once the stagger delay elapses; see
  // the constructor.
  private periodicRefreshTimer!: NodeJS.Timer;
  private activeReadTimer: NodeJS.Timer;

  // Timestamps of the last low-signal / low-battery warnings logged for this
  // accessory, used to avoid repeating the same warning every refresh cycle.
  private lastRssiWarningTime = 0;
  private lastLowBatteryWarningTime = 0;

  // Name used in log output only, distinct from accessory.displayName (which
  // is what Homekit shows in the Home app). Appends the raw device serial so
  // a device remains traceable in the logs by its physical identifier even
  // when a friendly deviceNames override hides the generated name that would
  // otherwise have included it.
  private readonly logName: string;

  constructor(
      private readonly platform: ConnectorHubPlatform,
      public readonly accessory: PlatformAccessory,
  ) {
    // Initialize the superclass constructor.
    super(<ExtendedDeviceInfo>accessory.context.device, platform.config);

    this.logName = `${makeDeviceName(this.deviceInfo, platform.config)} (${
        this.deviceInfo.mac})`;

    // Create a new client connection for this device.
    this.client = new ConnectorHubClient(
        this.platform.config, this.deviceInfo, this.deviceInfo.hubIp,
        this.deviceInfo.hubToken);

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
    const staggerOffsetMs = kNetworkSettings.refreshIntervalMs > 0 ?
        (ConnectorAccessory.instanceCount++ * kNetworkSettings.commandSpacingMs) %
            kNetworkSettings.refreshIntervalMs :
        0;
    setTimeout(() => {
      this.periodicRefreshTimer = setInterval(
          () => this.updateDeviceStatus(), kNetworkSettings.refreshIntervalMs);
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
  setAccessoryInformation(deviceState: ReadDeviceAck) {
    const Characteristic = this.platform.Characteristic;

    // Update the accessory display name, in case it wasn't set already.
    this.accessory.displayName = makeDeviceName(this.deviceInfo, this.config);
    this.platform.api.updatePlatformAccessories([this.accessory]);

    // Set the service names. These are the default names displayed by Homekit.
    this.wcService.setCharacteristic(
        Characteristic.Name, this.accessory.displayName);
    this.batteryService.setCharacteristic(
        Characteristic.Name, `${this.accessory.displayName} Battery`);

    // Update default accessory name and additional information in Homekit.
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Name, this.accessory.displayName)
        .setCharacteristic(Characteristic.Manufacturer, 'Dooya')
        .setCharacteristic(Characteristic.SerialNumber, this.deviceInfo.mac)
        .setCharacteristic(
            Characteristic.Model,
            getDeviceModel(deviceState.deviceType, deviceState.data.type));
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
    // Determine whether we should perform an active or passive read, obtain the
    // latest status from the device, and reset the active read tracker.
    let newState = <ReadDeviceResponse>(await this.client.getDeviceState(
        this.performActiveRead ? ReadDeviceType.kActive :
                                 ReadDeviceType.kPassive));
    this.performActiveRead = false;

    // Check whether the response from the hub is valid.
    if (newState && isInvalidAck(newState)) {
      // Read reply with 'actionResult' implies the device has been removed.
      if (newState.msgType === 'ReadDeviceAck' && newState.actionResult) {
        Log.info('Stale device response received:', newState);
        this.platform.unregisterDevice(this.accessory);
        clearInterval(this.periodicRefreshTimer);
        clearInterval(this.activeReadTimer);
        return;
      }
      // Otherwise, we may have a write reply error due to invalid access token.
      Log.error('Error received from hub. App key may be invalid:', newState);
      return;
    }

    // Update the cached current and last-good copies of the device status.
    this.lastState = (this.currentState || this.lastState);
    this.currentState = newState;

    // If we didn't hear back from the device, exit early.
    if (!newState) {
      Log.debug('Periodic refresh failed:', this.logName);
      return;
    }

    // Log a debug message showing the new device state received from the hub.
    Log.debug(`Latest ${this.logName} state:`, newState);

    // Sanitize the device state for the specific device that we are handling.
    this.currentState = newState = this.sanitizeDeviceState(newState);

    // The first time we read the device, we update the accessory details.
    if (!this.lastState) {
      this.setAccessoryInformation(newState);
    }

    // We extract 'lastPos' as below because lastState will be undefined on the
    // first iteration, so we wish to force an update.
    const lastPos = (this.lastState?.data.currentPosition);
    if (newState.data.currentPosition !== lastPos) {
      // Log a message for the user to signify that the position has changed.
      const newPos = this.toHomekitPercent(newState.data.currentPosition);
      Log.info('Updating position:', [this.logName, newPos]);

      // The hub updates only after completing each movement. Update the target
      // position to match the new currentPosition. Usually this is a no-op, but
      // it will keep Homekit in sync if the device is moved externally.
      this.currentTargetPos = newState.data.currentPosition;
      // Push the new state of the window covering properties to Homekit.
      this.updateWindowCoveringService();
    }

    // Update the battery level if it has changed since the last refresh.
    const lastBatteryPC = getBatteryPercent(this.lastState?.data.batteryLevel);
    const batteryPC = getBatteryPercent(newState?.data.batteryLevel);
    if (batteryPC !== lastBatteryPC) {
      // Log a message for the user, then push the new battery state to Homekit.
      Log.info('Updating battery:', [this.logName, batteryPC]);
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
  private maybeWarnDeviceHealth(state: ReadDeviceResponse, batteryPC: number) {
    const now = Date.now();
    const rssi = state?.data.RSSI;
    if (rssi !== undefined && rssi <= kLowRssiThreshold &&
        now - this.lastRssiWarningTime >= kHealthWarningRepeatMs) {
      Log.warn(
          'Weak signal:', [this.logName, `${rssi} dBm`]);
      this.lastRssiWarningTime = now;
    }
    if (isLowBattery(state?.data.batteryLevel ?? 100) &&
        now - this.lastLowBatteryWarningTime >= kHealthWarningRepeatMs) {
      Log.warn(
          'Low battery:', [this.logName, `${batteryPC}%`]);
      this.lastLowBatteryWarningTime = now;
    }
  }

  // Push the current status of the window covering properties to Homekit.
  updateWindowCoveringService() {
    // We only update if we have an up-to-date device state. Note that the hub
    // reports 0 as fully open and 100 as closed, but Homekit expects the
    // opposite. Correct the values before reporting.
    if (this.currentState) {
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.CurrentPosition,
          this.toHomekitPercent(this.currentState.data.currentPosition));
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.TargetPosition,
          this.toHomekitPercent(this.currentTargetPos));
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.PositionState,
          this.getDirection(
              this.currentState.data.currentPosition, this.currentTargetPos));
    }
  }

  // Push the current values of the battery service properties to Homekit.
  updateBatteryService() {
    // We only update if we have an up-to-date device state.
    if (this.currentState) {
      // getBatteryPercent() returns -1 as a sentinel for "unknown" when the
      // hub response is missing battery data (e.g. a TDBU device reporting
      // only one motor's fields on a given read). HAP rejects BatteryLevel
      // values outside 0-100, so pushing -1 through previously caused a
      // "characteristic was supplied illegal value" warning on every such
      // partial read. Skip the update instead, leaving Homekit showing the
      // last known good value rather than an invalid one.
      const batteryPC = getBatteryPercent(this.currentState.data.batteryLevel);
      if (batteryPC >= 0) {
        this.batteryService.updateCharacteristic(
            this.platform.Characteristic.BatteryLevel, batteryPC);
        this.batteryService.updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery,
            isLowBattery(this.currentState.data.batteryLevel));
      }
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.ChargingState,
          this.currentState.data.chargingState ||
              this.platform.Characteristic.ChargingState.NOT_CHARGING);
    }
  }

  /**
   * Handle "set TargetPosition" requests from HomeKit. These are sent when the
   * user changes the state of the device. Throws SERVICE_COMMUNICATION_FAILURE
   * if the hub cannot be contacted.
   */
  async setTargetPosition(targetVal: CharacteristicValue) {
    // Adjust the target value from Homekit to Hub values, and construct a
    // target request appropriate to this device.
    const [hubTarget, targetReq] = this.makeTargetRequest(<number>targetVal);

    // For Bottom-Up TDBU accessories, delay before entering the send queue so
    // that a Top-Down command for the same physical motor — dispatched by
    // HomeKit in the same scene burst — has time to queue ahead of us.
    // This guarantees Top-Down always precedes Bottom-Up at the hub regardless
    // of which order HomeKit happened to dispatch them.
    if (this.deviceInfo.tdbuType === TDBUType.kBottomUp) {
      const delayMs = kNetworkSettings.tdbuBottomUpDelayMs || 0;
      if (delayMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Send the targeting request in the appropriate format for this device.
    const ack = <WriteDeviceResponse>await this.client.setDeviceState(targetReq);

    // If we didn't receive an ack, or if the ack reports an exception from the
    // hub, or if the ack is invalid, throw a communications error to Homekit.
    if (!ack || isInvalidAck(ack)) {
      Log.error(
          `Failed to set ${this.logName} to ${targetVal}:`,
          (ack || 'No response from hub'));
      ConnectorAccessory.recordSceneBatchResult(false);
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    // Record the current targeted position, and inform Homekit.
    this.currentTargetPos = hubTarget;
    this.updateWindowCoveringService();

    // Optimistically report the shade as arrived at its target so HomeKit
    // clears "Closing..." / "Opening..." immediately after the hub acks the
    // command, rather than waiting for the next periodic refresh (up to 10s)
    // to bring back a position that matches the target. The refresh will
    // correct the value if the motor didn't fully reach the target.
    this.wcService.updateCharacteristic(
        this.platform.Characteristic.CurrentPosition,
        this.toHomekitPercent(hubTarget));
    this.wcService.updateCharacteristic(
        this.platform.Characteristic.PositionState,
        this.platform.Characteristic.PositionState.STOPPED);

    // Log the result of the operation for the user.
    Log.info('Targeted:', [this.logName, targetVal]);
    Log.debug('Target response:', (ack || 'None'));
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
  private static recordSceneBatchResult(success: boolean) {
    const batch = ConnectorAccessory.sceneBatch;
    if (!batch.flushTimer) {
      batch.count = 0;
      batch.failed = 0;
      batch.startTime = Date.now();
    } else {
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
        Log.info(
            'Scene batch:',
            `${succeeded}/${batch.count} acked, ${batch.failed} failed, ${
                elapsedSec}s`);
      }
      batch.flushTimer = undefined;
    }, ConnectorAccessory.kSceneBatchQuietPeriodMs);
  }

  async getTargetPosition(): Promise<CharacteristicValue> {
    // If a target position hasn't been set yet, report a communication error.
    if (this.currentTargetPos < 0) {
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    // Target is cached in Connector hub format, convert to Homekit format.
    const currentTarget = this.toHomekitPercent(this.currentTargetPos);
    Log.debug('Returning target:', [this.logName, currentTarget]);
    return currentTarget;
  }

  /**
   * Handle "get CurrentPosition" requests from HomeKit. Returns the most recent
   * value cached by the periodic updater; throws SERVICE_COMMUNICATION_FAILURE
   * if the most recent attempt to contact the hub failed.
   */
  async getCurrentPosition(): Promise<CharacteristicValue> {
    if (!this.currentState) {
      Log.debug('Failed to get position:', this.logName);
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    // Position is cached in Connector hub format, convert to Homekit format.
    const currentPos =
        this.toHomekitPercent(this.currentState.data.currentPosition);
    Log.debug('Returning position:', [this.logName, currentPos]);
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
  async getPositionState(): Promise<CharacteristicValue> {
    // If we don't know the current or target position, throw an exception.
    if (this.currentTargetPos < 0 || !this.currentState) {
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const posState = this.getDirection(
        this.currentState.data.currentPosition, this.currentTargetPos);
    Log.debug('Returning pos state:', [this.logName, posState]);
    return posState;
  }
}
