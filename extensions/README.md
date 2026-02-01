# ByteCode Extensions

## Extension Format (.bcext)

ByteCode extensions are ZIP files renamed to `.bcext` containing:

- `manifest.json` - Extension metadata (Required)
- `index.js` - Main extension code (Required)
- `README.md` - Extension documentation (Recommended)
- `icon.png` - Extension icon (Recommended)
- Other JS/CSS/Asset files if needed

## manifest.json Structure

Your `manifest.json` is the source of truth for your extension. It should follow this schema:

```json
{
  "id": "my-extension-id",
  "name": "My Extension Name",
  "version": "1.0.0",
  "description": "A short description of what your extension does.",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://yourwebsite.com"
  },
  "publisher": "YourPublisherName",
  "repository": {
    "type": "git",
    "url": "https://github.com/username/repo"
  },
  "engines": {
    "bytecode": "^1.0.0"
  },
  "main": "index.js",
  "icon": "icon.png",
  "categories": ["Themes", "Tools", "Languages"],
  "dependencies": {
    "some-other-extension": "^1.0.0"
  },
  "activationEvents": ["onStartup", "onCommand:extension.helloWorld"]
}
```

## Available API (bytecode object)

Access the full power of ByteCode via the global `bytecode` object.

### Editor API

```javascript
bytecode.editor.getValue(); // Get editor content
bytecode.editor.setValue(text); // Set content
bytecode.editor.getSelection(); // Get selected text
bytecode.editor.insertText(text); // Insert text at cursor position
bytecode.editor.getLanguage(); // Get current file language
bytecode.editor.getCursorPosition(); // {lineNumber, column}
bytecode.editor.setCursorPosition(line, col);
bytecode.editor.focus();
```

### Files API

```javascript
bytecode.files.getCurrentFile(); // {name, path, content, language, modified}
bytecode.files.getOpenFiles(); // List of open files
bytecode.files.openFile(path); // Open a file
bytecode.files.saveCurrentFile(); // Save
bytecode.files.createFile(name, content);
bytecode.files.readFile(path); // Read a file (sync)
bytecode.files.writeFile(path, content);
```

### Workspace API

```javascript
bytecode.workspace.getFolder(); // {path, name}
bytecode.workspace.refresh(); // Refresh file tree
```

### UI API

```javascript
bytecode.ui.showNotification(message, type); // type: 'info', 'success', 'error'
bytecode.ui.showInputDialog(title, placeholder); // Returns a Promise
bytecode.ui.addStatusBarItem(id, text, onClick);
bytecode.ui.updateStatusBarItem(id, text);
bytecode.ui.removeStatusBarItem(id);
bytecode.ui.addMenuItem(menuId, { label, shortcut, action });
bytecode.ui.addContextMenuItem({ label, action });
bytecode.ui.addSidebarPanel(id, title, htmlContent);
```

### Terminal API

```javascript
bytecode.terminal.execute(command); // Returns a Promise with result
bytecode.terminal.show(); // Show terminal
bytecode.terminal.write(text); // Write to terminal
```

### AI API

```javascript
bytecode.ai.chat(message); // Send message to AI (Promise)
bytecode.ai.getProvider(); // Get current provider
```

### Hooks API

```javascript
bytecode.hooks.on(event, callback); // Subscribe to an event
bytecode.hooks.off(event, callback); // Unsubscribe

// Available events:
// 'editor:ready', 'editor:change', 'file:open', 'file:save',
// 'file:close', 'folder:open', 'terminal:command',
// 'ai:message', 'ai:response', 'menu:init', 'statusbar:init'
```

### Storage API (persistent per extension)

```javascript
bytecode.storage.get(extId, key);
bytecode.storage.set(extId, key, value);
bytecode.storage.remove(extId, key);
```

### Utils

```javascript
bytecode.utils.path; // Node.js path module
bytecode.utils.fs; // Node.js fs module
```

## Creating a .bcext Package

To share your extension, you need to package it into a `.bcext` file.

### Manual Method

1. Select all files in your extension folder (`manifest.json`, `index.js`, etc.)
2. Zip them into an archive.
3. Rename `.zip` to `.bcext`.

### Automated Method (Recommended)

You can use the built-in build tool:

```bash
node tools/build-extension.js <path-to-extension-folder>
```

Example:

```bash
node tools/build-extension.js extensions/live-server
```

This will generate `live-server.bcext` in the `dist-extensions` folder.

---

## Extension SDK / CLI (bcext)

We provide a CLI to scaffold, validate, and build extensions.

### Install (dev)

```bash
cd tools/bcext-cli
npm link
```

### Commands

```bash
# Create a new extension scaffold
bcext init my-extension --id my-extension --name "My Extension"

# Validate manifest + entry file
bcext validate ./my-extension

# Build a .bcext package (outputs to ./my-extension/dist)
bcext build ./my-extension
```
