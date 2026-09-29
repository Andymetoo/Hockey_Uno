/** Absolute aircraft headings are visual state; relative facing still drives rules.
 * Degrees increase clockwise: 0 = north, 90 = east, 180 = south, 270 = west.
 * All helpers are deterministic and consume no game randomness.
 */
const normalizeHeading = value => ((value % 360) + 360) % 360;
const INWARD_HEADINGS = { Fore: 180, Starboard: 270, Aft: 0, Port: 90 };

export const inwardHeading = quadrant => INWARD_HEADINGS[quadrant];

/** Old saved fighters have no heading. Their former direction can only be
 * reconstructed deterministically from relative facing; new fighters retain it.
 */
export function fighterHeading(fighter) {
  return Number.isFinite(fighter.heading)
    ? normalizeHeading(fighter.heading)
    : normalizeHeading(inwardHeading(fighter.quadrant) + (fighter.facing || 0));
}

export function turnHeadingToward(fighter) {
  const heading = fighterHeading(fighter);
  const clockwise = normalizeHeading(inwardHeading(fighter.quadrant) - heading);
  if (clockwise === 0) return heading;
  // A 180-degree turn has no preferred side: choose clockwise, without RNG.
  return normalizeHeading(heading + (clockwise <= 180 ? 90 : -90));
}

export function turnHeadingAway(fighter) {
  const heading = fighterHeading(fighter);
  const clockwise = normalizeHeading(inwardHeading(fighter.quadrant) - heading);
  if (clockwise === 180) return heading;
  // An inward-facing fighter also has no preferred side; choose clockwise.
  return normalizeHeading(heading + (clockwise === 0 || clockwise > 180 ? 90 : -90));
}
