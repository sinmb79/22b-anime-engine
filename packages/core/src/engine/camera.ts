import type { CameraTrack, CameraKeyframe } from "../schema/scene.js";
import { applyEasing } from "./interpolator.js";

// ─── Resolved Camera State ────────────────────────────────────────────────────

export interface ResolvedCamera {
  x: number;
  y: number;
  zoom: number;
}

// ─── Camera Interpolation ─────────────────────────────────────────────────────

function lerpCamera(
  before: CameraKeyframe,
  after: CameraKeyframe,
  initialX: number,
  initialY: number,
  initialZoom: number,
  t: number
): { x: number; y: number; zoom: number } {
  const easedT = applyEasing(t, after.easing);

  const fromX = before.x ?? initialX;
  const fromY = before.y ?? initialY;
  const fromZoom = before.zoom ?? initialZoom;
  const toX = after.x ?? fromX;
  const toY = after.y ?? fromY;
  const toZoom = after.zoom ?? fromZoom;

  return {
    x: fromX + (toX - fromX) * easedT,
    y: fromY + (toY - fromY) * easedT,
    zoom: fromZoom + (toZoom - fromZoom) * easedT,
  };
}

// ─── Camera Shake ─────────────────────────────────────────────────────────────

function computeShakeOffset(
  intensity: number,
  frequency: number,
  duration: number,
  elapsed: number
): { dx: number; dy: number } {
  if (elapsed >= duration) return { dx: 0, dy: 0 };
  const envelope = 1 - elapsed / duration;
  const dx = intensity * Math.sin(2 * Math.PI * frequency * elapsed) * envelope;
  const dy = intensity * Math.cos(2 * Math.PI * frequency * elapsed * 0.7) * envelope;
  return { dx, dy };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves the camera state at the given currentTime.
 * @param track - The CameraTrack from the scene.
 * @param currentTime - Current playback time in seconds.
 */
export function resolveCamera(track: CameraTrack, currentTime: number): ResolvedCamera {
  const { x: initX, y: initY, zoom: initZoom } = track.initialTransform;
  const kfs = track.keyframes;

  let x = initX;
  let y = initY;
  let zoom = initZoom;

  if (kfs.length > 0) {
    if (currentTime <= kfs[0].time) {
      x = kfs[0].x ?? initX;
      y = kfs[0].y ?? initY;
      zoom = kfs[0].zoom ?? initZoom;
    } else if (currentTime >= kfs[kfs.length - 1].time) {
      const last = kfs[kfs.length - 1];
      x = last.x ?? initX;
      y = last.y ?? initY;
      zoom = last.zoom ?? initZoom;
    } else {
      for (let i = 0; i < kfs.length - 1; i++) {
        if (kfs[i].time <= currentTime && currentTime < kfs[i + 1].time) {
          const duration = kfs[i + 1].time - kfs[i].time;
          const rawT = (currentTime - kfs[i].time) / duration;
          const result = lerpCamera(kfs[i], kfs[i + 1], initX, initY, initZoom, rawT);
          x = result.x;
          y = result.y;
          zoom = result.zoom;
          break;
        }
      }
    }
  }

  // Apply shake from any keyframe whose shake is still active
  for (const kf of kfs) {
    if (kf.shake && currentTime >= kf.time) {
      const elapsed = currentTime - kf.time;
      const { dx, dy } = computeShakeOffset(
        kf.shake.intensity,
        kf.shake.frequency,
        kf.shake.duration,
        elapsed
      );
      x += dx;
      y += dy;
    }
  }

  return { x, y, zoom };
}
