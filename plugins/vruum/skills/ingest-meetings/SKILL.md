---
name: ingest-meetings
description: >-
  Pull meeting transcripts from your connected Google Drive into Vruum. Attaches
  each transcript to the right person and deal as a meeting on their timeline,
  and turns its action items into tasks that surface in your daily briefing. You
  review every attach before anything is written; safe to re-run. Use when:
  ingest meetings, import meeting notes, pull transcripts, log my meetings,
  action items from meetings, Gemini notes, Read.ai transcripts, turn meetings
  into tasks.
---
# /ingest-meetings

Your meeting transcripts (Gemini Meet auto-notes, Read.ai reports) land in Google Drive. With Drive connected to Vruum, those transcripts sync into your knowledge base — but on their own they're just searchable text. This skill turns them into CRM activity: each transcript gets **attached to the right person and deal as a meeting** on their timeline, and its **action items become Vruum tasks** that show up in your daily briefing.

This is an analyst's job, not a batch import. The attribution step (which person? which deal?) is where a wrong guess does real damage — a meeting logged on the wrong account misleads whoever reads it next. So **you confirm every attach before anything is written**, the skill never auto-attaches an ambiguous match, and it's **safe to re-run** (already-logged meetings and tasks are skipped, not duplicated).

## What this needs

- **Drive connected to Vruum.** The transcripts must be syncing into the knowledge base via the connector. If KB search turns up none of your recent meetings, the connection may be down or PDFs may not be admitted — say so and stop; this skill reads what's synced, it doesn't fix the connector.
- **Vruum MCP** for: `search` (kb + people reads), `get_person_360`, `manage_person` (to log the meeting as a `meeting`-kind interaction), `manage_tasks`, `get_tasks`.

### Step 1 — Establish the recency window, then find NEW transcripts

**This skill is incremental and go-forward.** It ingests only meetings newer than the last one already logged, and never re-ingests the historical archive (a connected Drive can hold years of old transcripts — those stay KB-searchable but are not turned into CRM activity/tasks).

1. **Get the watermark.** Call `get_daily_briefing` and read `latest_logged_meeting_at` — the date of the most recent meeting already logged for this tenant.
   - **Set** → the window is everything *after* that date.
   - **`null`** (no meeting logged yet — first run) → **ask the operator for a seed date** ("Ingest meetings since when? (default: last 30 days)"). Never silently default to the whole archive.

2. **Find candidates.** `search` type=kb with `filters={query: "meeting notes transcript live notes", include_content: false}`. Connector results carry `source_kind='connector'`, the meeting date in `modified_at`, a Drive `url`, and predictable filename shapes:
   - **Gemini:** `… - Notes by Gemini`, `… - Transcript`, `… - Live Notes`
   - **Read.ai:** `… - Read Meeting Report`, `… Smart Notes`

3. **Apply the window — drop everything at/before the watermark** (or the seed date). The Drive's historical archive is intentionally left KB-searchable-only, NOT re-ingested into the CRM. Logging an old meeting (and minting "follow up next week" tasks from a meeting that happened a year ago) is noise.

4. Present the surviving candidates as a short list: `name · meeting date · one-line summary`. **If none are newer than the watermark, say so and stop** — there are no new meetings to ingest.

> **One meeting, one record.** Gemini + Read.ai often produce 3-4 artifacts per meeting (`- Transcript`, `- Live Notes`, `Read Meeting Report`, `- Chat`). Pick the single richest one (usually `- Transcript` or `Notes by Gemini`) and ingest that — don't log the same meeting multiple times.

> Alternative source: if you have a Google Drive MCP on the same Drive and a meeting hasn't synced into the KB yet, read it directly (`search_files` → `read_file_content` / `download_file_content`) and feed the text into Step 3. Lead with the KB — it's tenant-scoped and is what the connector already pulled.

### Step 2 — Read each chosen transcript in full

`search` type=kb with `filters={document_id: "<doc_id>", include_content: true}` returns the full document text. You need the whole transcript (attendees + the discussion), not a search snippet.

### Step 3 — Resolve the entity (the careful step)

For each transcript, work out **which person** it's with and **which deal** it belongs to. Mis-attribution is worse than no attribution — when in doubt, ask.

