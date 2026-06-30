import { PlatformAccessory } from 'homebridge';
import { ConnectorHubPlatform } from '../platform';
import { ReadDeviceAck } from './connector-hub-api';
import { TDBUType } from './connector-hub-helpers';
export declare function doDiscovery(hubIp: string, platform: ConnectorHubPlatform): Promise<void>;
export declare function removeStaleAccessories(accessories: PlatformAccessory[], platform: ConnectorHubPlatform): Promise<void>;
export declare function identifyTdbuDevices(deviceState: ReadDeviceAck): TDBUType[];
//# sourceMappingURL=connector-device-discovery.d.ts.map