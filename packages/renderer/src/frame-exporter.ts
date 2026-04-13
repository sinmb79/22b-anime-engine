import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Writes a PNG buffer to disk as a zero-padded 6-digit frame file.
 * e.g. frameIndex=47 → {outputDir}/000047.png
 *
 * The 6-digit zero-pad format is required by FFmpeg's %06d.png glob pattern.
 */
export async function exportFramePng(
  buffer: Buffer,
  frameIndex: number,
  outputDir: string
): Promise<string> {
  const filename = frameIndex.toString().padStart(6, "0") + ".png";
  const filePath = join(outputDir, filename);
  await writeFile(filePath, buffer);
  return filePath;
}

/**
 * Creates a temporary directory for frame output.
 * Returns the absolute path.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}
