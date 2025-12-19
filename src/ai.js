// AI Manager - Multi-provider support for ByteCode IDE
// Supports: Claude, OpenAI, Gemini, OpenRouter, LM Studio, Ollama, and Puter.js (free)

class AIManager {
    constructor() {
        this.providers = {
            groq: { name: 'Groq (Free)', enabled: false, requiresKey: true },
            claude: { name: 'Claude (Anthropic)', enabled: false, requiresKey: true },
            openai: { name: 'OpenAI', enabled: false, requiresKey: true },
            gemini: { name: 'Google Gemini', enabled: false, requiresKey: true },
            openrouter: { name: 'OpenRouter', enabled: false, requiresKey: true },
            lmstudio: { name: 'LM Studio (Local)', enabled: true, requiresKey: false },
            ollama: { name: 'Ollama (Local)', enabled: true, requiresKey: false },
            puter: { name: 'Puter.js (Free but limited) ', enabled: true, requiresKey: false }
        };

        this.config = {
            currentProvider: 'puter', // Puter.js by default
            apiKeys: {},
            endpoints: {
                lmstudio: 'http://localhost:1234/v1',
                ollama: 'http://localhost:11434',
                groq: 'https://api.groq.com/openai/v1'
            },
            models: {
                groq: 'llama-3.3-70b-versatile',
                claude: 'claude-3-5-sonnet-20241022',
                openai: 'gpt-4o',
                gemini: 'gemini-2.0-flash-exp',
                openrouter: 'anthropic/claude-3.5-sonnet',
                lmstudio: 'local-model',
                ollama: 'llama3.2',
                puter: 'claude-3-5-sonnet-latest'
            },
            temperature: 0.7,
            maxTokens: 4096
        };

        this.conversationHistory = [];
        this.loadConfig();
    }

    loadConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const { app } = require('electron').remote || require('@electron/remote');
            const configPath = path.join(app.getPath('userData'), 'ai-config.json');

            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf8');
                const savedConfig = JSON.parse(data);

                // Deep merge models to ensure new providers are supported
                const defaultModels = this.config.models;
                this.config = { ...this.config, ...savedConfig };
                this.config.models = { ...defaultModels, ...(savedConfig.models || {}) };

                // Update provider enabled status based on API keys
                for (const [provider, info] of Object.entries(this.providers)) {
                    if (info.requiresKey) {
                        this.providers[provider].enabled = !!this.config.apiKeys[provider];
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load AI config:', err);
        }
    }

    saveConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const { app } = require('electron').remote || require('@electron/remote');
            const configPath = path.join(app.getPath('userData'), 'ai-config.json');

            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
        } catch (err) {
            console.error('Failed to save AI config:', err);
        }
    }

    setApiKey(provider, apiKey) {
        this.config.apiKeys[provider] = apiKey;
        this.providers[provider].enabled = !!apiKey;
        this.saveConfig();
    }

    setProvider(provider) {
        if (this.providers[provider] && this.providers[provider].enabled) {
            this.config.currentProvider = provider;
            this.saveConfig();
            return true;
        }
        return false;
    }

    setModel(provider, model) {
        this.config.models[provider] = model;
        this.saveConfig();
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    async chat(message, systemPrompt = null, useHistory = true) {
        const provider = this.config.currentProvider;

        if (!this.providers[provider].enabled) {
            throw new Error(`Provider ${provider} is not enabled or configured`);
        }

        // AGENT: Add user message to history
        if (useHistory) {
            this.conversationHistory.push({ role: 'user', content: message });
        }

        // AGENT: prepare system prompt with tools
        const agentSystemPrompt = this.getAgentSystemPrompt() + (systemPrompt ? '\n' + systemPrompt : '');

        let finalResponse;
        let iterations = 0;
        const MAX_ITERATIONS = 5; // Prevent infinite loops

        while (iterations < MAX_ITERATIONS) {
            iterations++;

            try {
                let response;
                if (provider === 'puter') {
                    // Pass explicit system prompt for Puter/Claude
                    response = await this.chatWithPuter(null, agentSystemPrompt);
                    // Note: chatWithPuter implementation handles history from this.conversationHistory
                } else {
                    switch (provider) {
                        case 'groq': response = await this.chatWithGroq(message, agentSystemPrompt); break;
                        case 'claude': response = await this.chatWithClaude(message, agentSystemPrompt); break;
                        case 'openai': response = await this.chatWithOpenAI(message, agentSystemPrompt); break;
                        case 'gemini': response = await this.chatWithGemini(message, agentSystemPrompt); break;
                        case 'openrouter': response = await this.chatWithOpenRouter(message, agentSystemPrompt); break;
                        case 'lmstudio': response = await this.chatWithLMStudio(message, agentSystemPrompt); break;
                        case 'ollama': response = await this.chatWithOllama(message, agentSystemPrompt); break;
                    }
                }

                // Parse for Tool Calls
                const toolCall = this.parseToolCall(response);

                if (toolCall) {
                    // It's a tool call! Execute it.
                    console.log(`[Agent] Executing tool: ${toolCall.tool}`);

                    // Add AI's tool call to history
                    this.conversationHistory.push({ role: 'assistant', content: response });

                    const result = await this.executeTool(toolCall.tool, toolCall.args);
                    const toolOutput = `Tool '${toolCall.tool}' output:\n${result}`;

                    // Feed back as user message (simulating system output)
                    this.conversationHistory.push({ role: 'user', content: toolOutput });

                    // Loop again to let AI process the result
                    message = toolOutput; // Update message for providers that don't rely only on history array in same way
                    continue;
                } else {
                    // It's a final response
                    if (useHistory && response) {
                        this.conversationHistory.push({ role: 'assistant', content: response });
                    }
                    finalResponse = response;
                    break;
                }

            } catch (error) {
                console.error(`AI Agent Error (${provider}):`, error);
                throw error;
            }
        }

        return finalResponse || "I encountered an error or loop while trying to help.";
    }

    getAgentSystemPrompt() {
        // Getting current context
        const currentPath = window.currentFolder ? window.currentFolder.path : 'No folder opened';
        const openFilesList = window.openFiles ? window.openFiles.map(f => f.name).join(', ') : 'None';

        const currentFile = (window.openFiles && typeof window.currentFileIndex === 'number' && window.currentFileIndex >= 0)
            ? window.openFiles[window.currentFileIndex]
            : null;
        const currentFileName = currentFile?.name || 'None';
        const currentFilePath = currentFile?.path || 'None';
        const currentFileLanguage = currentFile?.language || 'Unknown';
        const uiLanguage = window.currentLang || 'en';

        return `You are ByteCode AI, an autonomous coding agent embedded in an Electron IDE.
You can use tools to read files, list files, and run commands to help the user.
Be careful: avoid destructive actions, avoid overwriting files unless explicitly requested, and avoid running risky commands.

LANGUAGE:
- Always respond in the user's UI language: ${uiLanguage}. If the user writes in another language, still answer in ${uiLanguage} unless asked otherwise.

Current Context:
- Workspace: ${currentPath}
- Open Files: ${openFilesList}
- Current File: ${currentFileName}
- Current File Path: ${currentFilePath}
- Current File Language: ${currentFileLanguage}
- OS: Windows

AVAILABLE TOOLS:
To use a tool, you MUST reply with ONLY a JSON object in this exact format:
{
  "tool": "toolName",
  "args": { "arg1": "value" }
}

Tools:
1. read_file(path)
   - Read content of a file. Use absolute paths or relative to workspace.
   - Example: { "tool": "read_file", "args": { "path": "src/index.js" } }

2. write_file(path, content)
   - Create a file. Overwriting is only allowed if explicitly asked.
   - Example: { "tool": "write_file", "args": { "path": "test.js", "content": "console.log('Hi')" } }

3. apply_patch(path, patch)
   - Apply a unified-diff patch to an existing file.
   - Use this to modify files safely instead of rewriting full files.
   - The patch MUST be a standard unified diff with lines starting with: "---", "+++", "@@", "+", "-", or space.
   - Example: { "tool": "apply_patch", "args": { "path": "src/app.js", "patch": "--- a/src/app.js\n+++ b/src/app.js\n@@\n- old\n+ new\n" } }

4. remove_comments(path, language)
   - Remove comments from a file and write it back.
   - Use this instead of apply_patch when the user asks to "remove comments".
   - Supported languages: python
   - Example: { "tool": "remove_comments", "args": { "path": "app.py", "language": "python" } }

5. run_command(command)
   - Run a terminal command.
   - Example: { "tool": "run_command", "args": { "command": "npm install" } }

6. list_files(path)
   - List files in a directory.
   - Example: { "tool": "list_files", "args": { "path": "." } }

IMPORTANT RULES:
1. FORCE JSON: When you want to use a tool, you MUST output **ONLY** the JSON object. Do NOT add preamble like "I will create the file..." or "Here is the JSON". Just the JSON.
   - No extra text.
   - No markdown.
   - No emojis.
2. NO MARKDOWN FOR TOOLS: Do not wrap the tool JSON in markdown blocks if you can avoid it, but if you do, use \`\`\`json.
3. If you want to speak to the user, write normal text WITHOUT any JSON tool call.
4. Do not overwrite files unless the user explicitly requested overwriting.
5. Do not run destructive commands (delete, format, rm -rf, del, etc.). If the user requests them, ask for confirmation and propose a safer alternative.
6. Prefer apply_patch over write_file for editing existing files.
`;
    }

    parseToolCall(response) {
        try {
            const trimmed = String(response || '').trim();

            // STRICT MODE:
            // Only accept a tool call if the entire response is JSON (or a single ```json``` block).
            // This avoids executing JSON embedded inside normal text (common with local models).

            // 1) Pure JSON response
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const data = JSON.parse(trimmed);
                    if (this.isValidTool(data)) return data;
                } catch (e) { }
            }

            // 2) Entire response is exactly one JSON code block
            const codeBlockOnly = trimmed.match(/^```json\s*([\s\S]*?)\s*```$/);
            if (codeBlockOnly) {
                const inner = codeBlockOnly[1].trim();
                if (inner.startsWith('{') && inner.endsWith('}')) {
                    try {
                        const data = JSON.parse(inner);
                        if (this.isValidTool(data)) return data;
                    } catch (e) { }
                }
            }

        } catch (e) {
            console.warn('Tool parse check failed:', e);
        }
        return null;
    }

    isValidTool(data) {
        return data && typeof data.tool === 'string' && data.args && typeof data.args === 'object';
    }

    async executeTool(name, args) {
        const fs = require('fs');
        const path = require('path');
        const { ipcRenderer } = require('electron');

        // Resolve path relative to current folder if needed
        const resolvePath = (p) => {
            if (path.isAbsolute(p)) return p;
            if (window.currentFolder) return path.join(window.currentFolder.path, p);
            return p;
        };

        try {
            switch (name) {
                case 'read_file':
                    return fs.readFileSync(resolvePath(args.path), 'utf8');

                case 'write_file':
                    const targetPath = resolvePath(args.path);
                    const overwrite = !!args.overwrite;

                    if (fs.existsSync(targetPath) && !overwrite) {
                        return `Refused to overwrite existing file: ${targetPath}. To overwrite, set args.overwrite=true or ask the user explicitly.`;
                    }

                    fs.writeFileSync(targetPath, args.content, 'utf8');
                    // Refresh folder tree
                    if (window.currentFolder) ipcRenderer.send('refresh-folder', window.currentFolder.path);
                    // Refresh open file in editor if it's the same file
                    this.refreshOpenFile(targetPath, args.content);
                    return `File written successfully to ${targetPath}`;

                case 'apply_patch':
                    if (!args || typeof args.path !== 'string' || typeof args.patch !== 'string') {
                        return 'Tool Execution Error: apply_patch requires args.path (string) and args.patch (string).';
                    }

                    const filePath = resolvePath(args.path);
                    if (!fs.existsSync(filePath)) {
                        return `Tool Execution Error: File does not exist: ${filePath}`;
                    }

                    // Very small safety check: ensure it looks like a unified diff
                    const patchText = args.patch;
                    if (!patchText.includes('---') || !patchText.includes('+++') || !patchText.includes('@@')) {
                        return 'Tool Execution Error: Patch must be a unified diff containing --- / +++ / @@ lines.';
                    }

                    // Apply patch using a lightweight JS implementation
                    // Note: kept minimal to avoid extra dependencies.
                    const original = fs.readFileSync(filePath, 'utf8');
                    const patched = this.applyUnifiedDiff(original, patchText);
                    fs.writeFileSync(filePath, patched, 'utf8');

                    // Refresh folder tree
                    if (window.currentFolder) ipcRenderer.send('refresh-folder', window.currentFolder.path);
                    // Refresh open file in editor
                    this.refreshOpenFile(filePath, patched);
                    return `Patch applied successfully to ${filePath}`;

                case 'remove_comments':
                    if (!args || typeof args.path !== 'string') {
                        return 'Tool Execution Error: remove_comments requires args.path (string).';
                    }
                    const lang = String(args.language || '').toLowerCase();
                    if (lang !== 'python') {
                        return `Tool Execution Error: remove_comments currently supports only language=python.`;
                    }

                    const commentFilePath = resolvePath(args.path);
                    if (!fs.existsSync(commentFilePath)) {
                        return `Tool Execution Error: File does not exist: ${commentFilePath}`;
                    }

                    const originalText = fs.readFileSync(commentFilePath, 'utf8');
                    const cleaned = this.removePythonComments(originalText);
                    fs.writeFileSync(commentFilePath, cleaned, 'utf8');
                    // Refresh folder tree
                    if (window.currentFolder) ipcRenderer.send('refresh-folder', window.currentFolder.path);
                    // Refresh open file in editor
                    this.refreshOpenFile(commentFilePath, cleaned);
                    return `Comments removed from ${commentFilePath}`;

                case 'run_command':
                    if (typeof args.command !== 'string' || !args.command.trim()) {
                        return 'Tool Execution Error: Missing command.';
                    }

                    // Basic safety: block obviously destructive commands
                    const cmd = args.command.trim();
                    const lower = cmd.toLowerCase();
                    const destructivePatterns = [
                        /^rm\s+-rf\b/,
                        /^rm\s+-r\s+-f\b/,
                        /^del\b/,
                        /^erase\b/,
                        /^rmdir\b/,
                        /^rd\b/,
                        /^format\b/,
                        /^diskpart\b/,
                        /^powershell\b.*\bremove-item\b/,
                    ];
                    if (destructivePatterns.some(r => r.test(lower))) {
                        return `Refused to run potentially destructive command: ${cmd}`;
                    }

                    return new Promise((resolve) => {
                        ipcRenderer.send('execute-terminal-command', {
                            command: cmd,
                            cwd: window.currentFolder ? window.currentFolder.path : process.cwd()
                        });
                        ipcRenderer.once('terminal-command-result', (e, res) => {
                            resolve(res.stdout || res.stderr || (res.error ? 'Error: ' + res.error : 'Command executed.'));
                        });
                    });

                case 'list_files':
                    const dirPath = resolvePath(args.path);
                    const files = fs.readdirSync(dirPath);
                    return files.join('\n');

                default:
                    return `Unknown tool: ${name}`;
            }
        } catch (err) {
            return `Tool Execution Error: ${err.message}`;
        }
    }

    // Refresh a file that's currently open in the editor
    refreshOpenFile(filePath, newContent) {
        try {
            if (!window.openFiles || !window.editor) return;
            
            const fileIndex = window.openFiles.findIndex(f => f.path === filePath);
            if (fileIndex >= 0) {
                // Update the file content in memory
                window.openFiles[fileIndex].content = newContent;
                window.openFiles[fileIndex].modified = false;
                
                // If this file is currently displayed, update the editor
                if (fileIndex === window.currentFileIndex) {
                    const currentPosition = window.editor.getPosition();
                    const currentScrollTop = window.editor.getScrollTop();
                    
                    // Temporarily disable change tracking
                    window.isOpeningFile = true;
                    window.editor.setValue(newContent);
                    window.isOpeningFile = false;
                    
                    // Restore cursor position and scroll
                    if (currentPosition) {
                        window.editor.setPosition(currentPosition);
                    }
                    window.editor.setScrollTop(currentScrollTop);
                }
                
                // Update tabs to remove modified indicator
                if (window.updateEditorTabs) {
                    window.updateEditorTabs();
                }
            }
        } catch (e) {
            console.error('Failed to refresh open file:', e);
        }
    }

    removePythonComments(text) {
        // Conservative comment remover:
        // - keeps shebang and encoding lines
        // - removes full-line comments (after optional whitespace)
        // - keeps inline comments intact (safer; avoids breaking strings)
        const lines = String(text || '').split(/\r?\n/);
        const out = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Keep shebang / encoding
            if (i === 0 && trimmed.startsWith('#!')) {
                out.push(line);
                continue;
            }
            if (i <= 1 && /^#\s*-\*-\s*coding\s*:\s*[-\w.]+\s*-\*-\s*$/i.test(trimmed)) {
                out.push(line);
                continue;
            }

            // Remove full-line comments
            if (trimmed.startsWith('#')) {
                continue;
            }

            out.push(line);
        }

        return out.join('\n');
    }

    applyUnifiedDiff(originalText, diffText) {
        // Flexible unified diff applier that handles AI-generated patches
        // More tolerant of whitespace differences and context mismatches
        const originalLines = originalText.split(/\r?\n/);
        const diffLines = diffText.split(/\r?\n/);

        const out = [];
        let origIndex = 0;
        let i = 0;

        const parseHunkHeader = (line) => {
            // @@ -start,count +start,count @@ optional context
            const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
            if (!m) return null;
            return {
                oldStart: parseInt(m[1], 10),
                oldCount: m[2] ? parseInt(m[2], 10) : 1,
                newStart: parseInt(m[3], 10),
                newCount: m[4] ? parseInt(m[4], 10) : 1,
            };
        };

        // Normalize line for comparison (trim trailing whitespace)
        const normalizeLine = (line) => (line || '').trimEnd();

        // Find best match for a context line (fuzzy matching)
        const findContextMatch = (expected, startFrom) => {
            const normalizedExpected = normalizeLine(expected);
            // First try exact position
            if (startFrom < originalLines.length && 
                normalizeLine(originalLines[startFrom]) === normalizedExpected) {
                return startFrom;
            }
            // Search nearby (within 5 lines)
            for (let offset = 1; offset <= 5; offset++) {
                if (startFrom + offset < originalLines.length &&
                    normalizeLine(originalLines[startFrom + offset]) === normalizedExpected) {
                    return startFrom + offset;
                }
                if (startFrom - offset >= 0 &&
                    normalizeLine(originalLines[startFrom - offset]) === normalizedExpected) {
                    return startFrom - offset;
                }
            }
            return -1;
        };

        // Skip file header lines until first hunk
        while (i < diffLines.length && !diffLines[i].startsWith('@@')) i++;

        // If no hunks found, return original
        if (i >= diffLines.length) {
            console.warn('No hunks found in patch, returning original');
            return originalText;
        }

        while (i < diffLines.length) {
            const header = diffLines[i];
            const hunk = parseHunkHeader(header);
            if (!hunk) {
                i++;
                continue;
            }
            i++;

            // Copy lines before this hunk
            const targetIndex = Math.max(0, hunk.oldStart - 1);
            while (origIndex < targetIndex && origIndex < originalLines.length) {
                out.push(originalLines[origIndex++]);
            }

            // Process hunk lines
            while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
                const line = diffLines[i];
                
                // Handle empty lines in diff (treat as context)
                if (line === '' || line === ' ') {
                    if (origIndex < originalLines.length) {
                        out.push(originalLines[origIndex++]);
                    }
                    i++;
                    continue;
                }

                const prefix = line[0];
                const content = line.slice(1);

                if (prefix === ' ') {
                    // Context line - be tolerant of whitespace differences
                    const matchIdx = findContextMatch(content, origIndex);
                    if (matchIdx >= 0) {
                        // Copy any skipped lines
                        while (origIndex < matchIdx) {
                            out.push(originalLines[origIndex++]);
                        }
                        out.push(originalLines[origIndex++]);
                    } else {
                        // Context doesn't match - just copy original and continue
                        console.warn(`Patch context mismatch at line ${origIndex + 1}, continuing anyway`);
                        if (origIndex < originalLines.length) {
                            out.push(originalLines[origIndex++]);
                        }
                    }
                } else if (prefix === '-') {
                    // Delete line - verify it matches (with tolerance)
                    if (origIndex < originalLines.length) {
                        const normalizedOrig = normalizeLine(originalLines[origIndex]);
                        const normalizedContent = normalizeLine(content);
                        if (normalizedOrig === normalizedContent) {
                            origIndex++; // Skip this line (delete it)
                        } else {
                            // Try to find the line nearby
                            const matchIdx = findContextMatch(content, origIndex);
                            if (matchIdx >= 0 && matchIdx > origIndex) {
                                // Copy lines before the match, then skip the matched line
                                while (origIndex < matchIdx) {
                                    out.push(originalLines[origIndex++]);
                                }
                                origIndex++; // Skip the matched line
                            } else {
                                console.warn(`Patch delete mismatch at line ${origIndex + 1}, skipping delete`);
                            }
                        }
                    }
                } else if (prefix === '+') {
                    // Add line
                    out.push(content);
                } else if (line.startsWith('\\ No newline at end of file')) {
                    // ignore
                } else if (line.startsWith('---') || line.startsWith('+++')) {
                    // ignore file headers within diff body
                } else {
                    // Unknown prefix - treat as context if it looks like code
                    if (line.trim() && origIndex < originalLines.length) {
                        out.push(originalLines[origIndex++]);
                    }
                }
                i++;
            }
        }

        // Copy remaining lines
        while (origIndex < originalLines.length) {
            out.push(originalLines[origIndex++]);
        }

        return out.join('\n');
    }

    async chatWithGroq(message, systemPrompt) {
        const messages = this.buildMessages(message, systemPrompt);
        const apiKey = this.config.apiKeys.groq;

        if (!apiKey) {
            throw new Error('Groq API key is required. Please add your free API key in AI Settings. Get one at https://console.groq.com/keys');
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: this.config.models.groq,
                messages: messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async chatWithClaude(message, systemPrompt) {
        const messages = this.buildMessages(message, systemPrompt);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKeys.claude,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.config.models.claude,
                messages: messages.filter(m => m.role !== 'system'),
                system: systemPrompt || undefined,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    async chatWithOpenAI(message, systemPrompt) {
        const messages = this.buildMessages(message, systemPrompt);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKeys.openai}`
            },
            body: JSON.stringify({
                model: this.config.models.openai,
                messages: messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async chatWithGemini(message, systemPrompt) {
        const apiKey = this.config.apiKeys.gemini;
        const model = this.config.models.gemini;

        const messages = this.buildMessages(message, systemPrompt);
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        temperature: this.config.temperature,
                        maxOutputTokens: this.config.maxTokens
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    async chatWithOpenRouter(message, systemPrompt) {
        const messages = this.buildMessages(message, systemPrompt);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKeys.openrouter}`,
                'HTTP-Referer': 'https://github.com/ByteCode-Team/bytecode',
                'X-Title': 'ByteCode IDE'
            },
            body: JSON.stringify({
                model: this.config.models.openrouter,
                messages: messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async chatWithLMStudio(message, systemPrompt) {
        const messages = this.buildMessages(message, systemPrompt);

        const response = await fetch(`${this.config.endpoints.lmstudio}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config.models.lmstudio,
                messages: messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            })
        });

        if (!response.ok) {
            throw new Error(`LM Studio error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async chatWithOllama(message, systemPrompt) {
        const messages = this.buildMessages(message, systemPrompt);

        const response = await fetch(`${this.config.endpoints.ollama}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config.models.ollama,
                messages: messages,
                stream: false,
                options: {
                    temperature: this.config.temperature,
                    num_predict: this.config.maxTokens
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.message.content;
    }

    async chatWithPuter(message, systemPrompt) {
        // Check both global scope and window
        const puterInstance = (typeof puter !== 'undefined' ? puter : window.puter);

        if (!puterInstance) {
            console.error('Puter.js object not found in global scope or window');
            throw new Error('Puter.js is not loaded. Please restart the app and check your internet connection.');
        }

        const messages = this.buildMessages(message, systemPrompt);
        const model = this.config.models.puter || 'claude-3-5-sonnet-latest';

        try {
            const response = await puterInstance.ai.chat(messages, { model: model });
            console.log('Puter Response:', response); // For debugging

            // Handle various Puter.js response formats
            // Handle various Puter.js response formats
            // Debug: console.log('Raw Puter response:', response);

            if (typeof response === 'string') return response;

            const content = response?.message?.content;

            // Check for array content (Multimodal / modern Claude format)
            // Example: [{ type: "text", text: "Hello..." }]
            if (Array.isArray(content)) {
                return content.map(item => {
                    if (typeof item === 'string') return item;
                    return item.text || '';
                }).join('');
            }

            // Fallback for simple string content
            if (content) return content;

            if (response?.content) return response.content;
            if (response?.text) return response.text;

            // If we get here, we have an object but don't know where the text is.
            // Return stringified JSON so we can at least see what it is.
            return JSON.stringify(response, null, 2);
        } catch (err) {
            console.error('Puter.js error:', err);
            const errorMessage = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
            throw new Error('Puter.js error: ' + errorMessage);
        }
    }

    buildMessages(message, systemPrompt) {
        const messages = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // Add recent conversation history (last 10 messages)
        messages.push(...this.conversationHistory.slice(-10));

        // Add current message if not already in history AND if it is valid
        if (message && (!this.conversationHistory.length ||
            this.conversationHistory[this.conversationHistory.length - 1].content !== message)) {
            messages.push({ role: 'user', content: message });
        }

        return messages;
    }

    // Agent mode - specialized prompts for coding assistance
    async analyzeCode(code, language) {
        const prompt = `Analyze this ${language} code and provide:
1. Code quality assessment
2. Potential bugs or issues
3. Performance improvements
4. Best practices recommendations

\`\`\`${language}
${code}
\`\`\``;

        return await this.chat(prompt, 'You are an expert code reviewer and software architect.', false);
    }

    async explainCode(code, language) {
        const prompt = `Explain this ${language} code in detail:

\`\`\`${language}
${code}
\`\`\``;

        return await this.chat(prompt, 'You are an expert programming tutor. Explain code clearly and concisely.', false);
    }

    async fixCode(code, language, issue) {
        const prompt = `Fix this ${language} code. Issue: ${issue}

\`\`\`${language}
${code}
\`\`\`

Provide the corrected code with explanations.`;

        return await this.chat(prompt, 'You are an expert programmer. Fix code issues efficiently.', false);
    }

    async generateCode(description, language) {
        const prompt = `Generate ${language} code for: ${description}

Provide clean, well-commented, production-ready code.`;

        return await this.chat(prompt, 'You are an expert programmer. Write clean, efficient, and well-documented code.', false);
    }

    async refactorCode(code, language) {
        const prompt = `Refactor this ${language} code to improve quality, readability, and performance:

\`\`\`${language}
${code}
\`\`\``;

        return await this.chat(prompt, 'You are an expert in code refactoring and software design patterns.', false);
    }

    async addComments(code, language) {
        const prompt = `Add detailed comments to this ${language} code:

\`\`\`${language}
${code}
\`\`\``;

        return await this.chat(prompt, 'You are an expert at writing clear and helpful code documentation.', false);
    }

    getAvailableProviders() {
        return Object.entries(this.providers)
            .filter(([_, info]) => info.enabled)
            .map(([key, info]) => ({ key, name: info.name }));
    }

    getCurrentProvider() {
        return {
            key: this.config.currentProvider,
            name: this.providers[this.config.currentProvider].name
        };
    }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIManager;
}
