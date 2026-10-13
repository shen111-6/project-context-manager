import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const vscePackage = require.resolve("@vscode/vsce/package.json");
const vsceManifest = JSON.parse(await readFile(vscePackage, "utf8"));
const vsce = resolve(dirname(vscePackage), vsceManifest.bin.vsce);
const source = join(root, "packages/vscode");
const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
const outputDir = resolve(root, "../../outputs");
const output = join(outputDir, `${manifest.name}-${manifest.version}.vsix`);
// Only these runtime assets enter staging; never copy the workspace or dependencies.
const files = [
  "package.json",
  "README.md",
  "THIRD_PARTY_NOTICES.txt",
  "dist/extension.cjs",
  "resources/state-reconstruction.md",
];
// Read every required asset before creating staging or replacing an existing VSIX.
for (const file of files) await readFile(join(source, file));
await mkdir(outputDir, { recursive: true });
const temporaryRoot = resolve(tmpdir());
const stage = await mkdtemp(join(temporaryRoot, "pcm-vsix-"));
try {
  for (const file of files) {
    const destination = join(stage, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(source, file), destination);
  }
  const result = spawnSync(process.execPath, [
    vsce, "package", "--no-dependencies", "--allow-missing-repository",
    "--skip-license", "--out", output,
  ], { cwd: stage, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Local VSCE failed (${result.status ?? result.signal}).`);
  console.log(`VSIX: ${output}`);
} finally {
  // Verify the exact generated directory is inside the intended temporary root.
  if (dirname(resolve(stage)) !== temporaryRoot || !resolve(stage).startsWith(temporaryRoot + sep + "pcm-vsix-")) {
    throw new Error("Refusing to remove a staging directory outside the temporary root.");
  }
  await rm(stage, { recursive: true, force: true });
}
