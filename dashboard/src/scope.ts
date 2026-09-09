/**
 * GLV scope resolution.
 *
 * The Scouts Data Explorer views return every row in the *widest* hierarchy the
 * authenticated contact holds any role in. A volunteer who is GLV for one group
 * but also sits on, say, a District Programme Team gets the whole district back,
 * which is far more members than a GLV dashboard should show.
 *
 * Every dashboard view carries a `unitPrefix` column: a `>>`-delimited ancestry
 * path such as
 *
 *   S10000004>>S12272151>>000317172>>S10001979>>S10016945            (a group)
 *   S10000004>>S12272151>>000317172>>S10001979>>S10016945>>S10051045 (its Scout section)
 *
 * so `unitPrefix LIKE '<group path>%'` selects the group *and* every section
 * beneath it, server-side, on all seven views.
 *
 * Note that the query language uses each column's *internal* name, not the
 * display name that comes back in the response: `unitPrefix`, `LocationGroup`,
 * `MembershipNumber`. Using the display name (`Group = '...'`) is rejected with
 * `error_GetResultsAsync`.
 *
 * `LocationGroup` deliberately is not used for scoping: it holds the parent
 * group of a *section* and is null for group-level roles, so filtering on it
 * drops the Leadership Team, the Trustee Board and the GLV themselves.
 */

/** One unit the signed-in volunteer holds at least one role in. */
export interface ScopeUnit {
  unitId: string;
  unitName: string;
  unitPrefix: string;
  /** Distinct role names held in this unit, in first-seen order. */
  roles: string[];
}

/** Sentinel meaning "don't filter — show everything the API will return". */
export const ALL_UNITS = "__all__";

const STORAGE_KEY = "glv.scope.unitPrefix";

/**
 * Roles that confer oversight of a whole unit and everything beneath it.
 * Compared case-insensitively against the view's `Role` column.
 *
 * This list decides the *default* scope only — the picker always lets the
 * volunteer choose a different unit when the guess is wrong.
 */
export const OVERSIGHT_ROLES = [
  "group lead volunteer",
  "assistant group lead volunteer",
  "district lead volunteer",
  "assistant district lead volunteer",
  "county lead volunteer",
  "regional lead volunteer",
];

export function isOversightRole(role: string): boolean {
  return OVERSIGHT_ROLES.includes(role.trim().toLowerCase());
}

/**
 * Unit prefixes are opaque `>>`-joined unit codes. Anything else is rejected
 * rather than interpolated into a query — a stray `%` or `_` would widen the
 * LIKE pattern instead of narrowing it, and a quote would break the expression.
 */
const UNIT_PREFIX_PATTERN = /^[A-Za-z0-9-]+(?:>>[A-Za-z0-9-]+)*$/;

export function isValidUnitPrefix(prefix: string): boolean {
  return UNIT_PREFIX_PATTERN.test(prefix);
}

/** Depth of a unit in the hierarchy — shorter path means higher up. */
function depth(prefix: string): number {
  return prefix.split(">>").length;
}

/**
 * Collapse the rows of the signed-in volunteer's own record into one entry per
 * unit. Rows are the raw Data Explorer response, so field names are the
 * *display* names and a member appears once per role per learning module.
 */
export function buildScopeUnits(rows: Record<string, unknown>[]): ScopeUnit[] {
  const byPrefix = new Map<string, ScopeUnit>();

  for (const row of rows) {
    const unitPrefix = String(row["Unit prefix"] ?? "");
    if (!unitPrefix) continue;

    let unit = byPrefix.get(unitPrefix);
    if (!unit) {
      unit = {
        unitId: String(row["Unit ID"] ?? ""),
        unitName: String(row["Unit name"] ?? ""),
        unitPrefix,
        roles: [],
      };
      byPrefix.set(unitPrefix, unit);
    }

    const role = String(row["Role"] ?? "").trim();
    if (role && !unit.roles.includes(role)) unit.roles.push(role);
  }

  // Highest unit in the hierarchy first, then alphabetically for stable output.
  return [...byPrefix.values()].sort(
    (a, b) =>
      depth(a.unitPrefix) - depth(b.unitPrefix) ||
      a.unitName.localeCompare(b.unitName),
  );
}

/**
 * Choose the scope to apply when the volunteer has not picked one.
 *
 * Prefers the highest unit where they hold an oversight role. That is what
 * separates a GLV's own group from a district they merely sit on a team in:
 * the district role is not an oversight role, so it does not widen the scope.
 * Falls back to the highest unit they hold any role in, which preserves the
 * previous behaviour for volunteers with no oversight role at all.
 */
export function pickDefaultScopePrefix(units: ScopeUnit[]): string | null {
  if (units.length === 0) return null;

  const oversight = units.filter((u) => u.roles.some(isOversightRole));
  const candidates = oversight.length > 0 ? oversight : units;

  // `units` is already sorted highest-first, and filter preserves that order.
  return candidates[0].unitPrefix;
}

/**
 * Whether a scope value means "no filter". Two values do: null, when no unit
 * could be resolved, and ALL_UNITS, when the volunteer deliberately asked for
 * everything. Callers reasoning about the applied filter should use this rather
 * than a null check, which would miss the explicit choice.
 */
export function isUnfiltered(prefix: string | null): boolean {
  return !prefix || prefix === ALL_UNITS;
}

/**
 * Build the server-side filter for a scope, or null for "no filter".
 * Returns null for an unusable prefix rather than a filter that would silently
 * match everything.
 */
export function scopeQuery(prefix: string | null): string | null {
  if (!prefix || isUnfiltered(prefix)) return null;
  if (!isValidUnitPrefix(prefix)) {
    console.warn("[Scope] Refusing to filter on malformed unit prefix", prefix);
    return null;
  }
  return `unitPrefix LIKE '${prefix}%'`;
}

/** AND a scope filter together with a caller-supplied query. */
export function combineQueries(
  scope: string | null,
  existing: string | undefined,
): string {
  const other = (existing ?? "").trim();
  if (!scope) return other;
  if (!other) return scope;
  return `${scope} AND (${other})`;
}

/** The volunteer's explicit choice, or null if they have not made one. */
export function readStoredScope(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing and blocked site data both throw on access.
    return null;
  }
}

export function writeStoredScope(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Non-fatal: the scope still applies for this session.
  }
}
