# Company research procedure

Use this procedure both inline and when delegating Phase A. The caller supplies
the company identity, objective ICP, ACV floor, reusable fixed fields, and their
original evidence. Read the connection tool map and host guidance. Research
returns observations and classifications; it never persists or enrolls anyone.

1. **Reuse by field.** Read `fetch` type=company_research for the company's
   domain, requesting summary, stage, priorities, funding and growth fields.
   Reuse only fields explicitly marked reusable. Missing, unsourced, stale,
   invalid-time and invalid-value fields are unknown. A reusable summary does
   not skip objective-relative pricing, outbound, cycle, or trigger work.
2. **Verify identity.** Use `research_lookup` action=enrich_company when allowed,
   then available public reads to verify the website, domain and company page.
   Preserve the strongest anchors. Record dead/inaccessible sources, not an
   invented replacement company. For headcount/growth, distinguish provider
   observations from company self-reports and keep original dates.
3. **Read pricing and hiring.** Use available public read operations for pricing,
   careers and jobs pages. Capture tiers, annual/per-seat terms, enterprise
   positioning, and Sales/SDR/BDR/AE/RevOps/GTM vacancies. A missing page is a
   source limit; it does not prove a company has no sales team. Do not retry
   a 404 repeatedly.
4. **Read recent news.** Search for funding, launches, executive hiring and
   customer stories using the current year/date range. Record source URLs and
   dates; use already supplied YC news when relevant. Distinguish an observation
   from an inferred sales-cycle or ACV classification.
5. **Classify ACV.** Use the objective's actual floor. Public pipeline classes
   are smb (<$5k/year), mid ($5k–$50k/year), and ent ($50k+/year). Pricing is
   stronger evidence than sales-title/positioning proxies. If pricing is absent,
   enterprise/strategic AE hiring can support an enterprise inference and SMB AE
   hiring a mid-market inference; label the inference path and uncertainty.
   Return unknown when the evidence cannot justify a class, rather than fitting
   a company to the desired score.
6. **Classify outbound motion.** After inspecting the relevant sources, use 0
   for no observed sales/GTM vacancies or recent sales-leadership hire, 1 for
   one or two such vacancies or a recent sales-leadership hire, and 2 for three
   or more vacancies. Missing/inaccessible hiring evidence stays unknown and
   cannot earn outbound points in the gate.
7. **Infer cycle.** Use short (<3 months), medium (3–6 months), or long (>6
   months), supported by trials, contract/onboarding language, case-study
   timelines and security/procurement evidence. Do not present a proxy as a
   measured customer sales cycle.
8. **Extract timing triggers.** Capture observed funding, executive hire,
   launch, layoff, acquisition or partnership in the last 90 days, with type,
   description, event date and original URL. Distress is a concern, not an
   automatic dismissal. An unknown date does not establish recency.
9. **Return the Phase A result.** Include identity anchors, summary, stage,
   priorities, funding/growth observations, ACV class and inference path,
   outbound score, cycle, triggers, reused fields, notes and `STATUS: ok|failed`.
   Every non-null fixed research field needs `sources_by_field` in the exact
   `{url,title?,observed_at}` shape, including a source from the resolved
   company's own domain or canonical company page. Licensed-provider hints
   alone are insufficient for a public evidence save.

Respect provider restrictions and bounded waves. Retry a transient public read
at most twice within the source policy; do not repeat a provider refusal or
rate-limit. Report partial coverage. If nothing reliable was collected, return
failed; the engine's inconclusive cascade handles it. Do not manufacture an
assessment, dismiss the company yourself, or call a research save.
