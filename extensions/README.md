# ByteCode Extensions

## Extension Format (.bcext)

ByteCode extensions are ZIP files renamed to `.bcext` containing:

- `manifest.json` - Extension metadata
- `index.js` - Main extension code
- Other JS files if needed

## manifest.json Structure

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Extension description",
  "author": "Your name",
  "main": "index.js"
}
```

## Available API (bytecode object)

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

## Complete Example

```javascript
// manifest.json
{
    "id": "word-counter",
    "name": "Word Counter",
    "version": "1.0.0",
    "description": "Counts words in the current file",
    "author": "ByteCode",
    "main": "index.js"
}

// index.js
bytecode.ui.addStatusBarItem('word-count', 'Words: 0', () => {
    const content = bytecode.editor.getValue();
    const words = content.trim().split(/\s+/).filter(w => w).length;
    bytecode.ui.showNotification(`${words} words in this file`, 'info');
});

bytecode.hooks.on('editor:change', () => {
    const content = bytecode.editor.getValue();
    const words = content.trim().split(/\s+/).filter(w => w).length;
    bytecode.ui.updateStatusBarItem('word-count', `Words: ${words}`);
});
```

## Installation

1. Place your extension folder in `extensions/`
2. Or create a `.bcext` file (ZIP) and use the Extensions > Install menu
3. Restart ByteCode

## Creating a .bcext

```bash
cd my-extension
zip -r ../my-extension.bcext manifest.json index.js
```
