# Adjuster paperwork: how to drop it into the Agile quotes dashboard

Built by the session "Agile adjuster paperwork" for the session "Agile quotes dashboard",
which owns the Lovable project e86e162d-4574-4193-90a6-343e423781c0 and is the only session
that writes to it or applies migrations. Nothing here has been applied to Lovable or Supabase yet.

## What it adds

- **Business profile** at `/quotes/settings/business` (admin only, through `QuotesGate`): every value a
  landlord form asks for, plus a signature drawn with a finger or mouse. All values start empty.
- **Adjuster paperwork** card on each customer file: upload one or more PDFs, see their status,
  open each one, Download all as a zip.
- **Review screen** at `/quotes/paperwork/:id`: the real filled PDF as a live preview next to a list
  of every field, each editable, marked Filled, Changed by you, Needs you, Signature or Left blank.
  "Save to my profile too" on profile fields. "Add my signature" only on the preview, only when it is
  up to date. Download saves a flattened PDF and keeps a version that can be reopened.

## Files

Copy these into the Lovable repo at the same paths:

| From this folder | To the Lovable repo |
|---|---|
| `web/dashboard/src/lib/quotes/paperwork.ts` | `src/lib/quotes/paperwork.ts` |
| `web/dashboard/src/components/quotes/PaperworkCard.tsx` | `src/components/quotes/PaperworkCard.tsx` |
| `web/dashboard/src/components/quotes/PdfPreview.tsx` | `src/components/quotes/PdfPreview.tsx` |
| `web/dashboard/src/components/quotes/SignaturePad.tsx` | `src/components/quotes/SignaturePad.tsx` |
| `web/dashboard/src/components/quotes/paperwork.css` | `src/components/quotes/paperwork.css` |
| `web/dashboard/src/pages/quotes/QuotesBusinessProfile.tsx` | `src/pages/quotes/QuotesBusinessProfile.tsx` |
| `web/dashboard/src/pages/quotes/QuotesPaperwork.tsx` | `src/pages/quotes/QuotesPaperwork.tsx` |
| `supabase/functions/qa-paperwork/**` (generated, 14 files) | `supabase/functions/qa-paperwork/**` |

`supabase/functions/qa-paperwork/` is generated from `core/` and `server/` by
`npx tsx scripts/build-edge.ts`. Edit the sources, not the copy.

## Edits to existing files (small, all additive)

1. **`package.json`**: add `"pdfjs-dist": "4.10.38"` to dependencies. (4.x, not 5.x, so older iPhones
   still render the preview.)

2. **`src/App.tsx`**: next to the other quotes lazy imports add

   ```tsx
   const QuotesBusinessProfile = lazy(() => import("./pages/quotes/QuotesBusinessProfile"));
   const QuotesPaperwork = lazy(() => import("./pages/quotes/QuotesPaperwork"));
   ```

   and after the `/quotes/settings` route add

   ```tsx
   <Route path="/quotes/settings/business" element={<QuotesGate><Suspense fallback={<QuotesFallback />}><QuotesBusinessProfile /></Suspense></QuotesGate>} />
   <Route path="/quotes/paperwork/:id" element={<QuotesGate><Suspense fallback={<QuotesFallback />}><QuotesPaperwork /></Suspense></QuotesGate>} />
   ```

3. **`src/pages/quotes/QuotesCustomerFile.tsx`**: add
   `import { PaperworkCard } from "@/components/quotes/PaperworkCard";`
   and in the right column put `<PaperworkCard customerId={c.id} />` right after
   `<DocumentsCard customerId={c.id} />`.

4. **`src/pages/quotes/QuotesSettings.tsx`**: add `import { Link } from "react-router-dom";` and, right
   under the "New quotes use these numbers" paragraph:

   ```tsx
   <Card title="Business profile">
     <p className="q-muted">Your legal name, EIN, bank details and signature for adjuster paperwork.</p>
     <Link to="/quotes/settings/business" className="q-btn q-btn-ghost">Open business profile</Link>
   </Card>
   ```

The `/quotes` prefix keeps both new routes noindex, out of the sitemap, out of prerendering and under
the existing `Disallow: /quotes`. Nothing else in the public site changes.

## Database, storage and secrets

1. **Migration**: apply `supabase/migration_qa_paperwork.sql` as ONE migration exactly as written,
   with the next number (for example `0009_qa_paperwork`). It creates `qa_business_profile`,
   `qa_paperwork`, `qa_paperwork_drafts`, `qa_paperwork_versions` and the function
   `qa_paperwork_add_version`. It seeds no values.
