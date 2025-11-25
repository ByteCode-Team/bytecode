// Terminal simple intégré
class SimpleTerminal {
    constructor(container) {
        this.container = container;
        this.output = null;
        this.input = null;
        this.currentDir = process.cwd();
        this.history = [];
        this.historyIndex = -1;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="terminal-header">
                <span class="terminal-title">Terminal</span>
                <button class="terminal-close" onclick="toggleTerminal()">×</button>
            </div>
            <div class="terminal-output" id="terminal-output"></div>
            <div class="terminal-input-container">
                <span class="terminal-prompt">${this.currentDir}></span>
                <input type="text" class="terminal-input" id="terminal-input" placeholder="Type a command...">
            </div>
        `;

        this.output = document.getElementById('terminal-output');
        this.input = document.getElementById('terminal-input');

        this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));

        this.printWelcome();
    }

    printWelcome() {
        this.print('ByteCode Terminal v1.0.0', 'info');
        this.print(`Current directory: ${this.currentDir}`, 'info');
        this.print('Type "help" for available commands\n', 'info');
    }

    print(text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${type}`;
        line.textContent = text;
        this.output.appendChild(line);
        this.output.scrollTop = this.output.scrollHeight;
    }

    handleKeyDown(e) {
        if (e.key === 'Enter') {
            const command = this.input.value.trim();
            if (command) {
                this.history.push(command);
                this.historyIndex = this.history.length;
                this.executeCommand(command);
                this.input.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.input.value = this.history[this.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                this.input.value = this.history[this.historyIndex];
            } else {
                this.historyIndex = this.history.length;
                this.input.value = '';
            }
        }
    }

    executeCommand(command) {
        this.print(`${this.currentDir}> ${command}`, 'command');

        const parts = command.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case 'help':
                this.showHelp();
                break;
            case 'clear':
                this.output.innerHTML = '';
                break;
            case 'cd':
                this.changeDirectory(args[0]);
                break;
            case 'dir':
            case 'ls':
                this.listDirectory();
                break;
            case 'pwd':
                this.print(this.currentDir);
                break;
            case 'echo':
                this.print(args.join(' '));
                break;
            case 'node':
                this.runNodeCommand(args);
                break;
            case 'npm':
                this.runNpmCommand(args);
                break;
            default:
                this.print(`Command not found: ${cmd}. Type "help" for available commands.`, 'error');
        }
    }

    showHelp() {
        this.print('Available commands:', 'info');
        this.print('  help          - Show this help message');
        this.print('  clear         - Clear the terminal');
        this.print('  cd <dir>      - Change directory');
        this.print('  ls / dir      - List directory contents');
        this.print('  pwd           - Print working directory');
        this.print('  echo <text>   - Print text');
        this.print('  node <file>   - Run a Node.js file');
        this.print('  npm <command> - Run npm command');
    }

    changeDirectory(dir) {
        if (!dir) {
            this.print('Usage: cd <directory>', 'error');
            return;
        }

        const pathModule = require('path');
        const fsSync = require('fs');

        let newPath;
        if (pathModule.isAbsolute(dir)) {
            newPath = dir;
        } else {
            newPath = pathModule.join(this.currentDir, dir);
        }

        if (fsSync.existsSync(newPath) && fsSync.statSync(newPath).isDirectory()) {
            this.currentDir = newPath;
            document.querySelector('.terminal-prompt').textContent = `${this.currentDir}>`;
            this.print(`Changed directory to: ${this.currentDir}`, 'success');
        } else {
            this.print(`Directory not found: ${dir}`, 'error');
        }
    }

    listDirectory() {
        const fsSync = require('fs');
        const pathModule = require('path');

        try {
            const items = fsSync.readdirSync(this.currentDir);
            this.print(`\nDirectory: ${this.currentDir}\n`, 'info');

            items.forEach(item => {
                const fullPath = pathModule.join(this.currentDir, item);
                const stats = fsSync.statSync(fullPath);
                const type = stats.isDirectory() ? '<DIR>' : '     ';
                const size = stats.isDirectory() ? '' : `${stats.size} bytes`;
                this.print(`${type}  ${item.padEnd(30)} ${size}`);
            });

            this.print('');
        } catch (err) {
            this.print(`Error listing directory: ${err.message}`, 'error');
        }
    }

    runNodeCommand(args) {
        if (args.length === 0) {
            this.print('Usage: node <file.js>', 'error');
            return;
        }

        const { spawn } = require('child_process');
        const pathModule = require('path');

        const filePath = pathModule.join(this.currentDir, args[0]);
        const nodeProcess = spawn('node', [filePath], { cwd: this.currentDir });

        nodeProcess.stdout.on('data', (data) => {
            this.print(data.toString(), 'success');
        });

        nodeProcess.stderr.on('data', (data) => {
            this.print(data.toString(), 'error');
        });

        nodeProcess.on('close', (code) => {
            this.print(`Process exited with code ${code}`, 'info');
        });
    }

    runNpmCommand(args) {
        if (args.length === 0) {
            this.print('Usage: npm <command>', 'error');
            return;
        }

        const { spawn } = require('child_process');
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const npmProcess = spawn(npmCmd, args, { cwd: this.currentDir, shell: true });

        npmProcess.stdout.on('data', (data) => {
            this.print(data.toString(), 'success');
        });

        npmProcess.stderr.on('data', (data) => {
            this.print(data.toString(), 'error');
        });

        npmProcess.on('close', (code) => {
            this.print(`npm exited with code ${code}`, 'info');
        });
    }

    focus() {
        this.input.focus();
    }
}

// Export pour utilisation
window.SimpleTerminal = SimpleTerminal;
