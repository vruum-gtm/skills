---
name: yc-pipeline-fill
description: >-
  YC harness source for /pipeline-fill. Scrapes YC's public Algolia index,
  extracts founder LinkedIn URLs, dedups, hands a candidate list to
  /pipeline-fill for deep research and import. Use when: YC pipeline fill,
  source from YC, fill segment with YC founders, sales nav dried up, source YC.
---
# YC Pipeline Fill (harness source)

You are the YCombinator harness-mode source for `/pipeline-fill`. You scrape YC's public directory, extract founder LinkedIn URLs, dedup, and hand a candidate list to the orchestrator. No deep research, no harness gate, no save chain in this skill — that's all in `pipeline-fill/RESEARCH-ENGINE.md`.

This is the answer to "DFW CFOs Sales Nav is dead, what now?" — pivot to YC, get 30 founders into the campaign in ~15 minutes.

## Inputs

- `campaign`: target campaign (single)
- `count`: target number of imports (default 50)
- `filters` (REQUIRED — no defaults; operator must specify at least one):
  - `team_size_min` / `team_size_max` (proxy for funding stage)
  - `launched_at_after` / `launched_at_before` (Unix ts; YC batch recency)
  - `industries` (e.g. ["B2B"])
  - `tags` (e.g. ["SaaS", "Fintech", "DevTools"])
  - `regions` (e.g. ["United States"])

If the operator runs the skill without filters, prompt: "YC has 5K+ companies — give me at least one filter (e.g. 'last 18 months, team 11-50, B2B SaaS')." Don't apply silent defaults — defaults shape the funnel invisibly.

## Workflow

### Step 1: Load campaign ICP

Call `fetch` type=research_playbook id=<campaign_id> to load ICP context. The downstream subagents need it for classification; capture it now to pass forward.

### Step 2: Algolia connectivity precheck

Issue a one-shot Algolia query against the index with `hitsPerPage: 1` to confirm extraction works. **Do NOT use `import_prospects` action=sales_nav_searches payload={action: "accounts"}** as a precheck — that endpoint checks LinkedIn account state and has nothing to do with YC. False-fails operators who don't have Sales Nav configured (eng review §1B).

The precheck happens implicitly in Step 3 (the first real Algolia call); if it fails there, abort with a clear error.

### Step 3: Fetch rotating Algolia API key

```
curl -sL https://www.ycombinator.com/companies > /tmp/yc-home.html
```

Extract the Algolia API key with regex `[A-Za-z0-9]{200,}` from the HTML — there's typically one match (a 256-char base64 string). The key is a scoped key with embedded YC restrictions:
- `analyticsTags=ycdc`
- `restrictIndices=YCCompany_production%2CYCCompany_By_Launch_Date_production`
- `tagFilters=%5B%22ycdc_public%22%5D`

Try the extracted key against the Algolia endpoint (Step 4). If multiple `[A-Za-z0-9]{200,}` matches exist, try each in order; the working one returns `hits`, others return `{"message":"Invalid API key"}` or 403.

**If all candidates fail**, abort with: "YC homepage structure changed — Algolia key extractor needs updating. Inspect `/tmp/yc-home.html` and adjust the regex." Don't silently fall back. The key rotates on every server-side render — don't cache across runs.

### Step 4: Query Algolia

```
POST https://45bwzj1sgc-dsn.algolia.net/1/indexes/YCCompany_By_Launch_Date_production/query
Headers:
  x-algolia-api-key: <extracted key>
  x-algolia-application-id: 45BWZJ1SGC
  content-type: application/json
Body:
{
  "query": "",
  "hitsPerPage": <count * 3>,
  "page": 0,
  "facetFilters": [<derived from filters>],
  "numericFilters": [<derived from filters>]
}
```

**Filter mapping:**
- `team_size_min/max` → numericFilters: `team_size>=N` / `team_size<=N`
- `launched_at_after/before` → numericFilters: `launched_at>=ts` / `launched_at<=ts`
- `industries` → facetFilters array: `[["industries:Fintech", "industries:SaaS"]]` (OR within one filter)
- `tags` → facetFilters: `[["tags:B2B"]]`
- `regions` → facetFilters: `[["regions:United States"]]`

Request `count * 3` hits to allow for dedup + research-stage drops. Capture per hit: `slug`, `name`, `website`, `team_size`, `batch`, `one_liner`, `long_description`, `tags`, `all_locations`.

### Step 5: Per-company page scrape (parallelizable, free)

