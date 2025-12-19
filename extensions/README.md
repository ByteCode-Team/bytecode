# ByteCode Extensions

## Format d'extension (.bcext)

Les extensions ByteCode sont des fichiers ZIP renommés en `.bcext` contenant :
- `manifest.json` - Métadonnées de l'extension
- `index.js` - Code principal de l'extension
- Autres fichiers JS si nécessaire

## Structure du manifest.json

```json
{
    "id": "mon-extension",
    "name": "Mon Extension",
    "version": "1.0.0",
    "description": "Description de l'extension",
    "author": "Votre nom",
    "main": "index.js"
}
```

## API disponible (objet `bytecode`)

### Editor API
```javascript
bytecode.editor.getValue()           // Obtenir le contenu de l'éditeur
bytecode.editor.setValue(text)       // Définir le contenu
bytecode.editor.getSelection()       // Obtenir le texte sélectionné
bytecode.editor.insertText(text)     // Insérer du texte à la position du curseur
bytecode.editor.getLanguage()        // Obtenir le langage du fichier actuel
bytecode.editor.getCursorPosition()  // {lineNumber, column}
bytecode.editor.setCursorPosition(line, col)
bytecode.editor.focus()
```

### Files API
```javascript
bytecode.files.getCurrentFile()      // {name, path, content, language, modified}
bytecode.files.getOpenFiles()        // Liste des fichiers ouverts
bytecode.files.openFile(path)        // Ouvrir un fichier
bytecode.files.saveCurrentFile()     // Sauvegarder
bytecode.files.createFile(name, content)
bytecode.files.readFile(path)        // Lire un fichier (sync)
bytecode.files.writeFile(path, content)
```

### Workspace API
```javascript
bytecode.workspace.getFolder()       // {path, name}
bytecode.workspace.refresh()         // Rafraîchir l'arborescence
```

### UI API
```javascript
bytecode.ui.showNotification(message, type)  // type: 'info', 'success', 'error'
bytecode.ui.showInputDialog(title, placeholder)  // Retourne une Promise
bytecode.ui.addStatusBarItem(id, text, onClick)
bytecode.ui.updateStatusBarItem(id, text)
bytecode.ui.removeStatusBarItem(id)
bytecode.ui.addMenuItem(menuId, {label, shortcut, action})
bytecode.ui.addContextMenuItem({label, action})
bytecode.ui.addSidebarPanel(id, title, htmlContent)
```

### Terminal API
```javascript
bytecode.terminal.execute(command)   // Retourne une Promise avec le résultat
bytecode.terminal.show()             // Afficher le terminal
bytecode.terminal.write(text)        // Écrire dans le terminal
```

### AI API
```javascript
bytecode.ai.chat(message)            // Envoyer un message à l'IA (Promise)
bytecode.ai.getProvider()            // Obtenir le provider actuel
```

### Hooks API
```javascript
bytecode.hooks.on(event, callback)   // S'abonner à un événement
bytecode.hooks.off(event, callback)  // Se désabonner

// Événements disponibles:
// 'editor:ready', 'editor:change', 'file:open', 'file:save', 
// 'file:close', 'folder:open', 'terminal:command', 
// 'ai:message', 'ai:response', 'menu:init', 'statusbar:init'
```

### Storage API (persistant par extension)
```javascript
bytecode.storage.get(extId, key)
bytecode.storage.set(extId, key, value)
bytecode.storage.remove(extId, key)
```

### Utils
```javascript
bytecode.utils.path   // Module Node.js path
bytecode.utils.fs     // Module Node.js fs
```

## Exemple complet

```javascript
// manifest.json
{
    "id": "word-counter",
    "name": "Word Counter",
    "version": "1.0.0",
    "description": "Compte les mots dans le fichier actuel",
    "author": "ByteCode",
    "main": "index.js"
}

// index.js
bytecode.ui.addStatusBarItem('word-count', 'Words: 0', () => {
    const content = bytecode.editor.getValue();
    const words = content.trim().split(/\s+/).filter(w => w).length;
    bytecode.ui.showNotification(`${words} mots dans ce fichier`, 'info');
});

bytecode.hooks.on('editor:change', () => {
    const content = bytecode.editor.getValue();
    const words = content.trim().split(/\s+/).filter(w => w).length;
    bytecode.ui.updateStatusBarItem('word-count', `Words: ${words}`);
});
```

## Installation

1. Placez votre dossier d'extension dans `extensions/`
2. Ou créez un fichier `.bcext` (ZIP) et utilisez le menu Extensions > Installer
3. Redémarrez ByteCode

## Créer un .bcext

```bash
cd mon-extension
zip -r ../mon-extension.bcext manifest.json index.js
```
