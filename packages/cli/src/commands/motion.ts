/**
 * `anime motion` — Secondary motion and animation utilities.
 *
 * Commands:
 *   anime motion apply-secondary <scene.json> -o <output.json>
 *     — Injects breathing, blink, and anticipation keyframes
 *
 * Required by Risk Analysis §3.3: stiff/robotic motion mitigation.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { validateScene, applySecondaryMotion } from "@22b/anime-core";
import type { SecondaryMotionOptions } from "@22b/anime-core";
import { logCommand, logError } from "../utils/logger.js";

export function registerMotionCommand(program: Command): void {
  const motion = program
    .command("motion")
    .description("Secondary motion and animation utilities");

  motion
    .command("apply-secondary <scene>")
    .description("Inject breathing, blink, and anticipation into character layers")
    .requiredOption("-o, --output <path>", "Output scene JSON path")
    .option("--no-breathing", "Skip breathing idle motion")
    .option("--no-blink", "Skip auto eye blink")
    .option("--anticipation", "Add anticipation motion before large movements")
    .option(
      "--characters <ids>",
      "Comma-separated character layer IDs to target (default: all)"
    )
    .action(async (scenePath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      const absScene = resolve(scenePath);
      const outputPath = resolve(options["output"] as string);

      try {
        const raw = JSON.parse(await readFile(absScene, "utf-8")) as unknown;
        const scene = validateScene(raw);

        const motionOptions: SecondaryMotionOptions = {
          breathing: options["breathing"] !== false,
          blink: options["blink"] !== false,
          anticipation: options["anticipation"] === true,
          characterIds: options["characters"]
            ? (options["characters"] as string).split(",").map((s) => s.trim())
            : undefined,
        };

        const modified = applySecondaryMotion(scene, motionOptions);

        await writeFile(outputPath, JSON.stringify(modified, null, 2), "utf-8");

        const applied: string[] = [];
        if (motionOptions.breathing) applied.push("breathing");
        if (motionOptions.blink) applied.push("blink");
        if (motionOptions.anticipation) applied.push("anticipation");

        console.log(
          chalk.green("Applied:") +
          ` ${applied.join(", ")} → ${outputPath}`
        );
      } catch (err) {
        const msg = (err as Error).message;
        logError("motion apply-secondary failed", msg);
        console.error(chalk.red(`Error: ${msg}`));
        process.exit(1);
      }
    });
}
