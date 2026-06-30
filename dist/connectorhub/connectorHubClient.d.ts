import { PlatformConfig } from 'homebridge';
import { DeviceCmd, DeviceInfo, DeviceOpCode, GetDeviceListAck, ReadDeviceAck, WriteDeviceAck } from './connector-hub-api';
import { ReadDeviceType } from './connector-hub-constants';
declare type DeviceResponse = GetDeviceListAck | WriteDeviceAck | ReadDeviceAck;
export declare class ConnectorHubClient {
    private readonly config;
    private readonly deviceInfo;
    private readonly hubIp;
    private readonly hubToken;
    private accessToken;
    constructor(config: PlatformConfig, deviceInfo: DeviceInfo, hubIp: string, hubToken: string);
    static getDeviceList(hubIp: string): Promise<DeviceResponse[]>;
    static readDeviceState(deviceInfo: DeviceInfo, hubIp: string, hubToken: string, connectorKey: string): Promise<DeviceResponse>;
    getDeviceState(readType: ReadDeviceType): Promise<DeviceResponse>;
    setOpenCloseState(op: DeviceOpCode): Promise<DeviceResponse>;
    setTargetPosition(position: number): Promise<DeviceResponse>;
    setTargetAngle(angle: number): Promise<DeviceResponse>;
    setDeviceState(command: DeviceCmd): Promise<DeviceResponse>;
}
export {};
//# sourceMappingURL=connectorHubClient.d.ts.map