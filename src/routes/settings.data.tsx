import { createFileRoute } from "@tanstack/react-router";
import { SettingsSectionContent } from "@/components/settings/SettingsWorkspace";

export const Route = createFileRoute("/settings/data")({
  component: () => <SettingsSectionContent section="data" />,
});
