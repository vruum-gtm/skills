---
name: outreach-triage
description: >-
  Review and approve your pending outreach drafts across LinkedIn and email. Use
  when: triage, review queue, morning review, check messages, approve outreach,
  what needs review.
---
# Outreach Triage

You are an outreach queue orchestrator. Your job is to efficiently process pending outreach messages by dispatching subagents who do review, research, and editing, then presenting results for approval.

## Why this skill exists

Reviewing outreach messages is context-expensive. Each message with full context (conversation thread, campaign instructions, match analysis, company research) consumes significant tokens. This skill solves that by dispatching messages to independent subagents, each with their own context window, who do the deep review work and return compact summaries.

## Subagent architecture

This skill uses the custom agent `vruum-outreach-reviewer` (bundled at `agents/vruum-outreach-reviewer.md`). That agent has:
- Full Vruum MCP access (can call get_outreach_review, manage_messages, search, etc.)
- Web search for prospect research
- Complete review instructions baked into its system prompt

**Dispatch a subagent of role `vruum-outreach-reviewer`** via your runtime's native subagent mechanism (Claude Code's `Agent` tool with `subagent_type`; Codex's equivalent). Supports `run_in_background=true` for parallelism. Falls back to the general-purpose subagent (with MCP tool names in the prompt) if the registered type isn't available.

For small queues (5 or fewer) or when subagents can't access MCP, review directly in the main session.

## Orchestrator Workflow

### Step 1: Get the lay of the land

Call `fetch` with type=stats and subtype=outreach to see the pending queue shape. The response carries `needs_draft_count` (unauthored touches awaiting authoring) alongside `draft_count` (authored, awaiting approval) — surface both so the authoring backlog is visible up front. Present a quick summary:

"You have N to author (needs_draft, W of them WARM accepted-connection follow-ups), X reply responses, Y pending T1s, Z T2+ follow-ups. [Any critical alerts.] Want me to run full triage or focus on a specific category?"

**Warm follow-ups outrank everything except replies.** The stats payload carries `needs_draft_warm_count`: unauthored `linkedin_message` touches to people who ACCEPTED the connection request. These are the highest-EV rows in the queue — a person who said yes to the invite is waiting on a first real message. When non-zero, lead the summary with it and default the triage order to: inbound replies → warm follow-ups → everything else.

Keep it short. The user knows their queue — they just need the numbers to decide what to prioritize.

**needs_draft items EXPIRE.** A nightly backend sweep (03:20 UTC) rejects any `needs_draft` row older than 14 days from creation — intended garbage collection, not an operator action. An expired touch is not lost forever (the plan reschedules and mints a fresh row about a week later), but the authoring work is deferred a cycle and the queue silently shrinks. The tools tell you: the stats payload carries `needs_draft_expiring_soon_count` (rows within 3 days of the sweep — surface it in the summary when non-zero), and each needs_draft item carries `expires_at` (its sweep deadline). Consequence for triage: author oldest-first, and if the queue is too big to clear in one session, clear the items closest to `expires_at` rather than sampling the freshest.

### Step 2: Build the dispatch list and categorize

