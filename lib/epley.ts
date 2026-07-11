/** Epley estimated 1RM: weight × (1 + reps/30). */
export function epley1RM(weightLbs: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightLbs;
  return Math.round(weightLbs * (1 + reps / 30) * 10) / 10;
}
