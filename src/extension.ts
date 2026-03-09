import * as vscode from 'vscode';
import { McpServerManager } from './mcp-server.js';

let serverManager: McpServerManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('MCP IDE Link is now active.');

    serverManager = new McpServerManager(context);

    let disposable = vscode.commands.registerCommand('mcpIdeLink.restartServer', () => {
        if (serverManager) {
            serverManager.restart();
            vscode.window.showInformationMessage('MCP IDE Link Server restarted.');
        }
    });

    context.subscriptions.push(disposable);

    serverManager.start().catch((err: any) => {
        vscode.window.showErrorMessage(`Failed to start MCP IDE Link server: ${err.message}`);
    });
}

export function deactivate() {
    if (serverManager) {
        serverManager.stop();
    }
}
