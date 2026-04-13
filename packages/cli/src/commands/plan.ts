import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import {
  buildScenePlan,
  validateNarrativePayload,
  type ScenePlan,
} from "@22b/anime-core";
import { logCommand, logError, logInfo } from "../utils/logger.js";

function parseJsonWithBom(rawText: string): unknown {
  return JSON.parse(rawText.replace(/^\uFEFF/, ""));
}

function buildReadme(plan: ScenePlan, payloadPath: string): string {
  return [
    "# Scene Plan Package",
    "",
    `Source payload: \`${payloadPath}\``,
    `Title: ${plan.payload.title}`,
    `Total duration: ${plan.totalDurationSec.toFixed(1)}s`,
    "",
    "This package sits between scenario markdown and Scene JSON.",
    "It borrows the review-gate discipline of 22b-studio without forcing n8n or cloud dependencies.",
    "",
    "## Files",
    "",
    "- `narrative.payload.json` : normalized payload contract",
    "- `scene-plan.json` : shot plan with timing, review focus, and prompt packets",
    "- `prompt-packets.json` : prompts split into global and per-shot groups",
    "- `asset-requests.json` : stable asset requests for canonical mapping work",
    "- `review-gates.md` : human review checkpoints before previz and Blender final",
    "",
  ].join("\n");
}

function buildReviewMarkdown(plan: ScenePlan): string {
  const lines: string[] = [
    "# Review Gates",
    "",
    `Scene: ${plan.payload.title}`,
    `Generated: ${plan.generatedAt}`,
    "",
  ];

  for (const gate of plan.reviewGates) {
    lines.push(`## ${gate.stage}`);
    lines.push("");
    lines.push(gate.purpose);
    lines.push("");
    for (const item of gate.checklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  lines.push("## Shot Summary");
  lines.push("");
  for (const shot of plan.shots) {
    lines.push(
      `- ${shot.id} | ${shot.startTimeSec.toFixed(1)}s-${shot.endTimeSec.toFixed(1)}s | ${shot.shotType} | ${shot.title}`
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command("plan")
    .description("Build narrative payload based planning packages");

  plan
    .command("build <payload>")
    .description("Build a scene plan package from a narrative payload JSON file")
    .requiredOption("-o, --output <path>", "Output directory for the scene plan package")
    .action(async (payloadPath: string, options: Record<string, unknown>) => {
      logCommand(process.argv);

      try {
        const sourcePath = resolve(payloadPath);
        const outputDir = resolve(String(options["output"]));
        const rawText = await readFile(sourcePath, "utf8");
        const rawPayload = parseJsonWithBom(rawText);
        const normalizedPayload = validateNarrativePayload(rawPayload);
        const scenePlan = buildScenePlan(normalizedPayload);

        const promptPackets = {
          global: scenePlan.globalPromptPackets,
          shots: scenePlan.shots.map((shot) => ({
            shotId: shot.id,
            beatId: shot.beatId,
            promptPackets: shot.promptPackets,
          })),
        };

        await mkdir(outputDir, { recursive: true });
        await writeFile(
          join(outputDir, "narrative.payload.json"),
          JSON.stringify(normalizedPayload, null, 2),
          "utf8"
        );
        await writeFile(
          join(outputDir, "scene-plan.json"),
          JSON.stringify(scenePlan, null, 2),
          "utf8"
        );
        await writeFile(
          join(outputDir, "prompt-packets.json"),
          JSON.stringify(promptPackets, null, 2),
          "utf8"
        );
        await writeFile(
          join(outputDir, "asset-requests.json"),
          JSON.stringify(scenePlan.assetRequests, null, 2),
          "utf8"
        );
        await writeFile(join(outputDir, "review-gates.md"), buildReviewMarkdown(scenePlan), "utf8");
        await writeFile(join(outputDir, "README.md"), buildReadme(scenePlan, sourcePath), "utf8");

        console.log(chalk.green(`Scene plan package built: ${outputDir}`));
        console.log(chalk.dim(`Shots:          ${scenePlan.shots.length}`));
        console.log(chalk.dim(`Total duration: ${scenePlan.totalDurationSec.toFixed(1)}s`));
        console.log(chalk.dim(`Review gates:   ${scenePlan.reviewGates.length}`));
        logInfo(`plan build package: ${outputDir}`);
      } catch (error) {
        const message = (error as Error).message;
        logError("plan build failed", message);
        console.error(chalk.red(`Plan build failed: ${message}`));
        process.exit(1);
      }
    });
}
