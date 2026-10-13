import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { snapshotSchema } from "../dist/packages/protocol/src/index.js";
await mkdir("dist/schema", { recursive: true });
await writeFile(
  "dist/schema/snapshot-v1.json",
  JSON.stringify(snapshotSchema, null, 2) + "\n",
);
let notices =
  "Third-party runtime licenses (project source has no declared open-source license).\n\n";
for (const name of [
  "ajv",
  "fast-uri",
  "fast-deep-equal",
  "json-schema-traverse",
  "require-from-string",
]) {
  const pkg = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  const license = await readFile(
    `node_modules/${name}/${name === "require-from-string" ? "license" : "LICENSE"}`,
    "utf8",
  );
  notices += `${name} ${pkg.version} (${pkg.license})\n${license}\n\n`;
}
await writeFile("THIRD_PARTY_NOTICES.txt", notices);
await writeFile("packages/vscode/THIRD_PARTY_NOTICES.txt", notices);
await build({
  entryPoints: ["packages/vscode/src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["vscode"],
  outfile: "packages/vscode/dist/extension.cjs",
  sourcemap: false,
});
for (const dir of ["packages/vscode/resources", "dist/references"]) {
  await mkdir(dir, { recursive: true });
  await copyFile(
    "references/state-reconstruction.md",
    `${dir}/state-reconstruction.md`,
  );
}
await build({
  entryPoints: ["packages/cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/pcm.cjs",
  define: {
    PCM_POLICY: JSON.stringify(
      await readFile("references/state-reconstruction.md", "utf8"),
    ),
  },
});
