import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { ReadDeviceAck } from './connectorhub/connector-hub-api';
/**
 * This class is the entry point for the plugin. It is responsible for parsing
 * the user config, discovering accessories, and registering them.
 */
export declare class ConnectorHubPlatform implements DynamicPlatformPlugin {
    private readonly logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    private readonly cachedAccessories;
    private readonly accessoryHandlers;
    private readonly scannedHubs;
    constructor(logger: Logger, config: PlatformConfig, api: API);
    private validateConfig;
    /**
     * This function is invoked for each cached accessory that homebridge restores
     * from disk at startup. Here we add the cached accessories to a list which
     * will be examined later during the 'discoverDevices' phase.
     */
    configureAccessory(accessory: PlatformAccessory): void;
    /**
     * Iterate over the given hub IPs and begin the discovery process for each.
     * Note that we use the term "hub" here to distinguish them from individual
     * devices, but in practice a device may be its own hub if, for instance, it
     * is a WiFi motor device.
     */
    private discoverDevices;
    private hubIpsScanned;
    onDiscoveryCompleteForHub(hubIp: string): Promise<void>;
    /**
     * Register discovered accessories. Accessories must only be registered once;
     * previously created accessories must not be registered again, to avoid
     * "duplicate UUID" errors.
     */
    registerDevice(hubIp: string, deviceState: ReadDeviceAck, hubToken: string): Promise<void>;
    /**
     * Unregister a stale accessory. This will remove the accessory from both
     * Homebridge and from Homekit.
     */
    unregisterDevice(accessory: PlatformAccessory): void;
}
//# sourceMappingURL=platform.d.ts.map