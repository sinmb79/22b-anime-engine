import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import {
  parseScenarioMarkdown,
  buildNarrativePayloadFromScenarioScene,
} from "@22b/anime-core";
import { logCommand, logError, logInfo } from "../utils/logger.js";

export function registerScenarioCommand(program: Command): void {
  const scenario = program
    .command("scenario")
    .description("Extract structured planning data from scenario markdown");

  scenario
    .command("list <markdown>")
    .description("List all scene headings discovered in a scenario markdown file")
    .option("--format <fmt>", 'Output format: "human" (default) or "json"', "human")
    .action(async (markdownPath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      try {
        const sourcePath = resolve(markdownPath);
        const markdown = await readFile(sourcePath, "utf8");
        const document = parseScenarioMarkdown(sourcePath, markdown);

        if (options["format"] === "json") {
          console.log(JSON.stringify(document, null, 2));
          return;
        }

        console.log(chalk.cyan(document.title));
        for (const scene of document.scenes) {
          const shortFlag = scene.markedForShorts ? chalk.yellow(" [shorts]") : "";
          console.log(`- 씬${scene.sceneNumber} | ${scene.title} | ${scene.durationSec}초${shortFlag}`);
        }
        logInfo(`scenario list: ${sourcePath}`);
      } catch (error) {
        const message = (error as Error).message;
        logError("scenario list failed", message);
        console.error(chalk.red(`Scenario list failed: ${message}`));
        process.exit(1);
      }
    });

  scenario
    .command("payload <markdown>")
    .description("Extract one scene from scenario markdown into a narrative payload JSON")
    .requiredOption("-s, --scene <selector>", "Scene number, scene id, or exact scene title")
    .requiredOption("-o, --output <path>", "Output narrative payload JSON path")
    .action(async (markdownPath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      try {
        const sourcePath = resolve(markdownPath);
        const outputPath = resolve(String(options["output"]));
        const selectorRaw = String(options["scene"]);
        const selector = /^\d+$/.test(selectorRaw) ? parseInt(selectorRaw, 10) : selectorRaw;
        const markdown = await readFile(sourcePath, "utf8");
        const document = parseScenarioMarkdown(sourcePath, markdown);
        const payload = buildNarrativePayloadFromScenarioScene(document, selector);

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

        console.log(chalk.green(`Narrative payload written: ${outputPath}`));
        console.log(chalk.dim(`Scene: ${payload.sequenceId}`));
        console.log(chalk.dim(`Beats: ${payload.beats.length}`));
        logInfo(`scenario payload: ${outputPath}`);
      } catch (error) {
        const message = (error as Error).message;
        logError("scenario payload failed", message);
        console.error(chalk.red(`Scenario payload failed: ${message}`));
        process.exit(1);
      }
    });
}
