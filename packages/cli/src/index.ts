#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, capability } from "../../adapters/src/index.js";
import {
  makePlan,
  freezePlan,
  score,
  type Manifest,
  type CaseBinding,
  type RunRecord,
} from "../../evaluation/src/index.js";
import {
  operate,
  readBounded,
  prepare,
  importLegacy,
  readEvidence,
  runValidation,
  scrub,
  PcmError,
} from "../../engine/src/index.js";
import {
  validateSnapshot,
  type Operation,
  type Snapshot,
} from "../../protocol/src/index.js";
const [command = "status", project = ".", ...args] = process.argv.slice(2),
  abort = new AbortController();
process.on("SIGINT", () => abort.abort());
const print = (x: unknown) =>
  process.stdout.write(JSON.stringify(scrub(x), null, 2) + "\n");
declare const PCM_POLICY: string;
async function main() {
  try {
    if (command === "evaluation-plan")
      print(
        makePlan(
          project === "." ? "pcm-evaluation-1" : project,
          args.length ? (args as Parameters<typeof makePlan>[1]) : undefined,
        ),
      );
    else if (
      command === "evaluation-freeze" ||
      command === "evaluation-score"
    ) {
      const p = path.resolve(project),
        input = JSON.parse(
          await readBounded(path.dirname(p), path.basename(p)),
        ) as {
          manifest: Manifest;
          bindings: CaseBinding[];
          records: RunRecord[];
        };
      print(
        command === "evaluation-freeze"
          ? freezePlan(input.manifest, input.bindings)
          : score(input.manifest, input.records),
      );
    } else if (command === "validate-snapshot") {
      const p = path.resolve(project);
      const check = validateSnapshot(
        JSON.parse(await readBounded(path.dirname(p), path.basename(p))),
      );
      print(check);
      process.exitCode = check.valid ? 0 : 2;
    } else if (command === "legacy")
      print(await importLegacy(path.resolve(project), args[0] ?? "handoff.md"));
    else if (command === "evidence")
      print(
        await readEvidence(path.resolve(project), args[0] ?? "", abort.signal),
      );
    else if (command === "validate-run") {
      if (args[0] !== "--allow-project-side-effects")
        throw new PcmError(
          "VALIDATION_AUTHORIZATION",
          "验证进程需显式 --allow-project-side-effects；只读模块不调用它。",
        );
      const argv: unknown = JSON.parse(args[1] ?? "null");
      if (!Array.isArray(argv) || argv.some((x) => typeof x !== "string"))
        throw new PcmError(
          "VALIDATION_ARGUMENTS",
          "以 JSON 参数数组提供当前用户明确选择的验证命令。",
        );
      const result = await runValidation({
        projectPath: path.resolve(project),
        argv,
        scope: args.slice(2).length ? args.slice(2) : ["."],
        authorization: "current-cli-user",
        allowProjectSideEffects: true,
        signal: abort.signal,
      });
      print(result);
      process.exitCode = result.record.status === "Passed" ? 0 : 2;
    } else if (command === "capabilities")
      print(await capability("codex", args[0]));
    else if (command === "analyze") {
      const policy =
        typeof PCM_POLICY === "string"
          ? PCM_POLICY
          : await readBounded(
              path.resolve(
                path.dirname(fileURLToPath(import.meta.url)),
                "../../..",
              ),
              "references/state-reconstruction.md",
              65536,
            );
      const machine = await operate({
        protocolVersion: 1,
        requestId: randomUUID(),
        operation: "restore",
        projectPath: path.resolve(project),
        signal: abort.signal,
      });
      if (machine.operationOutcome === "failed") {
        print(machine);
        process.exitCode = 1;
      } else {
        const result = await analyze({
          host: "codex",
          projectPath: path.resolve(project),
          snapshot: machine.snapshot,
          rules: policy,
          authorized: true,
          signal: abort.signal,
          executable: args[0],
        });
        print({ machine, analysis: result });
        process.exitCode = result.status === "candidate" ? 2 : 1;
      }
    } else {
      const request = {
        protocolVersion: 1 as const,
        requestId: randomUUID(),
        operation: command as Operation,
        projectPath: path.resolve(project),
        signal: abort.signal,
        scope: undefined as string[] | undefined,
        task: undefined as Snapshot["task"] | undefined,
        storePath: undefined as string | undefined,
      };
      const scopes: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i]!;
        if (a === "--task") {
          const p = path.resolve(args[++i] ?? "");
          request.task = JSON.parse(
            await readBounded(path.dirname(p), path.basename(p), 65536),
          );
        } else if (a === "--store") request.storePath = args[++i];
        else if (a.startsWith("--"))
          throw new PcmError("ARGUMENT", "不支持的 CLI 参数。");
        else scopes.push(a);
      }
      request.scope = scopes.length ? scopes : undefined;
      if (command === "preview") {
        request.operation = "handoff";
        print(await prepare(request));
      } else {
        const result = await operate(request);
        print(result);
        process.exitCode =
          result.operationOutcome === "failed"
            ? 1
            : result.operationOutcome === "cancelled"
              ? 130
              : result.operationOutcome === "partial"
                ? 2
                : 0;
      }
    }
  } catch (e) {
    print({
      operationOutcome: "failed",
      code: e instanceof PcmError ? e.code : "INPUT_ERROR",
      message: e instanceof PcmError ? e.message : "无法读取或校验输入。",
    });
    process.exitCode = 1;
  }
}
void main();
