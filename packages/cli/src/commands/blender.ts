import { basename, dirname, extname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { Command } from "commander";
import chalk from "chalk";
import {
  buildShotPackage,
  renderShot,
  type RenderShotOptions,
} from "@22b/anime-blender";
import { logCommand, logError, logInfo } from "../utils/logger.js";

function defaultBuildDir(scenePath: string, outputPath: string): string {
  const stem = basename(scenePath, extname(scenePath));
  return join(dirname(resolve(outputPath)), `${stem}_blender_build`);
}

function printWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  console.log(chalk.yellow("\nBlender bridge notes:"));
  for (const warning of warnings) {
    console.log(chalk.yellow(`  - ${warning}`));
  }
}

export function registerBlenderCommand(program: Command): void {
  const blender = program
    .command("blender")
    .description("Local-first Blender build and render pipeline");

  blender
    .command("build <scene>")
    .description("Build a secure local Blender shot package from a scene JSON file")
    .requiredOption("-o, --output <path>", "Output directory for the shot package")
    .action(async (scenePath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      try {
        const result = await buildShotPackage({
          scenePath: resolve(scenePath),
          outputDir: resolve(String(options["output"])),
        });

        console.log(chalk.green(`Shot package built: ${result.outputDir}`));
        console.log(chalk.dim(`Manifest: ${result.manifestPath}`));
        console.log(chalk.dim(`Script:   ${result.scriptPath}`));
        printWarnings(result.manifest.unsupportedFeatures);
        logInfo(`blender build package: ${result.outputDir}`);
      } catch (error) {
        const message = (error as Error).message;
        logError("blender build failed", message);
        console.error(chalk.red(`Blender build failed: ${message}`));
        process.exit(1);
      }
    });

  blender
    .command("render <scene>")
    .description("Render a scene through the local Blender bridge and mux to MP4")
    .requiredOption("-o, --output <path>", "Output MP4 file path")
    .option("--build-dir <path>", "Directory for the intermediate Blender shot package")
    .option("--blender <path>", "Override the Blender executable path")
    .option("--dry-run", "Print the Blender command without executing it")
    .option("--crf <number>", "FFmpeg CRF quality (0-51, lower=better)", "18")
    .option("--preset <name>", "FFmpeg encode preset", "medium")
    .action(async (scenePath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      const outputPath = resolve(String(options["output"]));
      const buildDir = options["buildDir"]
        ? resolve(String(options["buildDir"]))
        : defaultBuildDir(scenePath, outputPath);

      try {
        mkdirSync(dirname(outputPath), { recursive: true });
      } catch {
        // Ignore directory creation errors here; renderShot will fail with context if needed.
      }

      try {
        const result = await renderShot({
          scenePath: resolve(scenePath),
          outputPath,
          buildDir,
          blenderBinary: typeof options["blender"] === "string" ? options["blender"] : undefined,
          dryRun: options["dryRun"] === true || options["dryRun"] === "true" || options["dryRun"] === "1",
          crf: parseInt(String(options["crf"] ?? "18"), 10),
          preset: String(options["preset"] ?? "medium") as RenderShotOptions["preset"],
        });

        if (result.dryRun) {
          console.log(chalk.cyan("Blender dry run command:"));
          console.log(result.command);
        } else {
          console.log(chalk.green(`Rendered via Blender bridge: ${result.outputPath}`));
          console.log(chalk.dim(`Frames:  ${result.frameCount}`));
          console.log(chalk.dim(`Build:   ${result.buildDir}`));
        }

        printWarnings(result.warnings);
        logInfo(`blender render: ${result.outputPath}`);
      } catch (error) {
        const message = (error as Error).message;
        logError("blender render failed", message);
        console.error(chalk.red(`Blender render failed: ${message}`));
        process.exit(1);
      }
    });
}
