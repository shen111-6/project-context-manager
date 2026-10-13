#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const entry = fileURLToPath(new URL("../dist/pcm.cjs", import.meta.url));
if (!existsSync(entry)) {
  process.stderr.write(
    "确定性引擎尚未构建。使用原 Skill v2 规则，并明确未进行程序化核验。开发安装：npm ci --ignore-scripts；npm run build。\n",
  );
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", () => {
    process.stderr.write("引擎无法启动。\n");
    process.exitCode = 1;
  });
  child.on("exit", (code) => (process.exitCode = code ?? 1));
  process.on("SIGINT", () => child.kill());
}
