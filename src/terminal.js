// Multi-Terminal Manager with xterm.js
(function () {
    const { Terminal } = require('xterm');
    const { FitAddon } = require('xterm-addon-fit');
    // Use local require to avoid global pollution if possible, or just re-require.
    // Electron's require is available in renderer.
    const electron = require('electron');
    const ipcRenderer = electron.ipcRenderer;
    const path = require('path');
    const fs = require('fs');

    // Inject xterm CSS and custom Dropdown CSS
    try {
        const xtermCssPath = require.resolve('xterm/css/xterm.css');
        if (fs.existsSync(xtermCssPath)) {
            const xtermCssContent = fs.readFileSync(xtermCssPath, 'utf8');
            const styleParams = document.createElement('style');
            styleParams.textContent = xtermCssContent;
            document.head.appendChild(styleParams);
        }
    } catch (e) {
        console.error('Failed to load xterm css', e);
    }

    // Add custom styles for the terminal AND the dropdown
    if (!document.getElementById('terminal-custom-styles')) {
        const customStyles = document.createElement('style');
        customStyles.id = 'terminal-custom-styles';
        customStyles.textContent = `
            .terminal-content {
                padding: 0;
                background-color: #1e1e1e;
                height: calc(100% - 35px);
                width: 100%;
                overflow: hidden;
                position: relative;
            }
            .terminal-instance {
                width: 100%;
                height: 100%;
                position: absolute;
                top: 0;
                left: 0;
                visibility: hidden;
            }
            .terminal-instance.active {
                visibility: visible;
                z-index: 1;
            }
            .xterm-viewport::-webkit-scrollbar {
                width: 10px;
            }
            .xterm-viewport::-webkit-scrollbar-track {
                background: #1e1e1e;
            }
            .xterm-viewport::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 5px;
            }
            
            /* Dropdown Styles */
            .terminal-new-group {
                display: flex;
                align-items: center;
                margin-right: 6px;
                position: relative; /* For absolute positioning of dropdown */
            }
            
            .terminal-action-btn.primary {
                border-top-right-radius: 0;
                border-bottom-right-radius: 0;
                margin-right: 0;
                background-color: transparent;
                border: 1px solid transparent; /* Reserve space for border */
                color: #cccccc;
            }
            .terminal-action-btn.primary:hover {
                 background-color: #333333;
                 color: #ffffff;
            }

            .terminal-dropdown-btn {
                background: transparent;
                border: 1px solid transparent;
                color: #cccccc;
                cursor: pointer;
                font-size: 8px; /* Smaller arrow */
                padding: 0 2px;
                height: 24px;
                width: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-top-right-radius: 4px;
                border-bottom-right-radius: 4px;
                margin-left: -1px; /* Visual join */
            }
            .terminal-dropdown-btn:hover {
                background-color: #333333;
                color: #ffffff;
            }
            
            .shell-dropdown-menu {
                position: absolute;
                top: 100%; /* Below the button */
                right: 0;
                margin-top: 4px;
                background: #252526;
                border: 1px solid #454545;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                border-radius: 3px;
                z-index: 9999;
                display: none;
                min-width: 180px;
                padding: 4px 0;
            }
            .shell-dropdown-menu.visible {
                display: block;
                animation: fadeIn 0.1s ease-out;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .shell-item {
                padding: 6px 12px;
                cursor: pointer;
                color: #cccccc;
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background 0.1s;
            }
            .shell-item:hover {
                background: #094771; /* VS Code Blue selection */
                color: #ffffff;
            }
            .shell-icon {
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 10px;
                background: #333;
                border-radius: 3px;
                color: #eee;
            }
        `;
        document.head.appendChild(customStyles);
    }

    class TerminalManager {
        constructor(container) {
            this.container = container;
            this.terminals = [];
            this.activeTerminalIndex = -1;
            this.terminalCounter = 0;
            this.defaultShell = null; // Will use backend default if null
            this.availableShells = [
                { name: 'PowerShell', path: 'powershell.exe', icon: 'PS' },
                { name: 'Command Prompt', path: 'cmd.exe', icon: 'CMD' },
                { name: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe', icon: 'GB' },
                { name: 'WSL', path: 'wsl.exe', icon: 'WSL' }
            ];
            this.init();

            // Listen for incoming data from main process
            ipcRenderer.removeAllListeners('terminal-incoming-data');
            ipcRenderer.on('terminal-incoming-data', (event, { id, data }) => {
                const terminal = this.getTerminalById(id);
                if (terminal) {
                    terminal.xterm.write(data);
                }
            });

            ipcRenderer.removeAllListeners('terminal-exited');
            ipcRenderer.on('terminal-exited', (event, { id, exitCode }) => {
                const terminalIndex = this.terminals.findIndex(t => t.id === id);
                if (terminalIndex !== -1) {
                    this.closeTerminal(terminalIndex);
                }
            });

            window.addEventListener('resize', () => this.fitActiveTerminal());

            // Click outside to close dropdown
            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('shell-dropdown');
                const btn = document.getElementById('shell-dropdown-btn');

                if (dropdown && dropdown.classList.contains('visible')) {
                    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                        dropdown.classList.remove('visible');
                    }
                }
            });
        }

        init() {
            this.container.innerHTML = `
                <div class="terminal-header">
                    <div class="terminal-tabs" id="terminal-tabs"></div>
                    <div class="terminal-actions">
                        <div class="terminal-new-group">
                            <button class="terminal-action-btn primary" onclick="window.terminalManager.createTerminal()" title="New Terminal (Default)">+</button>
                            <button class="terminal-dropdown-btn" id="shell-dropdown-btn" onclick="window.terminalManager.toggleShellDropdown(event)" title="Select Shell">▼</button>
                            <div class="shell-dropdown-menu" id="shell-dropdown"></div>
                        </div>
                        <button class="terminal-close" onclick="window.toggleTerminal ? window.toggleTerminal() : null">×</button>
                    </div>
                </div>
                <div class="terminal-content" id="terminal-content"></div>
            `;

            this.renderShellDropdown();

            // Wait slightly for DOM to be ready
            setTimeout(() => this.createTerminal(), 10);
        }

        renderShellDropdown() {
            const dropdown = document.getElementById('shell-dropdown');
            if (!dropdown) return;

            dropdown.innerHTML = '';

            this.availableShells.forEach(shell => {
                const item = document.createElement('div');
                item.className = 'shell-item';
                item.innerHTML = `<span class="shell-icon">${shell.icon}</span> ${shell.name}`;
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.createTerminal(null, shell.path, shell.name);
                    dropdown.classList.remove('visible');
                };
                dropdown.appendChild(item);
            });
        }

        toggleShellDropdown(e) {
            if (e) e.stopPropagation();
            const dropdown = document.getElementById('shell-dropdown');
            if (dropdown) {
                dropdown.classList.toggle('visible');
            }
        }



        createTerminal(initialDir = null, shellPath = null, shellName = null) {
            this.terminalCounter++;
            const terminalId = this.terminalCounter;
            const currentFolder = window.currentFolder ? window.currentFolder.path : process.cwd();
            const dir = initialDir || currentFolder;

            // Use provided shell path or fall back to default (null sends undefined to main, main picks default)
            const finalShellPath = shellPath || this.defaultShell;

            const contentDiv = document.getElementById('terminal-content');
            if (!contentDiv) return;

            const termContainer = document.createElement('div');
            termContainer.className = 'terminal-instance';
            termContainer.id = `terminal-${terminalId}`;
            contentDiv.appendChild(termContainer);

            const xterm = new Terminal({
                cursorBlink: true,
                theme: {
                    background: '#1e1e1e',
                    foreground: '#ffffff',
                    selectionBackground: 'rgba(255, 255, 255, 0.3)'
                },
                fontFamily: 'Consolas, "Courier New", monospace',
                fontSize: 14,
                allowProposedApi: true
            });

            const fitAddon = new FitAddon();
            xterm.loadAddon(fitAddon);
            xterm.open(termContainer);


            // Send input to main process
            xterm.onData(data => {
                ipcRenderer.send('terminal-input', { id: terminalId, data });
            });

            // Create terminal on backend
            // We delay fit slightly to ensure size is calculated correctly
            setTimeout(() => {
                fitAddon.fit();
                const dims = fitAddon.proposeDimensions();
                const cols = dims ? dims.cols : 80;
                const rows = dims ? dims.rows : 24;

                ipcRenderer.send('terminal-create', {
                    id: terminalId,
                    cols,
                    rows,
                    cwd: dir,
                    shellPath: finalShellPath
                });
            }, 50);

            // Determine name
            let name = shellName || (finalShellPath ? path.basename(finalShellPath, '.exe') : 'Terminal');
            // If it's just 'Terminal' include ID
            if (name === 'Terminal') name = `Terminal ${terminalId}`;

            const terminal = {
                id: terminalId,
                name: name,
                xterm: xterm,
                fitAddon: fitAddon,
                element: termContainer,
                dir: dir
            };

            this.terminals.push(terminal);
            this.switchToTerminal(this.terminals.length - 1);
            this.updateTabs();

            return terminal;
        }

        switchToTerminal(index) {
            if (index < 0 || index >= this.terminals.length) return;

            // Hide all terminals
            this.terminals.forEach(t => {
                t.element.classList.remove('active');
            });

            this.activeTerminalIndex = index;
            const activeTerm = this.terminals[index];

            // Show active terminal
            activeTerm.element.classList.add('active');
            activeTerm.xterm.focus();

            // Refit after making visible
            setTimeout(() => {
                this.fitActiveTerminal();
            }, 0);

            this.updateTabs();
        }

        closeTerminal(index) {
            if (index < 0 || index >= this.terminals.length) return;

            const terminal = this.terminals[index];

            // Kill backend process
            ipcRenderer.send('terminal-close', { id: terminal.id });

            // Cleanup frontend
            terminal.xterm.dispose();
            terminal.element.remove();

            this.terminals.splice(index, 1);

            if (this.terminals.length === 0) {
                // If no terminals left, create a new one
                this.createTerminal();
            } else {
                if (this.activeTerminalIndex >= this.terminals.length) {
                    this.activeTerminalIndex = this.terminals.length - 1;
                }
                this.switchToTerminal(this.activeTerminalIndex);
            }

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

        getTerminalById(id) {
            return this.terminals.find(t => t.id === id);
        }

        fitActiveTerminal() {
            const terminal = this.terminals[this.activeTerminalIndex];
            if (terminal && terminal.fitAddon) {
                try {
                    terminal.fitAddon.fit();
                    const dims = terminal.fitAddon.proposeDimensions();
                    if (dims) {
                        ipcRenderer.send('terminal-resize', {
                            id: terminal.id,
                            cols: dims.cols,
                            rows: dims.rows
                        });
                    }
                } catch (e) {
                    // Ignore fit errors if hidden
                }
            }
        }

        focus() {
            const terminal = this.terminals[this.activeTerminalIndex];
            if (terminal) {
                terminal.xterm.focus();
            }
        }

        reset() {
            // Close all existing terminals
            [...this.terminals].forEach((t, i) => this.closeTerminal(0));
            this.terminalCounter = 0;
            this.createTerminal();
        }
    }

    // Export for use
    window.TerminalManager = TerminalManager;

    // Function to reset terminals (called when folder changes)
    window.resetTerminals = function () {
        if (window.terminalManager) {
            // Instead of full reset, maybe just open a new terminal in the new folder?
            // But for now, let's keep the user's workflow simple
            // If we want to change directory of the *current* terminal, we can't easily do that with PTY
            // without sending a 'cd' command string, which is hacky.
            // Best to just spawn a new terminal.
            window.terminalManager.createTerminal(window.currentFolder ? window.currentFolder.path : null);
        }
    };
})();