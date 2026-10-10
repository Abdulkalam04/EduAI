import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntroSplash } from "@/components/shell/IntroSplash";

describe("IntroSplash", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when the flag is unset", () => {
    render(<IntroSplash />);

    const overlay = screen.getByTestId("intro-splash");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(sessionStorage.getItem("eduai_intro_seen")).toBeNull();
  });

  it("is not rendered when the flag is set", () => {
    sessionStorage.setItem("eduai_intro_seen", "1");

    render(<IntroSplash />);

    expect(screen.queryByTestId("intro-splash")).not.toBeInTheDocument();
  });

  it("dismisses on Skip and marks the intro as seen", () => {
    render(<IntroSplash />);

    const skipButton = screen.getByRole("button", { name: "Skip" });
    fireEvent.click(skipButton);

    expect(screen.queryByTestId("intro-splash")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("eduai_intro_seen")).toBe("1");
  });

  it("dismisses when clicking anywhere on the overlay", () => {
    render(<IntroSplash />);

    const overlay = screen.getByTestId("intro-splash");
    fireEvent.click(overlay);

    expect(screen.queryByTestId("intro-splash")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("eduai_intro_seen")).toBe("1");
  });
});
