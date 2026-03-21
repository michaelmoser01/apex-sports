/**
 * True when the coach has saved at least one group tier in groupRates (JSON object with keys).
 */
export function hasGroupRatesConfigured(groupRates: unknown): boolean {
  return (
    typeof groupRates === "object" &&
    groupRates !== null &&
    !Array.isArray(groupRates) &&
    Object.keys(groupRates as Record<string, unknown>).length > 0
  );
}
