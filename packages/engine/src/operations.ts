import { randomUUID } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import type {
  OperationRequest,
  OperationResult,
  OperationEvent,
  Finding,
  Snapshot,
  Baseline,
} from "../../protocol/src/index.js";
import { collect } from "./collect.js";
import { SnapshotStore, readBounded } from "./store.js";
import {
  PcmError,
  canonical,
  safePath,
  sensitive,
  redact,
  scrub,
  assertNotAborted,
} from "./safety.js";
export async function discoverStore(root: string): Promise<string> {
  for (const parent of ["docs/project-context", "project-context"]) {
    try {
      if ((await lstat(await safePath(root, parent))).isDirectory())
        return `${parent}/pcm`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return "docs/project-context/pcm";
}
export async function discoverLegacy(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const dir of [".", "docs", "docs/project-context", "project-context"]) {
    try {
      for (const name of (await readdir(await safePath(root, dir)))
        .sort()
        .slice(0, 200))
        if (/^(?:handoff|checkpoint|current-work)(?:[-_.].*)?\.md$/i.test(name))
          found.push(dir === "." ? name : `${dir}/${name}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return found;
}
export function compare(previous: Baseline, current: Baseline): Finding[] {
  const findings: Finding[] = [],
    add = (code: string, message: string, p?: string) =>
      findings.push({
        code,
        severity: "warning",
        message,
        action: "按当前文件和有效需求重新核实受影响结论。",
        ...(p ? { path: p } : {}),
      });
  if (
    previous.repositoryId !== current.repositoryId ||
    previous.worktreeId !== current.worktreeId
  )
    add(
      "WORKSITE_CHANGED",
      "工作现场与发送环境不同；不能假设 dirty 文件已转移。",
    );
  if (previous.head !== current.head || previous.branch !== current.branch)
    add("GIT_BASELINE_CHANGED", "Git 基线或分支变化；不代表所有语义结论失效。");
  if (
    canonical(previous.scope) !== canonical(current.scope) ||
    canonical(previous.exclusions) !== canonical(current.exclusions)
  )
    add("SCOPE_CHANGED", "检查范围或排除项不同，不能认证完整一致。");
  const old = new Map(previous.files.map((f) => [f.path, f])),
    now = new Map(current.files.map((f) => [f.path, f]));
  for (const p of [...new Set([...old.keys(), ...now.keys()])].sort()) {
    const a = old.get(p),
      b = now.get(p);
    if (
      !a ||
      !b ||
      a.sha256 !== b.sha256 ||
      a.state !== b.state ||
      canonical(a.index) !== canonical(b.index) ||
      canonical(a.head) !== canonical(b.head)
    )
      add(
        "FILE_DRIFT",
        `文件、索引或 HEAD 证据变化：${sensitive(p) ? "[sensitive path]" : p}`,
        sensitive(p) ? undefined : p,
      );
  }
  if (
    previous.status !== current.status &&
    !findings.some((f) => f.code === "FILE_DRIFT")
  )
    add("GIT_STATUS_CHANGED", "Git 状态变化未能由文件清单完整解释。");
  return findings;
}
export interface Prepared {
  snapshot: Snapshot;
  storePath: string;
  expectedRevision: string | null;
  root: string;
}
export async function prepare(request: OperationRequest): Promise<Prepared> {
  const initial = await collect(request.projectPath, {
    scope: request.scope,
    signal: request.signal,
  });
  const storePath = request.storePath ?? (await discoverStore(initial.root)),
    store = new SnapshotStore(initial.root, storePath);
  await safePath(initial.root, storePath, true);
  if (sensitive(storePath))
    throw new PcmError("STORE_PATH", "记录位置不能是敏感路径。");
  const index = await store.index();
  if (
    request.expectedRevision !== undefined &&
    request.expectedRevision !== index.revision
  )
    throw new PcmError("REVISION_CONFLICT", "预期记录版本已变化。");
  const c = await collect(request.projectPath, {
    scope: request.scope,
    exclude: [storePath],
    signal: request.signal,
  });
  const previous = index.revision ? await store.read() : undefined;
  let task = request.task;
  if (!task && previous) task = previous.task;
  task ??= { goal: null, current: null, next: null, workInProgress: [] };
  const gaps = [...c.findings];
  if (
    !request.task &&
    previous &&
    compare(previous.baseline, c.baseline).length
  )
    gaps.push({
      code: "HISTORICAL_TASK",
      severity: "warning",
      message: "任务来自旧记录，项目基线已变化。",
      action: "由当前用户确认任务与下一步是否仍适用。",
    });
  if (!task.goal || !task.current || !task.next)
    gaps.push({
      code: "TASK_UNKNOWN",
      severity: "warning",
      message: "目标、开发断点或下一步尚未完整记录。",
      action: "由当前用户或受信任会话补充任务；不要从文件名推断完成。",
    });
  const files = new Set(c.baseline.files.map((f) => f.id));
  const claims = (previous?.claims ?? []).map((claim) => ({
    ...claim,
    implementation:
      claim.implementation === "verified"
        ? ("implemented-unverified" as const)
        : claim.implementation,
    evidenceIds: claim.evidenceIds.filter((id) => files.has(id)),
    uncertainty:
      claim.implementation === "verified"
        ? "历史完成声明；本次未执行语义验证。"
        : claim.uncertainty,
  }));
  const snapshot: Snapshot = {
    schema_version: 1,
    id: randomUUID(),
    parentId: index.revision,
    toolVersion: "3.0.0-alpha.2",
    purpose:
      request.operation === "checkpoint"
        ? "checkpoint"
        : request.operation === "compress"
          ? "context"
          : "handoff",
    recordedAt: new Date().toISOString(),
    baseline: c.baseline,
    task: scrub(task),
    claims: scrub(claims),
    validations: (previous?.validations ?? []).map((v) => ({
      ...scrub(v),
      source: "imported",
    })),
    constraints: scrub(previous?.constraints ?? []),
    gaps,
  };
  return {
    snapshot,
    storePath,
    expectedRevision: index.revision,
    root: c.root,
  };
}
export async function publish(
  prepared: Prepared,
  signal?: AbortSignal,
): Promise<string[]> {
  const current = await collect(prepared.root, {
    scope: prepared.snapshot.baseline.scope,
    exclude: [prepared.storePath],
    signal,
  });
  if (
    current.baseline.fingerprint !== prepared.snapshot.baseline.fingerprint ||
    !current.baseline.stable
  )
    throw new PcmError(
      "PREVIEW_STALE",
      "准备后项目变化，拒绝发布旧基线。",
      "重新准备并检查新风险。",
    );
  return new SnapshotStore(prepared.root, prepared.storePath).publish(
    prepared.snapshot,
    prepared.expectedRevision,
    signal,
  );
}
/** Publication is already committed. A failed follow-up must retain the real artifacts. */
export async function checkPublishedBaseline(
  prepared: Prepared,
): Promise<Finding[]> {
  try {
    const after = await collect(prepared.root, {
      scope: prepared.snapshot.baseline.scope,
      exclude: [prepared.storePath],
    });
    if (
      after.baseline.fingerprint === prepared.snapshot.baseline.fingerprint &&
      after.baseline.stable
    )
      return [];
    return [
      {
        code: "PUBLISHED_BASELINE_CHANGED",
        severity: "warning",
        message: "记录已发布，但发布期间项目证据发生变化。",
        action: "保留记录作为历史快照，重新准备交接。",
      },
    ];
  } catch {
    return [
      {
        code: "PUBLISHED_RECHECK_FAILED",
        severity: "warning",
        message: "记录已发布，但无法核实发布后的项目基线。",
        action: "保留产物，处理权限或环境问题后重新核验。",
      },
    ];
  }
}
export async function operate(
  request: OperationRequest,
  emit: (event: OperationEvent) => void = () => {},
): Promise<OperationResult> {
  const result: OperationResult = {
    protocolVersion: 1,
    requestId: request.requestId,
    operation: request.operation,
    operationOutcome: "failed",
    evidenceAssessment: "Insufficient Evidence",
    handoffReadiness: "Not applicable",
    findings: [],
    artifacts: [],
    nextAction: "检查诊断后重试。",
  };
  const event = (type: OperationEvent["type"], message: string) =>
    emit({ requestId: request.requestId, type, message });
  event("operationStarted", "开始检查项目");
  try {
    if (request.protocolVersion !== 1)
      throw new PcmError("PROTOCOL_VERSION", "不支持的请求协议。");
    assertNotAborted(request.signal);
    const op =
      request.operation === "health-check" ? "verify" : request.operation;
    if (
      ![
        "status",
        "checkpoint",
        "compress",
        "handoff",
        "restore",
        "verify",
      ].includes(op)
    )
      throw new PcmError("OPERATION", "不支持的操作。");
    if (["checkpoint", "compress", "handoff"].includes(op)) {
      event("phaseChanged", "准备快照");
      const p = await prepare(request);
      result.snapshot = p.snapshot;
      result.baseline = p.snapshot.baseline;
      result.findings = [...p.snapshot.gaps];
      event("phaseChanged", "重新核实基线并发布");
      result.artifacts = await publish(p, request.signal);
      const postFindings = await checkPublishedBaseline(p);
      result.findings.push(...postFindings);
      result.operationOutcome = postFindings.length ? "partial" : "success";
      result.evidenceAssessment =
        p.snapshot.baseline.stable && p.snapshot.baseline.coverage === "scoped"
          ? "Verified With Gaps"
          : "Insufficient Evidence";
      if (postFindings.length)
        result.evidenceAssessment = postFindings.some(
          (f) => f.code === "PUBLISHED_BASELINE_CHANGED",
        )
          ? "Drift Detected"
          : "Insufficient Evidence";
      result.handoffReadiness = result.findings.length
        ? "Not Ready"
        : "Ready With Gaps";
      result.nextAction =
        p.snapshot.task.next ?? "补充当前任务，再由接收 Agent 核实实现语义。";
    } else {
      event("phaseChanged", "只读采集文件与 Git");
      const initial = await collect(request.projectPath, {
        scope: request.scope,
        signal: request.signal,
      });
      const storePath =
          request.storePath ?? (await discoverStore(initial.root)),
        store = new SnapshotStore(initial.root, storePath);
      let previous: Snapshot | undefined;
      try {
        previous = await store.read(request.snapshotId);
      } catch (e) {
        if (
          !(e instanceof PcmError) ||
          e.code !== "NO_RECORD" ||
          op !== "status"
        )
          throw e;
      }
      const c = await collect(
        !request.scope && previous ? initial.root : request.projectPath,
        {
          scope: request.scope ?? previous?.baseline.scope,
          exclude: [storePath],
          signal: request.signal,
        },
      );
      result.baseline = c.baseline;
      result.findings = [...c.findings];
      if (previous) {
        event("phaseChanged", "比较历史记录与本机证据");
        result.snapshot = previous;
        const drift = compare(previous.baseline, c.baseline);
        result.findings.push(...drift);
        for (const claim of previous.claims)
          if (claim.implementation === "verified") {
            result.findings.push({
              code: "COMPLETION_UNCERTIFIED",
              severity: "warning",
              message: `历史完成主张需要当前实现和适用验证重新确认：${redact(claim.text)}`,
              action: "检查代码和必要接线；历史通过记录不能替代本机验证。",
            });
            const changedEvidence = claim.evidenceIds.some((id) => {
              const old = previous.baseline.files.find((f) => f.id === id),
                now = c.baseline.files.find((f) => f.id === id);
              return (
                !old ||
                !now ||
                now.state !== "present" ||
                old.sha256 !== now.sha256 ||
                canonical(old.index) !== canonical(now.index) ||
                canonical(old.head) !== canonical(now.head)
              );
            });
            if (changedEvidence)
              result.findings.push({
                code: "CLAIM_EVIDENCE_CONFLICT",
                severity: "error",
                message: `完成声明与当前证据基线冲突：${redact(claim.text)}`,
                action:
                  "该声明引用的文件或 Git 证据已变化/缺失；重新核实实现和有效验证，不沿用历史完成结论。",
              });
          }
        for (const v of previous.validations)
          result.findings.push({
            code:
              v.baselineFingerprint === c.baseline.fingerprint
                ? "HISTORICAL_VALIDATION"
                : "STALE_VALIDATION",
            severity: "warning",
            message: `验证 ${v.id} 是历史记录；本次未执行，不能作为当前 Passed。`,
            action: "仅在独立授权和安全环境下运行必要验证。",
          });
        if (
          !previous.task.goal ||
          !previous.task.current ||
          !previous.task.next
        )
          result.findings.push({
            code: "TASK_UNKNOWN",
            severity: "warning",
            message: "记录缺少可恢复任务状态。",
            action: "请当前用户明确目标与下一步。",
          });
        result.evidenceAssessment = drift.length
          ? "Drift Detected"
          : c.baseline.coverage === "scoped" && c.baseline.stable
            ? "Verified With Gaps"
            : "Insufficient Evidence";
        result.nextAction = previous.task.next ?? "补充当前目标和断点。";
      } else {
        result.evidenceAssessment =
          c.baseline.coverage === "scoped" && c.baseline.stable
            ? "Verified"
            : "Insufficient Evidence";
        result.nextAction = "选择交接或补充任务；机器状态不证明项目完成。";
      }
      result.operationOutcome =
        result.findings.length || op === "restore" ? "partial" : "success";
      if (op === "restore")
        result.findings.push({
          code: "SEMANTIC_REVIEW_REQUIRED",
          severity: "warning",
          message:
            "机器证据已恢复；任务与架构语义仍需接收 Agent 核实。恢复后停止，未执行开发。",
          action: "交给接收 Agent 核实，由当前用户另行授权继续。",
        });
    }
  } catch (e) {
    const error =
      e instanceof PcmError
        ? e
        : new PcmError("IO_ERROR", "操作未完成；文件权限、记录或工具不可用。");
    result.operationOutcome =
      error.code === "CANCELLED" ? "cancelled" : "failed";
    result.findings.push({
      code: error.code,
      severity: "error",
      message: error.message,
      action: error.action,
    });
    result.nextAction = error.action;
    if (
      (request.operation === "restore" || request.operation === "verify") &&
      error.code === "NO_RECORD"
    ) {
      try {
        for (const p of await discoverLegacy(request.projectPath))
          result.findings.push({
            code: "LEGACY_AVAILABLE",
            severity: "warning",
            path: p,
            message: "发现 v2 Markdown；仅作为未经机器认证的历史主张。",
            action: "使用原 Skill 核实当前项目，或显式读取历史数据。",
          });
      } catch {}
    }
  }
  const safe = scrub(result);
  for (const f of safe.findings) event("findingAdded", f.message);
  for (const p of safe.artifacts) event("artifactPublished", p);
  event("operationFinished", safe.operationOutcome);
  return safe;
}
export async function importLegacy(
  root: string,
  relative: string,
): Promise<{
  source: string;
  text: string;
  certification: "unverified-legacy";
}> {
  if (sensitive(relative) || !relative.toLowerCase().endsWith(".md"))
    throw new PcmError("LEGACY_PATH", "仅读取项目内非敏感 Markdown。");
  return {
    source: relative,
    text: redact(await readBounded(root, relative, 256 * 1024)),
    certification: "unverified-legacy",
  };
}
