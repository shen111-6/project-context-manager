import { collect } from "./collect.js";
import { readBounded } from "./store.js";
import { digest, sensitive, PcmError, redact } from "./safety.js";
import { git, decode } from "./git.js";
export async function readEvidence(
  project: string,
  relative: string,
  signal?: AbortSignal,
) {
  if (sensitive(relative))
    throw new PcmError("SENSITIVE_PATH", "不读取敏感路径。");
  const c = await collect(project, { scope: [relative], signal });
  const f = c.baseline.files.find((f) => f.state === "present");
  if (!f || c.baseline.files.length !== 1)
    throw new PcmError("EVIDENCE_SCOPE", "请选择一个可访问的具体文件。");
  const text = await readBounded(c.root, f.path, 256 * 1024);
  if (digest(text) !== f.sha256)
    throw new PcmError("EVIDENCE_CHANGED", "文件证据在读取时变化。");
  const working =
      c.baseline.gitState === "available"
        ? redact(
            decode(
              await git(
                c.root,
                [
                  "diff",
                  "--no-ext-diff",
                  "--no-textconv",
                  "--",
                  `:(literal)${f.path}`,
                ],
                signal,
              ),
            ),
          )
        : null,
    staged =
      c.baseline.gitState === "available"
        ? redact(
            decode(
              await git(
                c.root,
                [
                  "diff",
                  "--cached",
                  "--no-ext-diff",
                  "--no-textconv",
                  "--",
                  `:(literal)${f.path}`,
                ],
                signal,
              ),
            ),
          )
        : null;
  return {
    path: f.path,
    sha256: f.sha256,
    text: redact(text),
    redacted: text !== redact(text),
    diff: { working, staged },
    limitation:
      "Git diff 不包含未跟踪文件；文本为当前磁盘内容，已按已知模式脱敏。",
  };
}
