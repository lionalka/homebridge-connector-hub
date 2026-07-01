export declare const kMulticastIp = "238.0.0.18";
export declare const kSendPort = 32100;
export declare const kLowBatteryPercent = 15;
export declare const kLowRssiThreshold = -100;
export declare const kHealthWarningRepeatMs: number;
export declare const kMacAddrLength = 12;
export declare const kHalfOpenValue = 50;
export declare const kNetworkSettings: {
    maxRetries: number;
    retryDelayMs: number;
    refreshIntervalMs: number;
    commandSpacingMs: number;
    tdbuBottomUpDelayMs: number;
};
export declare enum OperationState {
    CLOSED_CLOSING = 0,
    OPEN_OPENING = 1,
    STOPPED = 2
}
export declare enum ReadDeviceType {
    kPassive = 0,
    kActive = 1
}
export declare const opCodes: (string | undefined)[];
export declare const hubStats: (string | undefined)[];
export declare const deviceTypes: {
    10000000: string;
    22000000: string;
    "02000001": string;
    "02000002": string;
    22000002: string;
    22000005: string;
};
export declare const deviceModels: (string | undefined)[];
export declare const wirelessModes: string[];
export declare const voltageModes: string[];
export declare const stateModes: string[];
//# sourceMappingURL=connector-hub-constants.d.ts.map