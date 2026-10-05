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

This is an analyst's job, not a batch import. The attribution step (which person? which deal?) is where a wrong guess does real damage — a meeting logged on the wrong account misleads whoever reads it next. So **you confirm every attach before anything is written**, the skill never auto-attaches an ambiguous match, and every retry checks the meeting and task receipts separately.

## What this needs

- **Drive connected to Vruum.** The transcripts must be syncing into the knowledge base via the connector. If KB search turns up none of your recent meetings, the connection may be down or PDFs may not be admitted — say so and stop; this skill reads what's synced, it doesn't fix the connector.
- **Vruum MCP** for: `search` (kb + people reads), `get_person_360`, `manage_person` (to log the meeting as a `meeting`-kind interaction), `manage_tasks`, `get_tasks`.

**Check the session's actual tools before proposing execution.** The backend may
implement a tool without advertising it to the harness. If either task tool is
unavailable, explain that meeting-to-task execution is blocked; prepare a
reviewable proposal only. Do not log the meeting first and then discover that its
approved tasks cannot be written. Drive connection health proves neither tool
availability nor automatic contact linking/task creation: those are this reviewed
workflow's separate steps.

### Step 1 — Establish the recency window, then find NEW transcripts

**This skill is incremental and go-forward.** It ingests only meetings newer than the last one already logged, and never re-ingests the historical archive (a connected Drive can hold years of old transcripts — those stay KB-searchable but are not turned into CRM activity/tasks).

1. **Get the watermark.** Call `get_daily_briefing` and read `latest_logged_meeting_at` — the date of the most recent meeting already logged for this tenant.
   - **Set** → the window is everything *after* that date.
   - **`null`** (no meeting logged yet — first run) → **ask the operator for a seed date** ("Ingest meetings since when? (default: last 30 days)"). Never silently default to the whole archive.

2. **Find candidates — deterministic recency listing, NOT a keyword search.** `search` type=kb with `filters={doc_type: "connector", modified_after: "<watermark or seed date, ISO-8601>", include_content: false}` and **no `query`**. This lists synced connector documents modified after the watermark, newest first (up to 100). Connector results carry `source_kind='connector'`, the Drive modification time in `modified_at` (not the meeting date), a Drive `url`, and often these filename shapes:
   - **Gemini:** `… - Notes by Gemini`, `… - Transcript`, `… - Live Notes`
   - **Read.ai:** `… - Read Meeting Report`, `… Smart Notes`

   > **Never use a keyword query for this step.** A query (e.g. "meeting notes transcript live notes") is a relevance-ranked top-N sample over the whole archive — on a Drive with years of old transcripts, recent meetings routinely fall below the relevance cutoff and the run wrongly concludes there is nothing new. Keyword search is fine later for looking things up; candidate discovery must be the `modified_after` listing.

3. **Keep only the meeting artifacts.** The filename shapes above are clues, not an allowlist. Exported notes can use a plain `YYYY-MM-DD - <meeting title>` name with no provider suffix. Inspect the summary and, when unclear, read the document before excluding it; meeting time, attendees and substantive discussion identify a meeting more reliably than its filename. Drop obvious non-meeting files (specs, sheets, decks). The Drive's historical archive is intentionally left KB-searchable-only, NOT re-ingested into the CRM. Logging an old meeting (and minting "follow up next week" tasks from a meeting that happened a year ago) is noise.

   > **The window field is Drive *modified* time, not the meeting time.** They usually track each other, but an OLD transcript someone re-edits re-enters the window looking "new" — check the meeting date in the title/content, and the Step 5 idempotency marker catches anything already logged. If the listing returns exactly 100 documents, the window overflowed and the OLDEST part was cut (results are newest-first) — tell the user and pull the remainder via the Drive MCP alternative below; a narrower window can NOT recover it (the filter is a lower bound only).

4. Present the surviving candidates as a short list: `name · meeting date · one-line summary`. **If none are newer than the watermark, say so and stop** — no new candidates were found in the inspected window. This is not a claim about uninspected history.

   A failed or timed-out listing is **unknown coverage**, never an empty result.
   Report the failing read and stop discovery; do not substitute a keyword sample
   and claim completeness. The latest logged meeting is only a recency hint,
   not a completed-import checkpoint: skipped/failed older meetings and late
   arrivals can remain behind it. Any recovery or historical pass needs an
   explicitly agreed window and a per-document completion ledger.

> **One meeting, one record.** Gemini + Read.ai often produce 3-4 artifacts per meeting (`- Transcript`, `- Live Notes`, `Read Meeting Report`, `- Chat`). Pick the single richest one (usually `- Transcript` or `Notes by Gemini`) and ingest that — don't log the same meeting multiple times.

> Alternative source: if you have a Google Drive MCP on the same Drive and a meeting hasn't synced into the KB yet, read it directly (`search_files` → `read_file_content` / `download_file_content`) and feed the text into Step 3. Lead with the KB — it's tenant-scoped and is what the connector already pulled.

### Step 2 — Read each chosen transcript in full

