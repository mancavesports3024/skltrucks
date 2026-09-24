import "server-only";

/**
 * One active driving-distance calculation per lead (in-process).
 * Complements UI disabled state — does not replace auth.
 */
const activeByLead = new Map<string, string>();

export const DRIVING_DISTANCE_BUSY_MESSAGE =
  "A driving-distance calculation is already running for this lead. Wait for it to finish, then try again.";

export type DrivingDistanceLockResult =
  | { ok: true }
  | { ok: false; message: string };

export function tryAcquireDrivingDistanceLock(
  leadId: string,
  holder: string
): DrivingDistanceLockResult {
  const id = leadId.trim();
  const who = holder.trim().toLowerCase() || "anonymous";
  if (!id) {
    return { ok: false, message: "Missing lead id." };
  }
  const current = activeByLead.get(id);
  if (current && current !== who) {
    return { ok: false, message: DRIVING_DISTANCE_BUSY_MESSAGE };
  }
  activeByLead.set(id, who);
  return { ok: true };
}

export function releaseDrivingDistanceLock(leadId: string, holder: string): void {
  const id = leadId.trim();
  const who = holder.trim().toLowerCase() || "anonymous";
  if (activeByLead.get(id) === who) {
    activeByLead.delete(id);
  }
}

/** Test helper. */
export function resetDrivingDistanceLocksForTests(): void {
  activeByLead.clear();
}
