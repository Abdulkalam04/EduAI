import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/ComingSoonPage";
import { SettingsPage } from "@/components/settings/SettingsWorkspace";

export const Route = createFileRoute("/settings")({
  head: pageHead(
    "Settings",
    "Manage your profile, learning preferences, appearance, backend and data.",
  ),
  component: SettingsPage,
});