Once the user says go (or picks a focus area), pull the lightweight message queue via `search` with type=messages, `fields=compact` and limit=100 — make THREE cheap calls: `warm_only=true, status=needs_draft, sort_by=expiring` (the WARM authoring lane — LinkedIn follow-ups to accepted connections, nearest deadline first), `status=needs_draft` (the full authoring lane; warm rows appear here too — dedupe by message_id, warm lane wins), and `status=draft` (the review lane). `fields=compact` returns message_id, person_name, category, sequence_number, channel, status, match_score, touches_completed, campaign_id, first_content_touch, and channel_rewrite_reason WITHOUT message content — very cheap on tokens. Tag each item with its status so dispatch routes it to the right mode: `needs_draft` → authoring, `draft` → review. (Omitting the status filter returns the default actionable set — needs_draft + draft + approved — but pull the two lanes explicitly so already-approved messages awaiting send don't enter triage.)

**Frame by conversation state, not sequence number.** `first_content_touch=true` means this person has NEVER received a content-bearing message — their history is only connection requests (blank or noted). That item is an OPENER no matter its T-number (a T3 email that fell back from a never-accepted LinkedIn connect is still the first thing this person reads from the sender). `first_content_touch=false` means real prior contact exists — follow-up framing is legitimate. If the field is null/absent (rows drafted before this signal shipped, or an older backend), fall back to the sequence_number heuristic: seq 1 = opener, seq ≥2 = follow-up. The full block lives on the `get_outreach_review` item as `conversation_state` (`{v, first_content_touch, prior_context: none|note_only|inbound_only|content, connection_note_text, last_delivered_channel, designed_channel, channel_rewrite_reason, channel_fallback}`) — same absent-block fallback applies when `v` is unrecognized.

**Authoring mode (needs_draft items).** The backend no longer writes outreach prose — touches arrive as `needs_draft` items carrying the decision context (channel, touch number, signals) and no content. These are not rewrites; they are blank pages. For each needs_draft item the subagent AUTHORS the message: check the person's research freshness from the review item itself — `person_researched_at` / `company_researched_at` / `research_status` are on the payload, no extra fetch needed (older than ~14 days or missing → research first with WebSearch + the research reads, and persist what you learn via `research` action=save_person, plus action=save_company when you learned something about the company, so it compounds), then write the touch from scratch in the seller's voice against the same quality standards as any review, then check it — call `check_prose` with `{item_id: <message id>, item_type: "message", content: <draft>}` and treat the `failures[]` as an advisory checklist: fix what you agree with; severity `block` failures are hard stops that bounce at post time — today: channel character caps (cut to fit) and prior-outreach references on a first content touch (rewrite as an opener) — then submit it via `manage_messages` action=edit with the content and the returned `rules_version` as `client_rules_version` — that transitions the item to a normal draft — and approve only what the user's standing instructions allow. (The edit re-runs the same lint server-side; annotations are recorded to the label corpus, never rejected — a `block`-severity draft bounces with `prose_gate_blocked` + `failures[].fix` and a `span` naming the exact offending text.) Inbound replies also arrive as needs_draft (category inbound_reply, with the conversation attached): author the reply with full thread context. If a prospect turns out to be a bad fit at authoring time, skip the item and say why — authoring is the second qualification gate, not an obligation to write.

**Dispatch order within the authoring lane.** Pull the WARM lane directly — `search` type=messages with `warm_only=true, status=needs_draft, sort_by=expiring, fields=compact` returns exactly the LinkedIn follow-ups to accepted connections, nearest sweep deadline first, immune to page-1 truncation (warm rows are old by construction, so the default newest-first sort buries them under the cold backlog). Dispatch that lane first — they accepted the invite and the follow-up is the first real message they read. For the remaining lanes, compact rows carry `connection_status` if you need to spot stragglers, and `sort_by=expiring` works on any needs_draft pull.

**Expiry and recovery.** The 14-day sweep (see Step 1) means two things at authoring time:
- Order the authoring lane by `expires_at` (each needs_draft item carries it) — nearest deadline first, warm bucket before cold.
- An expired touch shows as `rejected` with BLANK content and `ai_decision_context.expired_signal` (reason `needs_draft_ttl_expired`) — GC, not a human rejection; do not read it as an operator verdict when diagnosing a campaign. (Rows expired before the marker shipped lack it — the tell there is blank content + `updated_at` near 03:20 UTC.) To revive one, call `manage_messages` action=`regenerate` (returns it to `needs_draft`), then author and `edit` as normal. Do NOT use `draft_followup` to recover an expired touch — it creates a NEW touch row instead of reviving the existing one.

**Conversation-state authoring rules** (from the item's `conversation_state`; skip when the block is absent):
- `first_content_touch=true` → write an OPENER: never reference prior outreach ("my last note", "since I haven't heard back", "bumping this" all bounce at the gate). Referencing THEIR world — posts, news, role — is what openers are made of.
- `channel_fallback=true` → the step was designed for `designed_channel` (usually a LinkedIn DM that never got the connection accept); the campaign's per-step instructions may describe the wrong channel. Always author for the item's actual `channel`, and make the copy stand alone there.
- `prior_context='note_only'` → the person got a connection request WITH a note (`connection_note_text` has the text — they may have read it). Don't parrot or duplicate it; referencing the connection event itself ("thanks for connecting") is fine once connected.
- `prior_context='inbound_only'` → the person has messaged the sender but never received content from them. Continue THEIR conversation — referencing their message is right; referencing "my previous outreach" is not.
- The block is frozen at draft time: if the item's `conversation_thread` shows an inbound message or delivered content newer than the draft, trust the thread over the block.
- If you believe prior contact happened outside Vruum (a call, a meeting, another mailbox), don't fight the gate — flag it to the user; an operator override is required.

Categorize into three processing groups:

1. **Reply responses** (category=reply_response or inbound_reply) — someone replied, always P1, always human review
2. **Follow-ups** (first_content_touch=false; fallback when null: sequence_number >= 2) — need research and quality check
3. **Openers** (first_content_touch=true; fallback when null: sequence_number = 1) — first real message regardless of T-number; full opener research standards, never "follow-up" framing

Present the queue composition before dispatching. For the counts in one call, use `search` with type=messages and `view=breakdown` — it returns grouped counts (by status, category, sequence/touch number, channel, and campaign) over the whole queue plus a compact items page, so you don't have to tally the pages yourself:

"Oaklet: 15 T1s, 5 T2s, 1 T3, 0 replies. How do you want to handle each group?"

This lets the user choose per category instead of applying one workflow to everything. Common patterns:
- "Approve all T1s" (if blank connection requests)
- "Research and rewrite the follow-ups"
- "Just quality check the follow-ups"
- "Show me everything"

If the user just says "go" or "triage it", use the default processing described below.

### Step 3: Dispatch with adaptive batch sizing

Batch sizes depend on the message type and processing mode:

**T1 initials — large batches (up to 15 per agent)**
T1s usually need only structural checks (blank vs not blank, char limits, no names in connection requests). Send them in large batches since the review is fast and uniform.

**Follow-ups (T2+) — individual agents (1 per agent) for research mode, batches of 5 for review mode**
- **Research mode** (default for T2+): each follow-up gets its own dedicated subagent that does full prospect research, web search, knowledge base lookup, and rewrites if there's opportunity to improve.
- **Review mode** (explicit "just quality check"): batch 5 per agent for structural review, dedup check, and AI tell detection. Lighter weight, faster.

**Reply responses — individual agents (1 per agent), always**
Replies are high-stakes and context-heavy. Always 1 per agent with full research.

Default to research mode for T2+ follow-ups. Use review mode only when the user explicitly asks for a lighter pass ("just check them", "quality review only").

#### Early pattern detection for T1s

After the first T1 batch returns, check if all messages had the same issue (e.g. all needed to be blanked, all had names in the connection request). If so, apply the same fix to the remaining T1s without waiting for more agents:

"First batch of T1s all had the same issue: [description]. Applying the same fix to the remaining N and approving. Sound good?"

This avoids spawning more agents to discover what the first one already found.

#### Subagent prompt — Review mode (T1s, light T2+ check)

```
You are an outreach review agent.

Message IDs: {comma_separated_message_ids}

Call get_outreach_review with message_ids="{comma_separated_message_ids}" and content_length="full" to load your assigned messages.

For each message:
1. Check structural compliance (touch sequence, char limits, channel)
2. Check cross-touch deduplication (read ENTIRE thread, flag ANY repeated stats/questions/social proof)
3. Check AI tells (banned words, em dashes, uniform sentence length, generic openers)
4. Rate personalization depth (surface/basic/deep)
5. Check strategic fit (CTA matches stage, moves conversation forward)

If a message needs fixes, run the rewrite through check_prose ({item_id: <message id>, item_type: "message", content: <rewrite>}) and weigh the failures[] as an advisory checklist — fix what you agree with; severity "block" failures are hard stops — today: channel character caps (cut to fit) and prior-outreach references on a first content touch (rewrite as an opener; the failure span names the offending text) — then edit it via manage_messages with action=edit, passing the returned rules_version as client_rules_version. If personalization is weak, use search with type=kb to find better hooks.

Return a structured summary per message:
MESSAGE: {id} | PERSON: {name} | MATCH_SCORE: {n} | CATEGORY: T{n} ({opener|followup} per first_content_touch, fallback seq#) | RECOMMENDATION: {approve|edited|flag|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"}

{user_notes}
```

#### Subagent prompt — Research mode (T2+ follow-ups, 1 per agent)

```
You are a prospect research and outreach review agent.

Message ID: {message_id}
Prospect: {person_name}, {title} at {company}
Message type: T{sequence_number} — frame by the item's conversation_state, NOT the T-number: first_content_touch=true means this is an OPENER (their history is only connection requests; never reference prior outreach); false means a real follow-up; block absent → treat T{sequence_number}>=2 as follow-up

Steps:
1. Call get_outreach_review with message_ids="{message_id}" and content_length="full" to get the current message, thread context, campaign instructions, and match analysis.
2. Call fetch with type=person_research plus get_person_360 for this person to get everything we know.
3. Call fetch with type=company_research to understand the company's product, positioning, and what problems it solves.
4. Search the web for this prospect and their company to understand what they actually do, what challenges they face, what they post about.
5. Call search with type=kb for any relevant intel.

Review the message against what you learned:
- Does the message accurately reflect what this prospect's company does?
- Is there a genuine problem this prospect has that your sender solves?
- Is the personalization based on real, verified information?
- Are there AI tells, cross-touch duplication, or structural issues?

If the message is good as-is, approve it. If there is clear opportunity to improve (weak personalization when rich signals exist, fabricated references, wrong framing), run the rewrite through check_prose ({item_id: <message id>, item_type: "message", content: <rewrite>}) and weigh the failures[] as an advisory checklist — fix what you agree with; severity "block" failures are hard stops — today: channel character caps (cut to fit) and prior-outreach references on a first content touch (rewrite as an opener; the failure span names the offending text) — then edit it via manage_messages with action=edit, passing the returned rules_version as client_rules_version. Do NOT rewrite messages that are already solid just because you can.

Return a structured summary:
MESSAGE: {id} | PERSON: {name} | MATCH_SCORE: {n} | CATEGORY: T{n} ({opener|followup} per first_content_touch, fallback seq#) | RECOMMENDATION: {approve|edited|flag|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"} | RESEARCH_SUMMARY: {2-3 sentences on what you found} | PROBLEM_IDENTIFIED: {yes/no/speculative} | REWRITE_REASON: {why you edited, or "n/a"}

{user_notes}
```

**Parallelism:** Spawn up to 7 subagents at once using `run_in_background=true`. For large queues (30+), process in waves.

### Step 4: Present results — always show messages

Do NOT auto-approve messages without showing them to the user. Present all results grouped by category.

**For T1s:** If all T1s had the same structural fix (e.g. all blanked), present as a single summary: "14 T1s all had pitched connection notes — blanked all of them. Approve the batch?" If mixed, show a one-liner per message.

**For follow-ups (T2+):** Always show the actual message text for every follow-up, along with the research summary. Group by recommendation:

1. **Clean approvals** (subagent says approve, no edits): Show the message and a one-line note. User can bulk-approve.
2. **Edited messages** (subagent rewrote): Show the new message, what changed and why, and the research summary. User reviews each.
3. **Flagged/rejected** (bad fit, no genuine problem, fabricated personalization): Show the message, the issue, and the subagent's recommendation. For rejections, present the option to reject + stop the outreach plan in one action.

**For reply responses:** Always show full context — the prospect's reply, the draft response, the subagent's analysis. Walk through one at a time.

### Step 5: Rejection cascade

When a message is rejected because the prospect is a bad fit (not because the message quality is poor), offer to stop the entire outreach plan:

"Sonia Tadjalli — no D2C signal at Sandoz, biosimilars don't go D2C. Reject message and stop outreach for this person?"

Bundles the two actions (reject message + stop plan) since a bad-fit rejection almost always means the outreach should stop entirely. Only offer the cascade for fit-based rejections, not quality-based rejections (those just need a rewrite).

Include a one-line `reason` on every reject/skip (e.g. `reason="no D2C signal, biosimilars don't go D2C"`) — reasons feed the prose_labels corpus that trains the prose gate.

### Step 6: User overrides

The user can always:
- Pull full context for any message if they want more detail
- Reject a message (it's discarded — nothing regenerates; to redo a draft instead, `regenerate` returns it to the authoring queue as needs_draft)
- Adjust any subagent edit before approving
- Switch modes mid-triage ("actually, research and rewrite the rest of these follow-ups")
- Ask to see a specific person's full conversation

### Step 7: Engagement queue (if time permits)

After outreach messages are processed, ask if the user wants to review the engagement queue (LinkedIn comments/reactions) via `/engagement-triage`. Lighter-weight review that can often be done without subagents since engagement items are shorter.

## Handling edge cases

- **Small queue (5 or fewer total):** skip subagent dispatch, pull `get_outreach_review` directly and review inline.
- **Small queue of follow-ups (5 or fewer T2+) with many T1s:** still use subagents for T1 structural review, review follow-ups inline.
- **User wants to review a specific person:** pull that person's conversation with `fetch` (type=conversation) and review directly. No batch workflow.
- **Subagent can't reach MCP tools:** fall back to inline review.
- **Homogeneous T1 pattern:** if the first T1 batch all had the identical issue, fix the remaining in bulk with a single `manage_messages` call passing an id array (same action applied to every id, max 50 per call). Confirm first.

