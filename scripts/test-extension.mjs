import { runTests } from "@vscode/test-electron";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = await mkdtemp(path.join(tmpdir(), "pcm-vscode-")),
  project = path.join(dir, "project");
await (await import("node:fs/promises")).mkdir(project);
await writeFile(path.join(project, "app.ts"), 'export const state = "WIP";');
const secondary = path.join(dir, "secondary");
await (await import("node:fs/promises")).mkdir(secondary);
await writeFile(path.join(secondary, "second.ts"), "second project");
const workspace = path.join(dir, "acceptance.code-workspace");
await writeFile(
  workspace,
  JSON.stringify({ folders: [{ path: project }, { path: secondary }] }),
);
try {
  await runTests({
    ...(process.env.PCM_VSCODE_PATH
      ? { vscodeExecutablePath: process.env.PCM_VSCODE_PATH }
      : {}),
    extensionDevelopmentPath: path.resolve("packages/vscode"),
    extensionTestsPath: path.resolve("tests/extension-host.cjs"),
    launchArgs: [
      workspace,
      "--disable-workspace-trust",
      "--disable-extensions",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-gpu",
      "--user-data-dir",
      path.join(dir, "profile"),
      "--extensions-dir",
      path.join(dir, "extensions"),
    ],
    extensionTestsEnv: { PCM_TEST_PROJECT: project },
  });
} finally {
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