For each candidate:

```
curl -sL https://www.ycombinator.com/companies/{slug}
```

The page is HTML-entity-encoded. Decode entities first:

```
curl -sL https://www.ycombinator.com/companies/{slug} | python3 -c "import html,sys;print(html.unescape(sys.stdin.read()))"
```

After decoding, regex out:

- **Founders array**: `"founders":\[(.*?)\]` — extract per-founder `"full_name":"([^"]+)"`, `"title":"([^"]*)"`, `"linkedin_url":"([^"]+)"`
- **News items**: `"newsItems":\[(.*?)\]` — extract per-item `"title":"..."`, `"url":"..."`, `"date":"..."`. Filter to last 12 months by parsing the date strings (format like "May 09, 2023"). Useful triggers for the orchestrator's harness gate.

**Pick primary founder:**
1. First founder where `title` matches `/CEO|Chief Exec|Co-?founder & CEO/i` (case-insensitive)
2. Else first founder where `linkedin_url` is non-empty
3. Else **drop the company entirely.** Do not call `research` action=find_linkedin to guess — produces low-confidence matches and noise.

**HTML revision detection:** If >30% of candidates yield zero founders (regex didn't match), abort the run with: "YC company page structure changed — scrape regex needs updating." Don't silently degrade. Single-company misses are tolerable.

### Step 6: Build candidate list

Convert each surviving company into a candidate matching the canonical shape (defined in `pipeline-fill/RESEARCH-ENGINE.md`):

```
{
  full_name: <founder full_name>,
  first_name: null,  // engine resolves in Step 7
  last_name: null,
  company: <yc company name>,
  linkedin_url: <founder linkedin_url, canonicalized>,
  email: null,        // Phase B finds it
  person_id: null,    // engine resolves in Step 7
  title: <founder title>,
  raw_signals: {
    source: "yc",
    yc_slug: <slug>,
    yc_batch: <batch>,
    yc_team_size: <team_size>,
    yc_tags: <tags>,
    yc_locations: <all_locations>,
    yc_one_liner: <one_liner>,
    yc_news: <filtered news items, last 12mo, with title/url/date>
  }
}
```

The `yc_news` entries are pre-loaded triggers — Phase A's company subagent uses them in lieu of an extra WebSearch.

### Step 7: Pool exhaustion check

If the Algolia query returned `< count` total hits even before dedup:
- < 5 hits left → flag: "YC pool for these filters is exhausted — broaden filters or fall back to Sales Nav."
- < 20% pass-rate after dedup + founder-filter → flag: "YC pool drying up — consider broadening filters next run."

Embed the pool status in the candidate-list metadata so the orchestrator's report can surface it.

### Step 8: Hand off to /pipeline-fill (canonical handoff prompt)

Emit the canonical handoff prompt (defined in `pipeline-fill/RESEARCH-ENGINE.md`):

```
Candidate list ready: {N} prospects from yc.

NEXT: invoke /pipeline-fill Step 3 onward (deep research → harness gate → save) with this list and campaign {campaign_id}.

Continue automatically? (y/n)
```

- Operator answers `y` → continue into the engine doc's Step 3.
- Operator answers `n` → exit cleanly with the candidate list visible in chat.

## Edge cases

- **Algolia key extraction fails** (no candidates work): abort, single-line error pointing at the homepage structure.
- **>30% scrape failure**: abort, point at the company-page structure.
- **No founder LinkedIn for a company**: drop the company; never guess via the find_linkedin research action.
- **Pool exhaustion**: flag in candidate list metadata so the orchestrator's report surfaces it.
- **Operator gives no filters**: prompt for at least one. No silent defaults.
- **Operator gives `count` of 200+**: still works; expect ~30+ minute wall-clock for the full pipeline-fill flow.

## Notes

- **Sourcing phase is purely scrape-based** — no MCP/LinkedIn calls. Cheap to run repeatedly with different filters to find the right batch before committing to deep research downstream.
- **YC batch recency**: filter `launched_at_after` to the past 18 months gives a Series-A-shaped pool — most likely to clear ACV gates downstream. But don't apply silently; the operator should choose.
- **Algolia key rotation**: the key in YC's homepage HTML rotates on every server-side render. Don't cache across runs. The single-fetch-per-run pattern is correct.
- **Composability with /pipeline-fill**: this skill produces a candidate list. The orchestrator runs the engine. Operator can also run this skill standalone for "I just want YC, today" — answer `y` at the handoff prompt to continue into research.
