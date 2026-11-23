/**
 * Mobile Sort Control
 *
 * Table headers (and their click-to-sort) are hidden on phones by the
 * `.stack-table` card layout, so this select + direction toggle stands in
 * for them below the `sm` breakpoint.
 */

import { useId } from "react";

type SortOrder = "asc" | "desc";

interface MobileSortProps<F extends string> {
  options: { field: F; label: string }[];
  field: F;
  order: SortOrder;
  onChange: (field: F, order: SortOrder) => void;
}

export function MobileSort<F extends string>({
  options,
  field,
  order,
  onChange,
}: MobileSortProps<F>) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 sm:hidden">
      <label className="text-sm text-gray-500" htmlFor={id}>
        Sort by
      </label>
      <select
        id={id}
        value={field}
        onChange={(e) => onChange(e.target.value as F, order)}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500"
      >
        {options.map((o) => (
          <option key={o.field} value={o.field}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(field, order === "asc" ? "desc" : "asc")}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        aria-label={order === "asc" ? "Sort descending" : "Sort ascending"}
      >
        {order === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}

export default MobileSort;
