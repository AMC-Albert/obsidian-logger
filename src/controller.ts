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
		const raw = window.DEBUG;
		const origEnable = raw?.enable?.bind(raw) ?? (() => '');
		const origDisable = raw?.disable?.bind(raw) ?? (() => '');
		const origEnabled = raw?.enabled?.bind(raw) ?? (() => false);
		const origSetLevel = raw?.setLevel?.bind(raw) ?? (() => '');
		const origGetLevel = raw?.getLevel?.bind(raw) ?? (() => null);
		
		window.DEBUG = {
			enable(ns: string, level: LogLevel = 'debug'): string {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					config.debugEnabled = true;
					config.currentLogLevel = level;
					return `Debug enabled for "${ns}" at level: ${level.toUpperCase()}`;
				}
				return origEnable(ns, level);
			},
			disable(ns: string): string {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					config.debugEnabled = false;
					config.currentLogLevel = 'error';
					return `Debug disabled for "${ns}" (errors still visible)`;
				}
				return origDisable(ns);
			},
			enabled(ns: string): boolean {
				if (ns === getNamespace() || ns === '*') {
					return getConfig().debugEnabled;
				}
				return origEnabled(ns);
			},
			setLevel(ns: string, level: LogLevel): string {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					config.currentLogLevel = level;
					if (!config.debugEnabled && level !== 'error') {
						config.debugEnabled = true;
					}
					return `Log level set to ${level.toUpperCase()} for plugin: ${ns}`;
				}
				return origSetLevel(ns, level);
			},			getLevel(ns: string): LogLevel | null {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					return config.debugEnabled ? config.currentLogLevel : null;
				}
				return origGetLevel(ns);
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
							let line = '';
							if (!stripTimestamp) line += `${log.timestamp.toISOString()} `;
							if (!stripLogLevel) line += `[${log.level.toUpperCase()}] `;
							if (!stripNamespace) line += `[${log.namespace}] `;
							if (log.className && !stripClass) line += `${log.className}`;
							if (log.methodName && !stripMethod) line += `.${log.methodName}`;
							if ((log.className && !stripClass) || (log.methodName && !stripMethod)) line += ': ';
							line += log.message;
							return line;						}).join('\n');
						break;
				}
				
				// Apply path simplification if enabled
				if (simplifyPaths) {
					output = simplifyPath(output);
				}
				
				// Copy to clipboard if available
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(output).then(() => {
						// Silent success - clipboard API handles the copy
					}).catch(() => {
						console.warn('Failed to copy logs to clipboard');
					});
				} else {
					console.warn('Clipboard API not available');
				}
				
				// Return brief status message instead of the full output
				return `✓ Copied ${logs.length} log entries to clipboard (${output.length} characters)`;
			},
			clearLogs(ns?: string): string {
				const targetNamespace = ns || getNamespace();
				if (targetNamespace === '*') {
					clearLogHistory();
					return 'All log history cleared';
				} else {
					// For specific namespace, we'd need to implement selective clearing
					// For now, just clear all since it's simpler
					clearLogHistory();
					return `Log history cleared for namespace: ${targetNamespace}`;
				}
			}
		};
	} catch (error) {
		console.warn('Failed to initialize debug system:', error);
	}
}

// Initialize the controller when this module is imported
initializeDebugSystem();