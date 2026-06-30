import { DeviceCmd, DeviceInfo, DeviceModel, DeviceType, GetDeviceListReq, ReadDeviceAck, ReadDeviceReq, WriteDeviceAck, WriteDeviceReq } from './connector-hub-api';
export declare enum TDBUType {
    kNone = "",
    kTopDown = " Top-Down",
    kBottomUp = " Bottom-Up"
}
export interface ExtendedDeviceInfo extends DeviceInfo {
    subType: DeviceModel;
    tdbuType: TDBUType;
    hubIp: string;
    hubToken: string;
}
export declare function computeAccessToken(connectorKey: string, hubToken: string): string;
export declare function makeMsgId(): string;
export declare function makeGetDeviceListRequest(): GetDeviceListReq;
export declare function makeReadDeviceRequest(deviceInfo: DeviceInfo, accessToken: string): ReadDeviceReq;
export declare function makeWriteDeviceRequest(deviceInfo: DeviceInfo, accessToken: string, command: DeviceCmd): WriteDeviceReq;
export declare function tryParse(jsonStr: string): any;
export declare function isInvalidAck(ack: WriteDeviceAck | ReadDeviceAck): string | undefined;
export declare function isWifiBridge(deviceType: DeviceType): boolean;
export declare function getDeviceModel(type: string, subType?: number, tdbuType?: TDBUType): string;
export declare function extractHubMac(deviceMac: string): string;
export declare function makeDeviceName(devInfo: ExtendedDeviceInfo): string;
export declare function getBatteryPercent(batteryLevel?: number): number;
export declare function isLowBattery(batteryLevel: number): boolean;
export declare function spliceIndexOf(arr: any[], value: any): number;
export declare function xor(foo: any, bar: any): any;
//# sourceMappingURL=connector-hub-helpers.d.ts.map