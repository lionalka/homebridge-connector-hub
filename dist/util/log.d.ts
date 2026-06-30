import { Logger } from 'homebridge';
/**
 * A logging class intended to allow finer-grain control over logging levels.
 */
export declare class Log {
    private static enableDebugLog;
    private static internalLog;
    static configure(internalLog: Logger, enableDebugLog: boolean): void;
    private static flatten;
    static info(message: string, ...parameters: any[]): void;
    static warn(message: string, ...parameters: any[]): void;
    static error(message: string, ...parameters: any[]): void;
    static debug(message: string, ...parameters: any[]): void;
}
//# sourceMappingURL=log.d.ts.map