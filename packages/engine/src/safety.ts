import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isRelativePath } from "../../protocol/src/index.js";

export class PcmError extends Error {
  constructor(
    public code: string,
    message: string,
    public action = "检查项目路径和访问权限后重试。",
  ) {
    super(message);
  }
}
export function digest(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function sensitive(p: string): boolean {
  return (
    p
      .split("/")
      .some((s) =>
        /^(\.env(?:\..*)?|\.git|\.ssh|\.aws|\.azure|\.gnupg|\.npmrc|\.pypirc|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$/i.test(
          s,
        ),
      ) || /\.(pem|key|p12|pfx)$/i.test(p)
  );
}
export function redact(s: string): string {
  return s
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /(?:sk-[a-zA-Z0-9_-]{10,}|gh[pousr]_[a-zA-Z0-9_]{10,}|AKIA[A-Z0-9]{16})/g,
      "[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@")
    .replace(
      /((?:password|token|api[_-]?key|secret)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}
export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PcmError("CANCELLED", "操作已取消。");
}
export function scrub<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map(scrub) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrub(v)]),
    ) as T;
  return value;
}
export async function safePath(
  root: string,
  relative: string,
  allowMissing = false,
): Promise<string> {
  if (!isRelativePath(relative))
    throw new PcmError(
      "UNSAFE_PATH",
      "路径必须在项目范围内，不能包含目录穿越或控制字符。",
    );
  let current = root;
  for (const segment of relative.split("/")) {
    if (segment === ".") continue;
    current = path.join(current, segment);
    try {
      const st = await lstat(current);
      if (st.isSymbolicLink())
        throw new PcmError("SYMLINK", "不跟随符号链接或目录联接。");
      const resolved = await realpath(current),
        rel = path.relative(root, resolved);
      if (
        rel === ".." ||
        rel.startsWith(`..${path.sep}`) ||
        path.isAbsolute(rel)
      )
        throw new PcmError("UNSAFE_PATH", "路径越过项目边界。");
    } catch (e) {
      if (allowMissing && (e as NodeJS.ErrnoException).code === "ENOENT")
        continue;
      throw e;
    }
  }
  return current;
}
