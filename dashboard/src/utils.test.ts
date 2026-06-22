import { describe, it, expect } from "vitest";
import {
  parseExpiryDate,
  computeModuleStatus,
  transformLearningResults,
  isExpiringSoon,
  FIRST_RESPONSE_MODULE,
} from "./utils";
import type { MemberLearningResult } from "./types";

describe("parseExpiryDate", () => {
  it("should parse a valid date string", () => {
    const result = parseExpiryDate("04/25/2028 21:22:00");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2028);
    expect(result?.getMonth()).toBe(3); // April is month 3 (0-indexed)
    expect(result?.getDate()).toBe(25);
    expect(result?.getHours()).toBe(21);
    expect(result?.getMinutes()).toBe(22);
  });

  it("should return null for null input", () => {
    expect(parseExpiryDate(null)).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseExpiryDate("")).toBeNull();
  });

  it("should handle date without time part", () => {
    const result = parseExpiryDate("12/31/2025");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2025);
    expect(result?.getMonth()).toBe(11); // December
    expect(result?.getDate()).toBe(31);
  });
});

describe("computeModuleStatus", () => {
  const fixedNow = new Date("2025-01-15T12:00:00Z");

  it('should return "Valid" for achieved skill with no expiry', () => {
    expect(computeModuleStatus("Achieved skill", null, fixedNow)).toBe("Valid");
  });

  it('should return "Not Started" for non-achieved skill with no expiry', () => {
    expect(computeModuleStatus("Not started", null, fixedNow)).toBe(
      "Not Started",
    );
    expect(computeModuleStatus("", null, fixedNow)).toBe("Not Started");
  });

  it('should return "Expired" for past expiry date', () => {
    const expiredDate = new Date("2025-01-01T00:00:00Z");
    expect(computeModuleStatus("Achieved skill", expiredDate, fixedNow)).toBe(
      "Expired",
    );
  });

  it('should return "Expiring" for expiry within 30 days', () => {
    const expiringDate = new Date("2025-02-01T00:00:00Z"); // 17 days from fixedNow
    expect(computeModuleStatus("Achieved skill", expiringDate, fixedNow)).toBe(
      "Expiring",
    );
  });

  it('should return "Renewal Due" for expiry within 60 days but after 30 days', () => {
    const renewalDate = new Date("2025-02-28T00:00:00Z"); // 44 days from fixedNow
    expect(computeModuleStatus("Achieved skill", renewalDate, fixedNow)).toBe(
      "Renewal Due",
    );
  });

  it('should return "Expiring Soon" for expiry within 90 days but after 60 days', () => {
    const expiringSoonDate = new Date("2025-04-01T00:00:00Z"); // 75 days from fixedNow
    expect(
      computeModuleStatus("Achieved skill", expiringSoonDate, fixedNow),
    ).toBe("Expiring Soon");
  });

  it('should return "Valid" for expiry more than 90 days away', () => {
    const validDate = new Date("2025-06-01T00:00:00Z"); // 137 days from fixedNow
    expect(computeModuleStatus("Achieved skill", validDate, fixedNow)).toBe(
      "Valid",
    );
  });
});

describe("isExpiringSoon", () => {
  it("should return false for null/undefined", () => {
    expect(isExpiringSoon(null)).toBe(false);
    expect(isExpiringSoon(undefined)).toBe(false);
    expect(isExpiringSoon("")).toBe(false);
  });

  it("should return false for past dates", () => {
    expect(isExpiringSoon(new Date(Date.now() - 86400000).toISOString())).toBe(
      false,
    );
  });

  it("should return true for dates within 90 days", () => {
    const thirtyDays = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isExpiringSoon(thirtyDays)).toBe(true);
  });

  it("should return false for dates beyond 90 days", () => {
    const farFuture = new Date(
      Date.now() + 120 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isExpiringSoon(farFuture)).toBe(false);
  });

  it("should respect a custom threshold", () => {
    const fortyDays = new Date(
      Date.now() + 40 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isExpiringSoon(fortyDays, 30)).toBe(false);
    expect(isExpiringSoon(fortyDays, 60)).toBe(true);
  });
});

