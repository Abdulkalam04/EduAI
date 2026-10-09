import { createFileRoute } from "@tanstack/react-router";
import { SettingsSectionContent } from "@/components/settings/SettingsWorkspace";

export const Route = createFileRoute("/settings/appearance")({
  component: () => <SettingsSectionContent section="appearance" />,
});
