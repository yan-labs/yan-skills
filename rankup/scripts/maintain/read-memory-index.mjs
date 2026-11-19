#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const globalDir = process.env.RANKUP_HOME || path.join(homedir(), ".rankup");
const project = path.resolve(process.argv[2] || ".");
const projectDir = path.basename(project) === ".rankup" ? project : path.join(project, ".rankup");

async function printFirst(dir, names, label) {
  for (const name of names) {
    try {
      const text = await readFile(path.join(dir, name), "utf8");
      console.log(`--- ${label} ${name} ---\n${text.trimEnd()}`);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

await printFirst(globalDir, ["README.md"], "全局层");
await printFirst(projectDir, ["INDEX.md", "README.md"], "项目层");
