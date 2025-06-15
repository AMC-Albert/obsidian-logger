import type { LogLevel } from './types';
import { getNamespace, getConfig, addLogEntry } from './config';
import { getCallerInfo, formatPrefixCustom, formatPrefixOnly } from './stack-parser';
import { getRegisteredClassName } from './class-registry';

// Safe JSON stringification that handles circular references
function safeStringify(obj: unknown, maxDepth = 3): string {
	const seen = new WeakSet<object>();
	
	function stringifyWithCircularCheck(value: unknown, depth = 0): string {
		// Handle primitives
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		if (typeof value !== 'object') return String(value);
		
		// Check for circular reference
		if (seen.has(value as object)) return '[Circular]';
		seen.add(value as object);
		
		try {
			// Handle arrays
			if (Array.isArray(value)) {
				if (depth >= maxDepth) return '[Array...]';
				const items = value.slice(0, 5).map(item => stringifyWithCircularCheck(item, depth + 1));
				const result = `[${items.join(', ')}${value.length > 5 ? `, ...${value.length - 5} more` : ''}]`;
				return result;
			}
			
			// For DOM elements, return a simple representation
			if (typeof value === 'object' && value !== null && 'nodeType' in value && 'nodeName' in value) {
				const element = value as { nodeType: unknown; nodeName: string; id?: string; className?: string };
				return `<${element.nodeName.toLowerCase()}${element.id ? ` id="${element.id}"` : ''}${element.className ? ` class="${element.className}"` : ''}>`;
			}
			
			// Handle objects
			if (depth >= maxDepth) return '[Object...]';

			// Try JSON.stringify first for simple objects (but with a separate seen set)
			try {
				const tempSeen = new WeakSet<object>();
				const jsonResult = JSON.stringify(value, function(this: unknown, key: string, val: unknown) {
					// Handle circular references in JSON.stringify with separate tracking
					if (typeof val === 'object' && val !== null) {
						if (tempSeen.has(val)) return '[Circular]';
						tempSeen.add(val);
					}
					return val;
				});
				// If JSON.stringify succeeded and produced reasonable output, use it
				if (jsonResult && jsonResult !== '{}' && !jsonResult.includes('[Circular]')) {
					return jsonResult;
				}
			} catch (jsonError) {
				// JSON.stringify failed, fall back to manual approach
			}
			
			// Prioritize constructor.name if available and not a generic Object/Function
			const valueAsObject = value as { constructor?: { name?: string } };
			if (typeof valueAsObject.constructor === 'function' && valueAsObject.constructor.name && valueAsObject.constructor.name !== 'Object' && valueAsObject.constructor.name !== 'Function') {
				const className = valueAsObject.constructor.name;
				// Show a few key properties if they exist and are simple
				const keyProps: string[] = [];
				const valueWithKeys = value as Record<string, unknown>;
				for (const key of ['name', 'id', 'type', 'status', 'length']) {
					if (key in valueWithKeys && typeof valueWithKeys[key] !== 'object' && typeof valueWithKeys[key] !== 'function') {
						keyProps.push(`${key}: ${String(valueWithKeys[key])}`);
						if (keyProps.length >= 3) break;
					}
				}
				return `${className}${keyProps.length > 0 ? ` {${keyProps.join(', ')}}` : ''}`;
			}

			// Fallback to registered name if constructor.name wasn't suitable
			const registeredName = getRegisteredClassName(value);
			if (registeredName) {
				// Show a few key properties if they exist and are simple
				const keyProps: string[] = [];
				const valueWithKeys = value as Record<string, unknown>;
				for (const key of ['name', 'id', 'type', 'status', 'length']) {
					if (key in valueWithKeys && typeof valueWithKeys[key] !== 'object' && typeof valueWithKeys[key] !== 'function') {
						keyProps.push(`${key}: ${String(valueWithKeys[key])}`);
						if (keyProps.length >= 3) break;
					}
				}
				return `${registeredName}${keyProps.length > 0 ? ` {${keyProps.join(', ')}}` : ''}`;
			}
			
			// For plain objects without a useful constructor.name or registered name, show properties
			const valueAsRecord = value as Record<string, unknown>;
			const keys = Object.keys(valueAsRecord);
			if (keys.length === 0) {
				return '{}';
			}
			
			// For small objects, show all properties; for larger ones, limit to first few
			const keysToShow = keys.length <= 5 ? keys : keys.slice(0, 5);
			const props = keysToShow.map(key => {
				try {
					const val = stringifyWithCircularCheck(valueAsRecord[key], depth + 1);
					// Quote strings for better readability
					const quotedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
					return `${quotedKey}: ${val}`;
				} catch {
					return `${key}: [Error]`;
				}
			});
			
			const ellipsis = keys.length > 5 ? ', ...' : '';
			return `{${props.join(', ')}${ellipsis}}`;
		} catch {
			return '[Object]';
		} finally {
			seen.delete(value as object);
		}
	}
	
	return stringifyWithCircularCheck(obj);
}

