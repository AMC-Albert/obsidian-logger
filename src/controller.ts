import type { LogLevel } from './types';
import { getNamespace, getConfig, getLogHistory, clearLogHistory } from './config';

// Define an interface for the DEBUG object
interface DebugAPI {
	enable: (level?: LogLevel) => string;
	disable: () => string;
	enabled: () => boolean;
	setLevel: (level: LogLevel) => string;
	getLevel: () => LogLevel | null;
	copyLogs: (options?: LogCopyOptions) => string;
	clearLogs: (ns?: string) => string;
}

interface LogCopyOptions {
	namespace?: string;
	count?: number;
	includeNamespace?: boolean;
	stripClass?: boolean;
	stripMethod?: boolean;
	includeTimestamp?: boolean;
	stripLogLevel?: boolean;
	simplifyPaths?: boolean;
	format?: 'full' | 'prefix-only' | 'message-only' | 'custom';
	customTemplate?: string;
}

// Extend the Window interface to include the DEBUG property
declare global {
	interface Window {
	   // Mapping of plugin namespaces to their DebugAPI instances
	   DEBUG?: Record<string, DebugAPI>;
	}
}

// Helper function to simplify file paths
function simplifyPath(text: string): string {
	// Regex patterns to match various path formats (allowing spaces in path segments)
	const pathPatterns = [
		// Windows paths with double backslashes (escaped in JSON: C:\\path\\to\\file.ext)
		/(?:[A-Za-z]:\\\\|\\\\\\\\[^\\]+\\\\[^\\]+\\\\)(?:[^\\\/\n\r\t<>":|?*]+\\\\)*([^\\\/\n\r\t<>":|?*]+\\\\[^\\\/\n\r\t<>":|?*]+)/g,
		// Windows paths (C:\path\to\file.ext or \\server\share\path\to\file.ext)
		// Allows spaces within path segments but stops at common delimiters
		/(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+\\)(?:[^\\\/\n\r\t<>":|?*]+[\\\/])*([^\\\/\n\r\t<>":|?*]+[\\\/][^\\\/\n\r\t<>":|?*]+)/g,
		// Unix/Linux paths (/path/to/file.ext)
		/(?:^|[\s(])(\/(?:[^\/\n\r\t<>":|?*]+\/)*[^\/\n\r\t<>":|?*]+\/[^\/\n\r\t<>":|?*]+)/g,
		// Relative paths (./path/to/file.ext or ../path/to/file.ext)
		/(?:^|[\s(])(\.\.\?\/)(?:[^\/\n\r\t<>":|?*]+\/)*([^\/\n\r\t<>":|?*]+\/[^\/\n\r\t<>":|?*]+)/g
	];
	let result = text;
	
	// Windows paths with double backslashes (escaped)
	result = result.replace(pathPatterns[0], (match) => {
		const segments = match.split('\\\\').filter(s => s.length > 0);
		if (segments.length >= 2) {
			const lastTwo = segments.slice(-2).join('/');
			return `.../${lastTwo}`;
		}
		return match;
	});

	// Windows and UNC paths
	result = result.replace(pathPatterns[1], (match) => {
		const segments = match.split(/[\\\/]/).filter(s => s.length > 0);
		if (segments.length >= 2) {
			const lastTwo = segments.slice(-2).join('/');
			return `.../${lastTwo}`;
		}
		return match;
	});

	// Unix/Linux absolute paths
	result = result.replace(pathPatterns[2], (match) => {
		const cleanMatch = match.trim();
		const segments = cleanMatch.split('/').filter(s => s.length > 0);
		if (segments.length >= 2) {
			const lastTwo = segments.slice(-2).join('/');
			const leadingSpace = match.match(/^(\s*)/)?.[1] ?? '';
			return `${leadingSpace}.../${lastTwo}`;
		}
		return match;
	});
	// Relative paths
	result = result.replace(pathPatterns[3], (match) => {
		const leadingSpace = match.match(/^(\s*)/)?.[1] ?? '';
		const relativePart = match.match(/(\.\.\?\/?)/)?.[1] ?? './';
		const pathPart = match.substring(leadingSpace.length + relativePart.length);
		const segments = pathPart.split('/').filter(s => s.length > 0);
		if (segments.length >= 2) {
			const lastTwo = segments.slice(-2).join('/');
			return `${leadingSpace}${relativePart}.../${lastTwo}`;
		}
		return match;
	});

	return result;
}

// Initialize debug controller
export function initializeDebugSystem() {
	if (typeof window === 'undefined') return;

	try {
		const preExistingDebug = window.DEBUG as DebugAPI | undefined; // Capture pre-existing DEBUG object
		const currentPluginNamespace = getNamespace(); // Capture namespace at initialization time

		// Define our logger's specific API methods
		const loggerDebugAPI: DebugAPI = {
			enable(level: LogLevel = 'debug'): string {
				// Enable debug for this plugin namespace
				const config = getConfig();
				config.debugEnabled = true;
				config.currentLogLevel = level;
				return `Debug enabled for "${currentPluginNamespace}" at level: ${level.toUpperCase()}`;
			},
			disable(): string {
				// Disable debug for this plugin namespace
				const config = getConfig();
				config.debugEnabled = false;
				config.currentLogLevel = 'error'; // Default to error so critical issues are still logged
				return `Debug disabled for "${currentPluginNamespace}" (errors still visible)`;
			},
			enabled(): boolean {
				// Check debug status for this plugin namespace
				return getConfig().debugEnabled;
			},
			setLevel(level: LogLevel): string {
				// Set log level for this plugin namespace
				const config = getConfig();
				config.currentLogLevel = level;
				// If setting a level other than error, ensure debug is enabled
				if (!config.debugEnabled && level !== 'error') {
					config.debugEnabled = true;
				}
				return `Log level set to ${level.toUpperCase()} for plugin: ${currentPluginNamespace}`;
			},
			getLevel(): LogLevel | null {
				// Get log level for this plugin namespace
				const config = getConfig();
				return config.debugEnabled ? config.currentLogLevel : null;
			},
			copyLogs(options: LogCopyOptions = {}): string {
				const {
					namespace = currentPluginNamespace, // Use captured namespace as default
					count = 50,
					includeNamespace = false,
					stripClass = false,
					stripMethod = false,
					includeTimestamp = true,
					stripLogLevel = true,
					simplifyPaths = true,
					format = 'full',
					customTemplate
				} = options;

				const logs = getLogHistory(namespace).slice(-count);
				if (logs.length === 0) {
					return 'No logs found for the specified namespace.';
				}

				let output: string;
				switch (format) {
					case 'message-only':
						output = logs.map(log => log.message).join('\n');
						break;
					case 'prefix-only':
						output = logs.map(log => {
							let prefix = `[${log.namespace}]`;
							if (log.className && !stripClass) prefix += ` ${log.className}`;
							if (log.methodName && !stripMethod) prefix += `.${log.methodName}`;
							return prefix;
						}).join('\n');
						break;
					case 'custom':
						if (customTemplate) {
							output = logs.map(log => {
								return customTemplate
									.replace('{timestamp}', log.timestamp.toISOString())
									.replace('{level}', log.level.toUpperCase())
									.replace('{namespace}', log.namespace)
									.replace('{class}', log.className || '')
									.replace('{method}', log.methodName || '')
									.replace('{message}', log.message);
							}).join('\n');
						} else {
							output = logs.map(log => log.formattedMessage).join('\n');
						}
						break;
					case 'full':
					default:
						output = logs.map(log => {
							// Reconstruct a reasonable full format based on typical stripping options
							let line = log.formattedMessage;
							if (includeTimestamp) {
								// Corrected regex for timestamp stripping - unescaped ')' inside character class
								line = line.replace(/^\s*[\[\(]?\d{2,4}[-/]\d{1,2}[-/]\d{1,2}[T\s]\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?[\])]?\s*/, '');
							}
							if (stripLogLevel) {
								// Remove leading [LEVEL]
								const lvlPrefix = `[${log.level.toUpperCase()}]`;
								if (line.startsWith(lvlPrefix)) {
									line = line.slice(lvlPrefix.length).trimStart();
								}
							}
							if (!includeNamespace) {
								// Remove leading [namespace]
								const nsPrefix = `[${log.namespace}]`;
								if (line.startsWith(nsPrefix)) {
									line = line.slice(nsPrefix.length).trimStart();
								}
							}
							if (stripClass && log.className) {
								line = line.replace(new RegExp(`${log.className.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}\\.?\\s*`, 'i'), '');
							}
							if (stripMethod && log.methodName) {
								line = line.replace(new RegExp(`${log.methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}\\s*`, 'i'), '');
							}
							return line.trim();
						}).join('\n');
						break;
				}

				if (simplifyPaths) {
					output = simplifyPath(output); // output here is the final string of logs
				}

				// --- New logic starts here ---
				const logStringToCopy = output;

				if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
					navigator.clipboard.writeText(logStringToCopy)
						.then(() => {
							// Successfully copied to clipboard. The function will return a confirmation.
							// You could add a console.debug here if you want to log success for the logger's own debugging.
						})
						.catch(err => {
							// Failed to copy. Log an error to the console so the user is aware.
							console.error('Logger: Failed to automatically copy logs to clipboard:', err);
						});
					const lineCount = logStringToCopy.split('\n').length;
					return `Copied ${lineCount} log line(s) to clipboard.`;
				} else {
					// Clipboard API not available.
					console.warn('Logger: Clipboard API (navigator.clipboard.writeText) is not available in this environment. Logs cannot be copied automatically.');
					return 'Clipboard API not available. Logs could not be copied to clipboard automatically.';
				}
				// --- Original 'return output;' is replaced by the logic above ---
			},
			clearLogs(ns?: string): string {
				const targetNamespace = ns || currentPluginNamespace; // Use captured namespace if ns is not provided
				// Assuming clearLogHistory can take an optional namespace or handle undefined if no specific namespace is given.
				// If clearLogHistory strictly expects 0 args, this call needs to be clearLogHistory() and logic adjusted.
				clearLogHistory(targetNamespace); 
				return `Logs cleared for namespace: ${targetNamespace}`;
			}
		};

		// Ensure window.DEBUG is an object before assigning to it
		if (typeof window.DEBUG !== 'object' || window.DEBUG === null) {
			(window.DEBUG as any) = {}; // Initialize if not an object (or null)
		}

		// Assign our API under the plugin's own namespace key, avoiding overwriting global methods
		(window.DEBUG as any)[currentPluginNamespace] = loggerDebugAPI;

	} catch (e) {
		console.error('Failed to initialize or update debug system:', e);
		// Fallback: ensure window.DEBUG is at least an empty object
		if (typeof window.DEBUG !== 'object' || window.DEBUG === null) {
			(window.DEBUG as any) = {};
		}
	}
}

function shouldLog(level: LogLevel): boolean {
	if (typeof window === 'undefined') return false;
	if (level === 'error') return true; // Errors always show

	try {
		// Use namespace-specific debug controller
		const namespace = getNamespace();
	   const nsController = window.DEBUG?.[namespace];
		if (!nsController?.enabled()) return false;
		const currentLevel = nsController.getLevel() as LogLevel;
		// Compare numeric levels: error=0, warn=1, info=2, debug=3
		const levels: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
		return levels[level] <= levels[currentLevel];
	} catch {
		return false;
	}
}