2. **Storage**: create a private bucket named `qa-paperwork` with Lovable's storage tool. Add no
   policies to it. Only the edge function reads it.
3. **Secrets** in Lovable Cloud:
   - `PAPERWORK_ENCRYPTION_KEY`: 32 random bytes, base64. Make it on the Mac with
     `openssl rand -base64 32` and paste it straight into the secret. Do not paste it into chat, a file,
     a commit or a log. If this key is ever lost, the saved EIN, bank numbers and signature cannot be
     read; Mike would type them in again.
   - `ANTHROPIC_API_KEY`: the Claude API key. Without it, uploads still work and open as
     "Fill by hand".

## How it keeps the data locked down

- The four new tables have row level security on and no policies, and every privilege is revoked
  from `anon` and `authenticated`. The browser cannot read them at all, not even encrypted values.
- Every call goes through the `qa-paperwork` edge function, which checks the caller the same way
  `qa-service` does today: the Supabase session token, then the `admin` row in `user_roles`.
  No new login, password or code.
- EIN, routing number, account number and the signature are encrypted with AES-256-GCM before they
  reach the database. Each value is bound to its column, so a copied ciphertext will not decrypt
  anywhere else. The database also refuses anything in those columns that is not ciphertext.
- The interface only ever receives the last 4 digits. The full value comes back only for one field
  at a time, when Mike taps Show, and hides again after 30 seconds.
- Edits Mike makes to a protected number on a form are stored encrypted in the draft. Downloaded
  versions keep protected values by reference, never in plain text. Filled PDFs are not stored;
  they are rebuilt on demand.
- Logs carry event names and ids only, never request bodies or values (tested).
- The Claude API receives the uploaded blank PDF, its field list, page sizes, printed text positions
  and the list of data key NAMES. Never a stored value. A guard refuses to send any request that
  contains a stored EIN, routing or account number (tested). Note that if an adjuster pre-printed
  details on the form (an insured name or claim number), those are part of the PDF Claude reads.

## Accuracy rules built in

- Fields Claude is unsure about (below 70% confidence) stay blank and highlighted, with a
  "Use ..." button that fills the suggestion only when Mike taps it.
- Questions about the property or the owner's finances (mortgage, liens, foreclosure, bankruptcy,
  taxes owed, financial standing, and similar) are never answered, even if the mapping tries to.
  A second check in our own code catches these by wording.
- Money is written exactly the way the quote shows it, using the dashboard's own `formatMoney` rule
  ("$3,850" when whole, "$3,850.50" otherwise), computed in whole cents. Dates are copied exactly as
  stored ("2026-11-04").
- Agreement notice to vacate: the agreements keep that in template text, so the profile's
  "Default notice to vacate" is used.
- Text too long for a box, or characters the form font cannot print, are flagged on the field
  instead of being cut off.
- The signature and date are added only by "Add my signature", only if the preview Mike is looking
  at matches the form exactly. Any later change takes the signature off and says so.

## Before publishing: the live check with the real Sedgwick form

No copy of the Sedgwick "LL Contact Form, ACH Form & W9" was available to this session, so every test
here uses fake forms and fake values. On the Mac, with the real blank PDF:

```
cd agile-paperwork && npm install
ANTHROPIC_API_KEY=... npx tsx scripts/live-check.ts "/path/to/LL Contact Form, ACH Form & W9.pdf" ./live-check-out
```

It prints what each blank was mapped to and writes `filled-with-fake-data.pdf` to eyeball the
placement. It never reads the profile or any customer data.

## Tests

```
npm install
npm test                  # 68 tests: mapping, encryption and masking, never-send rule,
                          # signature-after-preview, flat overlay, download, migration (PGlite)
npm run typecheck
cd web/harness && npm install && ./run-e2e.sh desktop /tmp/shots && ./run-e2e.sh phone /tmp/shots
./run-e2e.sh desktop /tmp/shots 5175 fail   # form reader down: fill by hand
```

The harness mounts these exact screen files with copies of the dashboard's layout, CSS and card
components, backed by the real server code with an in-memory database and fake data.

## Known limits

- Pages that are rotated inside the PDF may need the overlay boxes nudged by dragging.
- Forms made only in Adobe's old XFA format get a plain message asking for a "Save as PDF" copy.
- Uploads are capped at 20 MB and 40 pages, with plain messages above that. Supabase's own request
  size limit for edge functions should be confirmed on this project before relying on files near
  20 MB.
- Reading runs in the background. If it is stopped by a timeout, the form switches to
  "Fill by hand" after 6 minutes instead of staying stuck.
