// Multi-Terminal Manager
class TerminalManager {
    constructor(container) {
        this.container = container;
        this.terminals = [];
        this.activeTerminalIndex = -1;
        this.terminalCounter = 0;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="terminal-header">
                <div class="terminal-tabs" id="terminal-tabs"></div>
                <div class="terminal-actions">
                    <button class="terminal-action-btn" onclick="window.terminalManager.createTerminal()" title="New Terminal">+</button>
                    <button class="terminal-close" onclick="toggleTerminal()">×</button>
                </div>
            </div>
            <div class="terminal-content" id="terminal-content"></div>
        `;
        
        this.createTerminal();
    }

    createTerminal(initialDir = null) {
        this.terminalCounter++;
        const terminalId = this.terminalCounter;
        const dir = initialDir || (window.currentFolder ? window.currentFolder.path : process.cwd());
        
        const terminal = {
            id: terminalId,
            name: `Terminal ${terminalId}`,
            currentDir: dir,
            history: [],
            historyIndex: -1,
            output: [],
            element: null
        };
        
        this.terminals.push(terminal);
        this.switchToTerminal(this.terminals.length - 1);
        this.updateTabs();
        
        return terminal;
    }

    switchToTerminal(index) {
        if (index < 0 || index >= this.terminals.length) return;
        
        this.activeTerminalIndex = index;
        this.renderTerminal();
        this.updateTabs();
    }

    closeTerminal(index) {
        if (this.terminals.length <= 1) {
            // Don't close the last terminal, just clear it
            this.terminals[0].output = [];
            this.terminals[0].history = [];
            this.renderTerminal();
            return;
        }
        
        this.terminals.splice(index, 1);
        
        if (this.activeTerminalIndex >= this.terminals.length) {
            this.activeTerminalIndex = this.terminals.length - 1;
        }
        
        this.renderTerminal();
        this.updateTabs();
    }

    updateTabs() {
        const tabsContainer = document.getElementById('terminal-tabs');
        if (!tabsContainer) return;
        
        tabsContainer.innerHTML = '';
        
        this.terminals.forEach((terminal, index) => {
            const tab = document.createElement('div');
            tab.className = `terminal-tab ${index === this.activeTerminalIndex ? 'active' : ''}`;
            tab.innerHTML = `
                <span class="terminal-tab-name" onclick="window.terminalManager.switchToTerminal(${index})">${terminal.name}</span>
                <span class="terminal-tab-close" onclick="event.stopPropagation(); window.terminalManager.closeTerminal(${index})">×</span>
            `;
            tabsContainer.appendChild(tab);
        });
    }

    renderTerminal() {
        const content = document.getElementById('terminal-content');
        if (!content) return;
        
        const terminal = this.terminals[this.activeTerminalIndex];
        if (!terminal) return;
        
        content.innerHTML = `
            <div class="terminal-output" id="terminal-output-${terminal.id}"></div>
            <div class="terminal-input-container">
                <span class="terminal-prompt" id="terminal-prompt-${terminal.id}">${terminal.currentDir}></span>
                <input type="text" class="terminal-input" id="terminal-input-${terminal.id}" placeholder="Type a command...">
            </div>
        `;
        
        const output = document.getElementById(`terminal-output-${terminal.id}`);
        const input = document.getElementById(`terminal-input-${terminal.id}`);
        
        // Restore output history
        terminal.output.forEach(line => {
            const lineEl = document.createElement('div');
            lineEl.className = `terminal-line terminal-${line.type}`;
            lineEl.textContent = line.text;
            output.appendChild(lineEl);
        });
        
        // Print welcome if new terminal
        if (terminal.output.length === 0) {
            this.print(terminal.id, 'ByteCode Terminal v1.0.0', 'info');
            this.print(terminal.id, `Current directory: ${terminal.currentDir}`, 'info');
            this.print(terminal.id, 'Type "help" for available commands\n', 'info');
        }
        
        output.scrollTop = output.scrollHeight;
        
        input.addEventListener('keydown', (e) => this.handleKeyDown(e, terminal));
        input.focus();
    }

    print(terminalId, text, type = 'normal') {
        const terminal = this.terminals.find(t => t.id === terminalId);
        if (!terminal) return;
        
        terminal.output.push({ text, type });
        
        const output = document.getElementById(`terminal-output-${terminalId}`);
        if (output) {
            const line = document.createElement('div');
            line.className = `terminal-line terminal-${type}`;
            line.textContent = text;
            output.appendChild(line);
            output.scrollTop = output.scrollHeight;
        }
    }

    handleKeyDown(e, terminal) {
        const input = document.getElementById(`terminal-input-${terminal.id}`);
        if (!input) return;
        
        if (e.key === 'Enter') {
            const command = input.value.trim();
            if (command) {
                terminal.history.push(command);
                terminal.historyIndex = terminal.history.length;
                this.executeCommand(terminal, command);
                input.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (terminal.historyIndex > 0) {
                terminal.historyIndex--;
                input.value = terminal.history[terminal.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (terminal.historyIndex < terminal.history.length - 1) {
                terminal.historyIndex++;
                input.value = terminal.history[terminal.historyIndex];
            } else {
                terminal.historyIndex = terminal.history.length;
                input.value = '';
            }
        }
    }

    executeCommand(terminal, command) {
        this.print(terminal.id, `${terminal.currentDir}> ${command}`, 'command');

        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case 'help':
                this.showHelp(terminal.id);
                break;
            case 'clear':
            case 'cls':
                terminal.output = [];
                const output = document.getElementById(`terminal-output-${terminal.id}`);
                if (output) output.innerHTML = '';
                break;
            case 'cd':
                this.changeDirectory(terminal, args[0]);
                break;
            case 'dir':
            case 'ls':
                this.listDirectory(terminal);
                break;
            case 'pwd':
                this.print(terminal.id, terminal.currentDir);
                break;
            case 'echo':
                this.print(terminal.id, args.join(' '));
                break;
            case 'exit':
                this.closeTerminal(this.activeTerminalIndex);
                break;
            default:
                this.runSystemCommand(terminal, command);
        }
    }

    runSystemCommand(terminal, command) {
        const { ipcRenderer } = require('electron');
        
        this.print(terminal.id, 'Executing...', 'info');
        
        ipcRenderer.send('execute-terminal-command', {
            command: command,
            cwd: terminal.currentDir
        });

        ipcRenderer.once('terminal-command-result', (event, result) => {
            if (result.error) {
                this.print(terminal.id, result.error, 'error');
            } else {
                if (result.stdout) {
                    result.stdout.split('\n').forEach(line => {
                        if (line.trim()) this.print(terminal.id, line, 'success');
                    });
                }
                if (result.stderr) {
                    result.stderr.split('\n').forEach(line => {
                        if (line.trim()) this.print(terminal.id, line, 'error');
                    });
                }
            }
        });
    }

    showHelp(terminalId) {
        this.print(terminalId, 'Available commands:', 'info');
        this.print(terminalId, '  help          - Show this help message');
        this.print(terminalId, '  clear / cls   - Clear the terminal');
        this.print(terminalId, '  cd <dir>      - Change directory');
        this.print(terminalId, '  ls / dir      - List directory contents');
        this.print(terminalId, '  pwd           - Print working directory');
        this.print(terminalId, '  echo <text>   - Print text');
        this.print(terminalId, '  exit          - Close this terminal');
        this.print(terminalId, '  Any other command will be executed in the system shell');
    }

    changeDirectory(terminal, dir) {
        if (!dir) {
            this.print(terminal.id, 'Usage: cd <directory>', 'error');
            return;
        }

        const pathModule = require('path');
        const fsSync = require('fs');

        let newPath;
        if (dir === '~') {
            newPath = require('os').homedir();
        } else if (pathModule.isAbsolute(dir)) {
            newPath = dir;
        } else {
            newPath = pathModule.resolve(terminal.currentDir, dir);
        }

        try {
            if (fsSync.existsSync(newPath) && fsSync.statSync(newPath).isDirectory()) {
                terminal.currentDir = newPath;
                const prompt = document.getElementById(`terminal-prompt-${terminal.id}`);
                if (prompt) prompt.textContent = `${terminal.currentDir}>`;
                this.print(terminal.id, `Changed directory to: ${terminal.currentDir}`, 'success');
            } else {
                this.print(terminal.id, `Directory not found: ${dir}`, 'error');
            }
        } catch (err) {
            this.print(terminal.id, `Error: ${err.message}`, 'error');
        }
    }

    listDirectory(terminal) {
        const fsSync = require('fs');
        const pathModule = require('path');

        try {
            const items = fsSync.readdirSync(terminal.currentDir);
            this.print(terminal.id, `\nDirectory: ${terminal.currentDir}\n`, 'info');

            items.forEach(item => {
                try {
                    const fullPath = pathModule.join(terminal.currentDir, item);
                    const stats = fsSync.statSync(fullPath);
                    const type = stats.isDirectory() ? '<DIR>' : '     ';
                    const size = stats.isDirectory() ? '' : this.formatSize(stats.size);
                    this.print(terminal.id, `${type}  ${item.padEnd(35)} ${size}`);
                } catch (e) {
                    this.print(terminal.id, `      ${item.padEnd(35)} <access denied>`);
                }
            });

            this.print(terminal.id, '');
        } catch (err) {
            this.print(terminal.id, `Error listing directory: ${err.message}`, 'error');
        }
    }

    formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    }

    focus() {
        const terminal = this.terminals[this.activeTerminalIndex];
        if (terminal) {
            const input = document.getElementById(`terminal-input-${terminal.id}`);
            if (input) input.focus();
        }
    }

    reset() {
        this.terminals = [];
        this.activeTerminalIndex = -1;
        this.terminalCounter = 0;
        this.init();
    }

    destroy() {
        this.terminals = [];
        this.activeTerminalIndex = -1;
    }
}

// Export for use
window.TerminalManager = TerminalManager;

// Function to reset terminals (called when folder changes)
window.resetTerminals = function() {
    if (window.terminalManager) {
        window.terminalManager.reset();
    }
};