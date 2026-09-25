import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamStructure } from "./TeamStructure";
import type { AppointmentRecord } from "../types";

function record(overrides: Partial<AppointmentRecord>): AppointmentRecord {
  return {
    "First name": "First",
    "Last name": "Last",
    "Membership number": "0000000",
    Role: "Team Member",
    Team: "",
    "Unit name": "1st Demo Group",
    "Start date": "2024-01-01",
    ...overrides,
  };
}

describe("TeamStructure", () => {
  it("groups members by the Team field", () => {
    const records: AppointmentRecord[] = [
      record({
        "First name": "Bob",
        "Last name": "Smith",
        "Membership number": "1",
        Role: "Beaver Scout Leader",
        Team: "Beavers",
      }),
      record({
        "First name": "Carol",
        "Last name": "Williams",
        "Membership number": "2",
        Role: "Cub Scout Leader",
        Team: "Cubs",
      }),
    ];

    render(<TeamStructure records={records} isLoading={false} />);

    expect(screen.getByText("Beavers")).toBeInTheDocument();
    expect(screen.getByText("Cubs")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.getByText("Carol Williams")).toBeInTheDocument();
  });

  it("falls back to a Role keyword when Team is blank", () => {
    const records: AppointmentRecord[] = [
      record({
        "First name": "Henry",
        "Last name": "Taylor",
        "Membership number": "3",
        Role: "Scout Leader",
        Team: "",
      }),
    ];

    render(<TeamStructure records={records} isLoading={false} />);

    expect(screen.getByText("Scouts")).toBeInTheDocument();
    expect(screen.getByText("Henry Taylor")).toBeInTheDocument();
  });

  it("buckets board-level roles into Trustees & Board when Team is blank", () => {
    const records: AppointmentRecord[] = [
      record({
        "First name": "Ian",
        "Last name": "Clarke",
        "Membership number": "4",
        Role: "Chair",
        Team: "",
      }),
      record({
        "First name": "Judith",
        "Last name": "Adams",
        "Membership number": "5",
        Role: "Trustee",
        Team: "",
      }),
    ];

    render(<TeamStructure records={records} isLoading={false} />);

    expect(screen.getByText("Trustees & Board")).toBeInTheDocument();
    expect(screen.getByText("Ian Clarke")).toBeInTheDocument();
    expect(screen.getByText("Judith Adams")).toBeInTheDocument();
  });

  it("orders leaders before assistants before team members, and shows the start date", () => {
    const records: AppointmentRecord[] = [
      record({
        "First name": "David",
        "Last name": "Brown",
        "Membership number": "6",
        Role: "Team Member",
        Team: "Beavers",
        "Start date": "2024-06-01",
      }),
      record({
        "First name": "Alice",
        "Last name": "Johnson",
        "Membership number": "7",
        Role: "Assistant Beaver Scout Leader",
        Team: "Beavers",
      }),
      record({
        "First name": "Bob",
        "Last name": "Smith",
        "Membership number": "8",
        Role: "Beaver Scout Leader",
        Team: "Beavers",
      }),
    ];

    render(<TeamStructure records={records} isLoading={false} />);

    const names = screen
      .getAllByText(/^(Bob Smith|Alice Johnson|David Brown)$/)
      .map((el) => el.textContent);
    expect(names).toEqual(["Bob Smith", "Alice Johnson", "David Brown"]);
    expect(screen.getByText("Since 1 Jun 2024")).toBeInTheDocument();
  });

  it("shows an empty state when there are no records", () => {
    render(<TeamStructure records={[]} isLoading={false} />);
    expect(screen.getByText("No appointment records found")).toBeInTheDocument();
  });

  it("still renders a section whose Team value isn't one of the known labels", () => {
    // The live AppointmentsDashboardView Team field isn't guaranteed to use
    // "Beavers"/"Cubs"/etc — it can be an arbitrary unit-specific name. Those
    // must not be silently dropped just because they aren't in SECTION_ORDER.
    const records: AppointmentRecord[] = [
      record({
        "First name": "Bob",
        "Last name": "Smith",
        "Membership number": "1",
        Role: "Beaver Scout Leader",
        Team: "Beaver Scout 1",
      }),
    ];

    render(<TeamStructure records={records} isLoading={false} />);

    expect(screen.getByText("Beaver Scout 1")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
  });
});
