/**
 * `anime doctor` — System dependency health check.
 *
 * Verifies all required and optional dependencies are present and working.
 * Outputs a self-repair hint for each failure.
 *
 * Required by Risk Analysis §9.1: Codex must be able to diagnose environment issues.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  fix?: string;
}

// ─── Individual Checks ────────────────────────────────────────────────────────

function checkNode(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1));
  if (major >= 20) {
    return { name: "Node.js", status: "ok", detail: version };
  }
  return {
    name: "Node.js",
    status: "fail",
    detail: `${version} (requires >=20)`,
    fix: "Download Node.js 20+ from https://nodejs.org",
  };
}

function checkFfmpeg(): CheckResult {
  try {
    const out = execSync("ffmpeg -version", { stdio: "pipe" }).toString();
    const match = out.match(/ffmpeg version ([^\s]+)/);
    return {
      name: "FFmpeg",
      status: "ok",
      detail: match ? match[1] : "found",
    };
  } catch {
    const os = platform();
    const fix =
      os === "win32"
        ? "winget install ffmpeg"
        : os === "darwin"
        ? "brew install ffmpeg"
        : "sudo apt install ffmpeg";
    return {
      name: "FFmpeg",
      status: "fail",
      detail: "not found in PATH",
      fix,
    };
  }
}

async function checkCanvas(): Promise<CheckResult> {
  try {
    // Dynamic import — @napi-rs/canvas lives in renderer, not cli
    // We test by attempting to load it from node_modules
    await import("@22b/anime-renderer");
    return { name: "@napi-rs/canvas", status: "ok", detail: "loaded via @22b/anime-renderer" };
  } catch (err) {
    return {
      name: "@napi-rs/canvas",
      status: "fail",
      detail: (err as Error).message.slice(0, 80),
      fix: "pnpm install (from monorepo root)",
    };
  }
}

async function checkBlender(): Promise<CheckResult> {
  try {
    const { probeBlender } = await import("@22b/anime-blender");
    const probe = probeBlender();
    if (probe.found) {
      return {
        name: "Blender",
        status: "ok",
        detail: probe.version ? `${probe.version} (${probe.binary})` : String(probe.binary),
      };
    }
    return {
      name: "Blender",
      status: "warn",
      detail: "not found (required for secure final render path)",
      fix: "Install Blender 4.x locally or set BLENDER_PATH",
    };
  } catch (err) {
    return {
      name: "Blender",
      status: "warn",
      detail: (err as Error).message.slice(0, 80),
      fix: "pnpm install (from monorepo root)",
    };
  }
}

function checkRhubarb(): CheckResult {
  // Check common install locations
  const candidates = [
    "rhubarb",
    join(homedir(), ".local", "bin", "rhubarb"),
    "C:/Program Files/Rhubarb Lip Sync/rhubarb.exe",
  ];

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: "pipe" });
      return { name: "Rhubarb Lip Sync", status: "ok", detail: candidate };
    } catch { /* try next */ }
  }

  return {
    name: "Rhubarb Lip Sync",
    status: "warn",
    detail: "not found (required for lip sync — Phase 1)",
    fix: "Download from https://github.com/DanielSWolf/rhubarb-lip-sync/releases",
  };
}

function checkDiskSpace(): CheckResult {
  // Estimate free disk space on the current drive (best-effort)
  try {
    const os = platform();
    let freeGb = 0;

    if (os === "win32") {
      const out = execSync("wmic logicaldisk get FreeSpace,Name", { stdio: "pipe" }).toString();
      const lines = out.split("\n").filter((l) => l.trim());
      // Find the line for the current drive
      const drive = process.cwd().slice(0, 2).toUpperCase();
      for (const line of lines) {
        if (line.includes(drive)) {
          const bytes = parseInt(line.trim().split(/\s+/)[0]);
          if (!isNaN(bytes)) freeGb = bytes / 1e9;
        }
      }
    } else {
      const out = execSync("df -BG . | tail -1", { stdio: "pipe" }).toString();
      const parts = out.trim().split(/\s+/);
      freeGb = parseInt(parts[3]);
    }

    if (freeGb < 5) {
      return {
        name: "Disk Space",
        status: "warn",
        detail: `${freeGb.toFixed(1)} GB free (recommend ≥5 GB for rendering)`,
        fix: "Free up disk space before rendering long scenes",
      };
    }
    return { name: "Disk Space", status: "ok", detail: `${freeGb.toFixed(1)} GB free` };
  } catch {
    return { name: "Disk Space", status: "warn", detail: "could not determine" };
  }
}

function checkLogDir(): CheckResult {
  const logDir = join(homedir(), ".anime-engine", "logs");
  const writable = (() => {
    try {
      const { mkdirSync, writeFileSync, unlinkSync } = require("node:fs") as typeof import("node:fs");
      mkdirSync(logDir, { recursive: true });
      const testFile = join(logDir, ".write-test");
      writeFileSync(testFile, "");
      unlinkSync(testFile);
      return true;
    } catch { return false; }
  })();

  return writable
    ? { name: "Log Directory", status: "ok", detail: logDir }
    : { name: "Log Directory", status: "warn", detail: `Cannot write to ${logDir}`, fix: `mkdir -p "${logDir}"` };
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderResult(result: CheckResult): void {
  const icon =
    result.status === "ok"
      ? chalk.green("✓")
      : result.status === "warn"
      ? chalk.yellow("⚠")
      : chalk.red("✗");

  const nameCol = result.name.padEnd(22);
  const detail = result.status === "ok"
    ? chalk.dim(result.detail)
    : result.status === "warn"
    ? chalk.yellow(result.detail)
    : chalk.red(result.detail);

  console.log(`  ${icon} ${nameCol} ${detail}`);
  if (result.fix && result.status !== "ok") {
    console.log(`    ${chalk.cyan("FIX:")} ${result.fix}`);
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check all system dependencies and environment health")
    .action(async () => {
      console.log(chalk.bold("\n22B Anime Engine — System Check\n"));

      const checks: CheckResult[] = [
        checkNode(),
        checkFfmpeg(),
        await checkCanvas(),
        await checkBlender(),
        checkRhubarb(),
        checkDiskSpace(),
        checkLogDir(),
      ];

      for (const result of checks) {
        renderResult(result);
      }

      const failed = checks.filter((c) => c.status === "fail").length;
      const warned = checks.filter((c) => c.status === "warn").length;

      console.log();
      if (failed === 0 && warned === 0) {
        console.log(chalk.green("All checks passed. Engine is ready."));
      } else if (failed === 0) {
        console.log(chalk.yellow(`${warned} warning(s). Engine can run with limitations.`));
      } else {
        console.log(chalk.red(`${failed} check(s) failed. Fix errors above before rendering.`));
        process.exit(1);
      }
      console.log();
    });
}
