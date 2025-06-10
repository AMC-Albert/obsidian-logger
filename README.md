# Obsidian Logger

Debug logging for Obsidian plugins with customizable format templates, namespace support, and runtime configuration.

## Features

- Always shows errors
- Stack trace parsing for method names
- Class registration for minified code
- Customizable log format templates
- Separate callback context templates
- Runtime configuration via browser console
- Safe object logging

## Quick start for users wanting to debug

To debug any plugin that uses this logger system, open the Developer Console `(Ctrl+Shift+I)` and use these commands:

```typescript
// Enable debugging for a specific plugin
window.DEBUG['plugin-id'].enable();

// Optionally provide a log level (debug by default)
window.DEBUG['plugin-id'].enable('debug');

// Set log level
window.DEBUG['plugin-id'].setLevel('warn');

// Disable debugging for a plugin
window.DEBUG['plugin-id'].disable();

// Copy recent logs to clipboard (developer tools)
window.DEBUG['plugin-id'].copyLogs(); // Copy last 50 logs from current plugin

// Copy with custom options
window.DEBUG['plugin-id'].copyLogs({
	count: 100,                 // Number of recent logs (default: 50)
	stripNamespace: true,       // Remove [plugin-id] prefix
	stripClass: true,           // Remove class names
	stripMethod: true,          // Remove method names
	stripTimestamp: false,      // Include timestamps (default: true - off)
	stripLogLevel: false,       // Include log levels like [INFO] (default: true - off)
	simplifyPaths: false,       // Disable path simplification (default: true - on)
	format: 'message-only'      // 'full', 'prefix-only', 'message-only', 'custom'
});

```

**Log levels** (from most to least verbose):
- `loggerDebug` - Show everything (most verbose)
- `loggerInfo` - Show info, warnings, and errors  
- `loggerWarn` - Show warnings and errors only
- `loggerError` - Show errors only (always shown regardless of settings)

**Note:** Changes made in the console are temporary and will reset when you reload Obsidian. The plugin developer controls the default debug settings.

## Developer Tools: Log Export

The logger automatically stores recent log entries (up to 1000) that you can export for analysis or sharing. Use the developer console to copy formatted logs to your clipboard:

### Basic Usage

```typescript
// Copy last 50 logs from current plugin with full formatting
window.DEBUG['plugin-id'].copyLogs();
```

### Formatting Options

Control what information is included in the copied logs:

```typescript
// Strip out various components for cleaner output
window.DEBUG['plugin-id'].copyLogs({
	stripNamespace: true,    // Remove [plugin-id] prefix
	stripClass: true,        // Remove class names (ClassName.)
	stripMethod: true,       // Remove method names (.methodName)
	stripTimestamp: false,   // Include timestamps (default: true - timestamps OFF)
	stripLogLevel: false,    // Include log levels like [INFO], [DEBUG] (default: true - log levels OFF)
	simplifyPaths: false,    // Disable path simplification (default: true - path simplification ON)
});

// Pre-defined formats
window.DEBUG['plugin-id'].copyLogs({ format: 'message-only' });  // Just the log messages
window.DEBUG['plugin-id'].copyLogs({ format: 'prefix-only' });   // Just the prefixes
window.DEBUG['plugin-id'].copyLogs({ format: 'full' });          // Everything (default)

// Custom template
window.DEBUG['plugin-id'].copyLogs({ 
	format: 'custom',
	customTemplate: '{timestamp} | {level} | {message}'
});
```

## Quick start for developers

### Installation (git submodule)

Add as git submodule to your plugin project. You will likely want to add it to a specific subdirectory like `src/utils`.

```bash
git submodule add https://github.com/AMC-Albert/obsidian-logger.git
```

### Usage

Initialize the logger and `window.DEBUG` system in your plugin's `onload` method.

```typescript
import { Plugin } from 'obsidian';
import { 
  initLogger, 
  initializeDebugSystem,
  registerLoggerClass, 
  debug 
} from './obsidian-logger'; // Adjust path as needed

export default class MyObsidianPlugin extends Plugin {
  async onload() {
    // 1. Configure the logger (e.g., sets namespace from plugin ID).
    initLogger(this);

    // 2. Register class names for clearer log messages.
    registerLoggerClass(this, 'MyObsidianPlugin'); // Use your actual class name

    // 3. Initialize the `window.DEBUG` system when Obsidian's workspace is ready.
    // This ensures `window.DEBUG['plugin-id'].copyLogs()` etc. are reliably available.
    this.app.workspace.onLayoutReady(() => {
      initializeDebugSystem();
      loggerDebug(this, 'Logger and Debug system initialized (onLayoutReady).');
      // Example: [your-plugin-id] MyObsidianPlugin.onload: Logger and Debug system initialized (onLayoutReady).
    });

    loggerDebug(this, 'Plugin onload setup complete (pre-layout).');

    // ... rest of your onload logic ...
  }

  onunload() {
    // ... your onunload logic ...
  }

  // ... other methods in your plugin ...
}
```

### Build configuration for readable stack traces

