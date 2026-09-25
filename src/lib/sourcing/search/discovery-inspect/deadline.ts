/**
 * End-to-end wall-clock deadline helpers for Preview / Import.
 *
 * In-flight Tavily/OpenAI/fetch work is raced against the remaining budget so a
 * hung provider cannot extend the run past deadlineAt. Late promise rejections
 * are swallowed after timeout.
 *
 * Platform hard-kills can still skip `finally`; search-lock stale takeover is
 * the operational backstop (see search-lock.ts).
 */
export class DeadlineExceededError extends Error {
  readonly code = "DEADLINE_EXCEEDED" as const;
  constructor(message = "deadline exceeded") {
    super(message);
    this.name = "DeadlineExceededError";
  }
}

export function remainingMs(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

export function isPastDeadline(deadlineAt: number): boolean {
  return Date.now() >= deadlineAt;
}

/**
 * Race `work` against the remaining wall-clock budget for `deadlineAt`.
 * Does not cancel the underlying operation (JS has no preemptive cancel), but
 * returns/throws immediately when the deadline elapses so the pipeline can stop.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  deadlineAt: number,
  label = "operation"
): Promise<T> {
  const remaining = remainingMs(deadlineAt);
  if (remaining <= 0) {
    void work.then(
      () => undefined,
      () => undefined
    );
    throw new DeadlineExceededError(`${label} skipped — deadline`);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DeadlineExceededError(`${label} exceeded deadline`));
    }, remaining);
  });

  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    // Detach abandoned work so a late rejection is not unhandled.
    void work.then(
      () => undefined,
      () => undefined
    );
    throw e;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function isDeadlineExceeded(e: unknown): e is DeadlineExceededError {
  return (
    e instanceof DeadlineExceededError ||
    (typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "DEADLINE_EXCEEDED")
  );
}
