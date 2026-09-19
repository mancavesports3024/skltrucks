/**
 * Server-side single-flight lock for paid internet search runs.
 * UI disabled state is helpful but not the security control.
 */

export const SEARCH_ALREADY_RUNNING_MESSAGE =
  "A sourcing search is already running. Wait for it to finish, then try again.";

/** Default TTL — interrupted runs become acquirable after this. */
export const DEFAULT_SEARCH_LOCK_TTL_MS = 10 * 60 * 1000;

export type SearchLockAcquireResult =
  | { ok: true }
  | { ok: false; reason: "already_running" | "unauthorized" | "error"; message: string };

export interface SearchLockStore {
  tryAcquire(
    holderEmail: string,
    now?: Date,
    ttlMs?: number
  ): Promise<SearchLockAcquireResult>;
  release(holderEmail: string, now?: Date): Promise<void>;
}

export function isSearchLockExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (expiresAt == null) return true;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return true;
  return exp.getTime() <= now.getTime();
}

/** In-memory lock for unit tests (simulates DB single-row lock). */
export function createMemorySearchLockStore(): SearchLockStore {
  let holder = "";
  let expiresAt = new Date(0);

  return {
    async tryAcquire(holderEmail, now = new Date(), ttlMs = DEFAULT_SEARCH_LOCK_TTL_MS) {
      const email = holderEmail.trim().toLowerCase();
      if (!email) {
        return {
          ok: false,
          reason: "error",
          message: "Missing lock holder email.",
        };
      }
      const expired = isSearchLockExpired(expiresAt, now);
      if (!expired && holder && holder !== email) {
        return {
          ok: false,
          reason: "already_running",
          message: SEARCH_ALREADY_RUNNING_MESSAGE,
        };
      }
      holder = email;
      expiresAt = new Date(now.getTime() + Math.max(60_000, ttlMs));
      return { ok: true };
    },
    async release(holderEmail) {
      const email = holderEmail.trim().toLowerCase();
      if (holder === email) {
        holder = "";
        expiresAt = new Date(0);
      }
    },
  };
}

type SupabaseLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export function createSupabaseSearchLockStore(supabase: SupabaseLike): SearchLockStore {
  return {
    async tryAcquire(holderEmail, _now, ttlMs = DEFAULT_SEARCH_LOCK_TTL_MS) {
      const ttlSeconds = Math.max(60, Math.round(ttlMs / 1000));
      const { data, error } = await supabase.rpc("try_acquire_sourcing_search_lock", {
        p_holder: holderEmail.trim().toLowerCase(),
        p_ttl_seconds: ttlSeconds,
      });
      if (error) {
        return {
          ok: false,
          reason: "error",
          message: error.message,
        };
      }
      if (data === true) return { ok: true };
      return {
        ok: false,
        reason: "already_running",
        message: SEARCH_ALREADY_RUNNING_MESSAGE,
      };
    },
    async release(holderEmail) {
      await supabase.rpc("release_sourcing_search_lock", {
        p_holder: holderEmail.trim().toLowerCase(),
      });
    },
  };
}

let testStoreOverride: SearchLockStore | null = null;

/** Test-only: inject a lock store (e.g. memory) so provider mocks can be asserted. */
export function setSearchLockStoreForTests(store: SearchLockStore | null): void {
  testStoreOverride = store;
}

export function resolveSearchLockStore(supabase: SupabaseLike): SearchLockStore {
  if (testStoreOverride) return testStoreOverride;
  return createSupabaseSearchLockStore(supabase);
}
