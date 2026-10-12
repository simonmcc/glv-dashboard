import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InstallPrompt, INSTALL_DISMISSED_KEY } from "./InstallPrompt";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

function setUserAgent(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

function setStandalone(standalone: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: standalone,
  }) as unknown as typeof window.matchMedia;
}

function fireBeforeInstallPrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

describe("InstallPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
    setStandalone(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing on a non-iOS browser until beforeinstallprompt fires", () => {
    setUserAgent(ANDROID_UA);
    render(<InstallPrompt />);
    expect(screen.queryByRole("region", { name: "Install app" })).toBeNull();

    const { event } = fireBeforeInstallPrompt("accepted");
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
  });

  it("triggers the native prompt and hides once accepted", async () => {
    setUserAgent(ANDROID_UA);
    render(<InstallPrompt />);
    const { prompt } = fireBeforeInstallPrompt("accepted");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });

    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Install app" })).toBeNull();
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBeNull();
  });

  it("remembers dismissal when the native prompt is declined", async () => {
    setUserAgent(ANDROID_UA);
    render(<InstallPrompt />);
    fireBeforeInstallPrompt("dismissed");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });

    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe("true");
  });

  it("shows Add to Home Screen instructions on iOS Safari", () => {
    setUserAgent(IPHONE_UA);
    render(<InstallPrompt />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("stays hidden after Not now", () => {
    setUserAgent(IPHONE_UA);
    const { unmount } = render(<InstallPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Install app" })).toBeNull();
    unmount();

    render(<InstallPrompt />);
    expect(screen.queryByRole("region", { name: "Install app" })).toBeNull();
  });

  it("renders nothing when already running as an installed app", () => {
    setUserAgent(IPHONE_UA);
    setStandalone(true);
    render(<InstallPrompt />);
    expect(screen.queryByRole("region", { name: "Install app" })).toBeNull();
  });
});
