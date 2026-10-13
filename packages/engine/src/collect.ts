import path from "node:path";
import { realpath, lstat, open, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import type {
  Baseline,
  FileEvidence,
  Finding,
} from "../../protocol/src/index.js";
import { isRelativePath } from "../../protocol/src/index.js";
import { git, decode, records } from "./git.js";
import {
  digest,
  canonical,
  safePath,
  sensitive,
  assertNotAborted,
  PcmError,
} from "./safety.js";

export interface CollectOptions {
  scope?: string[];
  signal?: AbortSignal;
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  exclude?: string[];
}
export interface Collection {
  root: string;
  baseline: Baseline;
  findings: Finding[];
}
const skip = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".cache",
  ".next",
  ".venv",
  "vendor",
]);
const within = (p: string, scope: string[]) =>
  scope.some((s) => s === "." || p === s || p.startsWith(`${s}/`));
async function fileHash(
  root: string,
  p: string,
  limit: number,
): Promise<Pick<FileEvidence, "state" | "sha256" | "reason">> {
  if (sensitive(p))
    return {
      state: "excluded",
      sha256: null,
      reason: "敏感路径；未读取内容。",
    };
  try {
    const full = await safePath(root, p),
      st = await lstat(full);
    if (!st.isFile())
      return {
        state: "excluded",
        sha256: null,
        reason: "不是常规文件；未读取内容。",
      };
    if (st.size > limit)
      return {
        state: "excluded",
        sha256: null,
        reason: "文件超过本次读取上限。",
      };
    const handle = await open(
      full,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const initial = await handle.stat();
      if (initial.ino !== st.ino || initial.dev !== st.dev || !initial.isFile())
        throw new PcmError("UNSTABLE", "文件在打开时变化。");
      const bytes = Buffer.alloc(limit + 1);
      let length = 0;
      while (length < bytes.length) {
        const r = await handle.read(bytes, length, bytes.length - length, null);
        if (!r.bytesRead) break;
        length += r.bytesRead;
      }
      const final = await handle.stat();
      if (
        length > limit ||
        initial.size !== final.size ||
        initial.mtimeMs !== final.mtimeMs ||
        initial.ctimeMs !== final.ctimeMs
      )
        throw new PcmError("UNSTABLE", "文件在读取时变化。");
      await safePath(root, p);
      return {
        state: "present",
        sha256: digest(bytes.subarray(0, length)),
        reason: null,
      };
    } finally {
      await handle.close();
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { state: "missing", sha256: null, reason: "文件不存在。" };
    return {
      state: "unreadable",
      sha256: null,
      reason:
        e instanceof PcmError ? e.message : "文件不可读取；未推断其内容。",
    };
  }
}
export async function collect(
  projectPath: string,
  options: CollectOptions = {},
): Promise<Collection> {
  assertNotAborted(options.signal);
  const requestedRoot = await realpath(projectPath);
  let root = requestedRoot,
    gitState: Baseline["gitState"] = "available",
    reason: string | null = null;
  let repositoryId = digest(root),
    worktreeId = digest(root);
  try {
    root = await realpath(
      decode(
        await git(root, ["rev-parse", "--show-toplevel"], options.signal),
      ).trim(),
    );
    const common = decode(
      await git(root, ["rev-parse", "--git-common-dir"], options.signal),
    ).trim();
    const dir = decode(
      await git(root, ["rev-parse", "--git-dir"], options.signal),
    ).trim();
    repositoryId = digest(await realpath(path.resolve(root, common)));
    worktreeId = digest(await realpath(path.resolve(root, dir)));
  } catch (e) {
    if (!(e instanceof PcmError) || e.code === "CANCELLED") throw e;
    gitState = e.code === "NOT_GIT" ? "not-git" : "unavailable";
    reason = e.message;
  }
  const prefix = path.relative(root, requestedRoot).split(path.sep).join("/");
  const scope = [
    ...new Set(
      (options.scope ?? ["."]).map((s) => {
        if (!isRelativePath(s))
          throw new PcmError("UNSAFE_SCOPE", "检查范围必须是项目内相对路径。");
        return prefix ? (s === "." ? prefix : `${prefix}/${s}`) : s;
      }),
    ),
  ].sort();
  if (!scope.length) throw new PcmError("EMPTY_SCOPE", "检查范围不能为空。");
  for (const s of scope) await safePath(root, s, true);
  const maxFiles = options.maxFiles ?? 5000,
    maxFileBytes = options.maxFileBytes ?? 1024 * 1024;
  const excluded = [...new Set(options.exclude ?? [])].sort();
  for (const p of excluded)
    if (!isRelativePath(p) || p === ".")
      throw new PcmError("UNSAFE_EXCLUSION", "排除项必须是具体的项目内路径。");
  if (
    !Number.isInteger(maxFiles) ||
    maxFiles < 1 ||
    maxFiles > 20000 ||
    !Number.isInteger(maxFileBytes) ||
    maxFileBytes < 1 ||
    maxFileBytes > 16 * 1024 * 1024 ||
    (options.maxTotalBytes !== undefined &&
      (!Number.isInteger(options.maxTotalBytes) ||
        options.maxTotalBytes < 1 ||
        options.maxTotalBytes > 256 * 1024 * 1024))
  )
    throw new PcmError("LIMIT_OPTIONS", "采集上限超出支持范围。");
  let exceeded = false;
  const sample = async (): Promise<
    Omit<Baseline, "stable" | "coverage" | "fingerprint">
  > => {
    assertNotAborted(options.signal);
    let head: string | null = null,
      branch: string | null = null,
      status = "";
    let state: Baseline["gitState"] = gitState,
      why = reason;
    const entries = new Map<string, FileEvidence>();
    const entry = (p: string): FileEvidence | undefined => {
      if (
        !within(p, scope) ||
        excluded.some((x) => p === x || p.startsWith(`${x}/`))
      )
        return;
      if (!isRelativePath(p))
        throw new PcmError(
          "UNSUPPORTED_PATH",
          "文件路径无法安全表示；此次检查不完整。",
        );
      if (!entries.has(p) && entries.size >= maxFiles) {
        exceeded = true;
        return;
      }
      if (!entries.has(p))
        entries.set(p, {
          id: `f_${digest(p)}`,
          path: p,
          state: "unreadable",
          sha256: null,
          reason: "尚未读取",
          index: [],
          head: null,
        });
      return entries.get(p)!;
    };
    if (gitState === "available") {
      try {
        const args = [
          ...(scope.includes(".") ? ["."] : scope.map((s) => `:(literal)${s}`)),
          ...excluded.map((s) => `:(exclude,literal)${s}`),
        ];
        status = decode(
          await git(
            root,
            [
              "status",
              "--porcelain=v2",
              "-z",
              "--untracked-files=all",
              "--",
              ...args,
            ],
            options.signal,
          ),
        );
        const rawHead = await git(
          root,
          ["rev-parse", "--verify", "--quiet", "HEAD"],
          options.signal,
        ).catch(() => null);
        if (rawHead) head = decode(rawHead).trim();
        branch = await git(
          root,
          ["symbolic-ref", "--quiet", "--short", "HEAD"],
          options.signal,
        )
          .then((b) => decode(b).trim())
          .catch(() => null);
        if (!head && branch) {
          state = "unborn";
          why = "仓库尚无提交。";
        } else if (!head)
          throw new PcmError("HEAD_UNAVAILABLE", "无法确定 HEAD。");
        for (const record of records(
          await git(
            root,
            ["ls-files", "--stage", "-z", "--", ...args],
            options.signal,
          ),
        )) {
          const tab = record.indexOf("\t");
          const [mode, oid, stage] = record.slice(0, tab).split(" ");
          if (tab < 0 || !mode || !oid || stage === undefined)
            throw new PcmError("GIT_PARSE", "无法解析索引。");
          entry(record.slice(tab + 1))?.index.push({
            mode,
            oid,
            stage: Number(stage),
          });
        }
        for (const p of records(
          await git(
            root,
            ["ls-files", "--others", "--exclude-standard", "-z", "--", ...args],
            options.signal,
          ),
        ))
          entry(p);
        if (head)
          for (const record of records(
            await git(root, ["ls-tree", "-r", "-z", head], options.signal),
          )) {
            const tab = record.indexOf("\t");
            const [mode, , oid] = record.slice(0, tab).split(" ");
            if (mode && oid) {
              const f = entry(record.slice(tab + 1));
              if (f) f.head = { mode, oid };
            }
          }
      } catch (e) {
        if (options.signal?.aborted) throw e;
        state = "unavailable";
        why = e instanceof PcmError ? e.message : "Git 检查失败。";
      }
    } else if (gitState === "not-git") {
      let directories = 0;
      const walk = async (rel: string): Promise<void> => {
        assertNotAborted(options.signal);
        if (excluded.some((x) => rel === x || rel.startsWith(`${x}/`))) return;
        if (++directories > maxFiles * 2) {
          exceeded = true;
          return;
        }
        if (entries.size >= maxFiles) {
          exceeded = true;
          return;
        }
        const full = await safePath(root, rel, true);
        let st;
        try {
          st = await lstat(full);
        } catch {
          entry(rel);
          return;
        }
        if (!st.isDirectory() || st.isSymbolicLink() || sensitive(rel)) {
          entry(rel);
          return;
        }
        for (const child of (await readdir(full)).sort()) {
          if (skip.has(child)) {
            const omitted = rel === "." ? child : `${rel}/${child}`;
            if (!excluded.includes(omitted)) excluded.push(omitted);
            continue;
          }
          await walk(rel === "." ? child : `${rel}/${child}`);
        }
      };
      for (const s of scope) await walk(s);
    }
    for (const s of scope)
      if (
        s !== "." &&
        ![...entries.keys()].some((p) => p === s || p.startsWith(`${s}/`))
      )
        entry(s);
    const files = [...entries.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    let bytesLeft = options.maxTotalBytes ?? 64 * 1024 * 1024;
    for (const f of files) {
      assertNotAborted(options.signal);
      if (bytesLeft < 1) {
        exceeded = true;
        Object.assign(f, {
          state: "excluded",
          sha256: null,
          reason: "达到本次总读取上限。",
        });
        continue;
      }
      Object.assign(
        f,
        await fileHash(root, f.path, Math.min(maxFileBytes, bytesLeft)),
      );
      if (f.state === "present")
        bytesLeft -= (await lstat(await safePath(root, f.path))).size;
    }
    // Store only a digest of porcelain output; raw paths can contain sensitive names or content.
    return {
      repositoryId,
      worktreeId,
      head,
      branch,
      gitState: state,
      reason: why,
      workingTree:
        state === "available" || state === "unborn"
          ? status
            ? "dirty"
            : "clean"
          : "unknown",
      status: digest(status),
      scope,
      exclusions: [...excluded].sort(),
      files,
    };
  };
  const first = await sample(),
    second = await sample();
  const stable = canonical(first) === canonical(second);
  const excludedScope = scope.some((s) =>
    excluded.some((x) => s === x || s.startsWith(`${x}/`)),
  );
  const incomplete =
    exceeded ||
    excludedScope ||
    second.gitState === "unavailable" ||
    second.files.some((f) => f.state !== "present");
  const findings: Finding[] = [];
  if (excludedScope)
    findings.push({
      code: "SCOPE_EXCLUDED",
      severity: "warning",
      message: "请求范围被排除规则覆盖，不能确认其中事实。",
      action: "明确重新选择范围；敏感路径仍不能读取。",
    });
  if (!stable)
    findings.push({
      code: "UNSTABLE",
      severity: "error",
      message: "采集期间文件或 Git 状态变化。",
      action: "等待写入完成后重新检查。",
    });
  if (exceeded)
    findings.push({
      code: "LIMIT",
      severity: "warning",
      message: "超过采集数量上限，检查不完整。",
      action: "选择更小模块范围。",
    });
  for (const f of second.files)
    if (f.state !== "present")
      findings.push({
        code: `FILE_${f.state.toUpperCase()}`,
        severity: "warning",
        path: sensitive(f.path) ? "[sensitive path]" : f.path,
        message: f.reason!,
        action: "检查必要文件的可访问性；不要把未读取内容当成已验证。",
      });
  if (second.gitState !== "available")
    findings.push({
      code: second.gitState.toUpperCase(),
      severity: second.gitState === "unavailable" ? "error" : "warning",
      message: second.reason!,
      action: "保留 Git 状态限制，依据可用文件继续核实。",
    });
  if (!stable || incomplete || second.gitState === "unborn")
    if (second.workingTree === "clean") second.workingTree = "unknown";
  const baseline: Baseline = {
    ...second,
    stable,
    coverage: incomplete ? "incomplete" : "scoped",
    fingerprint: digest(canonical(second)),
  };
  return { root, baseline, findings };
}
