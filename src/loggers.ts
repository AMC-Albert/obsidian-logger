import type { LogLevel } from './types';
import { getNamespace, getConfig } from './config';
import { getCallerInfo, formatPrefixCustom, formatPrefixOnly } from './stack-parser';
import { getRegisteredClassName } from './class-registry';

// Safe JSON stringification that handles circular references
function safeStringify(obj: any, maxDepth = 3): string {
	const seen = new WeakSet();
	
	function stringifyWithCircularCheck(value: any, depth = 0): string {
		// Handle primitives
		if (value === null) return 'null';
		if (typeof value !== 'object') return String(value);
		
		// Check for circular reference
		if (seen.has(value)) return '[Circular]';
		
		// Handle arrays
		if (Array.isArray(value)) {
			if (depth >= maxDepth) return '[Array...]';
			seen.add(value);
			try {
				const items = value.slice(0, 5).map(item => stringifyWithCircularCheck(item, depth + 1));
				const result = `[${items.join(', ')}${value.length > 5 ? `, ...${value.length - 5} more` : ''}]`;
				seen.delete(value);
				return result;
			} catch {
				seen.delete(value);
				return '[Array]';
			}
		}
		
		// Handle objects
		if (depth >= maxDepth) return '[Object...]';
		seen.add(value);
		
		try {
			// For DOM elements, return a simple representation
			if (value.nodeType && value.nodeName) {
				seen.delete(value);
				return `<${value.nodeName.toLowerCase()}${value.id ? ` id="${value.id}"` : ''}${value.className ? ` class="${value.className}"` : ''}>`;
			}
			
			// Check if this object has a registered class name first
			const registeredName = getRegisteredClassName(value);
			if (registeredName) {
				// Show a few key properties if they exist and are simple
				const keyProps: string[] = [];
				for (const key of ['name', 'id', 'type', 'status', 'length']) {
					if (key in value && typeof value[key] !== 'object' && typeof value[key] !== 'function') {
						keyProps.push(`${key}: ${String(value[key])}`);
						if (keyProps.length >= 3) break;
					}
				}
				seen.delete(value);
				return `${registeredName}${keyProps.length > 0 ? ` {${keyProps.join(', ')}}` : ''}`;
			}
			
			// For functions, return a simple representation using constructor name
			if (typeof value.constructor === 'function' && value.constructor.name) {
				const className = value.constructor.name;
				// Show a few key properties if they exist and are simple
				const keyProps: string[] = [];
				for (const key of ['name', 'id', 'type', 'status', 'length']) {
					if (key in value && typeof value[key] !== 'object' && typeof value[key] !== 'function') {
						keyProps.push(`${key}: ${String(value[key])}`);
						if (keyProps.length >= 3) break;
					}
				}
				seen.delete(value);
				return `${className}${keyProps.length > 0 ? ` {${keyProps.join(', ')}}` : ''}`;
			}
			
			// For plain objects, show a few properties
			const keys = Object.keys(value).slice(0, 3);
			const props = keys.map(key => {
				try {
					const val = stringifyWithCircularCheck(value[key], depth + 1);
					return `${key}: ${val}`;
				} catch {
					return `${key}: [Error]`;
				}
			});
			
			seen.delete(value);
			return `{${props.join(', ')}${Object.keys(value).length > 3 ? ', ...' : ''}}`;
		} catch {
			seen.delete(value);
			return '[Object]';
		}
	}
	
	return stringifyWithCircularCheck(obj);
}

// Check if we should log at this level
function shouldLog(level: LogLevel): boolean {
	if (typeof window === 'undefined') return false;
	if (level === 'error') return true; // Errors always show
	
	try {
		const debugController = (window as any).DEBUG;
		if (!debugController?.enabled?.(getNamespace())) return false;
		
		const currentLevel = debugController.getLevel?.(getNamespace()) as LogLevel;
		return currentLevel && { error: 0, warn: 1, info: 2, debug: 3 }[level] <= { error: 0, warn: 1, info: 2, debug: 3 }[currentLevel];
	} catch {
		return false;
	}
}

// Helper function to parse arguments and extract component/context
function parseLogArgs(args: any[]): {
	component: string | undefined;
	contextInstance: any;
	logArgs: any[];
} {
	let component: string | undefined;
	let contextInstance: any = undefined;
	let logArgs = args;
	
	// Check if first argument is a component override (string) or context instance
	if (args.length > 1) {
		if (typeof args[0] === 'string' && !args[0].includes(' ')) {
			component = args[0];
			logArgs = args.slice(1);
		} else if (typeof args[0] === 'object' && args[0] !== null) {
			contextInstance = args[0];
			logArgs = args.slice(1);
		}
	}
	
	return { component, contextInstance, logArgs };
}

// Consolidated logging function
function log(level: LogLevel, ...args: any[]): void {
	if (!shouldLog(level)) return;
	
	const { component, contextInstance, logArgs } = parseLogArgs(args);
	
	// Combine all log arguments into a single message string with safe stringification
	const message = logArgs.map(arg => 
		typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)
	).join(' ');
		// Get the prefix without the message
	const prefixOnly = formatPrefixOnly(component, contextInstance);
	const colors = getConfig().debugColors;
	const messageColor = getConfig().messageColor;
	
	// Apply different styling: colored prefix, configurable message color
	const prefixStyle = `color:${colors[level]};font-weight:bold;`;
	const messageStyle = `color:${messageColor};font-weight:normal;`;
	
	// Use the appropriate console method
	const consoleMethods = {
		debug: console.debug,
		info: console.info,
		warn: console.warn,
		error: console.error
	};
	
	// Log with separate styles for prefix and message
	if (message) {
		consoleMethods[level](`%c${prefixOnly} %c${message}`, prefixStyle, messageStyle);
	} else {
		// If no message, just log the prefix with its style
		consoleMethods[level](`%c${prefixOnly}`, prefixStyle);
	}
}

// Export debug helpers with function overloads
export function debug(componentOrInstance?: string | any, ...args: any[]): void;
export function debug(...args: any[]): void;
export function debug(...args: any[]) {
	log('debug', ...args);
}

export function info(componentOrInstance?: string | any, ...args: any[]): void;
export function info(...args: any[]): void;
export function info(...args: any[]) {
	log('info', ...args);
}

export function warn(componentOrInstance?: string | any, ...args: any[]): void;
export function warn(...args: any[]): void;
export function warn(...args: any[]) {
	log('warn', ...args);
}

export function error(componentOrInstance?: string | any, ...args: any[]): void;
export function error(...args: any[]): void;
export function error(...args: any[]) {
	log('error', ...args);
}
