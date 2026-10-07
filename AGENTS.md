<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All backend calls go through `src/lib/api.ts`; request and response types live in `src/lib/types.ts`. UI never fetches directly — keeps the future backend swap to one file.
- Persisted client state lives in zustand stores under `src/store/` with `skipHydration`, rehydrated in `AppShell` — avoids SSR hydration mismatches.
- App chrome (sidebar, top bar, mobile tabs, command palette, onboarding) lives in `src/components/shell/` and wraps `<Outlet />` in `__root.tsx`.
- Shared design primitives live in `src/components/ui-custom/`; feature accent colours are CSS vars `--<accent>` / `--<accent>-soft` in `src/styles.css`.
- Reusable study widgets (McqQuiz, FlashcardDeck) live in `src/components/learning/`; PDF export goes through `src/lib/pdf.ts` — one place for jsPDF formatting.
