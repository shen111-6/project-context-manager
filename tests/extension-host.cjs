const vscode = require("vscode"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const samePath = (a, b) =>
  process.platform === "win32"
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);
exports.run = async () => {
  const extension = vscode.extensions.getExtension(
    "project-context-manager-local.project-context-manager",
  );
  assert.ok(extension);
  await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const c of [
    "pcm.status",
    "pcm.handoff",
    "pcm.restore",
    "pcm.verify",
    "pcm.checkpoint",
    "pcm.compress",
  ])
    assert.ok(commands.includes(c));
  const selected = vscode.workspace.workspaceFolders.find((f) =>
    samePath(f.uri.fsPath, process.env.PCM_TEST_PROJECT),
  );
  assert.ok(selected);
  const result = await vscode.commands.executeCommand("pcm.status", selected);
  assert.ok(result.baseline.files.some((f) => f.path === "app.ts"));
  assert.equal(result.baseline.gitState, "not-git");
  assert.equal(
    await fs.readFile(
      path.join(process.env.PCM_TEST_PROJECT, "app.ts"),
      "utf8",
    ),
    'export const state = "WIP";',
  );
  const missing = await vscode.commands.executeCommand("pcm.restore", selected);
  assert.equal(missing.operationOutcome, "failed");
  assert.ok(missing.findings.some((f) => f.code === "NO_RECORD"));
  assert.equal(
    await fs.readFile(
      path.join(process.env.PCM_TEST_PROJECT, "app.ts"),
      "utf8",
    ),
    'export const state = "WIP";',
  );
  const dirty = await vscode.workspace.openTextDocument(
    path.join(process.env.PCM_TEST_PROJECT, "app.ts"),
  );
  const edit = new vscode.WorkspaceEdit();
  edit.insert(dirty.uri, new vscode.Position(0, 0), "// unsaved\n");
  await vscode.workspace.applyEdit(edit);
  const unsaved = await vscode.commands.executeCommand("pcm.status", selected);
  assert.ok(unsaved.findings.some((f) => f.code === "UNSAVED"));
  assert.notEqual(unsaved.operationOutcome, "success");
  const secondary = path.join(
    path.dirname(process.env.PCM_TEST_PROJECT),
    "secondary",
  );
  const original = vscode.workspace.workspaceFolders.find((f) =>
      samePath(f.uri.fsPath, process.env.PCM_TEST_PROJECT),
    ),
    second = vscode.workspace.workspaceFolders.find((f) =>
      samePath(f.uri.fsPath, secondary),
    );
  assert.ok(original);
  assert.ok(second);
  const bound = await vscode.commands.executeCommand("pcm.status", original);
  assert.ok(bound.baseline.files.some((f) => f.path === "app.ts"));
  const other = await vscode.commands.executeCommand("pcm.status", second);
  assert.ok(other.baseline.files.some((f) => f.path === "second.ts"));
  assert.ok(!other.findings.some((f) => f.code === "UNSAVED"));
  console.log(
    "PCM extension host: status/missing/unsaved and bound multi-project commands PASS",
  );
};
