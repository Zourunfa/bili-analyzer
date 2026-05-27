## 1. P0 SEO Foundation

- [x] 1.1 Add `/robots.txt` via App Router metadata route with sitemap reference and safe disallow rules for API/admin/auth-only paths.
- [x] 1.2 Expand root metadata in `src/app/layout.tsx` with title template, canonical, Open Graph, Twitter Card, keywords, and robots defaults.
- [x] 1.3 Add safe security headers in `next.config.ts` without breaking app assets or external images.
- [x] 1.4 Extend `src/app/sitemap.ts` to include homepage, trust pages, public feature pages, and public share pages.

## 2. P0 Trust Pages and Footer

- [x] 2.1 Create public `/about`, `/privacy`, and `/terms` pages with page-specific metadata.
- [x] 2.2 Add a reusable public footer with links to homepage, about, privacy, terms, and contact.
- [x] 2.3 Integrate the footer into public pages without disrupting app-like authenticated workflows.

## 3. P1 Homepage SEO and Discovery

- [x] 3.1 Split homepage interactive analysis input into a client component so the route can fetch server-side public share data.
- [x] 3.2 Expand homepage crawlable content with product positioning, supported platforms, workflow, use cases, and FAQ.
- [x] 3.3 Add a recent public notes section backed by existing `SharePage` and `Video` records.
- [x] 3.4 Add homepage JSON-LD for WebApplication, Organization/Person, and FAQPage.

## 4. P1 Share Page GEO Enhancements

- [x] 4.1 Add Article, VideoObject, and BreadcrumbList JSON-LD to public video share pages.
- [x] 4.2 Add visible AI-generation attribution, update date, and clearer source creator/platform context to share pages.
- [x] 4.3 Ensure share pages link back to homepage and trust pages via page actions or public footer.

## 5. P1 Indexing Policy

- [x] 5.1 Add noindex metadata to auth-only or thin public pages such as login, verify-email, notebooks, search, and upowner where appropriate.
- [x] 5.2 Confirm public SEO pages remain indexable and have canonical URLs.

## 6. Verification

- [x] 6.1 Run lint or targeted lint for changed files and document any pre-existing warnings/errors.
- [x] 6.2 Run a production build if feasible and document blockers if existing issues prevent completion.
- [x] 6.3 Inspect generated metadata/HTML for robots, canonical, OG/Twitter, JSON-LD, footer links, and sitemap entries.
