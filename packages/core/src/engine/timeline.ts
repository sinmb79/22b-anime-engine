import type { Scene } from "../schema/scene.js";
import { composeFrame, type ComposedFrame } from "./compositor.js";

export interface FrameState {
  frameIndex: number;
  /** Time in seconds computed as frameIndex / fps. Never drifts. */
  time: number;
  composed: ComposedFrame;
}

/**
 * Generator that yields one FrameState per frame of the scene.
 * Uses integer division for time to avoid floating-point drift.
 * Memory-efficient: only one frame is in memory at a time.
 */
export function* frameIterator(scene: Scene): Generator<FrameState> {
  const totalFrames = Math.ceil(scene.meta.duration * scene.meta.fps);
  for (let i = 0; i < totalFrames; i++) {
    const time = i / scene.meta.fps;
    yield {
      frameIndex: i,
      time,
      composed: composeFrame(scene, time),
    };
  }
}

export { composeFrame };
