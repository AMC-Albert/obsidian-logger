// Helper function to clean up minified class/method names for better readability
function cleanMinifiedName(name: string): string {
	if (!name) return name;
	
	// Handle Class.method patterns
	if (name.includes('.')) {
		const parts = name.split('.');
		const className = parts[0];
		const methodName = parts[1];
		
		// If class looks minified (short or has special chars) and method is meaningful, just return method
		const isMinifiedClass = 
			className.match(/^[A-Za-z$_]{1,3}$/) ||          // 1-3 letters/symbols: Ln, $t, _n
			className.match(/^[A-Za-z]\d*$/) ||              // Letter + numbers: A1, B2  
			className.includes('$') ||                       // Contains dollar sign
			className.includes('_');                         // Contains underscore
		
		if (isMinifiedClass && methodName && methodName.length > 2) {
			return methodName;
		}
		
		// Keep meaningful class names
		if (className.length > 3 && !isMinifiedClass) {
			return name;
		}
		
		// Return just the method name for other minified cases
		return methodName || name;
	}
	
	return name;
}

// Helper function to determine if a name looks like meaningful context
function isMeaningfulContext(name: string): boolean {
	if (!name || name.length < 2) return false;
	
	// Skip generic or unhelpful names
	const skipNames = ['eval', 'anonymous', 'apply', 'call', 'pt', 'bt', 'wt', 'yt', 'et'];
	if (skipNames.includes(name)) return false;
	
	// Skip very short minified names when standalone
	if (name.length <= 2 && name.match(/^[A-Za-z]{1,2}$/)) return false;
	
	return true;
}

// Helper function to extract caller information from stack trace
export function getCallerInfo(): string {
	try {
		const stack = new Error().stack;
		if (!stack) return '';
		
		const lines = stack.split('\n');
		
		// Filter out internal debug functions
	   const relevantLines = lines.slice(1).filter(line => {
			const trimmed = line.trim();
			
			// Skip internal debug system functions
			if (trimmed.includes('getCallerInfo') || 
				trimmed.includes('formatPrefix') ||
				trimmed.includes('simple-debug')) {
				return false;
			}
			
			// Skip debug function calls
			if (trimmed.match(/at\s+(debug|info|warn|error)\s*\(/)) {
				return false;
			}
			
			return true;
		});
		// If any EventEmitter anonymous callbacks exist, treat as callback context
		if (relevantLines.some(line => line.includes('EventEmitter.<anonymous>'))) {
			return 'callback';
		}
		// If any EventEmitter emit calls are present, treat as callback context
		if (relevantLines.some(line => line.includes('emit (') || line.includes('EventEmitter.emit'))) {
			return 'callback';
		}
	   // Special case: if first relevant frame is Class.eval, treat as callback
	   const first = relevantLines[0]?.trim();
	   const evalMatch = first?.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+)\.eval\s*\(/);
	   if (evalMatch) {
		   return `${evalMatch[1]}:callback`;
	   }
	   // Find the most meaningful caller information
	   for (const line of relevantLines.slice(0, 5)) {
			if (!line?.trim()) continue;
			// First check for callback patterns in the stack trace
			const callbackPatterns = [
				/_onTimeout\s*\(/,       // setTimeout callbacks
				/_onImmediate\s*\(/,     // setImmediate callbacks  
				/\.then\s*\(/,           // Promise then callbacks
				/\.catch\s*\(/,          // Promise catch callbacks
				/\.finally\s*\(/,        // Promise finally callbacks
				/EventEmitter\.emit/,    // EventEmitter callbacks
				/\.emit\s*\(/,           // Custom EventEmitter emit calls
				/processTimers/,         // Timer processing
				/processImmediate/,      // Immediate processing
				/listOnTimeout/,         // Timer list processing
				/emitWrapper/,           // EventEmitter wrapper functions
				/processNextTick/,       // process.nextTick callbacks
			];
					// Check if any line in the stack trace suggests a callback context
		const hasCallbackContext = relevantLines.some(stackLine => 
			callbackPatterns.some(pattern => pattern.test(stackLine))
		);
				if (hasCallbackContext) {
			// Look for anonymous functions first (these are typically event listeners)
			if (line.includes('<anonymous>')) {
				// Try to extract the class name from the anonymous function context
				const match = line.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+)\.<anonymous>/);
				if (match) {
					const className = match[1];
					// If it's EventEmitter.<anonymous>, look deeper in the stack for the real class
					if (className === 'EventEmitter') {
						// Look for the class that set up the event listener
						for (const stackLine of relevantLines) {
							const deepMatch = stackLine.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+)\.setupEventListeners/);
							if (deepMatch) {
								return `${deepMatch[1]}:callback`;
							}
							// Also check for other setup methods
							const setupMatch = stackLine.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+)\.(setup|init|constructor|on)/);
							if (setupMatch && setupMatch[1] !== 'EventEmitter') {
								return `${setupMatch[1]}:callback`;
							}
						}
					}
					return `${className}:callback`;
				}
				return 'callback';
			}
			
			// Look for the actual method that was called (before the callback infrastructure)
			const match = line.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+)\.([A-Za-z_$][A-Za-z0-9_$]+)\s*\(/);
			if (match) {
				const className = match[1];
				const methodName = match[2];
				// Skip emit methods as they are infrastructure, not the actual callback
				if (methodName !== 'emit' && methodName !== 'emitWrapper') {
					const cleanedContext = cleanMinifiedName(`${className}.${methodName}`);
					if (isMeaningfulContext(cleanedContext)) {
						return `${cleanedContext}:callback`;
					}
				}
			}
		}
			
			// Handle callback/eval contexts (legacy)
			if (line.includes('at eval (')) {
				// Look backwards for meaningful context
				for (let j = relevantLines.indexOf(line) - 1; j >= 0; j--) {
					const contextLine = relevantLines[j]?.trim();
					if (!contextLine) continue;
					const contextMatch = contextLine.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+(?:\.[A-Za-z_$][A-Za-z0-9_$]+)?)\s*\(/);
					if (contextMatch && contextMatch[1] !== 'eval') {
						const cleanedContext = cleanMinifiedName(contextMatch[1]);
						if (isMeaningfulContext(cleanedContext)) {
							return `${cleanedContext}:callback`;
						}
					}
				}
				return 'callback';
			}
			
			// Class.method patterns
			let match = line.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]+)\.([A-Za-z_$][A-Za-z0-9_$]+)\s*\(/);
			if (match) {
				const className = match[1];
				const methodName = match[2];
				
				// Try to find a registered class name that might match
				let bestClassName = className;
				
				// Clean up the result
				let cleanResult = '';
				if (className === 'Object' || className === 'Module') {
					// For Object/Module, try to use a registered class name if available
					if (bestClassName !== className) {
						cleanResult = `${bestClassName}.${methodName}`;
					} else {
						cleanResult = methodName;
					}
				} else {
					cleanResult = cleanMinifiedName(`${bestClassName}.${methodName}`);
				}
				
				if (isMeaningfulContext(cleanResult)) {
					return cleanResult;
				}
			}
			
			// Constructor patterns
			match = line.match(/at\s+new\s+([A-Za-z_$][A-Za-z0-9_$]+)\s*\(/);
			if (match) {
				const constructorName = match[1];
				if (constructorName.length > 2) {
					return `${constructorName}.constructor`;
				}
			}
			
			// Standalone function names
			match = line.match(/at\s+([A-Za-z_$][A-Za-z0-9_$]{3,})\s*\(/);
			if (match) {
				const funcName = match[1];
				if (isMeaningfulContext(funcName)) {
					return funcName;
				}
			}
		}
		
	} catch (e) {
		// Stack trace parsing failed, continue without caller info
	}
	
	return '';
}

