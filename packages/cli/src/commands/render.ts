import { resolve, dirname, basename, extname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Command } from "commander";
import chalk from "chalk";
import { ValidationError } from "@22b/anime-core";
import { renderScene as doRender } from "@22b/anime-renderer";
import type { RenderQuality } from "@22b/anime-renderer";
import { logCommand, logError, logInfo } from "../utils/logger.js";

const QUALITY_LABELS: Record<RenderQuality, string> = {
  animatic: "Animatic (480p @ 6fps — fast preview)",
  draft:    "Draft    (720p @ 12fps — timing review)",
  final:    "Final    (full res @ 24fps — delivery)",
};

export function registerRenderCommand(program: Command): void {
  program
    .command("render <scene>")
    .description("Render a scene JSON to MP4")
    .requiredOption("-o, --output <path>", "Output MP4 file path or directory")
    .option(
      "--quality <preset>",
      "Render quality: animatic | draft | final (default: final)",
      "final"
    )
    .option("--crf <number>", "FFmpeg CRF quality (0-51, lower=better)", "18")
    .option("--preset <name>", "FFmpeg encode preset", "medium")
    .option("--temp-dir <path>", "Override temp directory for frame PNGs")
    .action(async (scenePath: string, options: Record<string, string>) => {
      logCommand(process.argv);

      const absScene = resolve(scenePath);
      const quality = (options["quality"] as RenderQuality) ?? "final";

      if (!["animatic", "draft", "final"].includes(quality)) {
        console.error(chalk.red(`Unknown quality preset "${quality}". Use: animatic | draft | final`));
        process.exit(1);
      }

      // Resolve output path
      let outputPath = resolve(options["output"]);
      if (!outputPath.endsWith(".mp4") && !outputPath.endsWith(".webm")) {
        const stem = basename(scenePath, extname(scenePath));
        const suffix = quality !== "final" ? `_${quality}` : "";
        outputPath = join(outputPath, `${stem}${suffix}.mp4`);
      }

      try {
        mkdirSync(dirname(outputPath), { recursive: true });
      } catch { /* ignore */ }

      console.log(chalk.dim(`Quality: ${QUALITY_LABELS[quality]}`));

      let lastLoggedPercent = -1;
      const startTime = Date.now();

      try {
        await doRender({
          scenePath: absScene,
          outputPath,
          quality,
          crf: parseInt(options["crf"] ?? "18", 10),
          preset: options["preset"] as "medium",
          tempDir: options["tempDir"] ? resolve(options["tempDir"]) : undefined,
          onProgress: (frame, total) => {
            const pct = Math.floor((frame / total) * 100);
            if (pct !== lastLoggedPercent) {
              lastLoggedPercent = pct;
              process.stdout.write(
                `\r${chalk.cyan("Rendering")} frame ${frame}/${total} (${pct}%)`
              );
            }
          },
        });

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write("\n");
        console.log(chalk.green(`Rendered: ${outputPath} (${elapsedSec}s)`));
        logInfo(`render complete: ${outputPath} in ${elapsedSec}s [quality=${quality}]`);
      } catch (err) {
        process.stdout.write("\n");
        const msg = (err as Error).message;
        logError("render failed", msg);
        if (err instanceof ValidationError) {
          console.error(chalk.red("Scene validation failed:"));
          console.error(err.details);
        } else {
          console.error(chalk.red(`Render failed: ${msg}`));
        }
        process.exit(1);
      }
    });
}
