import type { LogLevel } from './types';
import { getNamespace, getConfig, getLogHistory, clearLogHistory } from './config';

// Define an interface for the DEBUG object
interface DebugAPI {
	enable: (ns: string, level?: LogLevel) => string;
	disable: (ns: string) => string;
	enabled: (ns: string) => boolean;
	setLevel: (ns: string, level: LogLevel) => string;
	getLevel: (ns: string) => LogLevel | null;
	copyLogs: (options?: LogCopyOptions) => string;
	clearLogs: (ns?: string) => string;
}

interface LogCopyOptions {
	namespace?: string;
	count?: number;
	stripNamespace?: boolean;
	stripClass?: boolean;
	stripMethod?: boolean;
	stripTimestamp?: boolean;
	stripLogLevel?: boolean;
	simplifyPaths?: boolean;
	format?: 'full' | 'prefix-only' | 'message-only' | 'custom';
	customTemplate?: string;
}

// Extend the Window interface to include the DEBUG property
declare global {
	interface Window {
		DEBUG?: DebugAPI;
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

		// Define our logger's specific API methods
		const loggerDebugAPI: DebugAPI = {
			enable(ns: string, level: LogLevel = 'debug'): string {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					config.debugEnabled = true;
					config.currentLogLevel = level;
					return `Debug enabled for "${ns}" at level: ${level.toUpperCase()}`;
				}
				if (preExistingDebug && typeof preExistingDebug.enable === 'function') {
					return preExistingDebug.enable(ns, level);
				}
				return `Namespace "${ns}" not recognized. No pre-existing DEBUG.enable to call.`;
			},
			disable(ns: string): string {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					config.debugEnabled = false;
					config.currentLogLevel = 'error'; // Default to error so critical issues are still logged
					return `Debug disabled for "${ns}" (errors still visible)`;
				}
				if (preExistingDebug && typeof preExistingDebug.disable === 'function') {
					return preExistingDebug.disable(ns);
				}
				return `Namespace "${ns}" not recognized. No pre-existing DEBUG.disable to call.`;
			},
			enabled(ns: string): boolean {
				if (ns === getNamespace() || ns === '*') {
					return getConfig().debugEnabled;
				}
				if (preExistingDebug && typeof preExistingDebug.enabled === 'function') {
					return preExistingDebug.enabled(ns);
				}
				return false;
			},
			setLevel(ns: string, level: LogLevel): string {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					config.currentLogLevel = level;
					// If setting a level other than error, ensure debug is enabled
					if (!config.debugEnabled && level !== 'error') {
						config.debugEnabled = true;
					}
					return `Log level set to ${level.toUpperCase()} for plugin: ${ns}`;
				}
				if (preExistingDebug && typeof preExistingDebug.setLevel === 'function') {
					return preExistingDebug.setLevel(ns, level);
				}
				return `Namespace "${ns}" not recognized. No pre-existing DEBUG.setLevel to call.`;
			},
			getLevel(ns: string): LogLevel | null {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					return config.debugEnabled ? config.currentLogLevel : null;
				}
				if (preExistingDebug && typeof preExistingDebug.getLevel === 'function') {
					return preExistingDebug.getLevel(ns);
				}
				return null;
			},
			copyLogs(options: LogCopyOptions = {}): string {
				const {
					namespace = getNamespace(),
					count = 50,
					stripNamespace = false,
					stripClass = false,
					stripMethod = false,
					stripTimestamp = true,
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
							if (stripTimestamp) {
								// Corrected regex for timestamp stripping - unescaped ')' inside character class
								line = line.replace(/^\s*[\[\(]?\d{2,4}[-/]\d{1,2}[-/]\d{1,2}[T\s]\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?[\])]?\s*/, '');
							}
							if (stripLogLevel) {
								line = line.replace(new RegExp(`\\\\[${log.level.toUpperCase()}\\\\]\\s*`, 'i'), '');
							}
							if (stripNamespace) {
								line = line.replace(new RegExp(`\\\\[${log.namespace}\\\\]\\s*`, 'i'), '');
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
				const targetNamespace = ns || getNamespace();
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

		// Merge our API into window.DEBUG
		Object.assign(window.DEBUG as object, loggerDebugAPI);

	} catch (e) {
		console.error('Failed to initialize or update debug system:', e);
		// Fallback: ensure window.DEBUG is at least an empty object
		if (typeof window.DEBUG !== 'object' || window.DEBUG === null) {
			(window.DEBUG as any) = {};
		}
	}
}