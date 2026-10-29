import type { TrailSample } from './tracking.mjs';

export type MotionAlertPhase = 'unknown' | 'still' | 'moving';
export type MotionAlertEvent = 'start' | 'stop';

export function nextMotionAlert(input: {
  points?: TrailSample[] | null;
  now: number;
  phase?: string | null;
}): { phase: MotionAlertPhase; event: MotionAlertEvent | null };

export function motionAlertCopy(name: string | null | undefined, event: string): string;

export function motionNotifyNames(
  members: { id?: string; name?: string }[] | null | undefined,
  ids: string[] | null | undefined,
): string[];
