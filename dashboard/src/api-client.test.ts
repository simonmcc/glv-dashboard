import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScoutsApiClient } from "./api-client";
import type { LearningRecord, DisclosureRecord } from "./types";

// Test the pure functions on ScoutsApiClient
// Note: We can't easily test the API methods without mocking fetch,
// but we can test the data transformation methods

describe("ScoutsApiClient", () => {
  describe("computeComplianceSummary", () => {
    it("should compute summary for empty records", () => {
      const client = new ScoutsApiClient("test-token");
      const summary = client.computeComplianceSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.byLearningType).toEqual({});
      expect(summary.byStatus).toEqual({});
      expect(summary.expiringSoon).toBe(0);
    });

    it("should compute summary by learning type and status", () => {
      const client = new ScoutsApiClient("test-token");
      const records: LearningRecord[] = [
        {
          "First name": "John",
          "Last name": "Doe",
          "Membership number": "111",
          Learning: "Safety Training",
          Status: "Valid",
          "Expiry date": "2025-06-15",
        },
        {
          "First name": "Jane",
          "Last name": "Smith",
          "Membership number": "222",
          Learning: "Safety Training",
          Status: "Expired",
          "Expiry date": "2024-01-15",
        },
        {
          "First name": "Bob",
          "Last name": "Jones",
          "Membership number": "333",
          Learning: "First Aid",
          Status: "Expiring",
          "Expiry date": "2025-02-01",
        },
      ];

      const summary = client.computeComplianceSummary(records);

      expect(summary.total).toBe(3);
      expect(summary.byLearningType["Safety Training"].total).toBe(2);
      expect(summary.byLearningType["Safety Training"].compliant).toBe(1);
      expect(summary.byLearningType["Safety Training"].expired).toBe(1);
      expect(summary.byLearningType["First Aid"].total).toBe(1);
      expect(summary.byLearningType["First Aid"].expiring).toBe(1);
      expect(summary.byStatus["Valid"]).toBe(1);
      expect(summary.byStatus["Expired"]).toBe(1);
      expect(summary.byStatus["Expiring"]).toBe(1);
    });

    it("should categorize In-Progress as compliant", () => {
      const client = new ScoutsApiClient("test-token");
      const records: LearningRecord[] = [
        {
          "First name": "John",
          "Last name": "Doe",
          "Membership number": "111",
          Learning: "Training",
          Status: "In-Progress",
          "Expiry date": null,
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType["Training"].compliant).toBe(1);
    });

    it("should categorize Renewal Due as expiring", () => {
      const client = new ScoutsApiClient("test-token");
      const records: LearningRecord[] = [
        {
          "First name": "John",
          "Last name": "Doe",
          "Membership number": "111",
          Learning: "Training",
          Status: "Renewal Due",
          "Expiry date": "2025-03-01",
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType["Training"].expiring).toBe(1);
    });

    it("should categorize Not Started as expired", () => {
      const client = new ScoutsApiClient("test-token");
      const records: LearningRecord[] = [
        {
          "First name": "John",
          "Last name": "Doe",
          "Membership number": "111",
          Learning: "Training",
          Status: "Not Started",
          "Expiry date": null,
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType["Training"].expired).toBe(1);
    });

    it("should categorize Expiring Soon as expiring", () => {
      const client = new ScoutsApiClient("test-token");
      const records: LearningRecord[] = [
        {
          "First name": "John",
          "Last name": "Doe",
          "Membership number": "111",
          Learning: "Training",
          Status: "Expiring Soon",
          "Expiry date": "2025-06-01",
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.byLearningType["Training"].expiring).toBe(1);
    });

    it("should count expiringSoon as sum of Expiring, Renewal Due, and Expiring Soon", () => {
      const client = new ScoutsApiClient("test-token");
      const records: LearningRecord[] = [
        {
          "First name": "A",
          "Last name": "B",
          "Membership number": "1",
          Learning: "T",
          Status: "Expiring",
          "Expiry date": "2025-02-01",
        },
        {
          "First name": "C",
          "Last name": "D",
          "Membership number": "2",
          Learning: "T",
          Status: "Renewal Due",
          "Expiry date": "2025-03-01",
        },
        {
          "First name": "E",
          "Last name": "F",
          "Membership number": "3",
          Learning: "T",
          Status: "Expiring Soon",
          "Expiry date": "2025-04-01",
        },
        {
          "First name": "G",
          "Last name": "H",
          "Membership number": "4",
          Learning: "T",
          Status: "Valid",
          "Expiry date": "2026-01-01",
        },
      ];

      const summary = client.computeComplianceSummary(records);
      expect(summary.expiringSoon).toBe(3);
    });
  });

  describe("deduplicateRecords", () => {
    const client = new ScoutsApiClient("test-token");
    // Access private method for testing
    const dedup = (records: LearningRecord[]) =>
      (
        client as unknown as {
          deduplicateRecords: (r: LearningRecord[]) => LearningRecord[];
        }
      ).deduplicateRecords(records);

    const base = (overrides: Partial<LearningRecord>): LearningRecord => ({
      "First name": "Alice",
      "Last name": "Smith",
      "Membership number": "111",
      Learning: "Safeguarding",
      Status: "Valid",
      "Expiry date": "2027-01-01",
      "Start date": null,
      ...overrides,
    });

    it("passes a single record through unchanged", () => {
      const record = base({ Status: "Not Started", "Expiry date": null });
      expect(dedup([record])).toEqual([record]);
    });

    it('keeps "Not Started" over "Valid" for the same member+learning', () => {
      const valid = base({ Status: "Valid", "Start date": "2023-01-01" });
      const notStarted = base({
        Status: "Not Started",
        "Expiry date": null,
        "Start date": null,
      });
      const result = dedup([valid, notStarted]);
      expect(result).toHaveLength(1);
      expect(result[0].Status).toBe("Not Started");
    });

    it('keeps "Not Started" regardless of insertion order', () => {
      const notStarted = base({
        Status: "Not Started",
        "Expiry date": null,
        "Start date": null,
      });
      const valid = base({ Status: "Valid", "Start date": "2023-01-01" });
      const result = dedup([notStarted, valid]);
      expect(result).toHaveLength(1);
      expect(result[0].Status).toBe("Not Started");
    });

    it("preserves the earliest start date when taking a worse status record", () => {
      // Valid record has an earlier start date; Not Started has a later one.
      // The result should be "Not Started" status with the earlier start date.
      const valid = base({ Status: "Valid", "Start date": "2022-06-01" });
      const notStarted = base({
        Status: "Not Started",
        "Expiry date": null,
        "Start date": "2023-01-01",
      });
      const result = dedup([valid, notStarted]);
      expect(result).toHaveLength(1);
      expect(result[0].Status).toBe("Not Started");
      expect(result[0]["Start date"]).toBe(
        new Date("2022-06-01").toISOString(),
      );
    });

    it('keeps "Expired" over "Valid"', () => {
      const valid = base({ Status: "Valid" });
      const expired = base({ Status: "Expired", "Expiry date": "2020-01-01" });
      const result = dedup([valid, expired]);
      expect(result[0].Status).toBe("Expired");
    });

    it("keeps distinct records for different members", () => {
      const alice = base({ "Membership number": "111", Status: "Valid" });
      const bob = base({
        "Membership number": "222",
        Status: "Not Started",
        "Expiry date": null,
      });
      expect(dedup([alice, bob])).toHaveLength(2);
    });

    it("keeps distinct records for different learning modules", () => {
      const safety = base({ Learning: "Safety", Status: "Valid" });
      const gdpr = base({
        Learning: "GDPR",
        Status: "Not Started",
        "Expiry date": null,
      });
      expect(dedup([safety, gdpr])).toHaveLength(2);
    });

    it("uses earliest start date as tiebreaker when status is equal", () => {
      const older = base({ Status: "Expired", "Start date": "2021-01-01" });
      const newer = base({ Status: "Expired", "Start date": "2023-06-01" });
      const result = dedup([newer, older]);
      expect(result[0]["Start date"]).toBe("2021-01-01");
    });
  });

  describe("computeDisclosureSummary", () => {
    it("should compute summary for empty records", () => {
      const client = new ScoutsApiClient("test-token");
      const summary = client.computeDisclosureSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.byStatus).toEqual({});
      expect(summary.expired).toBe(0);
      expect(summary.expiringSoon).toBe(0);
      expect(summary.valid).toBe(0);
    });

    it("should count expired disclosures by status", () => {
      const client = new ScoutsApiClient("test-token");
      const records: DisclosureRecord[] = [
        {
          "First name": "John",
          "Last name": "Doe",
          "Membership number": "111",
          "Disclosure authority": "DBS",
          "Disclosure status": "Expired",
          "Disclosure issue date": "2020-01-01",
          "Disclosure expiry date": "2023-01-01",
          "Days since expiry": 365,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.total).toBe(1);
      expect(summary.byStatus["Expired"]).toBe(1);
      expect(summary.expired).toBe(1);
    });

    it("should count expiring soon disclosures (within 90 days)", () => {
      const client = new ScoutsApiClient("test-token");
      // Create a date 30 days from now (well within 90d threshold)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const records: DisclosureRecord[] = [
        {
          "First name": "Jane",
          "Last name": "Smith",
          "Membership number": "222",
          "Disclosure authority": "AccessNI",
          "Disclosure status": "Valid",
          "Disclosure issue date": "2022-01-01",
          "Disclosure expiry date": thirtyDaysFromNow.toISOString(),
          "Days since expiry": null,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.total).toBe(1);
      expect(summary.expiringSoon).toBe(1);
      expect(summary.valid).toBe(0);
    });

    it("should count valid disclosures (more than 90 days)", () => {
      const client = new ScoutsApiClient("test-token");
      // Create a date 120 days from now (beyond 90d threshold)
      const oneHundredTwentyDaysFromNow = new Date();
      oneHundredTwentyDaysFromNow.setDate(
        oneHundredTwentyDaysFromNow.getDate() + 120,
      );

      const records: DisclosureRecord[] = [
        {
          "First name": "Bob",
          "Last name": "Jones",
          "Membership number": "333",
          "Disclosure authority": "DBS",
          "Disclosure status": "Clear",
          "Disclosure issue date": "2024-01-01",
          "Disclosure expiry date": oneHundredTwentyDaysFromNow.toISOString(),
          "Days since expiry": null,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.total).toBe(1);
      expect(summary.valid).toBe(1);
      expect(summary.expired).toBe(0);
      expect(summary.expiringSoon).toBe(0);
    });

    it("should count records without expiry date as valid", () => {
      const client = new ScoutsApiClient("test-token");
      const records: DisclosureRecord[] = [
        {
          "First name": "Test",
          "Last name": "User",
          "Membership number": "444",
          "Disclosure authority": "DBS",
          "Disclosure status": "Clear",
          "Disclosure issue date": "2024-01-01",
          "Disclosure expiry date": null,
          "Days since expiry": null,
        },
      ];

      const summary = client.computeDisclosureSummary(records);

      expect(summary.valid).toBe(1);
    });
  });
});

describe("GLV scope filtering", () => {
  const GROUP = "S10000004>>S12272151>>000317172>>S10001979>>S10016945";
  const DISTRICT = "S10000004>>S12272151>>000317172>>S10001979";

  /**
   * Stub the backend proxy. Returns the parsed body of every Data Explorer
   * call so tests can assert on the `query` that was actually sent.
   */
  function mockBackend(
    scopeRows: Record<string, unknown>[],
    contact: Record<string, unknown> = {
      id: "contact-1",
      membershipno: "0012162494",
    },
  ) {
    const queries: { table: string; query: string }[] = [];
    const endpoints: string[] = [];

    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const outer = JSON.parse(String(init.body));
      endpoints.push(outer.endpoint);
      if (outer.endpoint === "/GetContactDetailAsync") {
        return new Response(JSON.stringify(contact), { status: 200 });
      }
      queries.push({ table: outer.body.table, query: outer.body.query });
      // First Data Explorer call is the scope lookup; serve it the roles.
      const isScopeLookup = String(outer.body.query).startsWith(
        "MembershipNumber",
      );
      return new Response(
        JSON.stringify({
          data: isScopeLookup ? scopeRows : [],
          nextPage: null,
          count: 0,
          error: null,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    return { queries, endpoints };
  }

  /**
   * The Learning Compliance data query. It runs alongside the preferred name
   * lookup, so it is not necessarily the last query sent; the scope lookup
   * reads the same view first.
   */
  function learningQuery(queries: { table: string; query: string }[]) {
    return queries
      .filter((q) => q.table === "LearningComplianceDashboardView")
      .at(-1)!;
  }

  function roleRow(unitPrefix: string, unitName: string, role: string) {
    return {
      "Unit prefix": unitPrefix,
      "Unit ID": "u",
      "Unit name": unitName,
      Role: role,
    };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scopes queries to the group where the volunteer is GLV, not the district", async () => {
    const { queries } = mockBackend([
      roleRow(DISTRICT, "Lisburn District", "Team Member"),
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await client.getAllLearningCompliance();

    expect(learningQuery(queries).query).toBe(`unitPrefix LIKE '${GROUP}%'`);
  });

  it("resolves the scope only once across many calls", async () => {
    const { queries } = mockBackend([
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await Promise.all([
      client.getAllLearningCompliance(),
      client.getSuspensions(),
      client.getPermits(),
    ]);

    const scopeLookups = queries.filter((q) =>
      q.query.startsWith("MembershipNumber"),
    );
    expect(scopeLookups).toHaveLength(1);
  });

  it("applies the same filter to every view", async () => {
    const { queries } = mockBackend([
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await client.getDisclosureCompliance();
    await client.getSuspensions();
    await client.getTeamReviews();
    await client.getAppointments();
    await client.getPermits();
    await client.getAwards();

    const dataQueries = queries.filter(
      (q) => !q.query.startsWith("MembershipNumber"),
    );
    // Six views, plus the preferred name lookup the first one triggers
    expect(dataQueries).toHaveLength(7);
    for (const q of dataQueries) {
      expect(q.query).toBe(`unitPrefix LIKE '${GROUP}%'`);
    }
  });

  it("honours an explicit choice stored from a previous session", async () => {
    const SECTION = `${GROUP}>>S10051045`;
    localStorage.setItem("glv.scope.unitPrefix", SECTION);

    const { queries } = mockBackend([
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
      roleRow(SECTION, "Scout 1", "Team Member"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await client.getAllLearningCompliance();

    expect(learningQuery(queries).query).toBe(`unitPrefix LIKE '${SECTION}%'`);
  });

  it("discards a stored choice for a unit the volunteer no longer holds", async () => {
    localStorage.setItem("glv.scope.unitPrefix", "S9999999>>S8888888");

    const { queries } = mockBackend([
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await client.getAllLearningCompliance();

    expect(learningQuery(queries).query).toBe(`unitPrefix LIKE '${GROUP}%'`);
    expect(localStorage.getItem("glv.scope.unitPrefix")).toBeNull();
  });

  it("queries unfiltered when the volunteer chooses all units", async () => {
    localStorage.setItem("glv.scope.unitPrefix", "__all__");

    const { queries } = mockBackend([
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await client.getAllLearningCompliance();

    expect(learningQuery(queries).query).toBe("");
  });

  it("falls back to an unfiltered query when the contact has no membership number", async () => {
    const { queries } = mockBackend([], { id: "contact-1" });

    const client = new ScoutsApiClient("test-token");
    await client.getAllLearningCompliance();

    expect(queries.every((q) => q.query === "")).toBe(true);
  });

  it("stays usable when scope resolution fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const outer = JSON.parse(String(init.body));
        if (outer.endpoint === "/GetContactDetailAsync") {
          throw new Error("network down");
        }
        return new Response(
          JSON.stringify({ data: [], nextPage: null, count: 0, error: null }),
          { status: 200 },
        );
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAllLearningCompliance();

    expect(result.error).toBeNull();
    warn.mockRestore();
  });

  it("fetches the contact record once when initialize() also runs", async () => {
    const { endpoints } = mockBackend([
      roleRow(GROUP, "1st Maghaberry Scout Group", "Group Lead Volunteer"),
    ]);

    const client = new ScoutsApiClient("test-token");
    await client.initialize();
    await client.getAllLearningCompliance();

    const contactCalls = endpoints.filter(
      (e) => e === "/GetContactDetailAsync",
    );
    expect(contactCalls).toHaveLength(1);
  });
});

describe("getAppointments", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Serves fixed appointment rows to whichever query isn't the scope lookup. */
  function mockAppointmentsBackend(rows: Record<string, unknown>[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const outer = JSON.parse(String(init.body));
        if (outer.endpoint === "/GetContactDetailAsync") {
          return new Response(
            JSON.stringify({ id: "contact-1", membershipno: "1" }),
            { status: 200 },
          );
        }
        const isScopeLookup = String(outer.body.query).startsWith(
          "MembershipNumber",
        );
        return new Response(
          JSON.stringify({
            data: isScopeLookup ? [] : rows,
            nextPage: null,
            count: 0,
            error: null,
          }),
          { status: 200 },
        );
      }),
    );
  }

  function appointment(overrides: Record<string, unknown>) {
    return {
      "First name": "Brian",
      "Last name": "Hawthorn",
      "Membership number": "1",
      Role: "Team Member",
      Team: "Leadership Team",
      "Unit name": "1st Demo Group",
      "Start date": "2025-01-01",
      "End date": null,
      ...overrides,
    };
  }

  it("drops appointments that have ended", async () => {
    mockAppointmentsBackend([
      appointment({ "Start date": "2024-01-01", "End date": "2024-12-31" }),
      appointment({ "Start date": "2025-01-01", "End date": null }),
    ]);

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAppointments();

    expect(result.data).toHaveLength(1);
    expect(result.data![0]["Start date"]).toBe("2025-01-01");
  });

  it("dedupes multiple active rows for the same Team/Role, keeping the latest Start date", async () => {
    mockAppointmentsBackend([
      appointment({ "Start date": "2025-11-10", "End date": null }),
      appointment({ "Start date": "2026-01-09", "End date": null }),
    ]);

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAppointments();

    expect(result.data).toHaveLength(1);
    expect(result.data![0]["Start date"]).toBe("2026-01-09");
  });

  it("keeps distinct rows for the same person in different Teams or Roles", async () => {
    mockAppointmentsBackend([
      appointment({ Team: "Leadership Team", Role: "Team Member" }),
      appointment({ Team: "Trustee Board", Role: "Trustee" }),
    ]);

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAppointments();

    expect(result.data).toHaveLength(2);
  });
});

describe("preferred names", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Serve rows per view. A view mapped to a string returns that error, so a
   * failing preferred name lookup can be simulated.
   */
  function mockViews(
    views: Record<string, Record<string, unknown>[] | string>,
  ) {
    const tables: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const outer = JSON.parse(String(init.body));
        if (outer.endpoint === "/GetContactDetailAsync") {
          return new Response(JSON.stringify({ id: "contact-1" }), {
            status: 200,
          });
        }
        tables.push(outer.body.table);
        const view = views[outer.body.table] ?? [];
        const body =
          typeof view === "string"
            ? { data: null, nextPage: null, count: 0, error: view }
            : { data: view, nextPage: null, count: view.length, error: null };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    return { tables };
  }

  const PREFERRED_NAMES = [
    { "Membership number": "2000037793", "Preferred name": "Chris" },
    { "Membership number": "2000037794", "Preferred name": "Steph" },
  ];

  function learningRow(membershipNumber: string, firstName: string) {
    return {
      "First name": firstName,
      "Last name": "Hawthorn",
      "Membership number": membershipNumber,
      Learning: "Safeguarding",
      Status: "In-Date",
      "Expiry date": "2027-01-01",
    };
  }

  it("shows the preferred name on learning records and keeps the legal one", async () => {
    mockViews({
      LearningComplianceDashboardView: [learningRow("2000037793", "Brian")],
      AppointmentsDashboardView: PREFERRED_NAMES,
    });

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAllLearningCompliance();

    expect(result.data![0]["First name"]).toBe("Chris");
    expect(result.data![0]["Legal first name"]).toBe("Brian");
  });

  it("trims names and leaves members without a different preferred name alone", async () => {
    mockViews({
      LearningComplianceDashboardView: [
        learningRow("0012310332", "Emma "),
        learningRow("0000000001", "Nobody"),
      ],
      AppointmentsDashboardView: [
        { "Membership number": "0012310332", "Preferred name": "Emma" },
      ],
    });

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAllLearningCompliance();

    const byNumber = new Map(
      result.data!.map((r) => [r["Membership number"], r]),
    );
    expect(byNumber.get("0012310332")!["First name"]).toBe("Emma");
    expect(byNumber.get("0012310332")!["Legal first name"]).toBeUndefined();
    expect(byNumber.get("0000000001")!["First name"]).toBe("Nobody");
  });

  it("falls back to legal names when the lookup fails", async () => {
    mockViews({
      LearningComplianceDashboardView: [learningRow("2000037793", "Brian")],
      AppointmentsDashboardView: "error_GetResultsAsync",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAllLearningCompliance();

    expect(result.error).toBeNull();
    expect(result.data![0]["First name"]).toBe("Brian");
    warn.mockRestore();
  });

  it("looks preferred names up once across views", async () => {
    const { tables } = mockViews({
      LearningComplianceDashboardView: [learningRow("2000037793", "Brian")],
      DisclosureComplianceDashboardView: [
        { "First name": "Brian", "Membership number": "2000037793" },
      ],
      SuspensionDashboardView: [
        { "First name": "Stephanie", "Membership number": "2000037794" },
      ],
      AppointmentsDashboardView: PREFERRED_NAMES,
    });

    const client = new ScoutsApiClient("test-token");
    const [, disclosures, suspensions] = await Promise.all([
      client.getAllLearningCompliance(),
      client.getDisclosureCompliance(),
      client.getSuspensions(),
    ]);

    expect(disclosures.data![0]["First name"]).toBe("Chris");
    expect(suspensions.data![0]["First name"]).toBe("Steph");
    expect(
      tables.filter((t) => t === "AppointmentsDashboardView"),
    ).toHaveLength(1);
  });

  it("keeps a failed lookup for the load, and retries after a refresh", async () => {
    const views: Record<string, Record<string, unknown>[] | string> = {
      LearningComplianceDashboardView: [learningRow("2000037793", "Brian")],
      DisclosureComplianceDashboardView: [
        { "First name": "Brian", "Membership number": "2000037793" },
      ],
      AppointmentsDashboardView: "error_GetResultsAsync",
    };
    const { tables } = mockViews(views);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lookups = () =>
      tables.filter((t) => t === "AppointmentsDashboardView").length;

    const client = new ScoutsApiClient("test-token");
    await client.getAllLearningCompliance();
    const disclosures = await client.getDisclosureCompliance();

    // Both views agree on the legal name; the failure is not retried mid-load
    expect(disclosures.data![0]["First name"]).toBe("Brian");
    expect(lookups()).toBe(1);

    views.AppointmentsDashboardView = PREFERRED_NAMES;
    client.refreshPreferredNames();
    const learning = await client.getAllLearningCompliance();

    expect(learning.data![0]["First name"]).toBe("Chris");
    expect(lookups()).toBe(2);
    warn.mockRestore();
  });

  it("uses the appointments view's own Preferred name column", async () => {
    mockViews({
      AppointmentsDashboardView: [
        {
          "First name": "Brian",
          "Preferred name": "Chris",
          "Last name": "Hawthorn",
          "Membership number": "2000037793",
          Role: "Section Team Member",
          Team: "Beaver Scout 1",
          "Unit name": "1st Maghaberry Scout Group - Beaver Scout 1",
          "Start date": "2025-01-01",
          "End date": null,
        },
      ],
    });

    const client = new ScoutsApiClient("test-token");
    const result = await client.getAppointments();

    expect(result.data![0]["First name"]).toBe("Chris");
    expect(result.data![0]["Legal first name"]).toBe("Brian");
  });
});
