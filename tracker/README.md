# Tracker files

## `items.json`

The plan. One object per item:

| Field | Meaning |
|---|---|
| `id` | `RVC-nn`, stable. Saved progress is keyed on this, so never renumber an existing item. |
| `workstream` | One of `decisions`, `research`, `partnerships`, `build`, `seo`, `measurement`, `risk`. |
| `priority` | `P1`, `P2`, `P3`. |
| `status` | Starting status only. The live status lives in the artifact store. |
| `title` / `note` | Verbatim from the 12 Sept 2026 load. |
| `blockedBy` / `blocks` | Item IDs. Both directions are stored so either can be rendered without a graph walk. |
| `owner` | Optional. Only `RVC-01` has one. |
| `kind` | Optional. `risk` marks a standing watch rather than a deliverable. |
| `sequence` | Optional. The build sessions, 1–3. |

## `tracker.html`

The published page. It contains a `var PLAN = {...}` line holding a copy of
`items.json`, inlined at publish time.

### Republishing after a plan change

```bash
python3 - <<'PY'
import json, re
html = open('tracker/tracker.html', encoding='utf-8').read()
plan = json.load(open('tracker/items.json', encoding='utf-8'))
html = re.sub(r'var PLAN = \{.*?\};',
              'var PLAN = ' + json.dumps(plan, ensure_ascii=False, separators=(',', ':')) + ';',
              html, count=1, flags=re.S)
open('tracker/tracker.html', 'w', encoding='utf-8').write(html)
PY
```

Then republish `tracker/tracker.html` to the same artifact URL. Statuses and working
notes are untouched by a republish — they are stored against item IDs, not against the
page.
