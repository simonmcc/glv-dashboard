import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ALL_UNITS,
  buildScopeUnits,
  combineQueries,
  isOversightRole,
  isUnfiltered,
  isValidUnitPrefix,
  pickDefaultScopePrefix,
  readStoredScope,
  scopeQuery,
  writeStoredScope,
} from "./scope";

const GROUP = "S10000004>>S12272151>>000317172>>S10001979>>S10016945";
const SECTION = `${GROUP}>>S10051045`;
const DISTRICT = "S10000004>>S12272151>>000317172>>S10001979";

/** A row as the Data Explorer returns it — display names, one row per role. */
function row(
  unitPrefix: string,
  unitName: string,
  role: string,
  unitId = "id",
): Record<string, unknown> {
  return {
    "Unit prefix": unitPrefix,
    "Unit ID": unitId,
    "Unit name": unitName,
    Role: role,
  };
}

describe("buildScopeUnits", () => {
  it("collapses repeated rows into one unit per prefix", () => {
    const units = buildScopeUnits([
      row(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
      row(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
      row(GROUP, "1st Maghaberry Scout Group", "Trustee"),
      row(SECTION, "1st Maghaberry Scout Group - Scout 1", "Team Member"),
    ]);

    expect(units).toHaveLength(2);
    expect(units[0].unitName).toBe("1st Maghaberry Scout Group");
    expect(units[0].roles).toEqual(["Group Lead Volunteer", "Trustee"]);
    expect(units[1].roles).toEqual(["Team Member"]);
  });

  it("orders units highest in the hierarchy first", () => {
    const units = buildScopeUnits([
      row(SECTION, "Scout 1", "Team Member"),
      row(DISTRICT, "Lisburn District", "Team Member"),
      row(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    expect(units.map((u) => u.unitName)).toEqual([
      "Lisburn District",
      "1st Maghaberry Scout Group",
      "Scout 1",
    ]);
  });

  it("skips rows with no unit prefix", () => {
    expect(buildScopeUnits([row("", "Nowhere", "Team Member")])).toEqual([]);
  });
});

describe("pickDefaultScopePrefix", () => {
  it("prefers the unit where an oversight role is held over a higher unit", () => {
    // The shape that motivated this work: a GLV who also sits on a district team.
    const units = buildScopeUnits([
      row(DISTRICT, "Lisburn District", "Team Member"),
      row(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
      row(SECTION, "Scout 1", "Team Member"),
    ]);

    expect(pickDefaultScopePrefix(units)).toBe(GROUP);
  });

  it("falls back to the highest unit when no oversight role is held", () => {
    const units = buildScopeUnits([
      row(SECTION, "Scout 1", "Team Member"),
      row(GROUP, "1st Maghaberry Scout Group", "Trustee"),
    ]);

    expect(pickDefaultScopePrefix(units)).toBe(GROUP);
  });

  it("returns null when the volunteer holds no roles", () => {
    expect(pickDefaultScopePrefix([])).toBeNull();
  });
});

describe("isOversightRole", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(isOversightRole("  Group Lead Volunteer ")).toBe(true);
    expect(isOversightRole("GROUP LEAD VOLUNTEER")).toBe(true);
  });

  it("does not treat ordinary team membership as oversight", () => {
    expect(isOversightRole("Team Member")).toBe(false);
    expect(isOversightRole("Trustee")).toBe(false);
  });
});

describe("isValidUnitPrefix", () => {
  it("accepts real unit paths", () => {
    expect(isValidUnitPrefix(GROUP)).toBe(true);
    expect(isValidUnitPrefix("S10000004")).toBe(true);
  });

  it("rejects anything that could widen or break the LIKE pattern", () => {
    expect(isValidUnitPrefix("S1%")).toBe(false);
    expect(isValidUnitPrefix("S1_")).toBe(false);
    expect(isValidUnitPrefix("S1' OR '1'='1")).toBe(false);
    expect(isValidUnitPrefix("")).toBe(false);
  });
});

describe("isUnfiltered", () => {
  it("treats both no-scope and the explicit all-units choice as unfiltered", () => {
    expect(isUnfiltered(null)).toBe(true);
    expect(isUnfiltered(ALL_UNITS)).toBe(true);
  });

  it("treats a real unit prefix as filtered", () => {
    expect(isUnfiltered(GROUP)).toBe(false);
  });
});

describe("scopeQuery", () => {
  it("builds a subtree filter that covers the unit and everything below it", () => {
    expect(scopeQuery(GROUP)).toBe(`unitPrefix LIKE '${GROUP}%'`);
  });

  it("returns null for no scope and for the all-units sentinel", () => {
    expect(scopeQuery(null)).toBeNull();
    expect(scopeQuery(ALL_UNITS)).toBeNull();
  });

  it("refuses a malformed prefix rather than emitting a filter", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(scopeQuery("nope'--")).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("combineQueries", () => {
  it("returns the caller's query when there is no scope", () => {
    expect(combineQueries(null, "Status = 'Valid'")).toBe("Status = 'Valid'");
  });

  it("returns the scope alone when the caller has no query", () => {
    expect(combineQueries("unitPrefix LIKE 'X%'", "")).toBe(
      "unitPrefix LIKE 'X%'",
    );
    expect(combineQueries("unitPrefix LIKE 'X%'", undefined)).toBe(
      "unitPrefix LIKE 'X%'",
    );
  });

  it("parenthesises the caller's query when ANDing", () => {
    expect(combineQueries("unitPrefix LIKE 'X%'", "A = '1' OR B = '2'")).toBe(
      "unitPrefix LIKE 'X%' AND (A = '1' OR B = '2')",
    );
  });
});

describe("stored scope", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a choice", () => {
    writeStoredScope(GROUP);
    expect(readStoredScope()).toBe(GROUP);
  });

  it("clears on null", () => {
    writeStoredScope(GROUP);
    writeStoredScope(null);
    expect(readStoredScope()).toBeNull();
  });

  it("returns null when storage throws", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(readStoredScope()).toBeNull();
    spy.mockRestore();
  });

  it("does not throw when writing is blocked", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => writeStoredScope(GROUP)).not.toThrow();
    spy.mockRestore();
  });
});
