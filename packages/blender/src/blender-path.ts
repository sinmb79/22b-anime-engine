import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

type BlenderProbeSource = "custom" | "env" | "path" | "candidate";

interface BlenderCandidate {
  binary: string;
  source: BlenderProbeSource;
}

export interface BlenderProbeResult {
  found: boolean;
  binary?: string;
  version?: string;
  source?: BlenderProbeSource;
  checked: string[];
}

function isPathLike(value: string): boolean {
  return value.includes("\\") || value.includes("/") || value.includes(":");
}

function uniqueCandidates(candidates: BlenderCandidate[]): BlenderCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.binary.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function windowsCandidates(): string[] {
  const versions = ["4.5", "4.4", "4.3", "4.2", "4.1", "4.0", "3.6"];
  const base = "C:/Program Files/Blender Foundation";
  const local = join(homedir(), "AppData", "Local", "Programs", "Blender Foundation");
  return versions.flatMap((version) => [
    `${base}/Blender ${version}/blender.exe`,
    `${local}/Blender ${version}/blender.exe`,
  ]);
}

function platformCandidates(): string[] {
  if (platform() === "win32") {
    return windowsCandidates();
  }
  if (platform() === "darwin") {
    return [
      "/Applications/Blender.app/Contents/MacOS/Blender",
      "/opt/homebrew/bin/blender",
      "/usr/local/bin/blender",
    ];
  }
  return ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender"];
}

function parseVersion(output: string): string | undefined {
  const match = output.match(/Blender\s+([0-9.]+)/);
  return match?.[1];
}

function canExecute(binary: string): { ok: boolean; version?: string } {
  if (isPathLike(binary) && !existsSync(binary)) {
    return { ok: false };
  }

  const result = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    return { ok: false };
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { ok: true, version: parseVersion(output) };
}

export function probeBlender(preferredBinary?: string): BlenderProbeResult {
  const envCandidates = ["BLENDER_PATH", "BLENDER_BIN"]
    .map((key) => process.env[key])
    .filter((value): value is string => Boolean(value));

  const candidates = uniqueCandidates([
    ...(preferredBinary ? [{ binary: preferredBinary, source: "custom" as const }] : []),
    ...envCandidates.map((binary) => ({ binary, source: "env" as const })),
    { binary: "blender", source: "path" as const },
    ...platformCandidates().map((binary) => ({ binary, source: "candidate" as const })),
  ]);

  const checked: string[] = [];
  for (const candidate of candidates) {
    checked.push(candidate.binary);
    const result = canExecute(candidate.binary);
    if (result.ok) {
      return {
        found: true,
        binary: candidate.binary,
        version: result.version,
        source: candidate.source,
        checked,
      };
    }
  }

  return { found: false, checked };
}

export function requireBlenderBinary(preferredBinary?: string): BlenderProbeResult {
  const probe = probeBlender(preferredBinary);
  if (probe.found) return probe;

  const lines = probe.checked.map((entry) => `  - ${entry}`).join("\n");
  throw new Error(
    [
      "Blender was not found in the local environment.",
      "Checked the following candidates:",
      lines || "  - blender",
      "Install Blender locally or set BLENDER_PATH to the executable.",
    ].join("\n")
  );
}
