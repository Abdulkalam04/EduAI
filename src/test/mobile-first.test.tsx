import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, routerState } = vi.hoisted(() => ({
  navigate: vi.fn(),
  routerState: { pathname: "/" },
}));

vi.mock("@tanstack/react-router", async () => {
  const router =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...router,
    Link: ({ to, children }: { to: string; children?: ReactNode }) =>
      createElement("a", { href: to }, children),
    useNavigate: () => navigate,
    useRouterState: (options?: {
      select?: (state: { location: { pathname: string } }) => unknown;
    }) => {
      const state = { location: { pathname: routerState.pathname } };
      return options?.select ? options.select(state) : state;
    },
  };
});

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { MobileNav } from "@/components/shell/MobileNav";
import { Onboarding } from "@/components/shell/Onboarding";
import { resolveDefaultApiUrl } from "@/lib/api";
import { StudyPage } from "@/routes/study";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useUserStore } from "@/store/useUserStore";

describe("mobile-first learning flows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUserStore.setState({ ...useUserStore.getInitialState(), onboarded: false });
    usePracticeStore.setState({ view: { stage: "generate" } });
    routerState.pathname = "/";
    navigate.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["a private IPv4 address", "192.168.1.42", "http://192.168.1.42:8000"],
    ["a .local host", "laptop.local", "http://laptop.local:8000"],
    ["localhost", "localhost", "http://localhost:8000"],
    ["the IPv4 loopback address", "127.0.0.1", "http://localhost:8000"],
    ["a public domain", "example.com", "http://localhost:8000"],
  ])("resolves the default backend URL for %s", (_case, hostname, expected) => {
    expect(resolveDefaultApiUrl(hostname)).toBe(expected);
  });

  it("renders exactly four primary mobile tabs", () => {
    render(<MobileNav />);

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Home", "Ask", "Study", "Progress"]);
  });

  it("shows all seven study tools with their plain-language names", () => {
    render(<StudyPage />);

    for (const [title, href] of [
      ["Learn from my book", "/book"],
      ["Solve a question paper", "/solver"],
      ["Practice for my exam", "/practice"],
      ["Practise speaking", "/viva"],
      ["Learn coding", "/coding"],
      ["Make a diagram", "/diagrams"],
      ["Make a presentation", "/ppt"],
    ] as const) {
      const titleElement = screen.getByText(title);
      expect(titleElement).toBeInTheDocument();
      expect(titleElement.closest("a")).toHaveAttribute("href", href);
    }
  });

  it("completes onboarding in three steps", async () => {
    render(<Onboarding />);

    expect(screen.getByLabelText("Step 1 of 3")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
      target: { value: "Asha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Step 2 of 3")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Pick your level" });
    fireEvent.click(screen.getByRole("button", { name: /Class 6–8/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByLabelText("Step 3 of 3")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "What are you studying?" });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => {
      expect(useUserStore.getState()).toMatchObject({
        name: "Asha",
        level: "c6-8",
        interests: ["English"],
        onboarded: true,
      });
    });
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  }, 15000);

  it("lets the learner skip onboarding", async () => {
    render(<Onboarding />);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(useUserStore.getState().onboarded).toBe(true);
    });
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("hides the tab bar during a practice attempt", () => {
    routerState.pathname = "/practice";
    usePracticeStore.setState({ view: { stage: "attempt", paperId: "paper-1" } });

    render(<MobileNav />);

    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("hides the tab bar during a viva session", () => {
    routerState.pathname = "/viva";

    render(<MobileNav />);

    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("hides the tab bar while the tutor composer is focused", async () => {
    routerState.pathname = "/tutor";
    render(
      <>
        <div data-tutor-composer>
          <textarea aria-label="Tutor message" />
        </div>
        <MobileNav />
      </>,
    );

    screen.getByRole("textbox", { name: "Tutor message" }).focus();

    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    });
  });
});
