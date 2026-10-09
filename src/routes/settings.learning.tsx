import { createFileRoute } from "@tanstack/react-router";
import { SettingsSectionContent } from "@/components/settings/SettingsWorkspace";

export const Route = createFileRoute("/settings/learning")({
  component: () => <SettingsSectionContent section="learning" />,
});
