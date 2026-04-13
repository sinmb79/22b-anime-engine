import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Command } from "commander";
import chalk from "chalk";
import { compileSceneFromPlan } from "@22b/anime-core";
import { logCommand, logError, logInfo } from "../utils/logger.js";

function parseJsonWithBom(rawText: string): unknown {
  return JSON.parse(rawText.replace(/^\uFEFF/, ""));
}

export function registerSceneCommand(program: Command): void {
  const scene = program
    .command("scene")
    .description("Compile scene plans into renderable Scene JSON");

  scene
    .command("compile <plan>")
    .description("Compile a scene-plan JSON into a Scene JSON file")
    .requiredOption("-o, --output <path>", "Output Scene JSON path")
    .option("--asset-catalog <path>", "Optional custom asset catalog JSON")
    .option("--width <number>", "Scene width", "1920")
    .option("--height <number>", "Scene height", "1080")
    .option("--fps <number>", "Scene FPS", "24")
    .option("--allow-unresolved", "Keep compiling even when required mappings are missing")
    .option("--no-secondary-motion", "Disable automatic breathing / anticipation generation")
    .action(async (planPath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      try {
        const sourcePath = resolve(planPath);
        const outputPath = resolve(String(options["output"]));
        const planRaw = parseJsonWithBom(await readFile(sourcePath, "utf8"));
        const catalogRaw = typeof options["assetCatalog"] === "string"
          ? parseJsonWithBom(await readFile(resolve(String(options["assetCatalog"])), "utf8"))
          : undefined;

        const result = compileSceneFromPlan({
          plan: planRaw,
          outputPath,
          assetCatalog: catalogRaw,
          assetCatalogPath: typeof options["assetCatalog"] === "string" ? resolve(String(options["assetCatalog"])) : undefined,
          width: parseInt(String(options["width"] ?? "1920"), 10),
          height: parseInt(String(options["height"] ?? "1080"), 10),
          fps: parseInt(String(options["fps"] ?? "24"), 10),
          applySecondaryMotion: options["secondaryMotion"] !== false,
          allowUnresolved: options["allowUnresolved"] === true || options["allowUnresolved"] === "true",
        });

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(result.scene, null, 2), "utf8");

        const reportPath = outputPath.replace(/\.json$/i, ".compile-report.json");
        await writeFile(
          reportPath,
          JSON.stringify({
            warnings: result.warnings,
            unresolved: result.unresolved,
            assets: result.scene.assets.map((asset) => ({ id: asset.id, source: asset.source })),
          }, null, 2),
          "utf8"
        );

        console.log(chalk.green(`Scene JSON compiled: ${outputPath}`));
        console.log(chalk.dim(`Layers: ${result.scene.layers.length}`));
        console.log(chalk.dim(`Assets: ${result.scene.assets.length}`));
        if (result.warnings.length > 0) {
          console.log(chalk.yellow(`Warnings: ${result.warnings.length}`));
        }
        if (result.unresolved.length > 0) {
          console.log(chalk.yellow(`Unresolved: ${result.unresolved.length} (see ${reportPath})`));
        }
        logInfo(`scene compile: ${outputPath}`);
      } catch (error) {
        const message = (error as Error).message;
        logError("scene compile failed", message);
        console.error(chalk.red(`Scene compile failed: ${message}`));
        process.exit(1);
      }
    });
}
