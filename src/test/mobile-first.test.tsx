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
import { AppShell } from "@/components/shell/AppShell";
import { Onboarding } from "@/components/shell/Onboarding";
import { GradientButton } from "@/components/ui-custom";
import { StickyActionBar } from "@/components/ui-custom/StickyActionBar";
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

    const diagramLink = screen.getByRole("link", { name: /Make a diagram/ });
    const diagramIcon = diagramLink.querySelector("svg")?.parentElement;
    expect(diagramIcon).toHaveStyle({
      background: "var(--diagrams-soft)",
      color: "var(--diagrams)",
    });
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
    expect(useUserStore.getState().level).toBe("c9-10");
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows first-run setup on / without redirecting new users", async () => {
    render(
      <AppShell>
        <div>Home page content</div>
      </AppShell>,
    );

    expect(screen.queryByText("Home page content")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Set up EduAI" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your name" })).toBeInTheDocument();
    expect(screen.queryByText("Home page content")).not.toBeInTheDocument();
    expect(routerState.pathname).toBe("/");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows Home after a new user skips setup", async () => {
    render(
      <AppShell>
        <div>Home page content</div>
      </AppShell>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(useUserStore.getState().onboarded).toBe(true);
      expect(screen.queryByRole("dialog", { name: "Set up EduAI" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Home page content")).toBeInTheDocument();
    expect(routerState.pathname).toBe("/");
  });

  it("shows Home without setup for returning onboarded users", async () => {
    window.localStorage.setItem(
      "eduai-user",
      JSON.stringify({
        state: {
          name: "Asha",
          level: "c6-8",
          subject: "Maths",
          interests: ["Maths"],
          xp: 0,
          streak: 0,
          onboarded: true,
          levelSet: true,
        },
        version: 0,
      }),
    );

    render(
      <AppShell>
        <div>Home page content</div>
      </AppShell>,
    );

    expect(await screen.findByText("Home page content")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Set up EduAI" })).not.toBeInTheDocument();
    expect(routerState.pathname).toBe("/");
  });

  it("hides the tab bar during a practice attempt", () => {
    routerState.pathname = "/practice/check";
    usePracticeStore.setState({ view: { stage: "attempt", paperId: "paper-1" } });

    render(<MobileNav />);

    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("shows the tab bar on the viva page", () => {
    routerState.pathname = "/viva";

    render(<MobileNav />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("keeps disabled primary actions opaque and readable", () => {
    render(<GradientButton disabled>Create PPT</GradientButton>);

    expect(screen.getByRole("button", { name: "Create PPT" })).toHaveClass(
      "gradient-button-primary",
    );
  });

  it("positions sticky actions using the shared tab bar offset", async () => {
    render(
      <StickyActionBar>
        <button type="button">Start</button>
      </StickyActionBar>,
    );

    const actionBar = await screen
      .findByRole("button", { name: "Start" })
      .then((button) => button.parentElement?.parentElement);

    expect(actionBar).toHaveClass("sticky-action-offset");
    expect(actionBar).toHaveClass("left-4", "right-4");
    expect(actionBar).toHaveStyle({
      bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--action-gap))",
    });
    expect(actionBar?.firstElementChild).toHaveClass("sticky-action-surface");
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
