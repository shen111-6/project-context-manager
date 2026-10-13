import { it, expect } from "vitest";
import { build } from "esbuild";
import path from "node:path";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

async function load(file: string, vscode: unknown, engine: unknown) {
  const output = await build({
    entryPoints: [path.resolve(file)],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "host-mocks",
        setup(builder) {
          builder.onResolve(
            { filter: /^(vscode|.*engine\/src\/.*)$/ },
            (args) => ({ path: args.path, external: true }),
          );
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", output.outputFiles![0]!.text)(
    (name: string) =>
      name.startsWith("node:")
        ? nativeRequire(name)
        : name === "vscode"
          ? vscode
          : engine,
    module,
    module.exports,
  );
  return module.exports;
}
function panel() {
  let handler: (message: unknown) => Promise<void>;
  return {
    webview: {
      html: "",
      options: {},
      postMessage: async () => true,
      onDidReceiveMessage: (fn: typeof handler) => {
        handler = fn;
        return { dispose() {} };
      },
    },
    onDidDispose() {},
    send: (message: unknown) => handler(message),
  };
}
it("result actions stay bound to the original project and reject injected project arguments", async () => {
  const p = panel(),
    calls: unknown[][] = [],
    project = { name: "original", uri: { fsPath: "/original" } };
  const host = await load(
    "packages/vscode/src/result-host.ts",
    {
      commands: {
        executeCommand: async (...args: unknown[]) => calls.push(args),
      },
    },
    { scrub: (x: unknown) => x },
  );
  host.wireResult(
    p,
    {
      protocolVersion: 1,
      requestId: "test",
      operation: "restore",
      operationOutcome: "failed",
      evidenceAssessment: "Insufficient Evidence",
      handoffReadiness: "Not applicable",
      findings: [
        {
          code: "NO_RECORD",
          severity: "error",
          message: "missing",
          action: "handoff",
        },
        {
          code: "RECORD_CHANGED",
          severity: "error",
          message: "changed",
          action: "history",
        },
      ],
      artifacts: [],
      nextAction: "inspect",
    },
    project,
  );
  for (const action of ["handoff", "history", "refresh"])
    await p.send({ action });
  expect(calls).toEqual([
    ["pcm.handoff", project],
    ["pcm.history", project],
    ["pcm.status", project],
  ]);
  await p.send({ action: "handoff", project: "/other" });
  expect(calls).toHaveLength(3);
});
it("post-publication failure preserves the generated artifact paths and does not report write failure", async () => {
  const p = panel(),
    project = {
      name: "original",
      uri: { toString: () => "original", fsPath: "/original" },
    };
  let writes = 0;
  class PcmError extends Error {
    constructor(
      public code: string,
      message: string,
      public action = "inspect",
    ) {
      super(message);
    }
  }
  const host = await load(
    "packages/vscode/src/handoff.ts",
    {
      workspace: { isTrusted: true, textDocuments: [] },
      ViewColumn: { Active: 1 },
      ProgressLocation: { Notification: 1 },
      window: {
        createWebviewPanel: () => p,
        withProgress: async (_options: unknown, fn: any) =>
          fn(
            { report() {} },
            { onCancellationRequested: () => ({ dispose() {} }) },
          ),
      },
    },
    {
      PcmError,
      scrub: (x: unknown) => x,
      prepare: async () => ({
        storePath: "docs/project-context/pcm",
        snapshot: {
          task: {
            goal: "goal",
            current: "WIP",
            next: "inspect",
            workInProgress: [],
          },
          gaps: [],
          baseline: { branch: "main" },
        },
      }),
      publish: async () => {
        writes++;
        return ["/original/snapshot.json", "/original/snapshot.md"];
      },
      checkPublishedBaseline: async () => {
        throw new Error("read failed after publication");
      },
    },
  );
  await host.openHandoff(project, { subscriptions: [] });
  await p.send({ action: "publish" });
  expect(writes).toBe(1);
  expect(p.webview.html).toContain("交接包已生成，结果展示未完成");
  expect(p.webview.html).toContain("/original/snapshot.json");
  expect(p.webview.html).not.toContain("交接尚未生成");
  await p.send({ action: "publish" });
  expect(writes).toBe(1);
});

class HostPcmError extends Error {
  constructor(
    public code: string,
    message: string,
    public action = "retry",
  ) {
    super(message);
  }
}
const hostProject = {
  name: "fixture",
  uri: { toString: () => "fixture", fsPath: "/fixture" },
};
const preparedFixture = () => ({
  storePath: "docs/project-context/pcm",
  snapshot: {
    task: {
      goal: "goal",
      current: "WIP",
      next: "inspect",
      workInProgress: ["app.ts"],
    },
    gaps: [],
    baseline: { branch: "main", stable: true, coverage: "scoped", files: [] },
  },
});
function vscodeHost(p: ReturnType<typeof panel>) {
  return {
    workspace: { isTrusted: true, textDocuments: [] },
    ViewColumn: { Active: 1 },
    ProgressLocation: { Notification: 1 },
    window: {
      createWebviewPanel: () => p,
      withProgress: async (_options: unknown, fn: any) =>
        fn(
          { report() {} },
          { onCancellationRequested: () => ({ dispose() {} }) },
        ),
    },
  };
}
it("cancel reaches an in-flight preparation and retry uses a fresh live signal", async () => {
  const p = panel(),
    signals: AbortSignal[] = [];
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const host = await load("packages/vscode/src/handoff.ts", vscodeHost(p), {
    PcmError: HostPcmError,
    scrub: (x: unknown) => x,
    prepare: async (request: { signal: AbortSignal }) => {
      signals.push(request.signal);
      if (signals.length === 1) {
        markStarted();
        return new Promise((_resolve, reject) =>
          request.signal.addEventListener(
            "abort",
            () => reject(new HostPcmError("CANCELLED", "操作已取消")),
            { once: true },
          ),
        );
      }
      return preparedFixture();
    },
  });
  const opening = host.openHandoff(hostProject, { subscriptions: [] });
  await started;
  expect(signals[0]!.aborted).toBe(false);
  await p.send({ action: "cancel" });
  await opening;
  expect(signals[0]!.aborted).toBe(true);
  expect(p.webview.html).toContain("操作已取消");
  expect(p.webview.html).toContain("重新检查项目");
  await p.send({ action: "retry" });
  expect(signals).toHaveLength(2);
  expect(signals[1]).not.toBe(signals[0]);
  expect(signals[1]!.aborted).toBe(false);
  expect(p.webview.html).toContain("检查交接资料");
  expect(p.webview.html).toContain("WIP");
});
it("a publication failure reports no success and retry freshly prepares before a successful write", async () => {
  const p = panel();
  let preparations = 0,
    attempts = 0;
  const host = await load("packages/vscode/src/handoff.ts", vscodeHost(p), {
    PcmError: HostPcmError,
    scrub: (x: unknown) => x,
    prepare: async () => {
      preparations++;
      return preparedFixture();
    },
    publish: async () => {
      attempts++;
      if (attempts === 1)
        throw new HostPcmError("IO_ERROR", "权限拒绝，写入未完成");
      return ["/fixture/snapshot.json", "/fixture/handoff.md"];
    },
    checkPublishedBaseline: async () => [],
  });
  await host.openHandoff(hostProject, { subscriptions: [] });
  await p.send({ action: "publish" });
  expect(p.webview.html).toContain("交接尚未生成");
  expect(p.webview.html).toContain("IO_ERROR");
  expect(p.webview.html).not.toContain("交接资料已生成");
  await p.send({ action: "retry" });
  expect(preparations).toBe(2);
  await p.send({ action: "publish" });
  expect(attempts).toBe(2);
  expect(p.webview.html).toContain("交接资料已生成");
  expect(p.webview.html).toContain("/fixture/handoff.md");
});
it("loss of workspace trust after preview stops publication", async () => {
  const p = panel(),
    vscode = vscodeHost(p);
  let writes = 0;
  const host = await load("packages/vscode/src/handoff.ts", vscode, {
    PcmError: HostPcmError,
    scrub: (x: unknown) => x,
    prepare: async () => preparedFixture(),
    publish: async () => {
      writes++;
      return [];
    },
  });
  await host.openHandoff(hostProject, { subscriptions: [] });
  vscode.workspace.isTrusted = false;
  await p.send({ action: "publish" });
  expect(writes).toBe(0);
  expect(p.webview.html).toContain("WORKSPACE_UNTRUSTED");
  expect(p.webview.html).not.toContain("交接资料已生成");
});
