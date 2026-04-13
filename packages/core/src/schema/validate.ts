import { ZodError } from "zod";
import { SceneSchema, type Scene } from "./scene.js";

// ─── Validation Error ─────────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(public readonly details: string) {
    super(`Scene validation failed:\n${details}`);
    this.name = "ValidationError";
  }
}

// ─── Format Zod Error ─────────────────────────────────────────────────────────

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `  [${path}] ${issue.message}`;
    })
    .join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates a raw unknown value as a Scene JSON.
 * Returns the validated and typed Scene on success.
 * Throws ValidationError with human-readable details on failure.
 * Machine-parseable output: one issue per line, format "[path] message".
 */
export function validateScene(raw: unknown): Scene {
  const result = SceneSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(formatZodError(result.error));
  }
  return result.data;
}
