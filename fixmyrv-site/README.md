# fixmyrv.ai site changes staged from this repo

The public site lives in the Lovable project "fixmyrv" (project id
8e9c68d0-84dc-48f4-afe3-2aabf2c63aea), not in this repository. This folder
holds a version-controlled copy of the files that were staged into that
project's preview build on 21 September 2026 for the new page
`/blog/rv-ac-repair-or-replace`. Nothing here was published.

Lovable project commits that carry the staged change: `627ff73` (page and
layout) and `99401b4` (route, blog index, sitemap, internal link). Preview:
https://id-preview--8e9c68d0-84dc-48f4-afe3-2aabf2c63aea.lovable.app/blog/rv-ac-repair-or-replace

## Files

| Path | Change |
|---|---|
| `src/pages/blog/RvAcRepairOrReplace.tsx` | New page. Article body, cost table, capacitor steps, model notes, FAQ, calls to action, author line, and the page-level structured data (Person, FAQPage, HowTo). |
| `src/components/blog/BlogPostLayout.tsx` | Adds three optional props (`author`, `extraJsonLd`, `hideDefaultCta`). Existing posts are unaffected. |
| `src/data/blogPosts.ts` | Adds the `rv-ac-repair-or-replace` entry and links it from the `rv-ac-not-cooling` entry. |
| `src/pages/blog/RvAcNotCooling.tsx` | Adds a link to the new page in the compressor section, where replacement comes up. |
| `src/App.tsx.patch` | The import and route lines to add to `src/App.tsx`. |
| `public/sitemap-snippet.xml` | The two `<url>` blocks for `public/sitemap.xml` (updated lastmod on the not-cooling post, plus the new page). |

## Sources used on the page

Every number on the page is either one of the Agile RV Housing figures
supplied by the founder or carries a link to the retailer, technician, or
manufacturer page it came from. See the page source for the full list.

## Publishing

Publishing is done from the Lovable editor (Publish button). Before that,
open each linked retailer price and confirm it still shows the price on the
page. Details are in the staging report delivered with this change.
