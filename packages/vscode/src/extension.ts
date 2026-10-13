import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import {
  operate,
  collect,
  discoverStore,
  SnapshotStore,
  readBounded,
  readEvidence,
  scrub,
} from "../../engine/src/index.js";
import { analyze } from "../../adapters/src/index.js";
import type { Operation } from "../../protocol/src/index.js";
import { resultHtml, progressHtml } from "./presentation.js";
import { wireResult, recoveryInstruction } from "./result-host.js";
import { openHandoff } from "./handoff.js";
export async function selectProject(): Promise<
  vscode.WorkspaceFolder | undefined
> {
  if (vscode.env.remoteName) {
    void vscode.window.showErrorMessage("此 alpha 暂不支持远程工作区。");
    return;
  }
  const folders =
    vscode.workspace.workspaceFolders?.filter((f) => f.uri.scheme === "file") ??
    [];
  if (!folders.length) {
    void vscode.window.showInformationMessage("请先打开本地项目文件夹。");
    return;
  }
  if (folders.length === 1) return folders[0];
  const choice = await vscode.window.showQuickPick(
    folders.map((f) => ({
      label: f.name,
      description: f.uri.fsPath,
      folder: f,
    })),
    { placeHolder: "选择要查看的项目" },
  );
  return choice?.folder;
}
export function showResult(r: Parameters<typeof resultHtml>[0]) {
  const panel = vscode.window.createWebviewPanel(
    "pcm.result",
    "项目上下文",
    vscode.ViewColumn.Active,
    { enableScripts: false, localResourceRoots: [] },
  );
  panel.webview.html = resultHtml(r);
}
export function activate(context: vscode.ExtensionContext) {
  const entries = [
    ["交接项目", "pcm.handoff", "export"],
    ["恢复项目", "pcm.restore", "history"],
    ["查看项目状态", "pcm.status", "info"],
  ];
  const provider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (x) => x,
    getChildren: () =>
      entries.map(([label, command, icon]) => {
        const item = new vscode.TreeItem(label!);
        item.iconPath = new vscode.ThemeIcon(icon!);
        item.command = { command: command!, title: label! };
        return item;
      }),
  };
  context.subscriptions.push(
    vscode.window.createTreeView("pcm.tasks", { treeDataProvider: provider }),
  );
  async function run(
    operation: Operation,
    snapshotId?: string,
    selected?: vscode.WorkspaceFolder,
  ) {
    const f = selected ?? (await selectProject());
    if (!f) return;
    const panel = vscode.window.createWebviewPanel(
      "pcm.result",
      "项目上下文",
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [] },
    );
    const abort = new AbortController(),
      started = performance.now(),
      log: { phase: string; elapsedMs: number }[] = [];
    panel.onDidDispose(() => abort.abort());
    const cancel = panel.webview.onDidReceiveMessage((m) => {
      if (m && Object.keys(m).join(",") === "action" && m.action === "cancel")
        abort.abort();
    });
    panel.webview.html = progressHtml(f.name, "正在读取当前项目");
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "检查项目上下文",
        cancellable: true,
      },
      async (progress, token) => {
        const sub = token.onCancellationRequested(() => abort.abort());
        try {
          const r = await operate(
            {
              protocolVersion: 1,
              requestId: randomUUID(),
              operation,
              projectPath: f.uri.fsPath,
              snapshotId,
              signal: abort.signal,
            },
            (e) => {
              const elapsedMs = Math.round(performance.now() - started);
              if (log.length < 60) log.push({ phase: e.message, elapsedMs });
              if (e.type === "phaseChanged") {
                progress.report({ message: e.message });
                panel.webview.html = progressHtml(f.name, e.message);
              }
            },
          );
          if (
            vscode.workspace.textDocuments.some(
              (d) =>
                d.isDirty &&
                vscode.workspace.getWorkspaceFolder(d.uri)?.uri.toString() ===
                  f.uri.toString(),
            )
          ) {
            r.findings.unshift({
              code: "UNSAVED",
              severity: "warning",
              message: "存在未保存编辑；当前记录只包含磁盘文件。",
              action: "自行决定保存后重新检查；工具没有自动保存。",
            });
            if (r.operationOutcome === "success")
              r.operationOutcome = "partial";
            r.evidenceAssessment = "Insufficient Evidence";
          }
          cancel.dispose();
          wireResult(
            panel,
            r,
            f,
            { log, elapsedMs: performance.now() - started },
            async () => {
              panel.dispose();
              return run(operation, snapshotId, f);
            },
          );
          return r;
        } finally {
          sub.dispose();
        }
      },
    );
  }
  for (const operation of [
    "status",
    "restore",
    "verify",
    "health-check",
  ] as const)
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `pcm.${operation}`,
        (selected?: vscode.WorkspaceFolder) =>
          run(operation, undefined, selected),
      ),
    );
  for (const operation of ["handoff", "checkpoint", "compress"] as const)
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `pcm.${operation}`,
        async (selected?: vscode.WorkspaceFolder) => {
          const f = selected ?? (await selectProject());
          if (f) return openHandoff(f, context, operation);
        },
      ),
    );
  context.subscriptions.push(
    vscode.commands.registerCommand("pcm.advanced", async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: "保存开发断点", command: "pcm.checkpoint" },
          { label: "压缩上下文记录", command: "pcm.compress" },
          { label: "核验漂移", command: "pcm.verify" },
          { label: "文件证据与 Git 差异", command: "pcm.evidence" },
          { label: "历史记录", command: "pcm.history" },
          { label: "复制接收 Agent 指令", command: "pcm.copyRecovery" },
          { label: "调用已登录 Codex 进行语义分析", command: "pcm.analyze" },
        ],
        { placeHolder: "高级操作" },
      );
      if (choice) return vscode.commands.executeCommand(choice.command);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "pcm.history",
      async (selected?: vscode.WorkspaceFolder) => {
        const f = selected ?? (await selectProject());
        if (!f) return;
        try {
          const c = await collect(f.uri.fsPath),
            store = new SnapshotStore(c.root, await discoverStore(c.root)),
            index = await store.index();
          if (!index.records.length) {
            void vscode.window.showInformationMessage("没有交接历史。");
            return;
          }
          const choice = await vscode.window.showQuickPick(
            index.records
              .slice()
              .reverse()
              .map((r) => ({ label: r.id, description: r.purpose })),
            { placeHolder: "选择只读核验的记录" },
          );
          if (choice) return run("verify", choice.label, f);
        } catch {
          void vscode.window.showErrorMessage(
            "无法读取交接历史，请查看权限或记录完整性。",
          );
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("pcm.copyRecovery", async () => {
      const f = await selectProject();
      if (!f) return;
      await vscode.env.clipboard.writeText(recoveryInstruction(f.name));
      void vscode.window.showInformationMessage(
        "接收指令已复制。请在已独立登录的 Agent 中提交；尚未自动恢复到 Agent。",
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("pcm.analyze", async () => {
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showErrorMessage("未受信任工作区不调用 Agent。");
        return;
      }
      const f = await selectProject();
      if (!f) return;
      const consent = await vscode.window.showInformationMessage(
        "将受限项目文本发送给已独立登录的 Codex CLI；会使用账号资源。仅分析，不继续开发。",
        "开始分析",
      );
      if (consent !== "开始分析") return;
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Codex 语义分析",
          cancellable: true,
        },
        async (progress, token) => {
          const abort = new AbortController(),
            sub = token.onCancellationRequested(() => abort.abort());
          try {
            const machine = await operate({
              protocolVersion: 1,
              requestId: randomUUID(),
              operation: "restore",
              projectPath: f.uri.fsPath,
              signal: abort.signal,
            });
            if (machine.operationOutcome === "failed") {
              showResult(machine);
              return machine;
            }
            const analysis = await analyze({
              host: "codex",
              projectPath: f.uri.fsPath,
              snapshot: machine.snapshot,
              authorized: true,
              rules: await readBounded(
                context.extensionPath,
                "resources/state-reconstruction.md",
                65536,
              ),
              signal: abort.signal,
              onPhase: (message) => progress.report({ message }),
            });
            machine.findings.push(...analysis.findings);
            machine.operationOutcome =
              analysis.status === "candidate"
                ? "partial"
                : analysis.status === "cancelled"
                  ? "cancelled"
                  : "failed";
            if (
              analysis.status !== "candidate" &&
              machine.evidenceAssessment !== "Drift Detected"
            )
              machine.evidenceAssessment = "Insufficient Evidence";
            if (analysis.candidate) {
              machine.nextAction =
                analysis.candidate.next ?? machine.nextAction;
              const doc = await vscode.workspace.openTextDocument({
                language: "json",
                content: JSON.stringify(scrub(analysis), null, 2),
              });
              await vscode.window.showTextDocument(doc, { preview: true });
            }
            showResult(machine);
            return { machine, analysis };
          } finally {
            sub.dispose();
          }
        },
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("pcm.evidence", async () => {
      const f = await selectProject();
      if (!f) return;
      try {
        const c = await collect(f.uri.fsPath),
          selected = await vscode.window.showQuickPick(
            c.baseline.files
              .filter((x) => x.state === "present")
              .map((x) => ({ label: x.path })),
            { placeHolder: "查看一个文件的证据与 Git 差异" },
          );
        if (!selected) return;
        const evidence = await readEvidence(c.root, selected.label);
        const doc = await vscode.workspace.openTextDocument({
          language: "json",
          content: JSON.stringify(scrub(evidence), null, 2),
        });
        return vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        void vscode.window.showErrorMessage("证据不可读取或 Git 不可用。");
      }
    }),
  );
}
