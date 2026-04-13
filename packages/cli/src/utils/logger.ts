/**
 * CLI Logger — appends all commands and errors to daily log files.
 * Log directory: ~/.anime-engine/logs/YYYY-MM-DD.log
 *
 * Required by Risk Analysis §9.1: comprehensive logging for Codex self-diagnosis.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".anime-engine", "logs");

function ensureLogDir(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch { /* ignore */ }
}

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `${date}.log`);
}

function formatLine(level: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${message}\n`;
}

export function logCommand(argv: string[]): void {
  ensureLogDir();
  const cmd = argv.slice(2).join(" ");
  try {
    appendFileSync(getLogPath(), formatLine("CMD", `anime ${cmd}`));
  } catch { /* non-fatal */ }
}

export function logError(message: string, detail?: string): void {
  ensureLogDir();
  try {
    const line = detail
      ? formatLine("ERR", `${message}\n${detail}`)
      : formatLine("ERR", message);
    appendFileSync(getLogPath(), line);
  } catch { /* non-fatal */ }
}

export function logInfo(message: string): void {
  ensureLogDir();
  try {
    appendFileSync(getLogPath(), formatLine("INF", message));
  } catch { /* non-fatal */ }
}
