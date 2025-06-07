// Simplified helper function to extract class and method if present
// No longer tries to "clean" minified names, assumes names are preserved.
function extractClassAndMethod(name: string): { className?: string, methodName?: string } {
	if (!name) return {};
	if (name.includes('.')) {
		const parts = name.split('.');
		// Handles cases like "ClassName.methodName" or "Possibly.Nested.ClassName.methodName"
		// Takes the last part as method, everything before as class.
		const methodName = parts.pop();
		const className = parts.join('.');
		return { className, methodName };
	}
	// If no '.', assume it's a standalone function/method name
	return { methodName: name };
}

// Simplified helper function to determine if a name looks like meaningful context
// Now primarily just checks for empty or very generic/internal JS names.
function isMeaningfulContext(name?: string): boolean {
	if (!name || name.length < 1) return false;

	// Skip generic or unhelpful names that might still appear
	const skipNames = ['eval', 'anonymous', 'apply', 'call', 'constructor']; // Added 'constructor'
	if (skipNames.includes(name.toLowerCase())) return false; // Case-insensitive check

	// Avoid returning just "Object" if that's all that was parsed (e.g. Object.eval)
	if (name === 'Object') return false;

	return true;
}

// Simplified helper function to extract caller information from stack trace
export function getCallerInfo(): { className?: string, methodName?: string, isCallback: boolean } {
	try {
		const stack = new Error().stack;
		if (!stack) return { isCallback: false };

		const lines = stack.split('\n');

		// Filter out internal logger functions and direct calls to debug/log/warn/error
		const relevantLines = lines.slice(1).filter(line => {
			const trimmed = line.trim();
			// Skip lines related to the logger's own functions
			if (trimmed.includes('getCallerInfo') ||
				trimmed.includes('formatPrefix') || // Catches formatPrefixOnly and formatPrefixCustom
				trimmed.includes('simple-debug') || // Assuming 'simple-debug' is an internal marker
				trimmed.match(/at\s+(log|debug|info|warn|error|logger)\s*\(/i)) { // Logger function calls
				return false;
			}
			// Skip lines that are not part of the plugin's own code (heuristic)
			// This helps avoid pulling context from Obsidian's internal calls or other plugins if possible
			// Modify 'plugin:sidecars' if your plugin ID in stack traces is different
			// Keep eval lines from the plugin as they might be part of callbacks
			if (!trimmed.includes('(plugin:sidecars:') && !(trimmed.includes('at eval (') && trimmed.includes('(plugin:sidecars:'))) {
				// If it's an eval line NOT from our plugin, skip it.
				if (trimmed.includes('at eval (')) {
					return false;
				}
			}
			return true;
		});

		// Regex to capture "at ClassName.methodName (source)" or "at methodName (source)"
		// Assumes names are NOT minified.
		const stackLineRegex = /\s*at\s+(?:new\s+)?([A-Za-z0-9_$.]+(?:\s+\[as\s+[A-Za-z0-9_$.]+])?)/;
		
		for (const line of relevantLines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			const match = trimmedLine.match(stackLineRegex);
			if (match && match[1]) {
				let potentialContext = match[1];

				// Handle " [as alias]" part if present
				const asAliasMatch = potentialContext.match(/(.*)\s+\[as\s+.*]/);
				if (asAliasMatch && asAliasMatch[1]) {
					potentialContext = asAliasMatch[1];
				}

				const { className, methodName } = extractClassAndMethod(potentialContext);

				if (isMeaningfulContext(methodName) || isMeaningfulContext(className)) {
					const isEvalCallback = trimmedLine.toLowerCase().includes('at eval');
					const isGenericCallbackHint = methodName?.toLowerCase().includes('callback') ||
												className?.toLowerCase().includes('callback') ||
												methodName?.toLowerCase().startsWith('_on') || 
												trimmedLine.toLowerCase().includes('eventemitter') ||
												trimmedLine.toLowerCase().includes('.emit');
					
					// If the context is just 'eval', we probably don't have a useful class/method name from it.
					// Trust the registered class name more in this case.
					if (methodName === 'eval' && !className) {
						return { isCallback: true }; // Signal callback, but no specific method/class from this frame
					}

					return { className, methodName, isCallback: isEvalCallback || isGenericCallbackHint };
				}
			}
		}
	} catch (e) {
		console.error("Error in getCallerInfo:", e);
	}
	return { isCallback: false }; // Default if no info found
}

// Import config functions
import { getNamespace, getFormatTemplate, getCallbackFormatTemplate } from './config';
import { getRegisteredClassName } from './class-registry';

// Customizable format function that uses templates and detects callback contexts
export function formatPrefixCustom(component?: string, contextInstance?: any, message?: string): string {
	const namespace = getNamespace();
	let derivedClassName: string | null = null;
	let derivedMethodName: string | null = null;
	let isCallbackContext = false;

	const callerInfo = getCallerInfo();
	isCallbackContext = callerInfo.isCallback;

	if (contextInstance) {
		derivedClassName = getRegisteredClassName(contextInstance);
		if (callerInfo.methodName && !isCallbackContext) { // Prefer stack method if not a callback and available
			derivedMethodName = callerInfo.methodName ?? null;
			// If stack also gave a class name, and it matches registered, it's fine.
			// If it's different, the registered one is usually more reliable for the primary class.
			if (callerInfo.className && callerInfo.className !== derivedClassName) {
				// This could happen if a method from a registered class calls a method on another (unregistered) class instance.
				// For now, we prioritize the registered class name.
			}
		} else if (callerInfo.methodName && isCallbackContext && !derivedClassName) {
			// If it's a callback and we don't have a registered class, use what stack gives
			derivedClassName = callerInfo.className ?? null;
			derivedMethodName = callerInfo.methodName ?? null; // Also assign method name if available
		}
	} else if (component) { // No instance, but a component string is provided
		derivedClassName = component;
		derivedMethodName = callerInfo.methodName ?? null;
		// If stack also gave a class name, and it's different from component, it might be a standalone function
		// or a method of a different class. For now, component override takes precedence for class.
		if (callerInfo.className && callerInfo.className !== derivedClassName && !callerInfo.methodName) {
			// This case is tricky: component="Comp", stack="OtherClass.someMethod"
			// Current logic: Class="Comp", Method="someMethod"
		} else if (callerInfo.className && !callerInfo.methodName) {
             // If stack gives "StandaloneClass" and no method, and we have a component,
             // it's ambiguous. Let's stick with component as class, method from stack.
        }

	} else { // No instance, no component string
		derivedClassName = callerInfo.className ?? null;
		derivedMethodName = callerInfo.methodName ?? null;
	}
	
	// If derivedClassName ended up empty, but callerInfo had one (e.g. standalone function in a module treated as class by stack)
	if (!derivedClassName && callerInfo.className && !callerInfo.methodName) {
		// This could be a function that isn't part of a class, stack might parse module as class.
		// Let's treat it as a "method" name without a class for the logger.
		derivedMethodName = callerInfo.className ?? null;
	} else if (!derivedClassName && callerInfo.className && callerInfo.methodName) {
		// If no registered class, take both from stack if available
		derivedClassName = callerInfo.className ?? null;
		derivedMethodName = callerInfo.methodName ?? null;
	}


	// Fallback for method name if it's empty but class name is present and looks like Class.method
	if (derivedClassName && !derivedMethodName && derivedClassName.includes('.')) {
		const parts = derivedClassName.split('.');
		derivedMethodName = parts.pop() ?? null;
		derivedClassName = parts.join('.');
	}
	// Fallback for class name if it's empty but method name is present and looks like Class.method
	if (!derivedClassName && derivedMethodName && derivedMethodName.includes('.')) {
		const parts = derivedMethodName.split('.');
		derivedClassName = parts.shift() ?? null;
		derivedMethodName = parts.join('.');
	}
	
	// Final check for callback context if method name implies it
	if (derivedMethodName && (derivedMethodName.toLowerCase().includes('callback') || derivedMethodName.toLowerCase().startsWith('_on'))) {
		isCallbackContext = true;
	}

	const template = isCallbackContext ? getCallbackFormatTemplate() : getFormatTemplate();
	
	let result = template
		.replace('{namespace}', namespace)
		.replace('{class}', derivedClassName || '') // Ensure empty string if null
		.replace('{message}', message || '');

	if (template.includes('{method}')) {
		result = result.replace('{method}', derivedMethodName || ''); // Ensure empty string if null
	}
	
	return result.replace(/\s\s+/g, ' ').trim(); // Normalize spaces
}

// Function to format just the prefix part (without message) for separate styling
export function formatPrefixOnly(component?: string, contextInstance?: any): string {
	// This function can leverage formatPrefixCustom by passing a placeholder message
	// and then removing it, to avoid duplicating logic.
	// However, for directness and potential minor optimization, we'll keep it separate but aligned.

	const namespace = getNamespace();
	let derivedClassName: string | null = null;
	let derivedMethodName: string | null = null;
	let isCallbackContext = false;

	const callerInfo = getCallerInfo();
	isCallbackContext = callerInfo.isCallback;

	if (contextInstance) {
		derivedClassName = getRegisteredClassName(contextInstance);
		if (callerInfo.methodName && !isCallbackContext) {
			derivedMethodName = callerInfo.methodName ?? null;
			// Class name logic similar to formatPrefixCustom
		} else if (callerInfo.methodName && isCallbackContext && !derivedClassName) {
			derivedClassName = callerInfo.className ?? null;
		}
	} else if (component) {
		derivedClassName = component;
		derivedMethodName = callerInfo.methodName ?? null;
		// Class name logic similar to formatPrefixCustom
	} else {
		derivedClassName = callerInfo.className ?? null;
		derivedMethodName = callerInfo.methodName ?? null;
	}
	
	if (!derivedClassName && callerInfo.className && !callerInfo.methodName) {
		derivedMethodName = callerInfo.className ?? null;
	} else if (!derivedClassName && callerInfo.className && callerInfo.methodName) {
		derivedClassName = callerInfo.className ?? null;
		derivedMethodName = callerInfo.methodName ?? null;
	}

	if (derivedClassName && !derivedMethodName && derivedClassName.includes('.')) {
		const parts = derivedClassName.split('.');
		derivedMethodName = parts.pop() ?? null;
		derivedClassName = parts.join('.');
	}
	if (!derivedClassName && derivedMethodName && derivedMethodName.includes('.')) {
		const parts = derivedMethodName.split('.');
		derivedClassName = parts.shift() ?? null;
		derivedMethodName = parts.join('.');
	}
	
	if (derivedMethodName && (derivedMethodName.toLowerCase().includes('callback') || derivedMethodName.toLowerCase().startsWith('_on'))) {
		isCallbackContext = true;
	}

	const template = isCallbackContext ? getCallbackFormatTemplate() : getFormatTemplate();
	
	let result = template
		.replace('{namespace}', namespace)
		.replace('{class}', derivedClassName || '');

	if (template.includes('{method}')) {
		result = result.replace('{method}', derivedMethodName || '');
	}
	
	result = result.replace('{message}', '').trim(); // Remove message placeholder
	return result.replace(/\s\s+/g, ' ').trim(); // Normalize spaces
}
