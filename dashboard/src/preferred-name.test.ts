import { describe, expect, it } from "vitest";
import {
  buildPreferredNameMap,
  firstNameMatches,
  withPreferredName,
} from "./preferred-name";
import type { LearningRecord } from "./types";

type Named = Pick<
  LearningRecord,
  "First name" | "Membership number" | "Legal first name"
>;

describe("buildPreferredNameMap", () => {
  it("maps membership numbers to trimmed preferred names, skipping blanks", () => {
    const map = buildPreferredNameMap([
      { "Membership number": "1", "Preferred name": " Chris " },
      { "Membership number": "2", "Preferred name": "   " },
      { "Membership number": "", "Preferred name": "Nobody" },
    ]);

    expect([...map]).toEqual([["1", "Chris"]]);
  });
});

describe("withPreferredName", () => {
  const names = new Map([["1", "Chris"]]);

  it("swaps in the preferred name and keeps the legal one", () => {
    const record = withPreferredName<Named>(
      { "First name": "Brian", "Membership number": "1" },
      names,
    );
    expect(record["First name"]).toBe("Chris");
    expect(record["Legal first name"]).toBe("Brian");
  });

  it("only trims when there is no different preferred name", () => {
    const record = withPreferredName(
      { "First name": "Emma ", "Membership number": "2" },
      names,
    );
    expect(record).toEqual({ "First name": "Emma", "Membership number": "2" });
  });

  it("is a no-op on a view that already returns the preferred name", () => {
    const record = withPreferredName<Named>(
      { "First name": "Chris", "Membership number": "1" },
      names,
    );
    expect(record["Legal first name"]).toBeUndefined();
  });
});

describe("firstNameMatches", () => {
  it("matches either the preferred or the legal first name", () => {
    const record = {
      "First name": "Chris",
      "Legal first name": "Brian",
      "Membership number": "1",
    };
    expect(firstNameMatches(record, "chr")).toBe(true);
    expect(firstNameMatches(record, "bri")).toBe(true);
    expect(firstNameMatches(record, "steph")).toBe(false);
  });
});
