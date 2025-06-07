import type { LogLevel } from './types';
import { getNamespace, getConfig } from './config';

// Define an interface for the DEBUG object
interface DebugAPI {
	enable: (ns: string, level?: LogLevel) => string;
	disable: (ns: string) => string;
	enabled: (ns: string) => boolean;
	setLevel: (ns: string, level: LogLevel) => string;
	getLevel: (ns: string) => LogLevel | null;
}

// Extend the Window interface to include the DEBUG property
declare global {
	interface Window {
		DEBUG?: DebugAPI;
	}
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
			},
			getLevel(ns: string): LogLevel | null {
				if (ns === getNamespace() || ns === '*') {
					const config = getConfig();
					return config.debugEnabled ? config.currentLogLevel : null;
				}
				return origGetLevel(ns);
			}
		};
	} catch (error) {
		console.warn('Failed to initialize debug system:', error);
	}
}

// Initialize the controller when this module is imported
initializeDebugSystem();