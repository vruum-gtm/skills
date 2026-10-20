---
name: yc-pipeline-fill
description: >-
  YC harness source for /pipeline-fill. Scrapes YC's public Algolia index,
  extracts founder LinkedIn URLs, dedups, hands a candidate list to
  /pipeline-fill for deep research and import. Use when: YC pipeline fill,
  source from YC, fill an objective with YC founders, sales nav dried up, source
  YC.
---

Read the [connection tool map](references/vruum-tool-map.md) for this host.

# Find YC founders

Read [host execution guidance](references/shared/references/host-workflows.md). Use the public-web
operations exposed by Vruum; no local scraper or extracted API key is required.

1. Resolve the target objective with `fetch` type=objective and
   `fetch` type=research_playbook. Require at least one user-chosen filter, such as
   batch/date range, team size, industry, tag, or region. Do not silently turn
   "YC founders" into a funding-stage assumption. Resolve the requested count.
2. Use `research_lookup` action=web_search to locate matching YC company pages and
   `research_lookup` action=web_fetch to read them. Keep queries bounded and use the
   published request-ID fields. Prefer YC's own company pages and linked
   first-party company sites for batch, website, founder, role, and location.
3. Verify each explicit filter from the returned evidence. Missing team size
   or batch information is unknown, not a match. Preserve the original page
   URLs and observation dates. Public web search is sampled coverage; do not
   claim an exhaustive directory scrape, exact remaining pool, or pool exhaustion.
4. Select an explicitly identified CEO/cofounder when appropriate to the ICP;
   otherwise a founder with a verified person profile. Do not infer a person
   URL from their name or confuse an alumni company with a current employer.
   Preserve verified `company_domain`, `company_website`, and
   `company_linkedin_url`; retain `company_id` only when obtained from Vruum.
   Pass these anchors with each candidate to `pipeline-fill` for current-employer
   verification and its company-binding gate before saving or enrolling.
5. Deduplicate companies and people and report unverifiable founder identities.
   If pages are inaccessible, dynamic, or systematically omit needed data,
   stop and report the coverage gap. Request a supplied YC export/list or use
   an explicitly allowed alternative; never fabricate scraped records.
6. Show the candidates, filter evidence, sources, and unresolved rows. Continue
   with pipeline-fill (bundled `pipeline-fill` skill) for current-role research,
   the fit gate, and only the authorized save/enrollment mode.

YC sourcing does not require a connected Sales Navigator account. Do not make
unrelated LinkedIn account checks or initiate outreach during this source step.

When the host has authorized local HTTP/file execution and the user needs
directory enumeration rather than a public-web sample, read
[local directory access](references/local-directory.md) for extraction mechanics.
Apply the same filters, identity checks, preview, and downstream research above.
