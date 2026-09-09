/**
 * ScopeSelector — chooses which unit the dashboard is scoped to.
 *
 * The default is picked automatically from the volunteer's oversight roles, but
 * anyone who is GLV for more than one group (or who wants a single section)
 * needs to be able to say so. Choosing "All my units" restores the unfiltered
 * behaviour, which for someone with a district-level role means the whole
 * district.
 */

import { ALL_UNITS, type ScopeUnit } from "../scope";

interface ScopeSelectorProps {
  units: ScopeUnit[];
  /** Currently applied prefix, ALL_UNITS, or null while still resolving. */
  value: string | null;
  onChange: (prefix: string) => void;
  disabled?: boolean;
}

export function ScopeSelector({
  units,
  value,
  onChange,
  disabled,
}: ScopeSelectorProps) {
  // Nothing useful to offer until the scope query has come back.
  if (units.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <label htmlFor="scope-select" className="shrink-0">
        Showing
      </label>
      <select
        id="scope-select"
        value={value ?? ALL_UNITS}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[18rem] truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:opacity-50"
      >
        {units.map((unit) => (
          <option key={unit.unitPrefix} value={unit.unitPrefix}>
            {unit.unitName}
            {unit.roles.length > 0 ? ` — ${unit.roles.join(", ")}` : ""}
          </option>
        ))}
        <option value={ALL_UNITS}>All my units</option>
      </select>
    </div>
  );
}
