import { spawn, execSync } from "node:child_process";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { existsSync } from "node:fs";

export interface AudioInput {
  /** Absolute path to audio file (wav/mp3/ogg/…). */
  path: string;
  /** Scene time in seconds when this clip starts. */
  startTime: number;
  /** Gain: 0.0–1.0. */
  volume: number;
  /** Fade-in duration in seconds (optional). */
  fadeIn?: number;
  /** Fade-out duration in seconds (optional). */
  fadeOut?: number;
}

export interface EncodeOptions {
  framesDir: string;
  outputPath: string;
  fps: number;
  /** Audio tracks to mix into the video. */
  audioTracks?: AudioInput[];
  /** Scene duration in seconds — needed for fade-out calculation. */
  duration?: number;
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
    audioTracks = [],
    duration,
    crf = 18,
    preset = "medium",
    onProgress,
  } = options;

  const inputPattern = join(framesDir, "%06d.png");

  const args: string[] = ["-y", "-framerate", String(fps), "-i", inputPattern];

  if (audioTracks.length === 0) {
    // No audio — simple video-only encode
    args.push(
      "-c:v", "libx264",
      "-preset", preset,
      "-crf", String(crf),
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    );
  } else {
    // Add each audio input
    for (const track of audioTracks) {
      args.push("-i", track.path);
    }

    // Build filter_complex: delay + volume + optional fades, then amix
    const filterParts: string[] = [];
    const mixLabels: string[] = [];

    audioTracks.forEach((track, idx) => {
      const inputLabel = `[${idx + 1}:a]`;
      const outLabel = `[a${idx}]`;
      const delayMs = Math.round(track.startTime * 1000);

      let filter = `${inputLabel}adelay=${delayMs}|${delayMs},volume=${track.volume}`;

      if (track.fadeIn && track.fadeIn > 0) {
        filter += `,afade=t=in:st=${track.startTime}:d=${track.fadeIn}`;
      }
      if (track.fadeOut && track.fadeOut > 0 && duration !== undefined) {
        const fadeStart = duration - track.fadeOut;
        filter += `,afade=t=out:st=${fadeStart}:d=${track.fadeOut}`;
      }

      filter += `${outLabel}`;
      filterParts.push(filter);
      mixLabels.push(outLabel);
    });

    // Mix all audio streams together
    const mixInput = mixLabels.join("");
    filterParts.push(`${mixInput}amix=inputs=${audioTracks.length}:duration=first:dropout_transition=0[aout]`);

    args.push(
      "-filter_complex", filterParts.join(";"),
      "-map", "0:v",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", preset,
      "-crf", String(crf),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      outputPath,
    );
  }

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