For the logger to accurately display class and method names from stack traces, it's crucial that your build process does not minify or obfuscate these identifiers, especially in production builds where other minification is often desired.

**Using esbuild (recommended configuration for production):**

If you are using `esbuild` (common for Obsidian plugins), ensure your production build options include settings to preserve names while still minifying whitespace and syntax. Here's an example of how you might set these options in your `esbuild.config.mjs` (or similar build script):

```javascript
// esbuild.config.mjs

// ... (other parts of your build script) ...

const prodEsbuildOptions = {
  // ... other esbuild options for your production build ...
  minifyWhitespace: true,   // Minifies whitespace
  minifySyntax: true,       // Minifies syntax (e.g., removing unnecessary characters)
  minifyIdentifiers: false, // Crucial: Prevents minification of class/function names
  keepNames: true,          // Ensures names are kept, works in conjunction with minifyIdentifiers: false
  sourcemap: false,         // Typically false for production builds
  // ... other production-specific options ...
};

// ... (logic to use prodEsbuildOptions for production builds) ...
```

This setup ensures that class and function names remain intact for the logger, providing informative logs, while still applying other minification techniques to reduce bundle size.

**For development builds:**

In development, you might use a simpler configuration, for example:

```javascript
// esbuild.config.mjs

// ... (other parts of your build script) ...

const devEsbuildOptions = {
  // ... other esbuild options for your development build ...
  minify: false,        // No minification in dev
  keepNames: true,      // Good for readable names and consistency with prod
  sourcemap: "inline",  // Or other sourcemap option for debugging
  // ... other development-specific options ...
};

// ... (logic to use devEsbuildOptions for development builds) ...
```

Preserving identifiers (`minifyIdentifiers: false` and `keepNames: true` in production, or `minify: false` and `keepNames: true` in development) is key to getting the most informative logs from this utility.

### Static (utility) function logging

For standalone functions or modules (no class instance), provide component and method names:

```typescript
import { debug } from './obsidian-logger';

loggerDebug('DateParser', 'parseDate', 'Parsing text:', text);
// → [plugin-id] DateParser.parseDate: Parsing text: "Today"  
```

This ensures the correct `Class.method` prefix even without `this` context.

### Registering multiple classes

```typescript
// Initialize logger system first
initLogger(this);

// Register your main plugin class
registerLoggerClass(this, 'MyPlugin');

// Create and register other components
this.settingsManager = new SettingsManager(this.settings);
this.uiController = new UIController(this);

// Register each component for better logging context
registerLoggerClass(this.settingsManager, 'SettingsManager');
registerLoggerClass(this.uiController, 'UIController');

// Now debug calls from each class will show their registered names
loggerDebug(this, 'Plugin initialized');                     // → [plugin-id] MyPlugin.onload: Plugin initialized
loggerDebug(this.dataManager, 'Loading data from vault');    // → [plugin-id] DataManager.load: Loading data from vault
loggerDebug(this.uiController, 'Setting up UI components');  // → [plugin-id] UIController.setup: Setting up UI components
```

## Configuration

```typescript
// Custom format templates
setFormatTemplate('[{namespace}] {class}.{method} →');
setFormatTemplate('{namespace} | {class} > {method}');
```

## Template placeholders

**Normal template** (for regular method calls):
- `{namespace}` - Plugin namespace
- `{class}` - Class name (from registration)
- `{method}` - Method/function name
- `{message}` - The actual log message

**Callback template** (for callback contexts):
- `{namespace}` - Plugin namespace
- `{class}` - Class name (from registration)  
- `{message}` - The actual log message

## Template configuration

Configure how log messages are formatted:

```typescript
import { setFormatTemplate, setCallbackFormatTemplate } from './simple-debug';

// Default template
setFormatTemplate('[{namespace}] {class}.{method}: {message}');

// Default callback template  
setCallbackFormatTemplate('[{namespace}] {class} (callback): {message}');

// Minimal style:
setFormatTemplate('{class}.{method}: {message}');
setCallbackFormatTemplate('{class}→cb: {message}');
```

## Styling and colors

Configure colors for different parts of the log output:

```typescript
import { setColors, setMessageColor } from './simple-debug';

// Set colors for log level prefixes
setColors({
	debug: '#7B68EE',    // Purple for debug
	info: '#4169E1',     // Blue for info  
	warn: '#FF8C00',     // Orange for warnings
	error: '#DC143C'     // Red for errors
});

// Set color for message text (separate from prefix)
setMessageColor('#ffffff');  // White messages (default)
```

**Log Output Structure:**
- **Prefix**: Colored according to log level (debug/info/warn/error)
- **Message**: Colored according to `messageColor` setting (default: white)

## Object logging

The debug system safely handles complex objects without circular reference errors using improved `safeStringify`:

```typescript
// These all work safely:
loggerDebug(this, 'App object:', this.app);           // → safe, readable output
loggerDebug(this, 'File info', file);                 // → TFile{name: "2025-06-07.md", path: "/..."}
loggerDebug(this, 'Complex data:', someComplexObj);   // → Object summary without circular refs
```