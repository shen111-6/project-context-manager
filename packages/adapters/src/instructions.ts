import path from "node:path";
import { lstat } from "node:fs/promises";
import { safePath } from "../../engine/src/safety.js";
export async function instructionPaths(
  root: string,
  scope: string[],
  host: "codex" | "claude",
): Promise<string[]> {
  const dirs = new Set(["."]);
  for (const s of scope) {
    let p = s;
    try {
      if (!(await lstat(await safePath(root, s))).isDirectory())
        p = path.posix.dirname(s);
    } catch {
      p = path.posix.dirname(s);
    }
    while (p !== ".") {
      dirs.add(p);
      const parent = path.posix.dirname(p);
      if (parent === p) break;
      p = parent;
    }
  }
  const paths: string[] = [];
  for (const dir of [...dirs].sort(
    (a, b) => a.split("/").length - b.split("/").length,
  )) {
    const names =
      host === "codex"
        ? ["AGENTS.override.md", "AGENTS.md"]
        : ["CLAUDE.md", ".claude/CLAUDE.md"];
    for (const name of names) {
      const relative = dir === "." ? name : `${dir}/${name}`;
      try {
        if ((await lstat(await safePath(root, relative))).isFile()) {
          paths.push(relative);
          if (host === "codex") break;
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }
  return paths;
}
