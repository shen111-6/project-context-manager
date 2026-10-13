import { randomUUID } from "node:crypto";
import type { OperationResult } from "../../protocol/src/index.js";
import { scrub } from "../../engine/src/safety.js";
import type { ResultAction } from "./result-actions.js";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const styles = `body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);max-width:900px;margin:28px auto;padding:0 24px;line-height:1.65}h1{font-size:25px;margin-bottom:8px}h2{font-size:18px}section,details{margin:18px 0;padding:16px;border:1px solid var(--vscode-panel-border);border-radius:8px}.muted{color:var(--vscode-descriptionForeground)}.risk{border-left:3px solid var(--vscode-editorWarning-foreground)}.error{border-left:3px solid var(--vscode-editorError-foreground)}.badge{display:inline-block;margin:4px 12px 4px 0;padding:3px 9px;border:1px solid var(--vscode-panel-border);border-radius:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}p,li{overflow-wrap:anywhere}summary{cursor:pointer}li{margin:9px 0}button{font:inherit;background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:8px 14px;border:0;border-radius:3px;margin:8px 10px 8px 0;cursor:pointer}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}label{display:block;margin-top:14px}textarea{box-sizing:border-box;width:100%;min-height:58px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);font:inherit;padding:8px}code{overflow-wrap:anywhere}`;
export function page(body: string, script = ""): string {
  const nonce = randomUUID().replace(/-/g, "");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';"><style>${styles}</style><title>项目上下文</title></head><body>${body}${script ? `<script nonce="${nonce}">const vscode=acquireVsCodeApi();${script}</script>` : ""}</body></html>`;
}
export interface ViewContext {
  projectName?: string;
  actions?: ResultAction[];
  log?: { phase: string; elapsedMs: number }[];
  elapsedMs?: number;
}
export function resultTitle(r: OperationResult): string {
  if (r.operationOutcome === "cancelled") return "操作已取消";
  if (r.operationOutcome === "failed")
    return r.findings.some((f) => f.code === "NO_RECORD")
      ? "没有找到交接资料"
      : "操作未完成";
  if (
    r.evidenceAssessment === "Drift Detected" ||
    r.findings.some((f) => f.code === "CLAIM_EVIDENCE_CONFLICT")
  )
    return "发现冲突，需要重新核实";
  if (r.evidenceAssessment === "Insufficient Evidence")
    return "证据不足，尚未完整恢复";
  if (["handoff", "checkpoint", "compress"].includes(r.operation))
    return r.handoffReadiness === "Not Ready"
      ? "资料已生成，仍有交接缺口"
      : "交接资料已生成";
  return r.operation === "restore"
    ? "已读取交接，语义仍待核实"
    : "当前项目状态";
}
export function resultHtml(
  input: OperationResult,
  context: ViewContext = {},
): string {
  const r = scrub(input),
    title = resultTitle(r),
    task = r.snapshot?.task;
  const evidence = {
    Verified: "范围内机器事实已核实",
    "Verified With Gaps": "机器事实已核实，语义仍需确认",
    "Drift Detected": "当前证据与历史记录有差异",
    "Insufficient Evidence": "证据不足",
  }[r.evidenceAssessment];
  const readiness = {
    Ready: "交接就绪",
    "Ready With Gaps": "可供接收方核验",
    "Not Ready": "当前交接缺口未解决",
    "Not applicable": "",
  }[r.handoffReadiness];
  const riskGroups = new Map<string, typeof r.findings>();
  for (const f of r.findings) {
    const group = riskGroups.get(f.code) ?? [];
    group.push(f);
    riskGroups.set(f.code, group);
  }
  const risks = [...riskGroups]
    .map(
      ([code, group]) =>
        `<li class="${group.some((g) => g.severity === "error") ? "error" : ""}"><strong>${escapeHtml(group[0]!.message)}</strong>${group.length > 1 ? `（共 ${group.length} 项）` : ""}<br>${escapeHtml(group[0]!.action)}${group.length > 1 ? `<details><summary>查看全部 ${group.length} 项</summary><ul>${group.map((f) => `<li>${escapeHtml(f.message)} — ${escapeHtml(f.action)}</li>`).join("")}</ul></details>` : ""}<span class="muted"> [${escapeHtml(code)}]</span></li>`,
    )
    .join("");
  const labels: Record<ResultAction, string> = {
    refresh: "重新检查",
    handoff: "生成交接资料",
    copyRecovery: "复制接收指令",
    openArtifact: "打开交接记录",
    history: "选择历史记录",
  };
  const buttons = (context.actions ?? [])
    .map(
      (a) =>
        `<button class="${a === "refresh" ? "" : "secondary"}" data-action="${a}">${labels[a]}</button>`,
    )
    .join("");
  const taskCard = `<section aria-label="当前任务"><h2>${r.evidenceAssessment === "Drift Detected" ? "历史任务（当前证据有变化）" : "任务与开发断点"}</h2>${task ? `<p><strong>目标：</strong>${escapeHtml(task.goal ?? "尚未记录")}</p><p><strong>记录中的断点：</strong>${escapeHtml(task.current ?? "尚未记录")}</p><p><strong>未完成工作：</strong></p><ul>${task.workInProgress.map((x) => `<li>${escapeHtml(x)}</li>`).join("") || "<li>未记录 WIP；这不代表没有未完成工作。</li>"}</ul>` : "<p>当前项目没有结构化任务记录。生成交接时可补充目标、断点和下一步。</p>"}</section>`;
  return page(
    `<header><p class="muted">${escapeHtml(context.projectName ?? "当前项目")}${context.elapsedMs !== undefined ? ` · 本次检查 ${(context.elapsedMs / 1000).toFixed(1)} 秒` : ""}</p><h1 role="status" aria-live="polite">${escapeHtml(title)}</h1><p><span class="badge">${escapeHtml(evidence)}</span>${readiness ? `<span class="badge">${escapeHtml(readiness)}</span>` : ""}</p><p class="muted">机器检查不证明功能完成。查看和恢复默认只读；交接仅写上下文记录，所有操作均不自动执行开发。</p></header>${taskCard}<section aria-label="下一步"><h2>下一步</h2><p>${escapeHtml(r.nextAction)}</p>${buttons}<p class="muted" id="action-feedback" aria-live="polite"></p></section><section class="risk" aria-label="关键风险"><h2>需要注意</h2><ul>${risks || "<li>本次机器范围内无诊断；未检查范围不能推断。</li>"}</ul></section>${r.artifacts.length ? `<section><h2>真实交接资料</h2>${r.artifacts.map((a) => `<p><code>${escapeHtml(a)}</code></p>`).join("")}</section>` : ""}<details><summary>高级：完整证据、Git 基线与异常</summary><pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre></details><details><summary>高级：本次执行阶段与耗时</summary><pre>${escapeHtml(JSON.stringify(context.log ?? [], null, 2))}</pre></details>`,
    buttons
      ? `document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{vscode.postMessage({action:button.dataset.action});});window.addEventListener('message',event=>{if(event.data&&event.data.type==='feedback')document.getElementById('action-feedback').textContent=event.data.message;});`
      : "",
  );
}
export function progressHtml(projectName: string, phase: string): string {
  return page(
    `<p class="muted">${escapeHtml(projectName)}</p><h1 role="status" aria-live="polite">${escapeHtml(phase)}</h1><p>正在核对当前项目。完成后会显示结果、关键风险和下一步。</p><button id="cancel">取消</button>`,
    `document.getElementById('cancel').onclick=()=>{vscode.postMessage({action:'cancel'});document.getElementById('cancel').disabled=true;};`,
  );
}
export function taskFormHtml(
  projectName: string,
  t: NonNullable<OperationResult["snapshot"]>["task"],
): string {
  return page(
    `<p class="muted">${escapeHtml(projectName)} · 已自动识别项目和 Git</p><h1>交接项目</h1><p>仅补充工具无法确定的任务。已有记录时会自动带入。</p><label for="goal">当前目标</label><textarea id="goal">${escapeHtml(t.goal ?? "")}</textarea><label for="current">开发做到哪里</label><textarea id="current">${escapeHtml(t.current ?? "")}</textarea><label for="next">接手后的下一步</label><textarea id="next">${escapeHtml(t.next ?? "")}</textarea><details><summary>补充未完成工作（可选）</summary><label for="wip">每行一项</label><textarea id="wip">${escapeHtml(t.workInProgress.join("\n"))}</textarea></details><p class="muted">未知项可以留空，会如实显示交接缺口。</p><button id="prepare">检查并准备</button>`,
    `document.getElementById('prepare').onclick=()=>{const value=id=>document.getElementById(id).value.trim()||null;vscode.postMessage({action:'prepare',task:{goal:value('goal'),current:value('current'),next:value('next'),workInProgress:(value('wip')||'').split(String.fromCharCode(10)).map(line=>line.trim()).filter(Boolean)}});document.getElementById('prepare').disabled=true;};document.getElementById('goal').focus();`,
  );
}
