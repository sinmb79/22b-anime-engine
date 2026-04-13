import { spawn, execSync } from "node:child_process";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { existsSync } from "node:fs";

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

/** Resolved FFmpeg binary path (set once on first checkFfmpeg() call). */
let ffmpegBin = "ffmpeg";

/** Candidate fallback paths when FFmpeg is not in PATH (e.g. fresh WinGet install). */
function ffmpegCandidates(): string[] {
  if (platform() !== "win32") return [];
  const home = homedir();
  return [
    join(home, "AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe"),
    join(home, "AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1-full_build/bin/ffmpeg.exe"),
    "C:/Program Files/ffmpeg/bin/ffmpeg.exe",
    "C:/ffmpeg/bin/ffmpeg.exe",
  ];
}

export function checkFfmpeg(): void {
  if (ffmpegBin !== "ffmpeg") return; // already resolved

  // Try PATH first
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return; // found in PATH
  } catch { /* fall through to candidates */ }

  // Try known fallback locations (handles fresh WinGet install before shell restart)
  for (const candidate of ffmpegCandidates()) {
    if (existsSync(candidate)) {
      try {
        execSync(`"${candidate}" -version`, { stdio: "ignore" });
        ffmpegBin = candidate;
        return;
      } catch { /* try next */ }
    }
  }

  throw new Error(
    "FFmpeg not found. Please install it and ensure it is in PATH.\n" +
    "  Windows: winget install ffmpeg  (then restart terminal)\n" +
    "  macOS:   brew install ffmpeg\n" +
    "  Linux:   sudo apt install ffmpeg"
  );
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
    const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });

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
