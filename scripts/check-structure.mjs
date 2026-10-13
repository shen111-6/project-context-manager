import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
const failures = [],
  modules = [
    "status",
    "checkpoint",
    "compress",
    "handoff",
    "restore",
    "verify",
  ];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) await walk(p);
    else if (p.endsWith(".md")) {
      const text = await readFile(p, "utf8");
      for (const m of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (!target || /^(https?:|#|mailto:)/.test(target)) continue;
        try {
          await access(path.resolve(path.dirname(p), target.split("#")[0]));
        } catch {
          failures.push(`${p}: missing ${target}`);
        }
      }
    }
  }
}
const skill = await readFile("SKILL.md", "utf8");
if (
  !/^---\r?\nname: project-context-manager\r?\ndescription: .+\r?\n---/.test(
    skill,
  )
)
  failures.push("Invalid Skill frontmatter");
for (const m of modules) {
  if (!skill.includes(`references/${m}.md`))
    failures.push(`Missing module entry ${m}`);
  const text = await readFile(`references/${m}.md`, "utf8");
  if (!text.includes("state-reconstruction.md"))
    failures.push(`Missing shared policy ${m}`);
}
for (const d of ["references", "assets", "docs"]) await walk(d);
for (const p of ["SKILL.md", "README.md"]) {
  const text = await readFile(p, "utf8");
  for (const m of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    if (!m[1] || /^(https?:|#)/.test(m[1])) continue;
    try {
      await access(m[1].split("#")[0]);
    } catch {
      failures.push(`${p}: missing ${m[1]}`);
    }
  }
}
if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exitCode = 1;
} else
  process.stdout.write(
    "Structure PASS: frontmatter, six entries, shared policy and local Markdown references.\n",
  );
