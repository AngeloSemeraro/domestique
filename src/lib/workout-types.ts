export type WorkoutKind = "default" | "race" | "workout" | "long_run";

/**
 * Map a logical workout kind to Strava's workout_type integer for a given
 * sport_type. Returns undefined when the kind doesn't apply.
 *   Run:  0 default, 1 race, 2 long run, 3 workout
 *   Ride: 10 default, 11 race, 12 workout
 */
export function workoutTypeForSport(
  kind: WorkoutKind,
  sport: string
): number | undefined {
  const isRun = sport === "Run" || sport === "TrailRun" || sport === "VirtualRun";
  const isRide =
    sport === "Ride" ||
    sport === "MountainBikeRide" ||
    sport === "GravelRide" ||
    sport === "EBikeRide" ||
    sport === "EMountainBikeRide" ||
    sport === "VirtualRide";
  if (isRun) {
    return { default: 0, race: 1, long_run: 2, workout: 3 }[kind];
  }
  if (isRide) {
    if (kind === "long_run") return undefined;
    return { default: 10, race: 11, workout: 12 }[kind];
  }
  return undefined;
}
