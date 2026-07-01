"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
/**
 * A logging class intended to allow finer-grain control over logging levels.
 */
class Log {
    static configure(internalLog, enableDebugLog) {
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
    static flatten(parameters) {
        return parameters.map((p) => (typeof p === 'object' && p !== null) ?
            JSON.stringify(p, (key, value) => key === 'accessToken' ? '[REDACTED]' : value) : p);
    }
    static info(message, ...parameters) {
        Log.internalLog.info(message, ...Log.flatten(parameters));
    }
    static warn(message, ...parameters) {
        Log.internalLog.warn(message, ...Log.flatten(parameters));
    }
    static error(message, ...parameters) {
        Log.internalLog.error(message, ...Log.flatten(parameters));
    }
    // Homebridge only outputs debug-level messages when the entire instance has
    // been started in debug mode. We use 'info' level and prepend [DEBUG] to
    // signify debug messages when the user has enabled verbose logging.
    static debug(message, ...parameters) {
        if (Log.enableDebugLog) {
            Log.internalLog.info(`[DEBUG] ${message}`, ...Log.flatten(parameters));
        }
    }
}
exports.Log = Log;
//# sourceMappingURL=log.js.map