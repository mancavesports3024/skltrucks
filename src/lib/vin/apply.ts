export type VinDecodeMode = "fill-empty" | "replace-all";

export function shouldApplyField(current: string, incoming: string, mode: VinDecodeMode): boolean {
  if (!incoming.trim()) return false;
  return mode === "replace-all" || !current.trim();
}

export function mergeDecodedDetails(
  current: Record<string, string>,
  incoming: Record<string, string>,
  mode: VinDecodeMode
): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (shouldApplyField(next[key] ?? "", value, mode)) {
      next[key] = value;
    }
  }
  return next;
}
