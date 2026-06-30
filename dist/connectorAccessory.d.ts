import { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { ReadDeviceAck } from './connectorhub/connector-hub-api';
import { ConnectorDeviceHandler } from './connectorhub/connectorDeviceHandler';
import { ConnectorHubPlatform } from './platform';
/**
 * An instance of this class is created for each accessory. Exposes both the
 * WindowCovering and Battery services for the device.
 */
export declare class ConnectorAccessory extends ConnectorDeviceHandler {
    private readonly platform;
    readonly accessory: PlatformAccessory;
    private static readonly kActiveReadInterval;
    private performActiveRead;
    private static instanceCount;
    private static sceneBatch;
    private static readonly kSceneBatchQuietPeriodMs;
    private client;
    private batteryService;
    private wcService;
    private currentTargetPos;
    private periodicRefreshTimer;
    private activeReadTimer;
    private lastRssiWarningTime;
    private lastLowBatteryWarningTime;
    private readonly logName;
    constructor(platform: ConnectorHubPlatform, accessory: PlatformAccessory);
    setAccessoryInformation(deviceState: ReadDeviceAck): void;
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
    updateDeviceStatus(): Promise<void>;
    private maybeWarnDeviceHealth;
    updateWindowCoveringService(): void;
    updateBatteryService(): void;
    /**
     * Handle "set TargetPosition" requests from HomeKit. These are sent when the
     * user changes the state of the device. Throws SERVICE_COMMUNICATION_FAILURE
     * if the hub cannot be contacted.
     */
    setTargetPosition(targetVal: CharacteristicValue): Promise<void>;
    /**
     * Tracks setTargetPosition calls landing close together in time (e.g. all
     * the commands fired by a single Homekit scene) and logs one summary line
     * once the burst goes quiet, instead of requiring the user to count
     * individual "Targeted:" lines to know whether a scene fully succeeded.
     * Single, isolated commands (not part of a burst) are not summarized,
     * since the per-accessory "Targeted:" line already covers that case.
     */
    private static recordSceneBatchResult;
    getTargetPosition(): Promise<CharacteristicValue>;
    /**
     * Handle "get CurrentPosition" requests from HomeKit. Returns the most recent
     * value cached by the periodic updater; throws SERVICE_COMMUNICATION_FAILURE
     * if the most recent attempt to contact the hub failed.
     */
    getCurrentPosition(): Promise<CharacteristicValue>;
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
    getPositionState(): Promise<CharacteristicValue>;
}
//# sourceMappingURL=connectorAccessory.d.ts.map