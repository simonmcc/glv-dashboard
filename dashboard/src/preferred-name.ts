/**
 * Preferred names.
 *
 * Volunteers can record a "Preferred name" (e.g. Brian → Chris) on the Scouts
 * portal. The Data Explorer views disagree about which name they put in
 * "First name": Joining Journey, Team Reviews, Permits and Awards already use
 * the preferred name, while Learning Compliance (and, as far as we can tell,
 * Disclosure and Suspension) use the legal first name and have no
 * PreferredName column. AppointmentsDashboardView is the one view that returns
 * both, so it is used as the lookup for the others.
 */

/** Map of membership number → trimmed preferred name, from Appointments rows. */
export function buildPreferredNameMap(
  rows: Record<string, unknown>[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const membershipNumber = String(row["Membership number"] ?? "").trim();
    const preferred = String(row["Preferred name"] ?? "").trim();
    if (membershipNumber && preferred) map.set(membershipNumber, preferred);
  }
  return map;
}

interface NamedRecord {
  "First name"?: string;
  "Membership number": string;
  "Legal first name"?: string;
}

/**
 * Show the member's preferred name as "First name". When that differs from
 * the name the view returned, the original is kept as "Legal first name" so
 * searching for it still finds the member.
 */
export function withPreferredName<T extends NamedRecord>(
  record: T,
  preferredNames: Map<string, string>,
): T {
  const firstName = (record["First name"] ?? "").trim();
  const preferred = preferredNames.get(record["Membership number"]);
  if (!preferred || preferred === firstName) {
    return { ...record, "First name": firstName };
  }
  if (!firstName) return { ...record, "First name": preferred };
  return { ...record, "First name": preferred, "Legal first name": firstName };
}

/** Whether a record's first name — preferred or legal — contains the term. */
export function firstNameMatches(record: NamedRecord, term: string): boolean {
  return [record["First name"], record["Legal first name"]].some((name) =>
    (name ?? "").toLowerCase().includes(term),
  );
}
