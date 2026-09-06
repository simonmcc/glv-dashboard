import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataSourceBanner } from "./DataSourceBanner";
import * as dataSource from "../data-source";
import * as session from "../session";

function mockBuild(switchable: boolean, source: "mock" | "live") {
  vi.spyOn(dataSource, "isDataSourceSwitchable").mockReturnValue(switchable);
  vi.spyOn(dataSource, "getDataSource").mockReturnValue(source);
}

describe("DataSourceBanner", () => {
  let setDataSource: ReturnType<typeof vi.spyOn>;
  let clearSession: ReturnType<typeof vi.spyOn>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setDataSource = vi
      .spyOn(dataSource, "setDataSource")
      .mockImplementation(() => {});
    clearSession = vi
      .spyOn(session, "clearSession")
      .mockImplementation(() => {});
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing on a production build", () => {
    mockBuild(false, "live");
    const { container } = render(<DataSourceBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the mock banner with a switch to live data on a preview build", () => {
    mockBuild(true, "mock");
    render(<DataSourceBanner />);
    expect(screen.getByText("🔍 Preview Mode (Mock Data)")).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in with any email and password/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use live backend data" }),
    ).toBeInTheDocument();
  });

  it("shows the live banner with a switch back to mock data", () => {
    mockBuild(true, "live");
    render(<DataSourceBanner />);
    expect(
      screen.getByText("🔗 Preview Mode (Live Backend)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch back to mock data" }),
    ).toBeInTheDocument();
  });

  it("switching to live clears the session, persists the choice and reloads", () => {
    mockBuild(true, "mock");
    render(<DataSourceBanner />);
    fireEvent.click(
      screen.getByRole("button", { name: "Use live backend data" }),
    );
    expect(clearSession).toHaveBeenCalled();
    expect(setDataSource).toHaveBeenCalledWith("live");
    expect(reload).toHaveBeenCalled();
  });

  it("switching back to mock persists 'mock'", () => {
    mockBuild(true, "live");
    render(<DataSourceBanner />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch back to mock data" }),
    );
    expect(setDataSource).toHaveBeenCalledWith("mock");
  });

  it("compact variant renders a one-line switch", () => {
    mockBuild(true, "mock");
    render(<DataSourceBanner compact />);
    expect(screen.getByText(/Preview: mock data/)).toBeInTheDocument();
    expect(
      screen.queryByText("🔍 Preview Mode (Mock Data)"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use live backend data" }),
    ).toBeInTheDocument();
  });
});
