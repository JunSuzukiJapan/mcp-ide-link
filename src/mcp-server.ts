import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as vscode from 'vscode';

export class McpServerManager {
    private app: express.Express;
    private server: Server;
    private httpServer: any;
    private port = 3000;
    private transport: SSEServerTransport | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.app = express();

        this.server = new Server(
            {
                name: 'mcp-ide-link',
                version: '0.0.1',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupRoutes();
        this.setupTools();
    }

    private setupRoutes() {
        this.app.get('/sse', async (req, res) => {
            console.log('New SSE connection established');
            this.transport = new SSEServerTransport('/message', res);
            await this.server.connect(this.transport);
        });

        this.app.post('/message', async (req, res) => {
            if (this.transport) {
                // @modelcontextprotocol/sdk SSEServerTransport requires handling raw request appropriately
                // We pass req, res to it. ensure express.json() hasn't consumed the stream in a way that breaks it
                console.log('Received POST on /message');
                try {
                    await this.transport.handlePostMessage(req, res);
                } catch (err: any) {
                    console.error('Error handling POST message:', err);
                    res.status(500).send(`Error: ${err.message}`);
                }
            } else {
                res.status(400).send('No active SSE connection');
            }
        });
    }

    private setupTools() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'apply_workspace_edit',
                        description: 'Apply a workspace edit to a specific file. This replaces a target string with a replacement string. The edit remains unsaved so that the user can review and undo it.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                filePath: {
                                    type: 'string',
                                    description: 'Absolute path of the file to edit'
                                },
                                target: {
                                    type: 'string',
                                    description: 'The exact string snippet to be replaced.'
                                },
                                replacement: {
                                    type: 'string',
                                    description: 'The string to replace the target with.'
                                }
                            },
                            required: ['filePath', 'target', 'replacement']
                        }
                    },
                    {
                        name: 'rename_symbol',
                        description: 'Use the IDE language server to safely rename a symbol across the workspace.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                filePath: {
                                    type: 'string',
                                    description: 'Absolute path of the file containing the symbol'
                                },
                                line: {
                                    type: 'number',
                                    description: '0-based line number of the symbol'
                                },
                                character: {
                                    type: 'number',
                                    description: '0-based character offset of the symbol'
                                },
                                newName: {
                                    type: 'string',
                                    description: 'The new name for the symbol'
                                }
                            },
                            required: ['filePath', 'line', 'character', 'newName']
                        }
                    },
                    {
                        name: 'get_active_editors',
                        description: 'Get the list of currently visible text editors (tabs) in VS Code, including the currently active one.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: 'get_cursor_position',
                        description: 'Get the absolute file path, cursor position (line and character), and selected text of the currently active editor.',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                            required: []
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === 'apply_workspace_edit') {
                const { filePath, target, replacement } = request.params.arguments as any;
                try {
                    const uri = vscode.Uri.file(filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const text = document.getText();

                    const index = text.indexOf(target);
                    if (index === -1) {
                        return {
                            content: [{ type: 'text', text: `Failed: Target string not found in the file.` }],
                            isError: true
                        };
                    }

                    const startPos = document.positionAt(index);
                    const endPos = document.positionAt(index + target.length);
                    const range = new vscode.Range(startPos, endPos);

                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(uri, range, replacement);

                    const success = await vscode.workspace.applyEdit(edit);
                    // Open the file in the editor so the user sees the dirty state, but preserve focus
                    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });

                    if (success) {
                        return { content: [{ type: 'text', text: `Successfully applied edit to ${filePath}. The file is now dirty (unsaved). Please review the changes in VS Code.` }] };
                    } else {
                        return {
                            content: [{ type: 'text', text: `Failed to apply workspace edit.` }],
                            isError: true
                        };
                    }
                } catch (err: any) {
                    return {
                        content: [{ type: 'text', text: `Error: ${err.message}` }],
                        isError: true
                    };
                }
            } else if (request.params.name === 'rename_symbol') {
                const { filePath, line, character, newName } = request.params.arguments as any;
                try {
                    const uri = vscode.Uri.file(filePath);
                    const position = new vscode.Position(line, character);

                    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
                        'vscode.executeDocumentRenameProvider',
                        uri,
                        position,
                        newName
                    );

                    if (edit) {
                        const success = await vscode.workspace.applyEdit(edit);
                        if (success) {
                            return { content: [{ type: 'text', text: `Successfully renamed symbol to '${newName}'. Affected files are unsaved.` }] };
                        } else {
                            return { content: [{ type: 'text', text: `Failed to apply rename edit.` }], isError: true };
                        }
                    } else {
                        return { content: [{ type: 'text', text: `Language server did not return any edits for rename.` }], isError: true };
                    }
                } catch (err: any) {
                    return { content: [{ type: 'text', text: `Error executing rename: ${err.message}` }], isError: true };
                }
            } else if (request.params.name === 'get_active_editors') {
                try {
                    const activeEditor = vscode.window.activeTextEditor;
                    const visibleEditors = vscode.window.visibleTextEditors;

                    const activePath = activeEditor ? activeEditor.document.uri.fsPath : null;
                    const visiblePaths = visibleEditors.map(editor => editor.document.uri.fsPath);

                    const resultInfo = {
                        activeEditor: activePath,
                        visibleEditors: visiblePaths
                    };

                    return { content: [{ type: 'text', text: JSON.stringify(resultInfo, null, 2) }] };
                } catch (err: any) {
                    return { content: [{ type: 'text', text: `Error getting active editors: ${err.message}` }], isError: true };
                }
            } else if (request.params.name === 'get_cursor_position') {
                try {
                    const activeEditor = vscode.window.activeTextEditor;
                    if (!activeEditor) {
                        return { content: [{ type: 'text', text: `No active text editor found.` }], isError: true };
                    }

                    const position = activeEditor.selection.active;
                    const selectionText = activeEditor.document.getText(activeEditor.selection);

                    const resultInfo = {
                        filePath: activeEditor.document.uri.fsPath,
                        cursor: {
                            line: position.line,
                            character: position.character
                        },
                        selectedText: selectionText || null
                    };

                    return { content: [{ type: 'text', text: JSON.stringify(resultInfo, null, 2) }] };
                } catch (err: any) {
                    return { content: [{ type: 'text', text: `Error getting cursor position: ${err.message}` }], isError: true };
                }
            }

            throw new Error(`Unknown tool: ${request.params.name}`);
        });
    }

    public async start() {
        return new Promise<void>((resolve, reject) => {
            this.httpServer = this.app.listen(this.port, () => {
                console.log(`MCP IDE Link Server listening on port ${this.port}`);
                resolve();
            });
            this.httpServer.on('error', (err: any) => {
                reject(err);
            });
        });
    }

    public stop() {
        if (this.httpServer) {
            this.httpServer.close();
        }
    }

    public restart() {
        this.stop();
        this.start();
    }
}
