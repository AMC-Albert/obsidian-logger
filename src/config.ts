import type { LogLevel, DebugColors, DebugConfig, FormatTemplate, CallbackFormatTemplate, LogEntry } from './types';

// Log storage - circular buffer to keep recent logs
const MAX_LOG_ENTRIES = 1000;
const logHistory: LogEntry[] = [];

// Internal configuration state
const config: DebugConfig = {
	namespaceOverride: null,
	debugColors: {
		debug: '#7B68EE',   // Medium slate blue (softer purple)
		info: '#4169E1',    // Royal blue (clearer blue)
		warn: '#FF8C00',    // Dark orange (more professional)
		error: '#DC143C',   // Crimson (clear red)
	},
	defaultLogLevel: 'error',
	globalNamespace: null,
	currentLogLevel: 'error',
	debugEnabled: false,
	formatTemplate: '[{namespace}] {class}.{method}: {message}',
	callbackFormatTemplate: '[{namespace}] {class} (callback): {message}',
	messageColor: '#ffffff', // White message text by default
    pluginIdForStackParsing: null // Added for dynamic plugin ID
};

// Function to initialize the debug system with a plugin instance
export function initLogger(plugin: { manifest: { id: string } }): void {
	config.globalNamespace = plugin.manifest.id;
	config.pluginIdForStackParsing = plugin.manifest.id; // Also set for stack parsing
}

// Function to get the current namespace
export function getNamespace(): string {
	if (config.namespaceOverride) return config.namespaceOverride;
	return config.globalNamespace || 'obsidian-plugin';
}

// New getter for the plugin ID for stack parsing
export function getLoggerPluginIdForStackParsing(): string | null {
    return config.pluginIdForStackParsing;
}

// Configuration methods
export function setNamespaceOverride(namespace: string | null): void {
	config.namespaceOverride = namespace;
}

export function setColors(colors: Partial<DebugColors>): void {
	config.debugColors = { ...config.debugColors, ...colors };
}

export function setDefaultLogLevel(level: LogLevel): void {
	config.defaultLogLevel = level;
	if (!config.debugEnabled) {
		config.currentLogLevel = level;
	}
}

export function setFormatTemplate(template: string): void {
	config.formatTemplate = template;
}

export function setCallbackFormatTemplate(template: string): void {
	config.callbackFormatTemplate = template;
}

export function setMessageColor(color: string): void {
	config.messageColor = color;
}

// Getter methods for current configuration
export function getColors(): DebugColors {
	return { ...config.debugColors };
}

export function getDefaultLogLevel(): LogLevel {
	return config.defaultLogLevel;
}

export function getCurrentNamespace(): string {
	return getNamespace();
}

export function getFormatTemplate(): FormatTemplate {
	return config.formatTemplate;
}

export function getCallbackFormatTemplate(): CallbackFormatTemplate {
	return config.callbackFormatTemplate;
}

export function getMessageColor(): string {
	return config.messageColor;
}

export function getConfig(): DebugConfig {
	return config;
}

// Log history management
export function addLogEntry(entry: LogEntry): void {
	logHistory.push(entry);
	if (logHistory.length > MAX_LOG_ENTRIES) {
		logHistory.shift(); // Remove oldest entry
	}
}

export function getLogHistory(namespace?: string): LogEntry[] {
	if (!namespace) return [...logHistory];
	return logHistory.filter(entry => entry.namespace === namespace);
}

export function clearLogHistory(namespace?: string): void {
	if (namespace) {
		const originalLength = logHistory.length;
		let newLength = 0;
		// Iterate backwards to safely remove elements
		for (let i = originalLength - 1; i >= 0; i--) {
			if (logHistory[i].namespace === namespace) {
				// If we need to remove it, we can splice or shift elements
				// For simplicity here, let's build a new array if filtering is needed often
				// or use a more efficient removal if this is a hot path.
				// A simple approach for now, though not the most performant for large arrays:
				logHistory.splice(i, 1);
			} else {
				newLength++;
			}
		}
	} else {
		// Clear all logs if no namespace is provided
		logHistory.length = 0;
	}
}
