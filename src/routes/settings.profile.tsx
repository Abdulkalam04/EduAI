import { createFileRoute } from "@tanstack/react-router";
import { SettingsSectionContent } from "@/components/settings/SettingsWorkspace";

export const Route = createFileRoute("/settings/profile")({
  component: () => <SettingsSectionContent section="profile" />,
});
