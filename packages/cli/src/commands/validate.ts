import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { validateScene, ValidationError } from "@22b/anime-core";

export function registerValidateCommand(program: Command): void {
  program
    .command("validate <scene>")
    .description("Validate a scene JSON file against the schema")
    .action(async (scenePath: string) => {
      const absPath = resolve(scenePath);

      let raw: unknown;
      try {
        const content = await readFile(absPath, "utf-8");
        raw = JSON.parse(content);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          console.error(chalk.red(`File not found: ${absPath}`));
        } else if (err instanceof SyntaxError) {
          console.error(chalk.red(`Invalid JSON: ${(err as Error).message}`));
        } else {
          console.error(chalk.red(`Read error: ${(err as Error).message}`));
        }
        process.exit(1);
      }

      try {
        const scene = validateScene(raw);
        const { meta, assets, layers, audio } = scene;
        console.log(
          chalk.green("VALID") +
          ` scene: "${meta.title}" | ${meta.duration}s | ${meta.fps}fps | ` +
          `${layers.length} layers | ${assets.length} assets | ${audio.length} audio tracks`
        );
      } catch (err) {
        if (err instanceof ValidationError) {
          console.error(chalk.red("INVALID scene:"));
          console.error(err.details);
        } else {
          console.error(chalk.red(`Unexpected error: ${(err as Error).message}`));
        }
        process.exit(1);
      }
    });
}
