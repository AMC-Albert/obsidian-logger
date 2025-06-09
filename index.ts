// Export types
export type { LogLevel, DebugColors, DebugConfig, CallbackFormatTemplate } from './src/types';

// Export configuration functions
export {
	initLogger,
	setNamespaceOverride,
	setColors,
	setDefaultLogLevel,
	setFormatTemplate,
	setCallbackFormatTemplate,
	setMessageColor,
	getColors,
	getDefaultLogLevel,
	getCurrentNamespace,
	getFormatTemplate,
	getCallbackFormatTemplate,
	getMessageColor,
    setLoggerPluginId, // Added export
    getLoggerPluginIdForStackParsing // Added export
} from './src/config';

// Export class registration
export { registerLoggerClass } from './src/class-registry';

// Export logger functions
export { loggerDebug, loggerInfo, loggerWarn, loggerError } from './src/loggers';

// Export the debug system initializer
export { initializeDebugSystem } from './src/controller';

// Initialize the debug controller
import './src/controller';
