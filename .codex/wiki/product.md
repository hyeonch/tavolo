# Product Direction

Tavolo is a personal cooking archive, not a social network.

The product is now web-app-first. The earlier Expo/React Native work is prototype context; new MVP implementation should target a browser-based web app unless the user explicitly changes direction again.

When Tavolo is added to a device home screen, it should launch in standalone app mode rather than a browser tab. This does not imply offline support.

Browser-history URL routing (refresh restoration and swipe-back navigation) is deferred outside the MVP scope.

MVP focus:

- Browser-based personal cooking archive.
- Google-authenticated users read and write only their Supabase-owned records; browser-local records are never mixed into an account.
- IndexedDB is retained only as legacy browser data.
- Photos use private Supabase Storage.
- No public feed, likes, comments, or follows.
- Record meals quickly.
- A cooking record can include recipe notes: ingredient and seasoning groups, plus step-by-step cooking instructions.
- Recipe steps can have a photo attachment entry point so users can capture intermediate cooking states, not only the finished dish.
- Each cooking record has one finished-dish photo; this photo is the representative thumbnail used on home, list, search, and recap surfaces.
- Add record must retain tag entry alongside recipe authoring fields.
- Browse past cooking records through a calendar-centered home, selected date lists, detail, search, and recap surfaces.
- Search is the full-record browsing surface: show all records newest-first by default, then filter personal records by meal name, tags, notes, and ingredient names. It does not perform external web search.
- Recap is also a discovery entry point: selecting a non-empty month or frequent tag opens the personal-search surface with that filter applied.
- Save external recipe links in a dedicated recipe space so they can later seed a cooking record.
- The recipe space has its own lightweight search for saved link titles, notes, and URLs.

Phase order:

1. Web app foundation.
2. Calendar and detail browsing.
3. Edit, delete, and media management.
4. Search and tags.
5. Basic recap.
6. Cooking world cup.

Design workflow:

- Do not defer all design work until the end of the MVP.
- At the end of Phase 1, run a thin Design Pass 0 for information architecture and wireframes before Phase 2 implementation gets too far.
- During later phases, include lightweight design checks in UI-facing issues and at phase QA time.
- Use Pencil or Figma for wireframes/design artifacts when available, and link or summarize those artifacts in Linear and the wiki.
- Keep early design checks focused on structure, hierarchy, navigation, responsive behavior, empty states, and reuse candidates; reserve high-fidelity polish for later passes.

TVL-31 Design Pass 0:

- Pencil split files:
  - `/Users/hyeonch/workspace/tavolo/design/00-overview.pen` for IA and navigation decisions.
  - `/Users/hyeonch/workspace/tavolo/design/01-mobile-browse.pen` for mobile home, recipes, selected date list, detail, search, and recap.
  - `/Users/hyeonch/workspace/tavolo/design/02-mobile-add-record.pen` for the scrollable add-record form.
  - `/Users/hyeonch/workspace/tavolo/design/03-desktop.pen` for desktop sidebar layouts.
- Legacy full Pencil boards: `/Users/hyeonch/workspace/tavolo/untitled.pen` and `/Users/hyeonch/workspace/tavolo/design.pen`; keep them only as migration context unless explicitly needed.
- Figma was briefly tested but is not the active design source because of plan/tooling limits.
- Scope: web MVP information architecture and low-fidelity wireframes for calendar-centered home, add record, recipe scraps, selected date list, detail, search, recap, mobile bottom tabs, and desktop sidebar.
- Linear milestone: Phase 1, because this is a Phase 1 wrap-up planning/design checkpoint before Phase 2 work starts.
- Navigation decision: mobile uses five bottom tabs (`홈`, `레시피`, `추가`, `검색`, `결산`), with `추가` as the emphasized primary action; desktop uses a persistent left sidebar with the same primary destinations.
- Home is the calendar-centered browsing surface; there is no separate primary `달력` tab.
- The former calendar tab position becomes `레시피`, a space for saving external recipe links and later starting a cooking record from one.
- Add record uses a scrollable recipe-authoring structure inspired by recipe sites: tag input, `재료정보` with `재료`/`양념` groups and ingredient rows, `요리순서` with Step cards and step-photo entry points, and exactly one `요리 완성사진` used as the record thumbnail. The design should prefer comfortable input spacing over squeezing the full form into a single mobile viewport.
- Detail and selected date list are contextual drill-in surfaces, not primary tabs.
- Phase 2 implementation should use the home calendar wireframe as a two-zone pattern on desktop: month grid plus selected-date list/detail context.
- TVL-31 should also produce any needed Phase 1 follow-up Linear issues discovered from the wireframe/IA pass.
- Later phase QA should compare implementation against the wireframe for hierarchy, responsive behavior, empty states, and reusable UI candidates.

Keep implementation aligned with the active Linear milestone and issue.
