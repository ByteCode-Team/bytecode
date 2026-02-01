// Live Server Extension for ByteCode
// Uses the bytecode API as described in README.md

(function () {
    const http = require('http');
    const fs = bytecode.utils.fs;
    const path = bytecode.utils.path;

    let serverInstance = null;
    const PORT = 5500;

    function startServer() {
        if (serverInstance) {
            bytecode.ui.showNotification('Live Server is already running!', 'info');
            return;
        }

        const folder = bytecode.workspace.getFolder();
        if (!folder) {
            bytecode.ui.showNotification('Please open a folder first.', 'error');
            return;
        }

        const root = folder.path;

        serverInstance = http.createServer((req, res) => {
            let filePath = path.join(root, req.url === '/' ? 'index.html' : req.url);

            // Remove query strings
            if (filePath.includes('?')) {
                filePath = filePath.split('?')[0];
            }

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
                '.eot': 'application/vnd.ms-fontobject'
            };

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(404, { 'Content-Type': 'text/html' });
                        res.end('<h1>404 - File Not Found</h1>');
                    } else {
                        res.writeHead(500);
                        res.end('Server error: ' + err.code);
                    }
                } else {
                    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
                    res.end(data);
                }
            });
        });

        serverInstance.listen(PORT, () => {
            bytecode.ui.showNotification(`Live Server started at http://localhost:${PORT}`, 'success');
            bytecode.ui.updateStatusBarItem('live-server', `Port: ${PORT}`);

            // Open in browser
            require('electron').shell.openExternal(`http://localhost:${PORT}`);
        });

        serverInstance.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                bytecode.ui.showNotification(`Port ${PORT} is already in use!`, 'error');
            } else {
                bytecode.ui.showNotification('Server error: ' + e.message, 'error');
            }
            serverInstance = null;
            bytecode.ui.updateStatusBarItem('live-server', 'Go Live');
        });
    }

    function stopServer() {
        if (serverInstance) {
            serverInstance.close(() => {
                bytecode.ui.showNotification('Live Server stopped.', 'info');
            });
            serverInstance = null;
            bytecode.ui.updateStatusBarItem('live-server', 'Go Live');
        }
    }

    function toggleServer() {
        if (serverInstance) {
            stopServer();
        } else {
            startServer();
        }
    }

    // Add status bar item
    bytecode.ui.addStatusBarItem('live-server', 'Go Live', toggleServer);

    // Cleanup on extension unload / window close
    window.addEventListener('beforeunload', () => {
        if (serverInstance) {
            serverInstance.close();
        }
    });

    console.log('Live Server extension loaded.');
})();