// Check if we should log at this level
function shouldLog(level: LogLevel): boolean {
	if (typeof window === 'undefined') return false;
	if (level === 'error') return true; // Errors always show
	
	try {
		// Use namespace-specific debug controller
		const namespace = getNamespace();
		const nsController = window.DEBUG?.[namespace];
		if (!nsController?.enabled()) return false;
		
		const currentLevel = nsController.getLevel() as LogLevel;
		if (!currentLevel) return false;
		
		// Compare numeric levels: error=0, warn=1, info=2, debug=3
		const levels: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
		return levels[level] <= levels[currentLevel];
	} catch {
		return false;
	}
}

// Helper function to parse arguments and extract component/context
function parseLogArgs(args: unknown[]): {
	component: string | undefined;
	contextInstance: unknown;
	logArgs: unknown[];
} {
	let component: string | undefined;
	let contextInstance: unknown = undefined;
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
function loggerLog(level: LogLevel, ...args: unknown[]): void {
	if (!shouldLog(level)) return;
	
	const { component, contextInstance, logArgs } = parseLogArgs(args);
	
	// Determine prefix and message, supporting component+method overrides for static functions
	let prefixOnly: string;
	let messageStr: string;
	let className: string | undefined;
	let methodName: string | undefined;
	
	// If first logArg is a method name override (static function), use custom prefix template
	if (component && logArgs.length > 0 && typeof logArgs[0] === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(logArgs[0])) {
		const methodOverride = logArgs[0] as string;
		const remaining = logArgs.slice(1);
		prefixOnly = formatPrefixCustom(component, methodOverride);
		messageStr = remaining.map(arg => typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)).join(' ');
		className = component;
		methodName = methodOverride;
	} else {
		// Default behavior: use contextInstance or registered class and method from stack
		messageStr = logArgs.map(arg => typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)).join(' ');
		prefixOnly = formatPrefixOnly(component, contextInstance);
		
		// Extract class and method for storage
		const callerInfo = getCallerInfo();
		className = component || callerInfo.className;
		methodName = callerInfo.methodName;
	}
	
	// Store log entry in history
	const namespace = getNamespace();
	const formattedMessage = `${prefixOnly} ${messageStr}`;
	addLogEntry({
		timestamp: new Date(),
		level,
		namespace,
		className,
		methodName,
		message: messageStr,
		args: logArgs,
		formattedMessage
	});
	
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
	if (messageStr) {
		consoleMethods[level](`%c${prefixOnly} %c${messageStr}`, prefixStyle, messageStyle);
	} else {
		// If no message, just log the prefix
		consoleMethods[level](`%c${prefixOnly}`, prefixStyle);
	}
}

// Export debug helpers with function overloads
export function loggerDebug(componentOrInstance?: string | object, ...args: unknown[]): void;
export function loggerDebug(...args: unknown[]): void;
export function loggerDebug(...args: unknown[]) {
	loggerLog('debug', ...args);
}

export function loggerInfo(componentOrInstance?: string | object, ...args: unknown[]): void;
export function loggerInfo(...args: unknown[]): void;
export function loggerInfo(...args: unknown[]) {
	loggerLog('info', ...args);
}

export function loggerWarn(componentOrInstance?: string | object, ...args: unknown[]): void;
export function loggerWarn(...args: unknown[]): void;
export function loggerWarn(...args: unknown[]) {
	loggerLog('warn', ...args);
}

export function loggerError(componentOrInstance?: string | object, ...args: unknown[]): void;
export function loggerError(...args: unknown[]): void;
export function loggerError(...args: unknown[]) {
	loggerLog('error', ...args);
}
