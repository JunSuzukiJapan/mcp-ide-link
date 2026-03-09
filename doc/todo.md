# 実装ToDoリスト (VS Code x MCP)

MCPサーバー経由でAIエージェントに提供するVS Codeの強力な機能について、優先度と実装難易度を考慮したToDoリストです。

## フェーズ 1: コンテキスト理解（最優先・基本機能）
AIが「ユーザーが今どこを見て作業しているか」を把握できるようにする最もコストパフォーマンスの高い機能群です。

- [x] `get_active_editors` の実装
  - **内容**: ユーザーが現在開いているタブ（エディタ）の一覧と、一番手前でアクティブになっているファイルの絶対パスを取得する
  - **VS Code API**: `vscode.window.visibleTextEditors` / `vscode.window.activeTextEditor`
- [x] `get_cursor_position_and_selection` の実装
  - **内容**: 現在アクティブなエディタのカーソル位置（行・列）と、選択（ハイライト）されている範囲のテキストを取得する
  - **VS Code API**: `vscode.window.activeTextEditor.selection` / `document.getText(selection)`

## フェーズ 2: 状態管理とクリーンアップ（安全性向上）
AI自身がファイルをどう扱うかコントロールできるようにする機能群です。

- [ ] `save_all_dirty_files` の実装
  - **内容**: `apply_workspace_edit` 等で未保存状態（Dirty）になっているファイル群を一括で保存する
  - **VS Code API**: `vscode.workspace.saveAll()`
- [ ] `close_active_editor` / `close_all_editors` の実装
  - **内容**: AIが調査のために開いたファイルを閉じる（現在のタブ、もしくはすべて）
  - **VS Code API**: `vscode.commands.executeCommand('workbench.action.closeActiveEditor')` 等

## フェーズ 3: LSP（言語サーバー）連携（高度・強力な機能）
通常のCLIファイル操作では実現できない、IDEならではの言語解析機能群です。

- [ ] `find_references` (すべての参照) の実装
  - **内容**: 特定のシンボル（関数・クラス名など）がコードベースのどこで使用されているかを検索する
  - **VS Code API**: `vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, position)`
- [ ] `go_to_definition` (定義元ジャンプ) の実装
  - **内容**: 未知の関数や変数の定義元ファイルのパスと位置（行番号）を取得する
  - **VS Code API**: `vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, position)`
- [ ] `get_diagnostics` (問題パネルの取得) の実装
  - **内容**: 開いているファイルで発生しているエラーや警告（赤い波線など）のリストを取得する
  - **VS Code API**: `vscode.languages.getDiagnostics(uri)`

---

## 運用・開発メモ
新しいツールを実装する際は、以下の順番で作業を行います。

1. `mcp-server.ts` 内の `setupTools()` に入力の型定義（JSON Schema）を追加する。
2. `CallToolRequestSchema` のハンドラブロック内で、VS Code APIを呼び出して処理を実装する。
3. デバッグ実行（F5）し、`test-client.mjs` 等から実際に取得・実行できるかテストを行う。
