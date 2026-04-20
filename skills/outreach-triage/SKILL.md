---
name: outreach-triage
description: "Review and approve your pending outreach drafts with parallel AI review. Use when: triage outreach, review queue, review pending messages, morning review, check my drafts, what needs approval, clear my queue, review messages."
---

# /outreach-triage

You review the user's pending outreach drafts, dispatch AI reviewer subagents in parallel to evaluate each message, and present results for approval. One company (the user's own), structured review, conversation-level edits where needed.

## Why this is a skill and not just "call the tool"

Reviewing outreach drafts is context-expensive. Each message carries the full conversation thread, segment instructions, match analysis, and company research. Pulling 20 messages inline blows out the context window. Instead, this skill fans out to subagents — each with its own context — who do deep review and return compact verdicts.

## Subagent: `vruum-outreach-reviewer`

This skill dispatches the `vruum-outreach-reviewer` subagent (bundled with this plugin at `agents/vruum-outreach-reviewer.md`). That agent has full Vruum MCP access and complete review instructions baked in.

**Dispatch via the Agent tool** with `subagent_type: "vruum-outreach-reviewer"`. Supports `run_in_background=true` for parallelism.

If the Agent tool doesn't recognize the subagent type, fall back to the general-purpose subagent with the message IDs and company context in the prompt — the subagent can still call Vruum MCP tools directly (`mcp__vruum-local__get_outreach_review`, etc.) as long as the Vruum MCP is connected.

## Workflow

### Step 1: Summarize the queue

Call `get_outreach_stats` to get counts of pending drafts by status. Present a quick summary:

"You have X pending drafts: Y reply responses, Z first-touches (T1s), W follow-ups (T2+). Run full triage, or focus somewhere specific?"

If the user just says "go", default to full triage.

### Step 2: Build the dispatch list

Call `get_message_queue` with `status=draft` and `limit=50` to get message IDs, person names, categories, and sequence numbers WITHOUT content (cheap on tokens).

Categorize into processing groups:

1. **Reply responses** (`category=reply_response`) — someone replied to you. High-stakes, always 1 subagent per message with full research.
2. **Follow-ups** (`sequence_number >= 2`) — existing threads. Research mode by default (1 subagent per message), or review-only mode if you request a lighter pass.
3. **T1 initials** (`sequence_number = 1`) — new cold outreach. Usually structural checks only (format, length, blank connection notes). Batch 5-8 per subagent.

### Step 3: Dispatch subagents in parallel

Batch sizes:

- **T1s:** 5-8 per subagent (structural review is fast and uniform)
- **Follow-ups in research mode:** 1 per subagent (each does deep prospect research + rewrite-if-needed)
- **Follow-ups in review mode:** 3-5 per subagent (light quality + dedup check)
- **Reply responses:** always 1 per subagent

Spawn up to 5 subagents concurrently with `run_in_background=true`. For larger queues (20+), dispatch in waves: first wave, collect, second wave.

**Subagent prompt — Review mode (T1s, light follow-up check):**

```
You are an outreach review agent. Review these messages:

Message IDs: {comma_separated_message_ids}

Call get_outreach_review with message_ids="{message_ids}" and content_length="full" to load your messages.

For each message:
1. Structural compliance (touch sequence, char limits, channel)
2. Cross-touch deduplication (read the full thread, flag any repeated stats/questions/hooks)
3. AI tells (banned words, em dashes, uniform sentence length, generic openers)
4. Personalization depth (surface/basic/deep)
5. Strategic fit (CTA matches stage, moves conversation forward)

If a message needs fixes, call edit_message. If personalization is weak, call search_knowledge_base for relevant hooks.

Return a structured summary per message:
MESSAGE: {id} | PERSON: {name} | MATCH_SCORE: {n} | CATEGORY: T{n} | RECOMMENDATION: {approve|edited|flag|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"}
```

**Subagent prompt — Research mode (follow-ups T2+, 1 per agent):**

```
You are a prospect research and outreach review agent.

Message ID: {message_id}
Prospect: {person_name}, {title} at {company}
Message type: T{sequence_number} follow-up

Steps:
1. get_outreach_review(message_ids="{message_id}", content_length="full") — message + thread + segment instructions + match analysis.
2. get_person_research and get_person_360 for this person.
3. get_company_research for the user's own company (product + positioning).
4. WebSearch for the prospect and their company — what they do, what challenges they face, what they post about.
5. search_knowledge_base for relevant intel.

Review against what you learned:
- Does the message accurately reflect what this prospect's company does?
- Is there a genuine problem the prospect has that this product solves?
- Is the personalization based on real, verified information?
- Any AI tells, cross-touch duplication, or structural issues?

If the message is solid, approve. If there's clear opportunity to improve (weak personalization when rich signals exist, wrong framing, fabricated references), edit via edit_message. Don't rewrite messages that are already good just because you can.

Return:
MESSAGE: {id} | PERSON: {name} | MATCH_SCORE: {n} | CATEGORY: T{n} | RECOMMENDATION: {approve|edited|flag|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"} | RESEARCH_SUMMARY: {2-3 sentences on what you found} | PROBLEM_IDENTIFIED: {yes/no/speculative} | REWRITE_REASON: {why you edited, or "n/a"}
```

### Step 4: Present results — show messages before approving

Never auto-approve without showing. Group by recommendation:

1. **Clean approvals** — show the message and a one-line "why it's good". User bulk-approves with one response.
2. **Edited messages** — show the new message, what changed and why, research summary. User reviews each.
3. **Flagged/rejected** — show the message and the issue. For bad-fit rejections, offer the cascade (see Step 5).

**For T1s with a homogeneous fix:** if the first batch all needed the same fix (e.g. all had pitched connection notes → blanked all), present once: "14 T1s all had pitched connection notes — blanked all of them. Approve the batch?" One decision instead of 14.

**For reply responses:** always walk through one at a time. Show the prospect's reply, the draft response, the subagent's analysis.

### Step 5: Rejection cascade

When a message is rejected because the prospect is a bad fit (not because the draft quality is poor), offer to stop the outreach plan for that person:

"Sandoz is biosimilars, no D2C signal — not a fit. Reject this message and stop outreach for this person?"

One confirmation, two actions (reject draft + stop plan). Only for fit-based rejections, not quality-based ones.

### Step 6: User overrides

The user can always:
- Pull full context for any message
- Reject a message (it gets regenerated)
- Adjust any subagent edit before approving
- Switch modes mid-triage ("actually, research and rewrite the rest of these follow-ups")
- Ask to see a specific person's full conversation

## Edge cases

**Tiny queue (5 or fewer total):** skip the subagent dispatch. Pull `get_outreach_review` with full content inline and review with the user directly. Subagent overhead isn't worth it.

**Mostly T1s, few follow-ups:** still subagent the T1s (one agent handles them all), review the handful of follow-ups inline.

**User wants to review a specific person:** pull `get_conversation` for that person and review directly. Skip the batch workflow.

**Subagent can't reach MCP tools:** if a subagent reports MCP connection errors, fall back to inline review. This usually means the Vruum MCP isn't set up for subagent inheritance. Tell the user: "Subagents can't reach Vruum MCP — run `claude mcp add --transport http --scope user vruum-local https://api.vruum.ai/mcp` once (OAuth), then retry."

**Large queue (30+):** warn the user it'll take a few minutes, dispatch in waves (5 subagents per wave), show progress between waves.

## After triage

Offer a quick followup:
- "Want to review your LinkedIn engagement queue next?" (runs `/engagement-triage` if they install it)
- "Check your outreach stats?" (calls `get_outreach_stats` for a quick snapshot)
