"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorHubPlatform = void 0;
const net_1 = require("net");
const connectorAccessory_1 = require("./connectorAccessory");
const connector_device_discovery_1 = require("./connectorhub/connector-device-discovery");
const connector_hub_constants_1 = require("./connectorhub/connector-hub-constants");
const connector_hub_helpers_1 = require("./connectorhub/connector-hub-helpers");
const settings_1 = require("./settings");
const log_1 = require("./util/log");
/**
 * This class is the entry point for the plugin. It is responsible for parsing
 * the user config, discovering accessories, and registering them.
 */
class ConnectorHubPlatform {
    constructor(logger, config, api) {
        this.logger = logger;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        // This array is used to track restored cached accessories.
        this.cachedAccessories = [];
        // This array records the handlers which wrap each accessory.
        this.accessoryHandlers = [];
        // This array records which hubs have been scanned for devices.
        this.scannedHubs = [];
        // The list of hubs that have been successfully scanned during discovery.
        this.hubIpsScanned = [];
        // Configure the custom log with the Homebridge logger and debug config.
        log_1.Log.configure(logger, config.enableDebugLog);
        // If the config is not valid, bail out immediately. We will not discover
        // any new accessories or register any handlers for cached accessories.
        const validationErrors = this.validateConfig(config);
        if (validationErrors.length > 0) {
            log_1.Log.error('Plugin suspended. Invalid configuration:', validationErrors);
            return;
        }
        // Update the retry settings to reflect the config values.
        connector_hub_constants_1.kNetworkSettings.maxRetries = config.maxRetries;
        connector_hub_constants_1.kNetworkSettings.retryDelayMs = config.retryDelayMs;
        connector_hub_constants_1.kNetworkSettings.refreshIntervalMs = config.refreshIntervalMs;
        connector_hub_constants_1.kNetworkSettings.commandSpacingMs = config.commandSpacingMs;
        connector_hub_constants_1.kNetworkSettings.sameDeviceSpacingMs = config.sameDeviceSpacingMs;
        // Notify the user that we have completed platform initialization.
        log_1.Log.debug('Finished initializing platform');
        // This event is fired when Homebridge has restored all cached accessories.
        // We must add handlers for these, and check for any new accessories.
        this.api.on('didFinishLaunching', () => {
            log_1.Log.debug('Finished restoring all cached accessories from disk');
            this.discoverDevices();
        });
    }
    // Validate that the plugin configuration conforms to the expected format.
    validateConfig(config) {
        const validationErrors = [];
        if (!config.connectorKey) {
            validationErrors.push('App Key has not been configured');
        }
        // Enforce default values for all applicable fields.
        config.refreshIntervalMs =
            (config.refreshIntervalMs || connector_hub_constants_1.kNetworkSettings.refreshIntervalMs);
        config.retryDelayMs =
            (config.retryDelayMs || connector_hub_constants_1.kNetworkSettings.retryDelayMs);
        config.maxRetries = (config.maxRetries || connector_hub_constants_1.kNetworkSettings.maxRetries);
        config.commandSpacingMs = (config.commandSpacingMs === undefined || config.commandSpacingMs === null) ?
            connector_hub_constants_1.kNetworkSettings.commandSpacingMs : config.commandSpacingMs;
        config.sameDeviceSpacingMs = (config.sameDeviceSpacingMs === undefined || config.sameDeviceSpacingMs === null) ?
            connector_hub_constants_1.kNetworkSettings.sameDeviceSpacingMs : config.sameDeviceSpacingMs;
        config.reverseDirection = (config.reverseDirection || []);
        config.hubIps = (config.hubIps || []);
        config.deviceNames = (config.deviceNames || []);
        // Check for invalid entries and compile a list of all validation errors.
        const invalidIps = config.hubIps.filter((ip) => !(0, net_1.isIPv4)(ip));
        for (const invalidIp of invalidIps) {
            validationErrors.push(`Hub IP is not valid IPv4: ${invalidIp}`);
        }
        if (config.refreshIntervalMs <= 0) {
            validationErrors.push('Refresh interval must be > 0');
        }
        if (config.maxRetries <= 0) {
            validationErrors.push('Max request retries must be > 0');
        }
        if (config.retryDelayMs <= 0) {
            validationErrors.push('Request retry delay must be > 0');
        }
        if (config.commandSpacingMs < 0) {
            validationErrors.push('Command spacing must be >= 0');
        }
        if (config.sameDeviceSpacingMs < 0) {
            validationErrors.push('Same-device command spacing must be >= 0');
        }
        return validationErrors;
    }
    /**
     * This function is invoked for each cached accessory that homebridge restores
     * from disk at startup. Here we add the cached accessories to a list which
     * will be examined later during the 'discoverDevices' phase.
     */
    configureAccessory(accessory) {
        log_1.Log.info('Loading accessory from cache:', accessory.displayName);
        this.cachedAccessories.push(accessory);
    }
    /**
     * Iterate over the given hub IPs and begin the discovery process for each.
     * Note that we use the term "hub" here to distinguish them from individual
     * devices, but in practice a device may be its own hub if, for instance, it
     * is a WiFi motor device.
     */
    async discoverDevices() {
        if (this.config.hubIps.length === 0) {
            log_1.Log.info('No device IPs configured, defaulting to multicast discovery');
            this.config.hubIps.push(connector_hub_constants_1.kMulticastIp);
        }
        // Perform device discovery, then repeat at regular intervals.
        for (const hubIp of this.config.hubIps) {
            (0, connector_device_discovery_1.doDiscovery)(hubIp, this);
        }
    }
    async onDiscoveryCompleteForHub(hubIp) {
        // Add this hub to the list of hubs we've scanned.
        this.hubIpsScanned.push(hubIp);
        // Don't try to remove stale devices until we have heard from evey hub.
        if (!this.config.hubIps.every(ip => this.hubIpsScanned.includes(ip))) {
            return;
        }
        log_1.Log.debug('Checking for stale cached accessories...');
        (0, connector_device_discovery_1.removeStaleAccessories)(this.cachedAccessories, this);
        // Clear the list of scanned hubs for the next round of discovery.
        this.hubIpsScanned = [];
    }
    /**
     * Register discovered accessories. Accessories must only be registered once;
     * previously created accessories must not be registered again, to avoid
     * "duplicate UUID" errors.
     */
    async registerDevice(hubIp, deviceState, hubToken) {
        // Output the discovered device if we're in debug mode.
        log_1.Log.debug('Discovered device:', deviceState);
        // If this is a TDBU blind, we may have to create two separate accessories.
        const tdbuTypes = (0, connector_device_discovery_1.identifyTdbuDevices)(deviceState);
        // Iterate over all TDBU types, if such types exist. Otherwise this will
        // just register the plain single-motor device directly.
        for (const tdbuType of tdbuTypes) {
            // Augment the basic device information with additional details.
            const deviceInfo = {
                mac: deviceState.mac,
                deviceType: deviceState.deviceType,
                subType: deviceState.data.type,
                tdbuType: tdbuType,
                hubIp: hubIp,
                hubToken: hubToken,
            };
            // Generate a unique id for the accessory from its MAC address. Append the
            // TDBU type to differentiate the top down from the bottom up accessory.
            const uuid = this.api.hap.uuid.generate(deviceInfo.mac + tdbuType);
            // Generate a display name for the device from the extended device info.
            const displayName = (0, connector_hub_helpers_1.makeDeviceName)(deviceInfo, this.config);
            // Check whether we have already registered this device in this session.
            if (this.accessoryHandlers.some(elem => elem.accessory.UUID === uuid)) {
                continue;
            }
            // See if a cached accessory with the same uuid already exists.
            let accessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
            // If the accessory does not yet exist, we need to create it.
            if (!accessory) {
                log_1.Log.info('Adding new accessory:', displayName);
                accessory = new this.api.platformAccessory(displayName, uuid);
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            }
            else {
                // Remove the cached accessory from the list before adding a handler.
                this.cachedAccessories.splice(this.cachedAccessories.indexOf(accessory), 1);
            }
            // Make sure the accessory stays in sync with any device config changes.
            accessory.context.device = deviceInfo;
            this.api.updatePlatformAccessories([accessory]);
            // Create the accessory handler for this accessory.
            log_1.Log.debug('Creating handler for accessory:', displayName);
            this.accessoryHandlers.push(new connectorAccessory_1.ConnectorAccessory(this, accessory));
        }
    }
    /**
     * Unregister a stale accessory. This will remove the accessory from both
     * Homebridge and from Homekit.
     */
    unregisterDevice(accessory) {
        // Unregister the specified accessory from the plugin.
        log_1.Log.info('Removing stale accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        // Remove this cached or active accessory from the appropriate list.
        this.cachedAccessories.splice((0, connector_hub_helpers_1.spliceIndexOf)(this.cachedAccessories, accessory), 1);
        this.accessoryHandlers.splice((0, connector_hub_helpers_1.spliceIndexOf)(this.accessoryHandlers.map(ah => ah.accessory), accessory), 1);
    }
}
exports.ConnectorHubPlatform = ConnectorHubPlatform;
//# sourceMappingURL=platform.js.map