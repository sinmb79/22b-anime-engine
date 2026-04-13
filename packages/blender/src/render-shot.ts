import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { encodeVideo } from "@22b/anime-renderer";
import { buildShotPackage, type BuildShotPackageResult } from "./build-shot.js";
import { probeBlender, requireBlenderBinary } from "./blender-path.js";

export interface RenderShotOptions {
  scenePath: string;
  outputPath: string;
  buildDir: string;
  blenderBinary?: string;
  dryRun?: boolean;
  crf?: number;
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
}

export interface RenderShotResult {
  outputPath: string;
  buildDir: string;
  framesDir: string;
  command: string;
  frameCount: number;
  warnings: string[];
  dryRun?: boolean;
}

async function runProcess(binary: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const proc = spawn(binary, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(`Blender exited with code ${code}.\n${stderr.slice(-4000)}`)
        );
      }
    });

    proc.on("error", (error) => {
      rejectPromise(new Error(`Failed to launch Blender: ${error.message}`));
    });
  });
}

async function normalizeFrameSequence(framesDir: string): Promise<number> {
  const entries = (await readdir(framesDir))
    .filter((entry) => entry.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (entries.length === 0) return 0;

  for (let index = 0; index < entries.length; index++) {
    const source = join(framesDir, entries[index]);
    const temp = join(framesDir, `.__tmp__${index.toString().padStart(6, "0")}.png`);
    await rename(source, temp);
  }

  const temps = (await readdir(framesDir))
    .filter((entry) => entry.startsWith(".__tmp__") && entry.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (let index = 0; index < temps.length; index++) {
    const source = join(framesDir, temps[index]);
    const target = join(framesDir, `${index.toString().padStart(6, "0")}.png`);
    await rename(source, target);
  }

  return entries.length;
}

function buildBlenderArgs(build: BuildShotPackageResult): string[] {
  return [
    "-b",
    "-P",
    build.scriptPath,
    "--",
    "--manifest",
    build.manifestPath,
    "--frames-dir",
    join(build.outputDir, "frames"),
  ];
}

export async function renderShot(options: RenderShotOptions): Promise<RenderShotResult> {
  const build = await buildShotPackage({
    scenePath: options.scenePath,
    outputDir: options.buildDir,
  });

  const framesDir = join(build.outputDir, "frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  if (options.dryRun) {
    const probe = probeBlender(options.blenderBinary);
    const binary = options.blenderBinary ?? probe.binary ?? "blender";
    const args = buildBlenderArgs(build);
    return {
      outputPath: resolve(options.outputPath),
      buildDir: build.outputDir,
      framesDir,
      command: [binary, ...args].join(" "),
      frameCount: 0,
      warnings: build.manifest.unsupportedFeatures,
      dryRun: true,
    };
  }

  const probe = requireBlenderBinary(options.blenderBinary);
  const binary = probe.binary as string;
  const args = buildBlenderArgs(build);
  const command = [binary, ...args].join(" ");

  await runProcess(binary, args, build.outputDir);
  const frameCount = await normalizeFrameSequence(framesDir);
  if (frameCount === 0) {
    throw new Error("Blender finished without producing any PNG frames.");
  }

  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });

  await encodeVideo({
    framesDir,
    outputPath,
    fps: build.manifest.render.fps,
    duration: build.manifest.render.duration,
    crf: options.crf,
    preset: options.preset,
    audioTracks: build.manifest.audioTracks
      .filter((track) => track.exists)
      .map((track) => ({
        path: track.absolutePath,
        startTime: track.startTime,
        volume: track.volume,
        fadeIn: track.fadeIn,
        fadeOut: track.fadeOut,
      })),
  });

  return {
    outputPath,
    buildDir: build.outputDir,
    framesDir,
    command,
    frameCount,
    warnings: build.manifest.unsupportedFeatures,
  };
}
