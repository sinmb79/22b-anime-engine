import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { preflightValidate } from "@22b/anime-core";
import type { ValidationIssue } from "@22b/anime-core";
import { logCommand, logError } from "../utils/logger.js";

// ─── Formatting ───────────────────────────────────────────────────────────────

function printIssue(issue: ValidationIssue): void {
  const icon = issue.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  console.log(`  ${icon} [${issue.path}] ${issue.message}`);
  if (issue.fix) {
    console.log(`    ${chalk.cyan("FIX:")} ${issue.fix}`);
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function registerValidateCommand(program: Command): void {
  program
    .command("validate <scene>")
    .description("Run 5-stage preflight validation on a scene JSON file")
    .option(
      "--format <fmt>",
      'Output format: "human" (default) or "json" (machine-readable for Codex)',
      "human"
    )
    .option("--strict", "Treat warnings as errors (non-zero exit on any issue)")
    .action(async (scenePath: string, options: Record<string, string>) => {
      logCommand(process.argv);

      const absPath = resolve(scenePath);

      let raw: unknown;
      try {
        const content = await readFile(absPath, "utf-8");
        raw = JSON.parse(content);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          const out = { valid: false, errors: [{ code: "FILE_NOT_FOUND", path: absPath, message: "File not found", severity: "error" }], warnings: [], issues: [] };
          if (options["format"] === "json") {
            console.log(JSON.stringify(out, null, 2));
          } else {
            console.error(chalk.red(`File not found: ${absPath}`));
          }
        } else {
          const msg = (err instanceof SyntaxError) ? `Invalid JSON: ${err.message}` : `Read error: ${(err as Error).message}`;
          const out = { valid: false, errors: [{ code: "PARSE_ERROR", path: absPath, message: msg, severity: "error" }], warnings: [], issues: [] };
          if (options["format"] === "json") {
            console.log(JSON.stringify(out, null, 2));
          } else {
            console.error(chalk.red(msg));
          }
        }
        process.exit(1);
      }

      const result = preflightValidate(raw, absPath);

      if (options["format"] === "json") {
        // Machine-readable output for Codex self-correction
        console.log(JSON.stringify(result, null, 2));
        const hasIssues = result.errors.length > 0 || (options["strict"] && result.warnings.length > 0);
        process.exit(hasIssues ? 1 : 0);
        return;
      }

      // Human-readable output
      if (result.valid) {
        // Parse scene meta for the summary line (raw is valid at this point)
        const scene = raw as { meta?: { title?: string; duration?: number; fps?: number }; layers?: unknown[]; assets?: unknown[]; audio?: unknown[] };
        const meta = scene?.meta ?? {};
        console.log(
          chalk.green("VALID") +
          ` scene: "${meta.title}" | ${meta.duration}s | ${meta.fps}fps | ` +
          `${(scene.layers as unknown[])?.length ?? 0} layers | ` +
          `${(scene.assets as unknown[])?.length ?? 0} assets | ` +
          `${(scene.audio as unknown[])?.length ?? 0} audio tracks`
        );
      } else {
        console.log(chalk.red(`INVALID scene: ${result.errors.length} error(s), ${result.warnings.length} warning(s)\n`));
      }

      if (result.errors.length > 0) {
        console.log(chalk.red("Errors:"));
        for (const issue of result.errors) printIssue(issue);
        console.log();
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow("Warnings:"));
        for (const issue of result.warnings) printIssue(issue);
        console.log();
      }

      const isStrict = options["strict"] === "true" || String(options["strict"]) === "true";
      const shouldFail = !result.valid || (isStrict && result.warnings.length > 0);
      if (shouldFail) {
        logError("validate failed", `${result.errors.length} errors, ${result.warnings.length} warnings in ${absPath}`);
        process.exit(1);
      }
    });
}