describe("transformLearningResults", () => {
  const fixedNow = new Date("2025-01-15T12:00:00Z");

  it("should transform member learning results into learning records", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "12345",
        contactId: "contact-123",
        firstName: "John",
        lastName: "Doe",
        modules: [
          {
            title: "Safety Training",
            currentLevel: "Achieved skill",
            expiryDate: "06/15/2025 00:00:00",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    // Safety Training (with expiry) + synthesised First Response
    // + synthesised Safety + Safeguarding + Who We Are + Creating Inclusion
    // + Data Protection in Scouts = 7 records
    expect(result).toHaveLength(7);
    const safetyRecord = result.find(
      (r) => r["Learning"] === "Safety Training",
    );
    expect(safetyRecord?.["First name"]).toBe("John");
    expect(safetyRecord?.["Last name"]).toBe("Doe");
    expect(safetyRecord?.["Membership number"]).toBe("12345");
    expect(safetyRecord?.["Status"]).toBe("Valid");
    expect(safetyRecord?.["Expiry date"]).toBeTruthy();
  });

  it("should filter out non-First-Response modules without expiry dates", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "12345",
        contactId: "contact-123",
        firstName: "John",
        lastName: "Doe",
        modules: [
          {
            title: "One-time Training",
            currentLevel: "Achieved skill",
            expiryDate: null,
          },
          {
            title: "Renewable Training",
            currentLevel: "Achieved skill",
            expiryDate: "06/15/2025 00:00:00",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    // 'One-time Training' is excluded (no expiry, not First Response or Growing Roots)
    // 'Renewable Training' is included (has expiry)
    // 'First Response' is synthesised; Growing Roots modules are NOT synthesised
    expect(
      result.find((r) => r["Learning"] === "Renewable Training"),
    ).toBeDefined();
    expect(
      result.find((r) => r["Learning"] === "First Response"),
    ).toBeDefined();
    expect(
      result.find((r) => r["Learning"] === "One-time Training"),
    ).toBeUndefined();
  });

  it("should handle multiple members with multiple modules", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "111",
        contactId: "contact-111",
        firstName: "Alice",
        lastName: "Smith",
        modules: [
          {
            title: "Module A",
            currentLevel: "Achieved skill",
            expiryDate: "06/15/2025 00:00:00",
          },
          {
            title: "Module B",
            currentLevel: "Achieved skill",
            expiryDate: "01/01/2025 00:00:00",
          }, // Expired
        ],
      },
      {
        membershipNumber: "222",
        contactId: "contact-222",
        firstName: "Bob",
        lastName: "Jones",
        modules: [
          {
            title: "Module C",
            currentLevel: "Not started",
            expiryDate: "02/01/2025 00:00:00",
          }, // Expiring
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    // Alice: Module A + Module B + synthesised (First Response + Safety + Safeguarding + Who We Are + Creating Inclusion + Data Protection in Scouts) = 8
    // Bob:   Module C + synthesised (same 6) = 7
    expect(result.filter((r) => r["First name"] === "Alice")).toHaveLength(8);
    expect(result.filter((r) => r["First name"] === "Bob")).toHaveLength(7);
    expect(result.find((r) => r["Learning"] === "Module B")?.Status).toBe(
      "Expired",
    );
    expect(result.find((r) => r["Learning"] === "Module C")?.Status).toBe(
      "Expiring",
    );
  });

  it("should return empty array for empty input", () => {
    expect(transformLearningResults([], fixedNow)).toEqual([]);
  });

  it("should exclude non-FR, non-Growing-Roots modules with no expiry date", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "12345",
        contactId: "contact-123",
        firstName: "John",
        lastName: "Doe",
        modules: [
          {
            title: "Module 1",
            currentLevel: "Achieved skill",
            expiryDate: null,
          },
          {
            title: "Module 2",
            currentLevel: "Achieved skill",
            expiryDate: null,
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);
    // Non-GR modules without expiry are excluded; FR is synthesised
    expect(result.find((r) => r["Learning"] === "Module 1")).toBeUndefined();
    expect(result.find((r) => r["Learning"] === "Module 2")).toBeUndefined();
    expect(
      result.find((r) => r["Learning"] === "First Response"),
    ).toBeDefined();
  });
});

describe("transformLearningResults – First Response", () => {
  const fixedNow = new Date("2025-01-15T12:00:00Z");

  it("should include a First Response module even without an expiry date (achieved)", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "111",
        contactId: "c1",
        firstName: "Alice",
        lastName: "Smith",
        modules: [
          {
            title: FIRST_RESPONSE_MODULE,
            expiryDate: null,
            currentLevel: "Achieved skill",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    const fr = result.find((r) => r["Learning"] === FIRST_RESPONSE_MODULE);
    expect(fr).toBeDefined();
    expect(fr!["Status"]).toBe("Valid");
    expect(fr!["Expiry date"]).toBeNull();
  });

  it("should include a First Response module without expiry date when not started", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "222",
        contactId: "c2",
        firstName: "Bob",
        lastName: "Jones",
        modules: [
          {
            title: FIRST_RESPONSE_MODULE,
            expiryDate: null,
            currentLevel: "Not started",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    const fr = result.find((r) => r["Learning"] === FIRST_RESPONSE_MODULE);
    expect(fr).toBeDefined();
    expect(fr!["Status"]).toBe("Not Started");
  });

  it("should synthesise a Not Started First Response record for members missing it", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "333",
        contactId: "c3",
        firstName: "Carol",
        lastName: "Davis",
        modules: [
          {
            title: "Safety",
            expiryDate: "06/15/2025 00:00:00",
            currentLevel: "Achieved skill",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    const firstResponse = result.find(
      (r) => r["Learning"] === FIRST_RESPONSE_MODULE,
    );
    expect(firstResponse).toBeDefined();
    expect(firstResponse!["Status"]).toBe("Not Started");
    expect(firstResponse!["Expiry date"]).toBeNull();
  });

  it("should attach start date from memberStartDates to synthesised First Response record", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "444",
        contactId: "c4",
        firstName: "Dave",
        lastName: "Lee",
        modules: [],
      },
    ];
    const startDates = new Map([["444", "2024-06-01"]]);

    const result = transformLearningResults(members, fixedNow, startDates);

    const fr = result.find((r) => r["Learning"] === FIRST_RESPONSE_MODULE);
    expect(fr).toBeDefined();
    expect(fr!["Start date"]).toBe("2024-06-01");
  });

  it("should attach start date from memberStartDates to existing First Response module", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "555",
        contactId: "c5",
        firstName: "Eve",
        lastName: "Brown",
        modules: [
          {
            title: FIRST_RESPONSE_MODULE,
            expiryDate: null,
            currentLevel: "Not started",
          },
        ],
      },
    ];
    const startDates = new Map([["555", "2024-09-01"]]);

    const result = transformLearningResults(members, fixedNow, startDates);

    const fr = result.find((r) => r["Learning"] === FIRST_RESPONSE_MODULE);
    expect(fr!["Start date"]).toBe("2024-09-01");
  });

  it("should synthesise Safety and Safeguarding when GetLmsDetailsAsync returns no modules", () => {
    // Regression: members the Scouts portal flags as Safety/Safeguarding non-compliant can have
    // GetLmsDetailsAsync return an empty module array, making them invisible in compliance tiles.
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "2000069651",
        contactId: "some-contact-id",
        firstName: "Callum",
        lastName: "McConville",
        modules: [],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result.find((r) => r["Learning"] === "Safeguarding")).toMatchObject({
      "Membership number": "2000069651",
      Status: "Not Started",
    });
    expect(result.find((r) => r["Learning"] === "Safety")).toMatchObject({
      "Membership number": "2000069651",
      Status: "Not Started",
    });
    expect(
      result.find((r) => r["Learning"] === FIRST_RESPONSE_MODULE),
    ).toMatchObject({
      "Membership number": "2000069651",
      Status: "Not Started",
    });
  });

  it("should not synthesise a duplicate First Response when one already exists", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "666",
        contactId: "c6",
        firstName: "Frank",
        lastName: "Mills",
        modules: [
          {
            title: FIRST_RESPONSE_MODULE,
            expiryDate: "06/15/2026 00:00:00",
            currentLevel: "Achieved skill",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    const frRecords = result.filter(
      (r) => r["Learning"] === FIRST_RESPONSE_MODULE,
    );
    expect(frRecords).toHaveLength(1);
  });

  it("should not synthesise Safety or Safeguarding when the LMS returns them", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "888",
        contactId: "c8",
        firstName: "Helen",
        lastName: "Grant",
        modules: [
          {
            title: "Safeguarding",
            expiryDate: "06/15/2027 00:00:00",
            currentLevel: "Achieved skill",
          },
          {
            title: "Safety",
            expiryDate: "06/15/2027 00:00:00",
            currentLevel: "Achieved skill",
          },
          {
            title: FIRST_RESPONSE_MODULE,
            expiryDate: "06/15/2026 00:00:00",
            currentLevel: "Achieved skill",
          },
        ],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    expect(result.filter((r) => r["Learning"] === "Safeguarding")).toHaveLength(
      1,
    );
    expect(result.filter((r) => r["Learning"] === "Safety")).toHaveLength(1);
    expect(result.find((r) => r["Learning"] === "Safeguarding")?.Status).toBe(
      "Valid",
    );
    expect(result.find((r) => r["Learning"] === "Safety")?.Status).toBe(
      "Valid",
    );
  });

  it("should synthesise all mandatory modules as Not Started when modules is empty", () => {
    const members: MemberLearningResult[] = [
      {
        membershipNumber: "777",
        contactId: "c7",
        firstName: "Grace",
        lastName: "Hill",
        modules: [],
      },
    ];

    const result = transformLearningResults(members, fixedNow);

    // First Response + Safeguarding + Safety + Who We Are + Creating Inclusion
    // + Data Protection in Scouts = 6 synthesised records
    // (Leading Scout Volunteers, Being a Trustee, Delivering a Great Programme are role-specific — not synthesised)
    expect(result).toHaveLength(6);

    for (const learning of [
      FIRST_RESPONSE_MODULE,
      "Safeguarding",
      "Safety",
      "Who We Are and What We Do",
      "Creating Inclusion",
      "Data Protection in Scouts",
    ]) {
      const record = result.find((r) => r["Learning"] === learning);
      expect(record, `expected ${learning} to be synthesised`).toBeDefined();
      expect(record!["Status"]).toBe("Not Started");
      expect(record!["Expiry date"]).toBeNull();
    }

    expect(
      result.find((r) => r["Learning"] === "Leading Scout Volunteers"),
    ).toBeUndefined();
    expect(
      result.find((r) => r["Learning"] === "Being a Trustee"),
    ).toBeUndefined();
    expect(
      result.find((r) => r["Learning"] === "Delivering a Great Programme"),
    ).toBeUndefined();
  });
});
