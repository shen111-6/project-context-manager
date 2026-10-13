import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PcmError } from "./safety.js";
const exec = promisify(execFile);
export function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    LC_ALL: "C",
  };
}
export async function git(
  root: string,
  args: string[],
  signal?: AbortSignal,
): Promise<Buffer> {
  try {
    const { stdout } = await exec(
      "git",
      [
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-c",
        "core.preloadIndex=false",
        "-c",
        "core.quotePath=false",
        ...args,
      ],
      {
        cwd: root,
        env: gitEnvironment(),
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 20000,
        windowsHide: true,
        signal,
      },
    );
    return stdout;
  } catch (e) {
    if (signal?.aborted) throw new PcmError("CANCELLED", "操作已取消。");
    const err = e as NodeJS.ErrnoException & { stderr?: Buffer };
    if (err.code === "ENOENT")
      throw new PcmError(
        "GIT_UNAVAILABLE",
        "未找到 Git。",
        "安装 Git 或使用非 Git 项目只读模式。",
      );
    if (err.stderr?.toString().includes("not a git repository"))
      throw new PcmError("NOT_GIT", "当前目录不是 Git 仓库。");
    throw new PcmError(
      "GIT_FAILED",
      `Git ${args[0]} 检查失败；未修改 Git 配置。`,
      "检查 Git 所有权、权限、对象可用性及命令超时；不要自动添加安全目录例外。",
    );
  }
}
export function decode(b: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    throw new PcmError(
      "PATH_ENCODING",
      "Git 输出包含不支持的路径编码。",
      "使用 UTF-8 路径或缩小范围；此次检查不完整。",
    );
  }
}
export function records(b: Buffer): string[] {
  return decode(b).split("\0").filter(Boolean);
}
