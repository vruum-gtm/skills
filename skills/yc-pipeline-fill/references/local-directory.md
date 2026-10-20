# Optional local YC directory access

Use only when the host supports authorized local HTTP/file execution. These
steps return source records; the canonical skill owns filtering, founder
selection, current-employer verification, preview, and research authorization.

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