1. **Pull the attendees** from the transcript text (Gemini and Read.ai both list participants, usually with emails).
2. **Drop the internal side:** ignore attendees on your own company's email domain (that's you / your team, not the prospect). Ignore bare free-provider addresses (gmail.com, outlook.com, …) unless that's the only handle you have and the name clearly matches.
3. For each remaining external attendee, resolve against the pipeline:
   - `search` type=people with `query=<attendee email>` (exact email is the strongest key).
   - If email finds nothing, try `query=<full name>` and disambiguate by company.
4. **Exactly one confident match** → that's the person. Then `get_person_360` on them and pick the **open / most-recent deal** (ignore closed-won/closed-lost). If there's no deal, that's fine — attach to the person only.
5. **Zero matches, more than one, or low confidence** → **ask the user**: pick from the candidates, create the person (`manage_person` action=create with the attendee's name/email/company), or skip this transcript. **Never auto-attach a guess.**

### Step 4 — Extract the recap and action items (your judgment)

From the transcript text, produce:

- A **1–2 sentence recap** of what the meeting was about and where it landed.
- **Action items** — only concrete commitments or follow-ups that were actually stated ("send the pricing doc", "intro them to security", "follow up after their board meeting"). Do **not** turn every discussion topic into a task. For each: a short imperative `title`, the `owner` if one was named, a `due` hint if a date/timeframe was said, and a `priority` (low/medium/high). Cap at ~10 to keep signal high. If the meeting had no real follow-ups, that's fine — log the meeting with no tasks.

### Step 5 — Review (the approval gate)

Per transcript, show the user the complete proposal before writing anything:

- **Resolved entity:** person (+ company) and the deal it'll attach to.
- **Meeting:** the recap + meeting date.
- **Tasks:** the action-item list.

**Idempotency check (do this before writing):** confirm the transcript isn't already logged — in `get_person_360` for the resolved person, scan recent **meeting** activity for the marker `[vruum-meeting:<doc_id>]`. If it's there, this transcript was already ingested → skip it (don't re-log, don't re-create tasks). The marker must lead the summary (see Step 6) because `get_person_360` truncates each activity description to ~200 chars — a marker buried at the end is cut off and the scan misses it.

The user **approves / edits / drops individual tasks / drops the whole transcript**. Only what they approve gets written.

### Step 6 — Write (only the approved items)

For each approved transcript:

1. **Log the meeting** — call `manage_person` with the action that records a manual interaction/touch (its `interaction_kind: call|email|linkedin|meeting|other` action), with:
   - `person_id` = the resolved person
   - `interaction_kind` = `"meeting"`
   - `direction` = `"outbound"` (or `"inbound"` if the prospect convened it)
   - `occurred_at` = the meeting date as ISO-8601 (from the transcript title/text; fall back to the KB doc's date)
   - `deal_id` = the resolved deal (omit if none)
   - `summary` =
     ```
     [vruum-meeting:<doc_id>] <1–2 sentence recap>

     Attendees: <names / emails>
     Source: <transcript filename> (Google Drive)
     ```
     The `[vruum-meeting:<doc_id>]` marker is what makes re-runs idempotent (Step 5 scans for it). It **must be the very first thing in the summary** — `get_person_360` truncates the activity description to ~200 chars, so a marker placed at the end is cut off and the dedup scan silently fails (re-runs would create duplicate meetings). Keep it verbatim, at the front.
2. **Create each approved task** — `manage_tasks` action=create with:
   - `title` (the action item), `person_id` (+ `deal_id` if there is one)
   - `priority`, and `due_at` as ISO-8601 **only if** a date was actually parseable (omit otherwise)
   - `assigned_to` = the rep running this (leave to self; only assign a teammate if you know their Vruum user id)
   - `external_id` = `transcript:<doc_id>:task:<n>` — the backend dedups on this, so re-running never duplicates a task.

### Step 7 — Confirm

Report concisely: **N meetings logged, M tasks created**, and anything **skipped** (already-logged, or unresolved). Note that the tasks will now surface in `get_daily_briefing` (tasks due) and on each person's timeline (`get_person_360`). For any **unresolved** transcripts, list them so the user can create the people and re-run.

## Guardrails

- **Never attach on an ambiguous or missing match** — ask. Mis-attribution is worse than no attribution.
- **Never invent action items** — only commitments actually stated in the meeting.
- **You approve every write.** Nothing is committed without the Step 5 sign-off.
- **Safe to re-run.** Tasks dedup on `external_id`; meetings dedup on the `[vruum-meeting:<doc_id>]` summary marker. Running this twice on the same Drive is a no-op for already-ingested meetings.
