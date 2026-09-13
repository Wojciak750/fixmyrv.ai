# fixmyrv.ai — ops repo

Working repo for FixMyRV-adjacent projects that need version-controlled files.

## RV total cost comparison site — build tracker

A standalone brand, deliberately **not** a FixMyRV sub-site. The brand and domain are
still undecided (`RVC-01`), so the site itself has no repo yet — only this tracker.

| | |
|---|---|
| Source of truth | [`tracker/items.json`](tracker/items.json) |
| Tracker page | [`tracker/tracker.html`](tracker/tracker.html) |
| Loaded | 12 September 2026 — 18 items, 7 workstreams |

The tracker is published as a private Claude Artifact. Statuses and working notes are
saved server-side against each item ID, so the page is the live record; `items.json`
holds the plan text, the priorities, and the dependency links, which do not change as
work progresses.

### How the two files relate

`items.json` is the plan. It carries each item's ID, workstream, priority, the original
note verbatim, and its `blockedBy` / `blocks` links. `tracker.html` embeds that JSON at
publish time and renders it; the mutable part (status, working note, last-saved date)
lives in the artifact's own store, keyed by item ID.

To change the plan — reword an item, re-prioritise, add or remove one — edit
`items.json`, re-inject it into `tracker.html`, and republish. Saved progress survives,
because it is keyed by ID rather than by position.

### Dependency links

Every `blockedBy` link is taken from the wording of the notes themselves, not invented:

- `RVC-01` (domain and brand) blocks the four items that deploy something — "the site
  cannot be deployed without it".
- `RVC-02` (demand pull) blocks the route pages and the question pages — "routes chosen
  by the demand pull, not by guess".
- Build sessions run `RVC-05` → `RVC-06` → `RVC-08` in order.
- `RVC-08` (route pages) blocks the city/destination pages, the international pages, and
  the embeddable calculator — the last of which is "only worth starting once the route
  pages have proven results".
- `RVC-11` (question pages) blocks `RVC-12`, which tracks those pages as AI prompts
  "once the question pages are live".

The tracker's "startable now" readout counts items whose prerequisites are all done.
