export const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
export type LogLevel = keyof typeof LOG_LEVELS;

export interface DebugColors {
	debug: string;
	info: string;
	warn: string;
	error: string;
	message?: string; // Optional color for message text (defaults to white)
}

// Format template for log messages - simple string with placeholders
// Available placeholders:
// {namespace} - Plugin namespace (e.g., "my-plugin")
// {class} - Class name (e.g., "SettingsManager")
// {method} - Method name (e.g., "save")
// {message} - The actual log message
export type FormatTemplate = string;

// Callback format template - string with placeholders for callback contexts
// Available placeholders:
// {namespace} - Plugin namespace (e.g., "my-plugin")
// {class} - Class name (e.g., "SettingsManager")
// {message} - The actual log message
// Example: "[{namespace}] {class} (callback) {message}"
export type CallbackFormatTemplate = string;

export interface DebugConfig {
	namespaceOverride: string | null;
	debugColors: DebugColors;
	defaultLogLevel: LogLevel;
	globalNamespace: string | null;
	currentLogLevel: LogLevel;
	debugEnabled: boolean;
	formatTemplate: FormatTemplate;
	callbackFormatTemplate: CallbackFormatTemplate;
	messageColor: string;
}
