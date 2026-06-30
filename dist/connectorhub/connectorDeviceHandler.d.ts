import { PlatformConfig } from 'homebridge';
import { DeviceCmd, ReadDeviceAck, WriteDeviceAck } from './connector-hub-api';
import { ExtendedDeviceInfo } from './connector-hub-helpers';
export declare type ReadDeviceResponse = ReadDeviceAck | undefined;
export declare type WriteDeviceResponse = WriteDeviceAck | undefined;
/**
 * This class exposes methods for handling all conversions between Homekit and
 * Connector co-ordinate systems. Generally, Connector positions are the inverse
 * of Homekit values, but in certain cases this does not hold true.
 */
export declare class ConnectorDeviceHandler {
    protected readonly deviceInfo: ExtendedDeviceInfo;
    protected readonly config: PlatformConfig;
    protected currentState: ReadDeviceResponse;
    protected lastState: ReadDeviceResponse;
    private kClosedValue;
    private fields;
    constructor(deviceInfo: ExtendedDeviceInfo, config: PlatformConfig);
    protected makeTargetRequest(homekitTarget: number): [
        hubTarget: number,
        targetRequest: DeviceCmd
    ];
    private makeOpenCloseRequest;
    private makeTargetPositionRequest;
    private positionToOpCode;
    private opCodeToPosition;
    private invertPC;
    toHomekitPercent(hubPC: number): number;
    private fromHomekitPercent;
    private usesBinaryState;
    protected sanitizeDeviceState(deviceState: ReadDeviceAck): ReadDeviceAck;
    private tdbuToGenericState;
    private binarizeTargetPosition;
    getDirection(hubPos: number, hubTarget: number): number;
}
//# sourceMappingURL=connectorDeviceHandler.d.ts.map