`search` type=kb with `filters={document_id: "<doc_id>", include_content: true}` returns the full document text. You need the whole transcript (attendees + the discussion), not a search snippet.

Check `truncated` and the actual content. A Read Meeting Report link, attendee
list, empty "Your Notes"/"Live Notes" template or "Recent Turn: ..." placeholder
is not a transcript. Mark it source-incomplete and request the substantive
artifact; do not infer action items from its title. If `truncated=true`, obtain
the complete source through an already-authorized read path or report the read
limit before extracting a supposedly complete action list.

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

**Idempotency check (do this before writing):** in `get_person_360` for the resolved person, scan recent **meeting** activity for the marker `[vruum-meeting:<doc_id>]`. If present, skip the meeting write. That marker does **not** prove its tasks succeeded: a run can fail after logging the meeting. Resume task writes only from the saved, approved task list with the same external IDs and original numbering; the task service returns an existing task on a sequential retry. If that proposal or its write receipts are missing, report the partial state for review instead of inventing a new task list. The marker must lead the summary because `get_person_360` truncates each activity description to ~200 chars.

The recent activity view is bounded. Absence there is not proof that an old
meeting was never logged. Historical reconciliation needs an exhaustive,
tenant-scoped marker check before writes. Run one writer at a time: the meeting
marker is a workflow check, not a database uniqueness constraint.

The user **approves / edits / drops individual tasks / drops the whole transcript**. Only what they approve gets written.

### Step 6 — Write (only the approved items)

For each approved transcript:

1. **Log the meeting** — call `manage_person` with the action that records a manual interaction/touch (its `interaction_kind: call|email|linkedin|meeting|other` action), with:
   - `person_id` = the resolved person
   - `interaction_kind` = `"meeting"`
   - `direction` = `"outbound"` (or `"inbound"` if the prospect convened it)
   - `occurred_at` = the meeting date as ISO-8601 from the transcript title/text, with its timezone resolved. If missing, ask; Drive modification time can be a later edit/export and must not silently become the meeting date.
   - `deal_id` = the resolved deal (omit if none)
   - `summary` =
     ```
     [vruum-meeting:<doc_id>] <1–2 sentence recap>

     Attendees: <names / emails>
     Source: <transcript filename> (Google Drive)
     ```
     The `[vruum-meeting:<doc_id>]` marker lets Step 5 detect a previously logged transcript within the returned activity history. It **must be the very first thing in the summary** — `get_person_360` truncates the activity description to ~200 chars, so a marker placed at the end is cut off and the duplicate check fails. Keep it verbatim, at the front.
2. **Name the meeting's purpose** — pass `purpose` on the `manage_person` interaction (step 1) when the transcript makes it clear: discovery, demo, proposal, negotiation, commit, kickoff, impact_review, renewal, expansion, winback, internal, other. A purpose you got wrong is corrected later with `manage_person` action=set_meeting_purpose (id = `li:<interaction id>` for a logged meeting, or the meeting id; payload={purpose}) — it moves the held event to the right practice. The held meeting's timeline event under its practice (`discovery_held`, `kickoff_held`, `impact_review_held`, …) is written by the backend from the purpose; you do NOT call `manage_account` action=record_impact for the meeting itself — a held meeting is not impact. Record impact only when the transcript states a RESULT the customer got (a value in a unit): then `manage_account` action=record_impact with a post-commit practice (onboarding | adoption | expansion), its event type, `value_delivered_numeric` and `value_delivered_unit`.
3. **Create each approved task** — `manage_tasks` action=create with:
   - `title` (the action item), `person_id` (+ `deal_id` if there is one)
   - `priority`, and `due_at` as ISO-8601 **only if** a date was actually parseable (omit otherwise)
   - `assigned_to` = the rep running this (leave to self; only assign a teammate if you know their Vruum user id)
   - `external_id` = `transcript:<doc_id>:task:<n>` — keep the approved list's original numbering, including gaps for dropped tasks. Save the approved proposal and each successful task ID before continuing. Retry the same IDs sequentially; never renumber or re-extract the task list during partial recovery.

### Step 7 — Confirm

Report concisely: **N meetings logged, M tasks created**, and anything **skipped** (already-logged, or unresolved). Distinguish reused tasks from newly created ones and report partial failures, unavailable tools, incomplete source text and discovery limits. Note that successfully created tasks will surface in `get_daily_briefing` (tasks due) and on each person's timeline (`get_person_360`). For any **unresolved** transcripts, list them so the user can create the people and re-run.

## Guardrails

- **Never attach on an ambiguous or missing match** — ask. Mis-attribution is worse than no attribution.
- **Never invent action items** — only commitments actually stated in the meeting.
- **You approve every write.** Nothing is committed without the Step 5 sign-off.
- **Reconcile before re-running.** Tasks dedup on stable `external_id` values; meeting checks use the `[vruum-meeting:<doc_id>]` summary marker. Multiple artifacts for one meeting, truncated activity history and partial task failures require explicit reconciliation. Do not promise an unconditional no-op.
