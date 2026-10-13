import assert from "node:assert/strict";
import {
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  rm,
  rename,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { ZipFile } = require("yazl");
const yauzl = require("yauzl");
const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = path.resolve(root, "../../outputs");
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const extension = JSON.parse(
  await readFile(path.join(root, "packages/vscode/package.json"), "utf8"),
);
assert.equal(version, extension.version, "root and extension version mismatch");
const files = new Map();
const add = async (name, source) => files.set(name, await readFile(source));
await add("bin/pcm.cjs", path.join(root, "dist/pcm.cjs"));
await add(
  "schema/snapshot-v1.json",
  path.join(root, "dist/schema/snapshot-v1.json"),
);
await add(
  "THIRD_PARTY_NOTICES.txt",
  path.join(root, "THIRD_PARTY_NOTICES.txt"),
);
await add("verify.mjs", path.join(root, "scripts/release-verify.mjs"));
await add(
  `extensions/${extension.name}-${version}.vsix`,
  path.join(outputDir, `${extension.name}-${version}.vsix`),
);
await add("docs/overview.md", path.join(root, "docs/delivery-overview.md"));
await add(
  "evidence/offline-demo-2026-10-13.json",
  path.join(root, "docs/next/demo-2026-10-13.json"),
);
const guide = `# Project Context Manager ${version}\n\n本地 Alpha 交付包：CLI + VS Code 扩展 + 协议 Schema + 实际演示证据。没有打包源码、项目交接记录、私人简历或账号数据。\n\n## 使用 CLI\n\n需要 Node.js >=22.12；Git 证据采集需要 Git。解压后无需 npm install：\n\n    node bin/pcm.cjs status /path/to/project\n    node bin/pcm.cjs handoff /path/to/project --task /path/to/task.json\n    node bin/pcm.cjs restore /path/to/project\n    node bin/pcm.cjs verify /path/to/project\n\n任务 JSON：{ "goal": "目标", "current": "断点", "next": "下一步", "workInProgress": ["未完成工作"] }。未确定字段可用 null。查看/恢复/核验默认只读；handoff 写入上下文记录，不执行开发。\n\n退出码 0=操作成功；1=失败；2=部分成功或语义待核实；130=取消。恢复返回 2 通常表示机器证据已读、语义尚待确认，不能只按非零退出码认定恢复失败。\n\n## 安装 GUI\n\n在 VS Code 的扩展菜单选择“从 VSIX 安装”，使用 extensions/${extension.name}-${version}.vsix。打开本地项目，在资源管理器的 Project Context Manager 选择交接、恢复或查看状态。信任项目由你决定；未受信任工作区不生成记录或调用 Agent。\n\n## 自检\n\n    node verify.mjs\n\n自检比较 manifest.json 中的文件 SHA256，然后在系统临时目录创建合成项目，运行本包 CLI 的缺少记录、交接、只读恢复和源码漂移场景。验证后只清理其明确创建的临时目录。它不读取你的实际项目，不调用 Agent，也不自动安装扩展。\n\n## 验证范围\n\n本包校验与 CLI 自检有本次 Windows 执行报告，另附 2026-10-13 离线演示证据。GUI 有此前限定范围验收，运行中取消/重试及 OS 权限拒绝仍待补齐；macOS/Linux 实际结果及用户研究未完成。单次耗时不是性能基准。manifest 只能核对内容一致性，不是发布者签名。\n\nCodex 语义分析需要用户另外授权并独立安装、登录 CLI；结果为候选判断。Claude/Gemini 目前仅接口设计。原项目未声明开源授权；本包不改变许可状态，第三方许可见 THIRD_PARTY_NOTICES.txt。\n`;
files.set("README.md", Buffer.from(guide));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = {
  schemaVersion: 1,
  kind: "local-alpha-delivery",
  version,
  generatedAt: new Date().toISOString(),
  files: [...files].map(([name, bytes]) => ({
    path: name,
    bytes: bytes.length,
    sha256: digest(bytes),
  })),
};
files.set(
  "manifest.json",
  Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
);
await mkdir(outputDir, { recursive: true });
const token = randomUUID();
const filename = `project-context-manager-${version}-delivery-${token}.zip`;
const pending = path.join(outputDir, `.${filename}.pending`);
const final = path.join(outputDir, filename);
const zip = new ZipFile();
const pumping = pipeline(
  zip.outputStream,
  createWriteStream(pending, { flags: "wx" }),
);
zip.on("error", (error) => zip.outputStream.destroy(error));
for (const [name, bytes] of files) zip.addBuffer(bytes, name);
zip.end();
await pumping;
const readZip = () =>
  new Promise((resolve, reject) => {
    yauzl.open(
      pending,
      { lazyEntries: true, autoClose: true },
      (error, archive) => {
        if (error) return reject(error);
        const actual = new Map();
        archive.on("error", reject);
        archive.on("entry", (entry) => {
          if (
            !files.has(entry.fileName) ||
            actual.has(entry.fileName) ||
            entry.uncompressedSize > 16 * 1024 * 1024
          ) {
            archive.close();
            return reject(new Error("Unexpected archive entry"));
          }
          archive.openReadStream(entry, (error, stream) => {
            if (error) return reject(error);
            const chunks = [];
            stream.on("data", (data) => chunks.push(data));
            stream.on("error", reject);
            stream.on("end", () => {
              actual.set(entry.fileName, Buffer.concat(chunks));
              archive.readEntry();
            });
          });
        });
        archive.on("end", () => resolve(actual));
        archive.readEntry();
      },
    );
  });
const actual = await readZip();
assert.equal(actual.size, files.size);
for (const [name, bytes] of files)
  assert.deepEqual(actual.get(name), bytes, name);
const nestedVsix = await new Promise((resolve, reject) => {
  yauzl.fromBuffer(
    files.get(`extensions/${extension.name}-${version}.vsix`),
    { lazyEntries: true },
    (error, archive) => {
      if (error) return reject(error);
      const entries = new Map();
      archive.on("error", reject);
      archive.on("entry", (entry) => {
        if (
          entries.has(entry.fileName) ||
          entry.uncompressedSize > 16 * 1024 * 1024
        ) {
          archive.close();
          return reject(new Error("Invalid VSIX entry"));
        }
        archive.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            archive.readEntry();
          });
        });
      });
      archive.on("end", () => resolve(entries));
      archive.readEntry();
    },
  );
});
const expectedVsix = [
  "[Content_Types].xml",
  "extension.vsixmanifest",
  "extension/package.json",
  "extension/readme.md",
  "extension/THIRD_PARTY_NOTICES.txt",
  "extension/dist/extension.cjs",
  "extension/resources/state-reconstruction.md",
];
assert.deepEqual([...nestedVsix.keys()].sort(), expectedVsix.sort());
assert.equal(
  JSON.parse(nestedVsix.get("extension/package.json").toString()).version,
  version,
);
assert.deepEqual(
  nestedVsix.get("extension/dist/extension.cjs"),
  await readFile(path.join(root, "packages/vscode/dist/extension.cjs")),
);
assert.deepEqual(
  nestedVsix.get("extension/resources/state-reconstruction.md"),
  await readFile(path.join(root, "references/state-reconstruction.md")),
);

