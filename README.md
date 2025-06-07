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
window.DEBUG.enable('plugin-id');

// Optionally provide a log level (debug by default)
window.DEBUG.enable('plugin-id', 'debug');

// Set log level
window.DEBUG.setLevel('plugin-id', 'warn');

// Disable debugging for a plugin
window.DEBUG.disable('plugin-id');
```

**Log Levels** (from most to least verbose):
- `debug` - Show everything (most verbose)
- `info` - Show info, warnings, and errors  
- `warn` - Show warnings and errors only
- `error` - Show errors only (always shown regardless of settings)

**Note:** Changes made in the console are temporary and will reset when you reload Obsidian. The plugin developer controls the default debug settings.

## Quick start for developers

### Installation (git submodule)

Add as git submodule to your plugin project. You will likely want to add it to a specific subdirectory like `src/utils`.

```bash
git submodule add https://github.com/AMC-Albert/obsidian-logger.git
```

### Usage

```typescript
import { initLogger, debug, registerLoggerClass } from './obsidian-logger';

// In your main plugin class constructor
initLogger(this);
registerLoggerClass(this, 'MyPluginClass');

// Use throughout your code
debug(this, 'Message'); // → [plugin-id] MyPluginClass.methodName: Message
```

### Registering Multiple Classes

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
debug(this, 'Plugin initialized');                     // → [plugin-id] MyPlugin.onload: Plugin initialized
debug(this.dataManager, 'Loading data from vault');    // → [plugin-id] DataManager.load: Loading data from vault
debug(this.uiController, 'Setting up UI components');  // → [plugin-id] UIController.setup: Setting up UI components
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

## Object Logging

The debug system safely handles complex objects without circular reference errors:

```typescript
// These all work safely:
debug(this, 'App object:', this.app);           // Obsidian app object
debug(this, 'File:', file);                     // TFile object
debug(this, 'Complex data:', someComplexObj);   // Any object
```

Objects are summarized to show useful information without overwhelming the console or causing circular reference errors.