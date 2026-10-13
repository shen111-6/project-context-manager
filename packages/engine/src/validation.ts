import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { ValidationRecord } from "../../protocol/src/index.js";
import { collect } from "./collect.js";
import { PcmError, redact, assertNotAborted } from "./safety.js";
const exec = promisify(execFile);
export interface ValidationRequest {
  projectPath: string;
  argv: string[];
  scope: string[];
  authorization: "current-cli-user" | "trusted-gui-action";
  allowProjectSideEffects: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export async function runValidation(
  request: ValidationRequest,
): Promise<{
  record: ValidationRecord;
  output: string;
  currentApplicable: boolean;
}> {
  assertNotAborted(request.signal);
  if (
    !request.allowProjectSideEffects ||
    !["current-cli-user", "trusted-gui-action"].includes(request.authorization)
  )
    throw new PcmError(
      "VALIDATION_AUTHORIZATION",
      "验证进程可能写入项目，必须由当前受信任交互独立授权。",
    );
  if (
    request.timeoutMs !== undefined &&
    (!Number.isInteger(request.timeoutMs) ||
      request.timeoutMs < 1 ||
      request.timeoutMs > 300000)
  )
    throw new PcmError(
      "VALIDATION_TIMEOUT",
      "验证超时必须在 1–300000 毫秒之间。",
    );
  if (
    !request.argv.length ||
    request.argv.length > 100 ||
    request.argv.some(
      (x) => typeof x !== "string" || x.length > 8192 || /[\x00\r\n]/.test(x),
    )
  )
    throw new PcmError("VALIDATION_ARGUMENTS", "无效验证命令参数。");
  if (
    /(?:^|[\\/])(?:git|cmd|powershell|pwsh|bash|sh|zsh|fish)(?:\.exe|\.cmd)?$/i.test(
      request.argv[0]!,
    )
  )
    throw new PcmError(
      "VALIDATION_COMMAND",
      "不将 Git 或 shell 操作作为自动验证入口。",
      "选择具体的已审查测试执行器；不要导入交接中的命令。",
    );
  const before = await collect(request.projectPath, {
    scope: request.scope,
    signal: request.signal,
  });
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "HOME",
    "USERPROFILE",
    "TEMP",
    "TMP",
    "LANG",
  ])
    if (process.env[key]) env[key] = process.env[key];
  const record: ValidationRecord = {
    id: randomUUID(),
    argv: request.argv.map(redact),
    cwd: ".",
    status: "Not run",
    source: "local-run",
    baselineFingerprint: before.baseline.fingerprint,
    exitCode: null,
    recordedAt: new Date().toISOString(),
    scope: before.baseline.scope,
    limitation: "单次执行退出结果仅支持所声明的验证范围，不证明功能完整。",
  };
  let output = "";
  try {
    const r = await exec(request.argv[0]!, request.argv.slice(1), {
      cwd: before.root,
      env,
      windowsHide: true,
      signal: request.signal,
      timeout: request.timeoutMs ?? 30000,
      maxBuffer: 1024 * 1024,
    });
    record.status = "Passed";
    record.exitCode = 0;
    output = redact(r.stdout + "\n" + r.stderr);
  } catch (e) {
    const error = e as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };
    output = redact((error.stdout ?? "") + "\n" + (error.stderr ?? ""));
    if (request.signal?.aborted || error.killed || error.signal) {
      record.status = "Incomplete";
      record.limitation = "验证被取消、超时或输出超过上限。";
    } else if (typeof error.code === "number") {
      record.status = "Failed";
      record.exitCode = error.code;
      record.limitation = "命令实际执行失败；不能简写为未验证。";
    } else {
      record.status = "Blocked";
      record.limitation = "执行器、权限或运行环境不可用。";
    }
  }
  record.recordedAt = new Date().toISOString();
  const after = await collect(before.root, { scope: before.baseline.scope });
  const currentApplicable =
    before.baseline.fingerprint === after.baseline.fingerprint &&
    after.baseline.stable &&
    after.baseline.coverage === "scoped";
  if (record.status === "Passed" && !currentApplicable) {
    record.status = "Incomplete";
    record.limitation =
      "退出码为 0，但执行期间证据基线变化或覆盖不足；当前适用性未确认。";
  }
  return { record, output, currentApplicable };
}
