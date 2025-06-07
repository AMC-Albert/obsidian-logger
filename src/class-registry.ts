// Class name mapping for minified code
const classNameMap = new Map<any, string>();

// Function to register a class instance with its original name
export function registerLoggerClass(instance: any, originalName: string): void {
	if (instance && originalName) {
		classNameMap.set(instance, originalName);
		// Also register the constructor if it's different
		if (instance.constructor && instance.constructor !== instance) {
			classNameMap.set(instance.constructor, originalName);
		}
	}
}

// Function to get registered class name
export function getRegisteredClassName(instance: any): string | null {
	if (!instance) return null;
	
	// Check direct mapping first
	if (classNameMap.has(instance)) {
		return classNameMap.get(instance) || null;
	}
	
	// Check constructor mapping
	if (instance.constructor && classNameMap.has(instance.constructor)) {
		return classNameMap.get(instance.constructor) || null;
	}
	
	return null;
}
