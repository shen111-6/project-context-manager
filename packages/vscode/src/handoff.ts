import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import {
  prepare,
  publish,
  checkPublishedBaseline,
  PcmError,
  scrub,
  type Prepared,
} from "../../engine/src/index.js";
import type { Snapshot, OperationResult } from "../../protocol/src/index.js";
import {
  escapeHtml,
  page,
  progressHtml,
  taskFormHtml,
} from "./presentation.js";
import { wireResult } from "./result-host.js";
export function validTask(input: unknown): input is Snapshot["task"] {
  if (!input || typeof input !== "object") return false;
  const t = input as Snapshot["task"];
  return (
    Object.keys(t).sort().join(",") === "current,goal,next,workInProgress" &&
    [t.goal, t.current, t.next].every(
      (x) =>
        x === null ||
        (typeof x === "string" && x.trim().length > 0 && x.length <= 8192),
    ) &&
    Array.isArray(t.workInProgress) &&
    t.workInProgress.length <= 100 &&
    t.workInProgress.every(
      (x) => typeof x === "string" && x.length > 0 && x.length <= 8192,
    )
  );
}
export async function openHandoff(
  project: vscode.WorkspaceFolder,
  context: vscode.ExtensionContext,
  operation: "handoff" | "checkpoint" | "compress" = "handoff",
) {
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showErrorMessage(
      "未受信任工作区不能生成记录。请由你确认项目来源后决定是否信任。",
    );
    return;
  }
  const panel = vscode.window.createWebviewPanel(
      "pcm.handoff",
      "交接项目",
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [] },
    ),
    started = performance.now(),
    log: { phase: string; elapsedMs: number }[] = [];
  let pending: Prepared | undefined,
    busy = false,
    abort = new AbortController(),
    published = false;
  let publishedArtifacts: string[] = [];
  panel.onDidDispose(() => abort.abort(), undefined, context.subscriptions);
  const request = {
    protocolVersion: 1 as const,
    requestId: randomUUID(),
    operation,
    projectPath: project.uri.fsPath,
  };
  const unsaved = () =>
    vscode.workspace.textDocuments.some(
      (d) =>
        d.isDirty &&
        vscode.workspace.getWorkspaceFolder(d.uri)?.uri.toString() ===
          project.uri.toString(),
    );
  const stage = (phase: string) => {
    log.push({ phase, elapsedMs: Math.round(performance.now() - started) });
    panel.webview.html = progressHtml(project.name, phase);
  };
  async function run<T>(
    phase: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ) {
    abort = new AbortController();
    stage(phase);
    return vscode.window.withProgress(
      {
        title: phase,
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
      },
      async (progress, token) => {
        const sub = token.onCancellationRequested(() => abort.abort());
        progress.report({
          message: "读取 Git 和当前磁盘证据；不会执行开发任务",
        });
        try {
          return await fn(abort.signal);
        } finally {
          sub.dispose();
        }
      },
    );
  }
  function errorView(error: PcmError) {
    if (published) {
      panel.webview.html = page(
        `<p class="muted">${escapeHtml(project.name)}</p><h1>交接包已生成，结果展示未完成</h1><section class="risk" role="alert"><p>真实交接文件已写入。后续核验或界面展示失败，尚不能确认交接资料可用性；请通过恢复项目重新核验。</p><ul>${publishedArtifacts.map((artifact) => `<li><code>${escapeHtml(artifact)}</code></li>`).join("")}</ul></section><p>不要重复生成以覆盖本次记录；开发任务未被执行。</p>`,
      );
      return;
    }
    panel.webview.html = page(
      `<p class="muted">${escapeHtml(project.name)}</p><h1>${error.code === "CANCELLED" ? "操作已取消" : "交接尚未生成"}</h1><section class="error" role="alert"><h2>${escapeHtml(error.message)}</h2><p>${escapeHtml(error.action)}</p><code>${escapeHtml(error.code)}</code></section><p>项目任务未被执行；没有将本次失败显示为交接成功。</p><button id="retry">重新检查项目</button>`,
      "document.getElementById('retry').onclick=()=>vscode.postMessage({action:'retry'});",
    );
  }
  function preview(p: Prepared) {
    if (unsaved() && !p.snapshot.gaps.some((g) => g.code === "UNSAVED"))
      p.snapshot.gaps.unshift({
        code: "UNSAVED",
        severity: "warning",
        message: "存在未保存编辑，磁盘快照不包含这些内容。",
        action: "自行决定保存并重新检查，或明确保留此缺口。",
      });
    const t = p.snapshot.task;
    panel.webview.html = page(
      `<p class="muted">${escapeHtml(project.name)} · 分支 ${escapeHtml(p.snapshot.baseline.branch ?? "未知/无分支")}</p><h1>检查交接资料</h1><section><p><strong>目标：</strong>${escapeHtml(t.goal ?? "未知")}</p><p><strong>断点：</strong>${escapeHtml(t.current ?? "未知")}</p><p><strong>下一步：</strong>${escapeHtml(t.next ?? "未知")}</p></section><section class="risk"><h2>需要注意</h2><ul>${p.snapshot.gaps.map((g) => `<li>${escapeHtml(g.message)}<br>${escapeHtml(g.action)}</li>`).join("") || "<li>本次机器范围内无缺口；接收方仍须核实语义。</li>"}</ul></section><p>将写入 <code>${escapeHtml(p.storePath)}</code>。只生成交接 JSON/Markdown，不打包源码，不执行下一步。</p><button id="publish">生成交接包</button><button class="secondary" id="edit">编辑任务</button><details><summary>高级：完整证据和保存位置</summary><pre>${escapeHtml(JSON.stringify(scrub(p.snapshot), null, 2))}</pre></details>`,
      "document.getElementById('publish').onclick=()=>{vscode.postMessage({action:'publish'});document.getElementById('publish').disabled=true;};document.getElementById('edit').onclick=()=>vscode.postMessage({action:'edit'});",
    );
  }
  function edit(t: Snapshot["task"]) {
    panel.webview.html = taskFormHtml(project.name, t);
  }
  async function initialize(task?: Snapshot["task"]) {
    pending = await run("正在识别项目并检查交接记录", (signal) =>
      prepare({ ...request, task, signal }),
    );
    if (
      pending.snapshot.task.goal &&
      pending.snapshot.task.current &&
      pending.snapshot.task.next
    )
      preview(pending);
    else edit(pending.snapshot.task);
  }
  const sub = panel.webview.onDidReceiveMessage(async (m: unknown) => {
    if (!m || typeof m !== "object") return;
    const message = m as { action?: unknown; task?: unknown };
    if (
      message.action === "cancel" &&
      Object.keys(message).join(",") === "action"
    ) {
      abort.abort();
      return;
    }
    if (busy || published) return;
    busy = true;
    try {
      if (!vscode.workspace.isTrusted)
        throw new PcmError(
          "WORKSPACE_UNTRUSTED",
          "工作区当前未受信任，已停止交接写入。",
          "由你决定信任项目后重新检查。",
        );
      if (message.action === "prepare") {
        if (
          Object.keys(message).sort().join(",") !== "action,task" ||
          !validTask(message.task)
        )
          throw new PcmError(
            "TASK_INPUT",
            "任务输入无效或超过长度上限。",
            "每个字段不超过 8192 字符，未完成工作不超过 100 项。",
          );
        await initialize(message.task);
      } else if (
        message.action === "retry" &&
        Object.keys(message).join(",") === "action"
      )
        await initialize(pending?.snapshot.task);
      else if (
        message.action === "edit" &&
        Object.keys(message).join(",") === "action"
      )
        edit(
          pending?.snapshot.task ?? {
            goal: null,
            current: null,
            next: null,
            workInProgress: [],
          },
        );
      else if (
        message.action === "publish" &&
        Object.keys(message).join(",") === "action" &&
        pending
      ) {
        if (
          unsaved() &&
          !pending.snapshot.gaps.some((g) => g.code === "UNSAVED")
        )
          throw new PcmError(
            "UNSAVED_CHANGED",
            "出现新的未保存编辑，请重新检查。",
          );
        const artifacts = await run("正在生成真实交接包", (signal) =>
          publish(pending!, signal),
        );
        publishedArtifacts = artifacts;
        published = true;
        const postFindings = await checkPublishedBaseline(pending),
          findings = [...pending.snapshot.gaps, ...postFindings];
        const result: OperationResult = {
          protocolVersion: 1,
          requestId: request.requestId,
          operation,
          operationOutcome: postFindings.length ? "partial" : "success",
          evidenceAssessment: postFindings.length
            ? postFindings.some((f) => f.code === "PUBLISHED_BASELINE_CHANGED")
              ? "Drift Detected"
              : "Insufficient Evidence"
            : pending.snapshot.baseline.stable &&
                pending.snapshot.baseline.coverage === "scoped"
              ? "Verified With Gaps"
              : "Insufficient Evidence",
          handoffReadiness: findings.length ? "Not Ready" : "Ready With Gaps",
          findings,
          artifacts,
          nextAction: pending.snapshot.task.next ?? "补充任务并交由接收方核实",
          baseline: pending.snapshot.baseline,
          snapshot: pending.snapshot,
        };
        sub.dispose();
        wireResult(panel, result, project, {
          log,
          elapsedMs: performance.now() - started,
        });
        pending = undefined;
      }
    } catch (e) {
      errorView(
        e instanceof PcmError
          ? e
          : new PcmError(
              "HANDOFF_FAILED",
              "交接资料尚未生成。",
              "检查项目权限、Git 和记录位置后重新检查。",
            ),
      );
    } finally {
      busy = false;
    }
  });
  panel.onDidDispose(() => sub.dispose());
  try {
    busy = true;
    await initialize();
  } catch (e) {
    errorView(
      e instanceof PcmError
        ? e
        : new PcmError(
            "PROJECT_UNAVAILABLE",
            "项目无法检查。",
            "检查文件夹是否可访问，然后重试。",
          ),
    );
  } finally {
    busy = false;
  }
  return panel;
}
