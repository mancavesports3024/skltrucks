import "server-only";

/**
 * One active driving-distance calculation per lead+route key (in-process only).
 *
 * Complements UI disabled state — does not replace auth or Google Cloud quotas.
 * Not fleet-wide on Vercel: two isolates can each call Google before cache is saved.
 * Acceptable for manual low-volume Market Comparison; Google quotas are the hard limit.
 */
const activeByKey = new Map<string, string>();

export const DRIVING_DISTANCE_BUSY_MESSAGE =
  "A driving-distance calculation is already running for this lead/route. Wait for it to finish, then try again.";

export type DrivingDistanceLockResult =
  | { ok: true; lockKey: string }
  | { ok: false; message: string };

export function drivingDistanceLockKey(
  leadId: string,
  destLat: number,
  destLng: number,
  version: string
): string {
  return `${leadId.trim()}|${destLat.toFixed(5)}|${destLng.toFixed(5)}|${version}`;
}

export function tryAcquireDrivingDistanceLock(
  lockKey: string,
  holder: string
): DrivingDistanceLockResult {
  const key = lockKey.trim();
  const who = holder.trim().toLowerCase() || "anonymous";
  if (!key) {
    return { ok: false, message: "Missing lock key." };
  }
  const current = activeByKey.get(key);
  if (current && current !== who) {
    return { ok: false, message: DRIVING_DISTANCE_BUSY_MESSAGE };
  }
  // Same holder re-entry (duplicate click): treat as busy if already held.
  if (current === who) {
    return { ok: false, message: DRIVING_DISTANCE_BUSY_MESSAGE };
  }
  activeByKey.set(key, who);
  return { ok: true, lockKey: key };
}

export function releaseDrivingDistanceLock(lockKey: string, holder: string): void {
  const key = lockKey.trim();
  const who = holder.trim().toLowerCase() || "anonymous";
  if (activeByKey.get(key) === who) {
    activeByKey.delete(key);
  }
}

/** Test helper. */
export function resetDrivingDistanceLocksForTests(): void {
  activeByKey.clear();
}
