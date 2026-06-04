---
name: csv-pipeline-fill
description: >-
  CSV harness source for /pipeline-fill. Reads a CSV, auto-detects headers, maps
  columns, hands off to /pipeline-fill for harness deep research and import. Use
  when: import CSV, paste a CSV, csv import, prospect list from CSV, csv harness
  mode.
---
# CSV Pipeline Fill (harness source)

You are the CSV harness-mode source for `/pipeline-fill`. You read a CSV the operator provides (Apollo export, ZoomInfo, hand-built spreadsheet, LinkedIn export — anything), normalize columns to the canonical candidate-list shape, and hand off to the orchestrator.

**This is the harness counterpart to `/csv-platform-fill`.** The platform skill calls `start_csv_import` and lets backend agents do everything. This skill stops at producing a candidate list — Phase A and Phase B run in your chat session (your harness compute), and `save_discovered_person` is called only after the harness pre-filter gate passes.

## Inputs

- `file_path`: absolute path to the CSV. If not provided, ask for it. Common locations: `~/Downloads/`, `.context/attachments/` in the workspace.
- `segment`: target segment (single)
- `column_mapping` (optional): explicit `{header_name: canonical_field}` mapping if headers don't auto-resolve. Default: auto-detect.

## Workflow

### Step 1: Read the file

Use the `Read` tool on the absolute path. If the file doesn't exist, surface a clear error: "File not found at `{path}`. If it's in your Downloads folder, the path is typically `/Users/<you>/Downloads/<file>.csv`." Don't guess.

### Step 2: Detect delimiter + encoding

- **Delimiter:** read the first line. If it has more `;` than `,`, use `;`. If more tabs than commas, use `\t`. Default: `,`.
- **Encoding:** assume UTF-8. If decoding fails, fall back to Latin-1 and note the encoding in the report.
- **BOM:** if the first 3 bytes are `\xef\xbb\xbf` (UTF-8 BOM), strip them before parsing.
- **Header row offset:** if the first row has only one non-empty cell (likely a title or disclaimer), skip it and treat row 2 as headers.

### Step 3: Detect headers + map columns

The first non-empty data row after the header offset is treated as the header. Lowercase + strip whitespace from each header. Match against canonical fields:

- `name` ← `full_name`, `name`, `contact name`, `prospect`, `contact`
- `first_name` ← `first_name`, `first name`, `firstname`, `given name`
- `last_name` ← `last_name`, `last name`, `lastname`, `surname`, `family name`
- `company` ← `company`, `company name`, `account`, `organization`, `org`, `employer`
- `linkedin_url` ← `linkedin`, `linkedin url`, `linkedin_url`, `profile`, `linkedin profile`, `linkedin_profile`, `li_url`
- `email` ← `email`, `email_address`, `work_email`, `business email`
- `title` ← `title`, `job_title`, `position`, `role`

If `name` is mapped, defer the first/last split to the engine doc's Step 7 (canonical heuristic). If `first_name` + `last_name` are both mapped, use them directly.

### Step 4: Resolve ambiguous mappings

If any required field can't be auto-mapped (`name`/(first+last) AND `company`, OR `linkedin_url`), show the operator the detected headers + sample row and ask which column maps to which field. Don't guess silently — silent guessing is the source of "why did my CSV import 50 prospects with the wrong company" bugs.

For multi-column ambiguity (e.g. two columns matching `email`), pick the leftmost match and note it in the operator output.

### Step 5: Normalize each row

Per row:
- Strip whitespace from all fields.
- Lowercase emails.
- Validate `linkedin_url` matches `^https?://(www\.)?linkedin\.com/in/[^/?]+/?(\?.*)?$`. If invalid (e.g. `https://linkedin.com/company/...`), set to null and log.
- Strip query strings from LinkedIn URLs (`?utm_source=...` etc.) — canonicalize to `https://linkedin.com/in/<slug>/`.
- **Skip rows** where neither `linkedin_url` nor (`name` AND `company`) is present. Log the skipped count.
- **In-CSV dedup**: dedup the candidate list by lowercased `linkedin_url` (preferred), else by `<lowercased name> + <lowercased company>`. Log duplicates dropped.

### Step 6: Pre-filter on size

If the CSV has >200 rows after normalize+dedup, ask the operator: "CSV has {N} rows after dedup. Process all, or first M? (a/N)". Big CSVs eat real time + LinkedIn API quota in the deep-research stage.

### Step 7: Build candidate list

Convert each row to the canonical shape (defined in `pipeline-fill/RESEARCH-ENGINE.md`):

```
{
  full_name: <name field if mapped, else null>,
  first_name: <first_name field if mapped, else null>,
  last_name: <last_name field if mapped, else null>,
  company: <company>,
  linkedin_url: <canonicalized URL or null>,
  email: <email or null>,
  person_id: null,
  title: <title or null>,
  raw_signals: {
    source: "csv",
    csv_path: "<file_path>",
    csv_row_number: <row index, 1-based>,
    csv_extra_columns: { <header>: <value>, ... }  // any unmapped columns, preserved for ops
  }
}
```

The `csv_extra_columns` field keeps unmapped data on the candidate so an operator can later inspect it via `get_user_people` if a question comes up about why a particular prospect was imported.

### Step 8: Hand off to /pipeline-fill (canonical handoff prompt)

Emit the canonical handoff prompt (defined in `pipeline-fill/RESEARCH-ENGINE.md`):

```
Candidate list ready: {N} prospects from csv (after {dedup_count} dedup).

NEXT: invoke /pipeline-fill Step 3 onward (deep research → harness gate → save) with this list and segment {segment_id}.

Continue automatically? (y/n)
```

- Operator answers `y` → continue into the engine doc's Step 3.
- Operator answers `n` → exit cleanly with the candidate list visible in chat.

## Edge cases

- **Tabs/semicolons** as delimiter — auto-detected from first line.
- **BOM/encoding** — UTF-8 BOM stripped; Latin-1 fallback if UTF-8 fails.
- **Headers in row 2** — auto-detected when row 1 has only one non-empty cell.
- **Duplicate rows** — in-CSV dedup before handoff.
- **LinkedIn URLs with tracking params** — query string stripped during canonicalization.
- **Mixed name format** (some rows have full_name, others have first/last) — engine handles both via Step 7's identity-resolution flow.
- **Empty CSV** — orchestrator says "CSV has no data rows after dedup; nothing to research" and exits.

## Notes

- **Sourcing phase is ~free** (file read + parsing). Real-money costs live in `/pipeline-fill`'s deep-research subagents.
- **For backend-driven CSV import** (fire-and-forget, no in-chat research): the platform-mode CSV skill calls `start_csv_import` directly and lets backend agents do sourcing/research/gate. Pick this skill when you want to see the deep research happen in your chat instead.
- **Composability** with `/pipeline-fill`: standard pattern. Run this skill standalone for "I just want this CSV imported with deep research today" or invoke via the orchestrator's source picker.
