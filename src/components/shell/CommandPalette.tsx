import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  MessageCircleQuestion,
  Upload,
  Presentation,
  Workflow,
  SunMoon,
  GraduationCap,
  Settings,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ALL_NAV, TOOLS } from "@/lib/nav";
import { useUiStore, resolvedTheme } from "@/store/useUiStore";
import { LEVELS, useUserStore } from "@/store/useUserStore";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, theme, setTheme } = useUiStore();
  const setUser = useUserStore((s) => s.set);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  const run = (fn: () => void) => {
    setPaletteOpen(false);
    fn();
  };
  const go = (to: string) => run(() => navigate({ to }));

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search pages, actions, levels…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go("/tutor")}>
            <MessageCircleQuestion className="mr-2 h-4 w-4" />
            Ask a question
          </CommandItem>
          <CommandItem onSelect={() => go("/solver")}>
            <Upload className="mr-2 h-4 w-4" />
            Upload question paper
          </CommandItem>
          <CommandItem onSelect={() => go("/ppt")}>
            <Presentation className="mr-2 h-4 w-4" />
            Create a PPT
          </CommandItem>
          <CommandItem onSelect={() => go("/diagrams")}>
            <Workflow className="mr-2 h-4 w-4" />
            Make a flowchart
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Main pages">
          {ALL_NAV.map((n) => (
            <CommandItem key={n.to} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 h-4 w-4" />
              {n.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Study tools">
          {TOOLS.map((n) => (
            <CommandItem key={n.to} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 h-4 w-4" />
              {n.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => go("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() => run(() => setTheme(resolvedTheme(theme) === "dark" ? "light" : "dark"))}
          >
            <SunMoon className="mr-2 h-4 w-4" />
            Toggle theme
          </CommandItem>
          {LEVELS.map((l) => (
            <CommandItem key={l.id} onSelect={() => run(() => setUser({ level: l.id }))}>
              <GraduationCap className="mr-2 h-4 w-4" />
              Change level: {l.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
