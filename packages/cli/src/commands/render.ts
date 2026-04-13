import { resolve, dirname, basename, extname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Command } from "commander";
import chalk from "chalk";
import { ValidationError } from "@22b/anime-core";
import { renderScene as doRender } from "@22b/anime-renderer";

export function registerRenderCommand(program: Command): void {
  program
    .command("render <scene>")
    .description("Render a scene JSON to MP4")
    .requiredOption("-o, --output <path>", "Output MP4 file path or directory")
    .option("--crf <number>", "FFmpeg CRF quality (0-51, lower=better quality)", "18")
    .option(
      "--preset <name>",
      "FFmpeg encode preset (ultrafast/fast/medium/slow)",
      "medium"
    )
    .option("--temp-dir <path>", "Override temp directory for frame PNGs")
    .action(async (scenePath: string, options: Record<string, string>) => {
      const absScene = resolve(scenePath);

      // Resolve output path: if a directory, auto-generate filename
      let outputPath = resolve(options["output"]);
      if (!outputPath.endsWith(".mp4") && !outputPath.endsWith(".webm")) {
        const stem = basename(scenePath, extname(scenePath));
        outputPath = join(outputPath, `${stem}.mp4`);
      }

      // Ensure output directory exists
      try {
        mkdirSync(dirname(outputPath), { recursive: true });
      } catch { /* ignore */ }

      let lastLoggedPercent = -1;

      const startTime = Date.now();

      try {
        await doRender({
          scenePath: absScene,
          outputPath,
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
      } catch (err) {
        process.stdout.write("\n");
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
