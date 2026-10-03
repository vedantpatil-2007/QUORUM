export const MIN_BUILDERS = 3;
export const QUORUM_THRESHOLD_PERCENT = 66.67;

/**
 * Calculates the percentage of votes received by a group formatted to 2 decimal places.
 * Example: 2 / 3 -> 66.67%
 */
export function calculateConsensusPercentage(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

/**
 * Evaluates whether dominant vote count meets or exceeds the required 66.67% quorum threshold.
 * 
 * Technical Rationale:
 * A 2/3 majority represents 66.666...%, which under standard two-decimal statistical rounding
 * formats to 66.67%. To ensure exact mathematical robustness against floating point imprecision,
 * we verify both the rounded percentage against 66.67% and the exact rational comparison:
 *   dominantCount / totalValidCount >= (2 / 3 - 0.0001)
 */
export function meetsQuorumThreshold(dominantCount: number, totalValidCount: number): boolean {
  if (totalValidCount <= 0 || dominantCount <= 0) return false;
  const percentage = calculateConsensusPercentage(dominantCount, totalValidCount);
  return percentage >= QUORUM_THRESHOLD_PERCENT;
}
