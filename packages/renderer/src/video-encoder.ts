import { spawn, execSync } from "node:child_process";
import { join } from "node:path";

export interface EncodeOptions {
  framesDir: string;
  outputPath: string;
  fps: number;
  /** Audio files to mix in (not used in Phase 0). */
  audioPaths?: string[];
  /** FFmpeg CRF: 0-51, lower = better quality. Default 18. */
  crf?: number;
  /** FFmpeg preset. Default "medium". */
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  onProgress?: (frame: number) => void;
}

// ─── FFmpeg Detection ─────────────────────────────────────────────────────────

let ffmpegChecked = false;

export function checkFfmpeg(): void {
  if (ffmpegChecked) return;
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    ffmpegChecked = true;
  } catch {
    throw new Error(
      "FFmpeg not found. Please install it and ensure it is in PATH.\n" +
      "  Windows: winget install ffmpeg\n" +
      "  macOS:   brew install ffmpeg\n" +
      "  Linux:   sudo apt install ffmpeg"
    );
  }
}

// ─── Video Encoder ────────────────────────────────────────────────────────────

/**
 * Encodes a PNG frame sequence to MP4 using FFmpeg.
 *
 * Frames must be zero-padded 6-digit PNGs: 000000.png, 000001.png, ...
 *
 * Uses:
 *   -pix_fmt yuv420p  — mandatory for broad player compatibility
 *   -movflags +faststart  — enables progressive web streaming
 */
export function encodeVideo(options: EncodeOptions): Promise<void> {
  checkFfmpeg();

  const {
    framesDir,
    outputPath,
    fps,
    crf = 18,
    preset = "medium",
    onProgress,
  } = options;

  const inputPattern = join(framesDir, "%06d.png");

  const args = [
    "-y",
    "-framerate", String(fps),
    "-i", inputPattern,
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      if (onProgress) {
        const match = text.match(/frame=\s*(\d+)/);
        if (match) onProgress(parseInt(match[1], 10));
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}.\n${stderr.slice(-2000)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}
