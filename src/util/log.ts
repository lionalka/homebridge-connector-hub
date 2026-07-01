/* eslint-disable @typescript-eslint/no-explicit-any */
import {Logger} from 'homebridge';

/**
 * A logging class intended to allow finer-grain control over logging levels.
 */
export class Log {
  private static enableDebugLog: boolean;
  private static internalLog: Logger;

  public static configure(internalLog: Logger, enableDebugLog: boolean) {
    Log.enableDebugLog = enableDebugLog;
    Log.internalLog = internalLog;
  }

  // Collapse object parameters to single-line JSON so multi-line util.inspect
  // dumps don't get split into separate timestamped log entries by Docker /
  // journald, which made debug output unreadable and hard to grep.
  //
  // accessToken is the derived per-command hub credential (see
  // connector-hub-helpers.ts computeAccessToken); it must never reach the
  // log, since Homebridge logs are commonly shared for support/debugging.
  private static flatten(parameters: any[]): any[] {
    return parameters.map((p) => (typeof p === 'object' && p !== null) ?
        JSON.stringify(p, (key, value) => key === 'accessToken' ? '[REDACTED]' : value) : p);
  }

  public static info(message: string, ...parameters: any[]): void {
    Log.internalLog.info(message, ...Log.flatten(parameters));
  }

  public static warn(message: string, ...parameters: any[]): void {
    Log.internalLog.warn(message, ...Log.flatten(parameters));
  }

  public static error(message: string, ...parameters: any[]): void {
    Log.internalLog.error(message, ...Log.flatten(parameters));
  }

  // Homebridge only outputs debug-level messages when the entire instance has
  // been started in debug mode. We use 'info' level and prepend [DEBUG] to
  // signify debug messages when the user has enabled verbose logging.
  public static debug(message: string, ...parameters: any[]): void {
    if (Log.enableDebugLog) {
      Log.internalLog.info(`[DEBUG] ${message}`, ...Log.flatten(parameters));
    }
  }
}
