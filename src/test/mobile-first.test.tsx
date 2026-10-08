import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async () => {
  const router =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...router,
    Link: ({ to, children }: { to: string; children?: ReactNode }) =>
      createElement("a", { href: to }, children),
    useNavigate: () => navigate,
    useRouterState: () => "/",
  };
});

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

import { MobileNav } from "@/components/shell/MobileNav";
import { Onboarding } from "@/components/shell/Onboarding";
import { getApiUrl } from "@/lib/api";
import { StudyPage } from "@/routes/study";
import { useUserStore } from "@/store/useUserStore";

describe("mobile-first learning flows", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUserStore.setState({ ...useUserStore.getInitialState(), onboarded: false });
    navigate.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("derives the backend URL from the current LAN host", () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null },
      location: { hostname: "192.168.1.42", protocol: "http:" },
    });

    expect(getApiUrl()).toBe("http://192.168.1.42:8000");
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

    for (const title of [
      "Learn from my book",
      "Solve a question paper",
      "Practice for my exam",
      "Practise speaking",
      "Learn coding",
      "Make a diagram",
      "Make a presentation",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
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
});
