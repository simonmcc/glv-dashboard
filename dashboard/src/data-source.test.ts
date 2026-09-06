import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DATA_SOURCE_KEY } from "./data-source";

/**
 * `VITE_MOCK_MODE` is read once at module load, so each test stubs the env and
 * re-imports the module to simulate a production vs preview build.
 */
async function loadModule(buildMockMode: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_MOCK_MODE", buildMockMode ? "true" : "");
  return import("./data-source");
}

function setUrl(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

describe("data-source", () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl("");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("production build", () => {
    it("always uses the live backend", async () => {
      const m = await loadModule(false);
      expect(m.getDataSource()).toBe("live");
      expect(m.isMockMode()).toBe(false);
      expect(m.isDataSourceSwitchable()).toBe(false);
    });

    it("ignores a stored override", async () => {
      localStorage.setItem(DATA_SOURCE_KEY, "mock");
      const m = await loadModule(false);
      expect(m.isMockMode()).toBe(false);
    });

    it("ignores a query string override", async () => {
      setUrl("?data=mock");
      const m = await loadModule(false);
      expect(m.isMockMode()).toBe(false);
    });
  });

  describe("preview build", () => {
    it("defaults to mock data", async () => {
      const m = await loadModule(true);
      expect(m.getDataSource()).toBe("mock");
      expect(m.isMockMode()).toBe(true);
      expect(m.isDataSourceSwitchable()).toBe(true);
    });

    it("honours a stored live override", async () => {
      localStorage.setItem(DATA_SOURCE_KEY, "live");
      const m = await loadModule(true);
      expect(m.getDataSource()).toBe("live");
      expect(m.isMockMode()).toBe(false);
    });

    it("ignores a malformed stored value", async () => {
      localStorage.setItem(DATA_SOURCE_KEY, "nonsense");
      const m = await loadModule(true);
      expect(m.getDataSource()).toBe("mock");
    });

    it("?data=live switches to the live backend", async () => {
      setUrl("?data=live");
      const m = await loadModule(true);
      expect(m.getDataSource()).toBe("live");
    });

    it("persists the query override so it survives navigation", async () => {
      setUrl("?data=live");
      const m = await loadModule(true);
      m.getDataSource();
      expect(localStorage.getItem(DATA_SOURCE_KEY)).toBe("live");
    });

    it("strips the query parameter from the address bar", async () => {
      setUrl("?data=live&keep=1");
      const m = await loadModule(true);
      m.getDataSource();
      expect(window.location.search).toBe("?keep=1");
    });

    it("?data=mock overrides a stored live preference", async () => {
      localStorage.setItem(DATA_SOURCE_KEY, "live");
      setUrl("?data=mock");
      const m = await loadModule(true);
      expect(m.getDataSource()).toBe("mock");
      expect(localStorage.getItem(DATA_SOURCE_KEY)).toBe("mock");
    });

    it("setDataSource persists the choice", async () => {
      const m = await loadModule(true);
      m.setDataSource("live");
      expect(localStorage.getItem(DATA_SOURCE_KEY)).toBe("live");
      expect(m.getDataSource()).toBe("live");
    });
  });
});
