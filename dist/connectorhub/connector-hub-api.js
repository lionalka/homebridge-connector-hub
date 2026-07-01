"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WirelessMode = exports.DeviceModel = exports.DeviceType = exports.DeviceOpCode = void 0;
/*
 * A set of enums and interfaces laying out the Connector hub wire protocol.
 */
var DeviceOpCode;
(function (DeviceOpCode) {
    DeviceOpCode[DeviceOpCode["kClose"] = 0] = "kClose";
    DeviceOpCode[DeviceOpCode["kOpen"] = 1] = "kOpen";
    DeviceOpCode[DeviceOpCode["kStopped"] = 2] = "kStopped";
    DeviceOpCode[DeviceOpCode["kStatusQuery"] = 5] = "kStatusQuery";
})(DeviceOpCode = exports.DeviceOpCode || (exports.DeviceOpCode = {}));
var DeviceType;
(function (DeviceType) {
    DeviceType["kWiFiBridge"] = "02000001";
    DeviceType["kWiFiBridgeAlt"] = "02000002";
    DeviceType["k433MHzRadioMotor"] = "10000000";
    DeviceType["kWiFiCurtain"] = "22000000";
    DeviceType["kWiFiTubularMotor"] = "22000002";
    DeviceType["kWiFiReceiver"] = "22000005";
})(DeviceType = exports.DeviceType || (exports.DeviceType = {}));
var DeviceModel;
(function (DeviceModel) {
    DeviceModel[DeviceModel["kRollerBlinds"] = 1] = "kRollerBlinds";
    DeviceModel[DeviceModel["kVenetianBlinds"] = 2] = "kVenetianBlinds";
    DeviceModel[DeviceModel["kRomanBlinds"] = 3] = "kRomanBlinds";
    DeviceModel[DeviceModel["kHoneycombBlinds"] = 4] = "kHoneycombBlinds";
    DeviceModel[DeviceModel["kShangriLaBlinds"] = 5] = "kShangriLaBlinds";
    DeviceModel[DeviceModel["kRollerShutter"] = 6] = "kRollerShutter";
    DeviceModel[DeviceModel["kRollerGate"] = 7] = "kRollerGate";
    DeviceModel[DeviceModel["kAwning"] = 8] = "kAwning";
    DeviceModel[DeviceModel["kTopDownBottomUp"] = 9] = "kTopDownBottomUp";
    DeviceModel[DeviceModel["kDayAndNightBlinds"] = 10] = "kDayAndNightBlinds";
    DeviceModel[DeviceModel["kDimmingBlinds"] = 11] = "kDimmingBlinds";
    DeviceModel[DeviceModel["kCurtain"] = 12] = "kCurtain";
    DeviceModel[DeviceModel["kCurtainOpenLeft"] = 13] = "kCurtainOpenLeft";
    DeviceModel[DeviceModel["kCurtainOpenRight"] = 14] = "kCurtainOpenRight";
})(DeviceModel = exports.DeviceModel || (exports.DeviceModel = {}));
var DeviceState;
(function (DeviceState) {
    DeviceState[DeviceState["kNoLimits"] = 0] = "kNoLimits";
    DeviceState[DeviceState["kTopLimitDetected"] = 1] = "kTopLimitDetected";
    DeviceState[DeviceState["kBottomLimitDetected"] = 2] = "kBottomLimitDetected";
    DeviceState[DeviceState["kLimitsDetected"] = 3] = "kLimitsDetected";
    DeviceState[DeviceState["kThirdLimitDetected"] = 4] = "kThirdLimitDetected";
})(DeviceState || (DeviceState = {}));
var VoltageMode;
(function (VoltageMode) {
    VoltageMode[VoltageMode["kACMotor"] = 0] = "kACMotor";
    VoltageMode[VoltageMode["kDCMotor"] = 1] = "kDCMotor";
})(VoltageMode || (VoltageMode = {}));
var ChargingState;
(function (ChargingState) {
    ChargingState[ChargingState["kNotCharging"] = 0] = "kNotCharging";
    ChargingState[ChargingState["kCharging"] = 1] = "kCharging";
    ChargingState[ChargingState["kNotChargeable"] = 2] = "kNotChargeable";
})(ChargingState || (ChargingState = {}));
var WirelessMode;
(function (WirelessMode) {
    WirelessMode[WirelessMode["kUniDirectional"] = 0] = "kUniDirectional";
    WirelessMode[WirelessMode["kBiDirectional"] = 1] = "kBiDirectional";
    WirelessMode[WirelessMode["kBiDiWithMechanicalLimits"] = 2] = "kBiDiWithMechanicalLimits";
    WirelessMode[WirelessMode["kOther"] = 3] = "kOther";
})(WirelessMode = exports.WirelessMode || (exports.WirelessMode = {}));
//# sourceMappingURL=connector-hub-api.js.map