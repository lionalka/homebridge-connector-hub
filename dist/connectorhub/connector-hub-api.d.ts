export declare enum DeviceOpCode {
    kClose = 0,
    kOpen = 1,
    kStopped = 2,
    kStatusQuery = 5
}
export declare enum DeviceType {
    kWiFiBridge = "02000001",
    kWiFiBridgeAlt = "02000002",
    k433MHzRadioMotor = "10000000",
    kWiFiCurtain = "22000000",
    kWiFiTubularMotor = "22000002",
    kWiFiReceiver = "22000005"
}
export declare enum DeviceModel {
    kRollerBlinds = 1,
    kVenetianBlinds = 2,
    kRomanBlinds = 3,
    kHoneycombBlinds = 4,
    kShangriLaBlinds = 5,
    kRollerShutter = 6,
    kRollerGate = 7,
    kAwning = 8,
    kTopDownBottomUp = 9,
    kDayAndNightBlinds = 10,
    kDimmingBlinds = 11,
    kCurtain = 12,
    kCurtainOpenLeft = 13,
    kCurtainOpenRight = 14
}
declare enum DeviceState {
    kNoLimits = 0,
    kTopLimitDetected = 1,
    kBottomLimitDetected = 2,
    kLimitsDetected = 3,
    kThirdLimitDetected = 4
}
declare enum VoltageMode {
    kACMotor = 0,
    kDCMotor = 1
}
declare enum ChargingState {
    kNotCharging = 0,
    kCharging = 1,
    kNotChargeable = 2
}
export declare enum WirelessMode {
    kUniDirectional = 0,
    kBiDirectional = 1,
    kBiDiWithMechanicalLimits = 2,
    kOther = 3
}
export interface DeviceInfo {
    mac: string;
    deviceType: DeviceType;
}
interface DeviceStatus {
    type: DeviceModel;
    operation: DeviceOpCode;
    direction?: number;
    currentPosition: number;
    targetPosition?: number;
    currentAngle: number;
    currentState: DeviceState;
    switchMode?: number;
    controlMode?: number;
    voltageMode: VoltageMode;
    batteryLevel: number;
    chargingState: ChargingState;
    wirelessMode: WirelessMode;
    RSSI: number;
}
export interface DeviceStatusTDBU extends DeviceStatus {
    operation_T: DeviceOpCode;
    operation_B: DeviceOpCode;
    currentPosition_T: number;
    currentPosition_B: number;
    currentState_T: DeviceState;
    currentState_B: DeviceState;
    batteryLevel_T: number;
    batteryLevel_B: number;
}
export interface DeviceCmd {
    operation?: DeviceOpCode;
    targetPosition?: number;
    targetAngle?: number;
}
export interface GetDeviceListReq {
    msgType: 'GetDeviceList';
    msgID: string;
}
export interface GetDeviceListAck {
    msgType: 'GetDeviceListAck';
    mac: string;
    deviceType: DeviceType;
    fwVersion: string;
    ProtocolVersion: string;
    token: string;
    data: DeviceInfo[];
}
export interface WriteDeviceReq {
    msgType: 'WriteDevice';
    mac: string;
    deviceType: DeviceType;
    accessToken: string;
    msgID: string;
    data: DeviceCmd;
}
export interface WriteDeviceAck {
    msgType: 'WriteDeviceAck';
    mac: string;
    deviceType: DeviceType;
    data: DeviceStatus;
    actionResult?: string;
}
export interface ReadDeviceReq {
    msgType: 'ReadDevice';
    mac: string;
    deviceType: DeviceType;
    accessToken: string;
    msgID: string;
}
export interface ReadDeviceAck {
    msgType: 'ReadDeviceAck';
    mac: string;
    deviceType: DeviceType;
    data: DeviceStatus;
    actionResult?: string;
}
export {};
//# sourceMappingURL=connector-hub-api.d.ts.map