// Import config functions
import { getNamespace, getFormatTemplate, getCallbackFormatTemplate } from './config';
import { getRegisteredClassName } from './class-registry';

// Customizable format function that uses templates and detects callback contexts
export function formatPrefixCustom(component?: string, contextInstance?: any, message?: string): string {
	const namespace = getNamespace();
	let className = '';
	let methodName = '';
	let isCallbackContext = false;
	
	// Special case: component and methodOverride (both strings) -> straightforward prefix
	if (component && typeof contextInstance === 'string' && message === undefined) {
		const namespace = getNamespace();
		const className = component;
		const methodName = contextInstance;
		const template = getFormatTemplate();
		let result = template.replace('{namespace}', namespace).replace('{class}', className);
		if (template.includes('{method}')) {
			result = result.replace('{method}', methodName);
		}
		// Remove {message} placeholder
		result = result.replace('{message}', '').trim();
		// Clean up whitespace
		return result.replace(/\s+/g, ' ').trim();
	}
	// Get caller information
	if (contextInstance) {
		const registeredName = getRegisteredClassName(contextInstance);
		// Get stack info and detect EventEmitter/eval callbacks
		const stackInfo = getCallerInfo();
		const rawStack = new Error().stack || '';
		// Detect eval or any .emit(...) calls (including 'wu.emit') as callback context
		const isEmitCallback = /\.eval\s*\(|\.emit\s*\(/.test(rawStack);
		// Check if this appears to be a callback context
		isCallbackContext = isEmitCallback || stackInfo.includes(':callback') || stackInfo === 'callback' || stackInfo.includes('anonymous');
		
		// If registered instance and callback context, return early with callback template
		if (registeredName && isCallbackContext) {
			const template = getCallbackFormatTemplate();
			return template
				.replace('{namespace}', getNamespace())
				.replace('{class}', registeredName)
				.replace('{message}', message || '')
				.trim();
		}
		if (registeredName) {
			className = registeredName;
			if (!isCallbackContext) {
				if (stackInfo && !stackInfo.includes('.') && stackInfo !== 'callback' && stackInfo !== 'eval') {
					// Simple method name from stack
					methodName = stackInfo;
				} else if (stackInfo.includes('.')) {
					methodName = stackInfo.split('.').pop() || '';
				} else {
					methodName = stackInfo || '';
				}
			}
		} else {
			// No registered name, use stack info
			if (stackInfo.includes('.')) {
				const parts = stackInfo.split('.');
				className = parts[0] || '';
				methodName = parts[1] || '';
				// Check for callback in the context
				if (stackInfo.includes(':callback')) {
					isCallbackContext = true;
					methodName = '';
				}
			} else {
				className = '';
				methodName = stackInfo || '';
			}
		}
	} else {
		// No context instance, use component or caller info
		const callerInfo = component || getCallerInfo();
		isCallbackContext = callerInfo.includes(':callback') || callerInfo === 'callback';
		
		if (callerInfo.includes('.')) {
			const parts = callerInfo.split('.');
			className = parts[0] || '';
			methodName = parts[1] || '';
		} else if (callerInfo.includes(':callback')) {
			// Handle "ClassName:callback" format
			className = callerInfo.split(':')[0] || '';
			methodName = '';
			isCallbackContext = true;
		} else {
			className = '';
			methodName = callerInfo || '';
		}
	}
	
	// Choose the appropriate template
	const template = isCallbackContext ? getCallbackFormatTemplate() : getFormatTemplate();
		// Apply the template - replace placeholders
	let result = template
		.replace('{namespace}', namespace)
		.replace('{class}', className)
		.replace('{message}', message || '');
	
	// Only replace {method} if it exists in the template (for callback templates that don't use it)
	if (template.includes('{method}')) {
		result = result.replace('{method}', methodName);
	}
	
	return result;
}

// Function to format just the prefix part (without message) for separate styling
export function formatPrefixOnly(component?: string, contextInstance?: any): string {
	const namespace = getNamespace();
	let className = '';
	let methodName = '';
	let isCallbackContext = false;
	// Get caller information
	if (contextInstance) {
		const registeredName = getRegisteredClassName(contextInstance);
		const stackInfo = getCallerInfo();		// Check if this appears to be a callback context
		isCallbackContext = stackInfo.includes(':callback') || stackInfo === 'callback' || 
						   stackInfo.includes('eval') || stackInfo.includes('anonymous') ||
						   stackInfo.includes('EventEmitter.<anonymous>');
		
		if (registeredName) {
			className = registeredName;
			if (isCallbackContext) {
				// Use callback template - the registered name is the class name we want
				methodName = ''; // Not used in callback template
			} else if (stackInfo && !stackInfo.includes('.') && stackInfo !== 'callback' && stackInfo !== 'eval') {
				// Simple method name from stack
				methodName = stackInfo;
			} else if (stackInfo.includes('.')) {
				// Handle "ClassName.methodName" format - extract method only since we have registered name
				if (stackInfo.includes(':callback')) {
					isCallbackContext = true;
					methodName = '';
				} else {
					const parts = stackInfo.split('.');
					methodName = parts[1] || '';
				}
			}
		} else {
			// No registered name, use caller info
			const callerInfo = getCallerInfo();
			if (isCallbackContext) {
				// Use callback template
				methodName = ''; // Not used in callback template
				// If callerInfo is like "ClassName:callback", extract the class name
				if (callerInfo.includes(':callback')) {
					className = callerInfo.split(':')[0] || '';
				}
			} else if (component) {
				className = component;
				methodName = callerInfo || '';
			} else if (callerInfo.includes('.')) {
				const parts = callerInfo.split('.');
				className = parts[0] || '';
				methodName = parts[1] || '';
			} else if (callerInfo.includes(':callback')) {
				// Handle "ClassName:callback" format
				className = callerInfo.split(':')[0] || '';
				methodName = '';
				isCallbackContext = true;
			} else {
				className = '';
				methodName = callerInfo || '';
			}
		}
	} else if (component) {
		className = component;
		const stackInfo = getCallerInfo();
		if (stackInfo.includes(':callback') || stackInfo.includes('anonymous') || stackInfo.includes('EventEmitter.<anonymous>')) {
			isCallbackContext = true;
			methodName = '';
		} else {
			methodName = stackInfo || '';
		}
	} else {
		// No instance and no component override, get from stack
		const callerInfo = getCallerInfo();
		if (callerInfo.includes('.')) {
			const parts = callerInfo.split('.');
			className = parts[0] || '';
			methodName = parts[1] || '';
		} else if (callerInfo.includes(':callback')) {
			// Handle "ClassName:callback" format
			className = callerInfo.split(':')[0] || '';
			methodName = '';
			isCallbackContext = true;
		} else {
			className = '';
			methodName = callerInfo || '';
		}
	}
	
	// Choose the appropriate template
	const template = isCallbackContext ? getCallbackFormatTemplate() : getFormatTemplate();
	
	// Apply the template - replace placeholders (excluding {message})
	let result = template
		.replace('{namespace}', namespace)
		.replace('{class}', className);
	
	// Only replace {method} if it exists in the template (for callback templates that don't use it)
	if (template.includes('{method}')) {
		result = result.replace('{method}', methodName);
	}
	// Remove the {message} placeholder entirely
	result = result.replace('{message}', '').trim();
	
	// Clean up any double spaces, but preserve intentional punctuation like colons
	result = result.replace(/\s+/g, ' ').trim();
	
	return result;
}