const temporaryRoot = path.resolve(tmpdir());
const stage = await mkdtemp(path.join(temporaryRoot, "pcm-release-unzip-"));
let check;
try {
  for (const [name, bytes] of actual) {
    const destination = path.resolve(stage, name);
    assert.ok(destination.startsWith(stage + path.sep));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  const result = spawnSync(process.execPath, [path.join(stage, "verify.mjs")], {
    cwd: stage,
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  check = JSON.parse(result.stdout);
  assert.equal(check.status, "Passed");
  const binary = path.join(stage, "bin/pcm.cjs");
  await writeFile(
    binary,
    Buffer.concat([
      actual.get("bin/pcm.cjs"),
      Buffer.from("\n// tampered fixture\n"),
    ]),
  );
  const rejected = spawnSync(
    process.execPath,
    [path.join(stage, "verify.mjs")],
    { cwd: stage, encoding: "utf8", timeout: 30000 },
  );
  if (rejected.error) throw rejected.error;
  assert.notEqual(rejected.status, 0, "tampered package must fail self-check");
  assert.ok(
    rejected.stderr.includes("bin/pcm.cjs"),
    "failure must identify corrupted file",
  );
  assert.equal(
    rejected.stdout,
    "",
    "CLI must not execute after integrity failure",
  );
  check.tamperRejection = "Passed before CLI execution";
} finally {
  const resolved = path.resolve(stage);
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith("pcm-release-unzip-")
  )
    throw new Error("Unsafe staging cleanup path");
  await rm(resolved, { recursive: true, force: true });
}
await rename(pending, final);
const report = {
  status: "Passed",
  artifact: filename,
  sha256: digest(await readFile(final)),
  archiveEntries: [...actual.keys()],
  archiveByteCheck: "Passed",
  nestedVsixCheck: {
    status: "Passed",
    entries: expectedVsix,
    currentBundleBytes: "Matched",
    currentPolicyBytes: "Matched",
  },
  extractedCliCheck: check,
  verificationTime: new Date().toISOString(),
};
await writeFile(
  path.join(outputDir, `${filename}.verification.json`),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, path: final }, null, 2));
