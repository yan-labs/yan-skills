#!/usr/bin/env node
// Spaceship official API. Credentials live in the macOS Keychain, never in Git or argv.
import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const base = "https://spaceship.dev/api/v1"
const keychain = (service) => execFileSync("security", ["find-generic-password", "-a", "kcsx", "-s", service, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const key = keychain("rankup.spaceship.api-key")
const secret = keychain("rankup.spaceship.api-secret")
const config = `header = "X-API-Key: ${key}"\nheader = "X-API-Secret: ${secret}"\nheader = "Content-Type: application/json"\n`

function request(method, path, body) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) throw new Error("Path must stay under /api/v1")
  let dir
  try {
    const args = ["-sS", "--config", "-", "--max-time", "25", "--max-redirs", "0", "-X", method, "-w", "\n%{http_code}"]
    if (body !== undefined) {
      dir = mkdtempSync(join(tmpdir(), "spaceship-api-"))
      const file = join(dir, "body.json")
      writeFileSync(file, JSON.stringify(body), { mode: 0o600 })
      chmodSync(file, 0o600)
      args.push("--data-binary", `@${file}`)
    }
    args.push(base + path)
    const result = spawnSync("curl", args, { input: config, encoding: "utf8", maxBuffer: 2_000_000 })
    if (result.status !== 0) throw new Error(`curl failed (${result.status})`)
    const split = result.stdout.lastIndexOf("\n")
    const status = Number(result.stdout.slice(split + 1))
    let data
    try { data = JSON.parse(result.stdout.slice(0, split)) } catch { data = null }
    if (status < 200 || status >= 300) throw new Error(`Spaceship HTTP ${status}: ${data?.title || data?.detail || "request failed"}`)
    return data
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

function safe(value) {
  if (Array.isArray(value)) return value.map(safe)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /secret|password|token|authcode|apikey/i.test(k) ? "[REDACTED]" : safe(v)]))
  return value
}

const [command, ...args] = process.argv.slice(2)
try {
  let result
  if (command === "get" && args.length === 1) {
    const d = request("GET", `/domains/${encodeURIComponent(args[0])}`)
    result = { name: d.name, nameservers: d.nameservers, lifecycleStatus: d.lifecycleStatus }
  } else if (command === "set-ns" && args.length >= 3) {
    const [domain, ...hosts] = args
    if (hosts.length > 12 || !hosts.every(x => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(x))) throw new Error("Pass 2-12 valid nameservers")
    const current = request("GET", `/domains/${encodeURIComponent(domain)}`).nameservers
    result = current?.provider === "custom" && JSON.stringify([...current.hosts].sort()) === JSON.stringify([...hosts].sort())
      ? { provider: "custom", hosts: current.hosts, unchanged: true }
      : request("PUT", `/domains/${encodeURIComponent(domain)}/nameservers`, { provider: "custom", hosts })
  } else if (command === "request" && args.length === 2 && /^(GET|POST|PUT|PATCH|DELETE)$/i.test(args[0])) {
    const body = /^(POST|PUT|PATCH)$/i.test(args[0]) ? JSON.parse(readFileSync(0, "utf8")) : undefined
    result = request(args[0].toUpperCase(), args[1], body)
  } else {
    throw new Error("Usage: spaceship-api.mjs get DOMAIN | set-ns DOMAIN NS1 NS2 [NS...] | request METHOD /path (JSON body on stdin for writes)")
  }
  console.log(JSON.stringify(safe(result), null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
