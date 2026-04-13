import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { Command } from "commander";
import chalk from "chalk";
import { ValidationError } from "@22b/anime-core";
import { renderSingleFrame } from "@22b/anime-renderer";

export function registerRenderFrameCommand(program: Command): void {
  program
    .command("render-frame <scene>")
    .description("Render a single frame at a given time as PNG")
    .requiredOption("--time <seconds>", "Scene time in seconds to render")
    .requiredOption("-o, --output <path>", "Output PNG file path")
    .action(async (scenePath: string, options: Record<string, string>) => {
      const absScene = resolve(scenePath);
      const time = parseFloat(options["time"] ?? "0");
      const outputPath = resolve(options["output"]);

      if (isNaN(time) || time < 0) {
        console.error(chalk.red("--time must be a non-negative number"));
        process.exit(1);
      }

      // Ensure output dir exists
      try {
        mkdirSync(dirname(outputPath), { recursive: true });
      } catch { /* ignore */ }

      try {
        await renderSingleFrame({ scenePath: absScene, time, outputPath });

        const fps = 24; // default; actual fps from scene is logged separately
        const frameNum = Math.round(time * fps);
        console.log(
          chalk.green(`Frame rendered: ${outputPath}`) +
          ` (at ${time.toFixed(2)}s, ~frame ${frameNum})`
        );
      } catch (err) {
        if (err instanceof ValidationError) {
          console.error(chalk.red("Scene validation failed:"));
          console.error(err.details);
        } else {
          console.error(chalk.red(`Render failed: ${(err as Error).message}`));
        }
        process.exit(1);
      }
    });
}
