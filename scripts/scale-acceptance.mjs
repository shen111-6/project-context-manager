import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect, operate } from "../dist/packages/engine/src/index.js";
import { gitEnvironment } from "../dist/packages/engine/src/git.js";

const toolRoot = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(toolRoot, "outputs/scale");
await mkdir(output, { recursive: true });
const runRoot = await mkdtemp(path.join(output, "run-"));
const project = path.join(runRoot, "project");
await mkdir(project);
const exec = promisify(execFile);
const git = (args) => exec("git", args, {cwd: project, env: gitEnvironment(), windowsHide: true, maxBuffer: 16*1024*1024, timeout: 60000});
const sha = (value) => createHash("sha256").update(value).digest("hex");
const protectedFiles = new Map();
const stages = [];
const startedAt = new Date().toISOString();
async function fixtureFile(relative, text) {
  await writeFile(path.join(project, relative), text);
  protectedFiles.set(relative, sha(text));
}
async function measured(label, fn) {
  console.log("START " + label);
  const start = performance.now();
  const result = await fn();
  const measurement = {label, elapsedMs: Math.round(performance.now()-start), ...result};
  stages.push(measurement);
  console.log(JSON.stringify(measurement));
}
const scope = ["modules/module-00"];
const request = (operation) => ({protocolVersion: 1, requestId: randomUUID(), operation, projectPath: project, scope});
try {
  await git(["init"]);
  await git(["config", "user.name", "Scale Fixture"]);
  await git(["config", "user.email", "scale@example.invalid"]);
  await measured("create-24-module-fixture", async () => {
    for (let m=0;m<24;m++) {
      const directory = "modules/module-" + String(m).padStart(2,"0");
      await mkdir(path.join(project,directory), {recursive:true});
      for (let f=0;f<250;f++) {
        const relative = directory + "/file-" + String(f).padStart(4,"0") + ".ts";
        await fixtureFile(relative, "export const value = " + f + ";\n// " + "synthetic ".repeat(100) + "\n");
      }
    }
    await fixtureFile(".gitignore", "docs/project-context/pcm/\n");
    await mkdir(path.join(project,"large"));
    await fixtureFile("large/oversize.txt", "x".repeat(1024*1024+1));
    await git(["add","."]);
    await git(["-c","core.hooksPath=","commit","-m","synthetic scale fixture"]);
    await mkdir(path.join(project,"scratch"));
    for (let i=0;i<200;i++) await fixtureFile("scratch/untracked-"+i+".ts", "synthetic untracked "+i+"\n");
    await fixtureFile("modules/module-00/file-0000.ts", "// WIP: persistence remains incomplete\n");
    await fixtureFile("modules/module-01/file-0000.ts", "// staged candidate\n");
    await git(["add","modules/module-01/file-0000.ts"]);
    await fixtureFile("modules/module-01/file-0000.ts", "// unstaged follow-up\n");
    protectedFiles.set(".git/index", sha(await readFile(path.join(project,".git/index"))));
    protectedFiles.set(".git/HEAD", sha(await readFile(path.join(project,".git/HEAD"))));
    return {trackedFiles:6002, untrackedFiles:200, modules:24};
  });
  await measured("default-file-limit", async () => {
    const result=await collect(project);
    assert.equal(result.baseline.files.length,5000);
    assert.equal(result.baseline.coverage,"incomplete");
    assert.ok(result.findings.some(f=>f.code==="LIMIT"));
    assert.equal(result.baseline.stable,true);
    return {files:result.baseline.files.length, coverage:result.baseline.coverage, limitReported:true};
  });
  let scoped;
  await measured("scoped-repeatable-evidence", async () => {
    scoped=await collect(project,{scope});
    const repeat=await collect(project,{scope});
    assert.equal(scoped.baseline.files.length,250);
    assert.equal(scoped.baseline.coverage,"scoped");
    assert.equal(scoped.baseline.fingerprint,repeat.baseline.fingerprint);
    assert.equal(scoped.baseline.workingTree,"dirty");
    return {files:250, stableFingerprint:true, workingTree:"dirty"};
  });
  await measured("oversize-and-total-read-budgets", async () => {
    const large=await collect(project,{scope:["large"]});
    assert.equal(large.baseline.coverage,"incomplete");
    assert.equal(large.baseline.files[0].state,"excluded");
    const budget=await collect(project,{scope,maxTotalBytes:32768});
    assert.equal(budget.baseline.coverage,"incomplete");
    assert.ok(budget.baseline.files.some(f=>f.state==="excluded"));
    let readableBytes=0;
    for (const file of budget.baseline.files.filter(f=>f.state==="present")) readableBytes+=(await stat(path.join(project,file.path))).size;
    assert.ok(readableBytes<=32768);
    return {oversizeExcluded:true, totalBudget:32768, readableBytes, coverage:"incomplete"};
  });
  await measured("cancel-during-collection-and-fresh-retry", async () => {
    const controller=new AbortController();
    let began=false;
    const collection=collect(project,{signal:controller.signal});
    began=true;
    const timer=setTimeout(()=>controller.abort(),100);
    try {await assert.rejects(collection,error=>error.code==="CANCELLED");} finally {clearTimeout(timer);}
    assert.equal(began,true);
    const retry=await collect(project,{scope});
    assert.equal(retry.baseline.fingerprint,scoped.baseline.fingerprint);
    return {cancelledAfterStart:true, freshRetrySameFingerprint:true, abortDelayMs:100};
  });
  await measured("scoped-handoff-readonly-restore", async () => {
    const task={goal:"Complete synthetic persistence",current:"Implementation remains WIP",next:"Implement and validate persistence",workInProgress:["modules/module-00/file-0000.ts"]};
    const handoff=await operate({...request("handoff"),task});
    assert.equal(handoff.operationOutcome,"success");
    for(const artifact of handoff.artifacts)protectedFiles.set(path.relative(project,artifact),sha(await readFile(artifact)));
    protectedFiles.set("docs/project-context/pcm/index.json",sha(await readFile(path.join(project,"docs/project-context/pcm/index.json"))));
    const restored=await operate(request("restore"));
    assert.equal(restored.operationOutcome,"partial");
    assert.deepEqual(restored.snapshot.task,task);
    assert.deepEqual(restored.snapshot.baseline.scope,scope);
    assert.equal(restored.nextAction,task.next);
    return {restoredWip:true, restoredScope:scope, outcome:restored.operationOutcome};
  });
  await measured("all-fixture-bytes-preserved", async () => {
    for(const [relative,hash] of protectedFiles)assert.equal(sha(await readFile(path.join(project,relative))),hash,relative);
    return {sha256Matches:protectedFiles.size, includesGitIndex:true, includesHandoffArtifacts:true};
  });
  const summary={schemaVersion:1,kind:"synthetic-scale-acceptance",status:"Passed",startedAt,finishedAt:new Date().toISOString(),environment:{platform:process.platform,node:process.version},fixture:{modules:24,trackedFiles:6002,untrackedFiles:200},stages,protectedHashes:[...protectedFiles].map(([file,sha256])=>({file,sha256})),limitations:["Synthetic workload; single observations are not performance benchmarks or product efficacy measurements.","Cancellation exercises the real engine after invocation, not native GUI clicks.","Read-only evidence covers all generated fixture files plus Git index/HEAD and handoff artifacts; no malicious filesystem race claim."]};
  await writeFile(path.join(runRoot,"summary.json"),JSON.stringify(summary,null,2)+"\n");
  console.log("Scale acceptance Passed: "+path.join(runRoot,"summary.json"));
} catch(error) {
  await writeFile(path.join(runRoot,"failure.json"),JSON.stringify({status:"Failed",startedAt,error:error.message,stages},null,2)+"\n");
  console.error("Evidence retained at "+runRoot);
  throw error;
}
