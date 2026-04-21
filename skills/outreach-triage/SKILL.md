---
name: outreach-triage
description: >-
  Review and approve your pending outreach drafts across LinkedIn and email. Use
  when: triage, review queue, morning review, check messages, approve outreach,
  what needs review.
---

## Auto-update check

Before starting, run `~/.vruum/bin/vruum-skills-update-check` (path relative to this repo). Interpret output:
- `UPGRADE_AVAILABLE <old> <new>` → mention the available upgrade in one line and offer `/vruum-upgrade`. Then continue.
- `JUST_UPGRADED <old> <new>` → acknowledge in one line, then continue.
- Empty → proceed silently.

Never block skill execution on this check.

# Outreach Triage

You are an outreach queue orchestrator. Your job is to efficiently process pending outreach messages by dispatching subagents who do review, research, and editing, then presenting results for approval.

## Why this skill exists

Reviewing outreach messages is context-expensive. Each message with full context (conversation thread, segment instructions, match analysis, company research) consumes significant tokens. This skill solves that by dispatching messages to independent subagents, each with their own context window, who do the deep review work and return compact summaries.

## Subagent architecture

This skill uses the custom agent `vruum-outreach-reviewer` (bundled at `agents/vruum-outreach-reviewer.md`). That agent has:
- Full Vruum MCP access (can call get_outreach_review, edit_message, search_knowledge_base, etc.)
- Web search for prospect research
- Complete review instructions baked into its system prompt

**Dispatch via the Agent tool** with `subagent_type: "vruum-outreach-reviewer"`. Supports `run_in_background=true` for parallelism. Falls back to the general-purpose subagent (with MCP tool names in the prompt) if the registered type isn't available.

For small queues (5 or fewer) or when subagents can't access MCP, review directly in the main session.

## Orchestrator Workflow

### Step 1: Get the lay of the land

Call `get_outreach_stats` to see the pending queue shape. Present a quick summary:

"You have X reply responses, Y pending T1s, Z T2+ follow-ups. [Any critical alerts.] Want me to run full triage or focus on a specific category?"

Keep it short. The user knows their queue — they just need the numbers to decide what to prioritize.

### Step 2: Build the dispatch list and categorize

Once the user says go (or picks a focus area), pull the lightweight message queue via `get_message_queue` with `status=draft` and `limit=100`. This returns message IDs, person names, categories, sequence numbers, and match scores WITHOUT message content. Very cheap on tokens.

Categorize into three processing groups:

1. **Reply responses** (category=reply_response) — someone replied, always P1, always human review
2. **Follow-ups** (sequence_number >= 2) — need research and quality check
3. **T1 initials** (sequence_number = 1) — usually structural check only

Present the queue composition before dispatching:

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

If a message needs fixes, edit it via edit_message. If personalization is weak, use search_knowledge_base to find better hooks.

Return a structured summary per message:
MESSAGE: {id} | PERSON: {name} | MATCH_SCORE: {n} | CATEGORY: T{n} | RECOMMENDATION: {approve|edited|flag|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"}

{user_notes}
```

#### Subagent prompt — Research mode (T2+ follow-ups, 1 per agent)

```
You are a prospect research and outreach review agent.

Message ID: {message_id}
Prospect: {person_name}, {title} at {company}
Message type: T{sequence_number} follow-up

Steps:
1. Call get_outreach_review with message_ids="{message_id}" and content_length="full" to get the current message, thread context, segment instructions, and match analysis.
2. Call get_person_research and get_person_360 for this person to get everything we know.
3. Call get_company_research to understand the company's product, positioning, and what problems it solves.
4. Search the web for this prospect and their company to understand what they actually do, what challenges they face, what they post about.
5. Call search_knowledge_base for any relevant intel.

Review the message against what you learned:
- Does the message accurately reflect what this prospect's company does?
- Is there a genuine problem this prospect has that your sender solves?
- Is the personalization based on real, verified information?
- Are there AI tells, cross-touch duplication, or structural issues?

If the message is good as-is, approve it. If there is clear opportunity to improve (weak personalization when rich signals exist, fabricated references, wrong framing), edit it via edit_message. Do NOT rewrite messages that are already solid just because you can.

Return a structured summary:
MESSAGE: {id} | PERSON: {name} | MATCH_SCORE: {n} | CATEGORY: T{n} | RECOMMENDATION: {approve|edited|flag|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"} | RESEARCH_SUMMARY: {2-3 sentences on what you found} | PROBLEM_IDENTIFIED: {yes/no/speculative} | REWRITE_REASON: {why you edited, or "n/a"}

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

### Step 6: User overrides

The user can always:
- Pull full context for any message if they want more detail
- Reject a message (it gets regenerated)
- Adjust any subagent edit before approving
- Switch modes mid-triage ("actually, research and rewrite the rest of these follow-ups")
- Ask to see a specific person's full conversation

### Step 7: Engagement queue (if time permits)

After outreach messages are processed, ask if the user wants to review the engagement queue (LinkedIn comments/reactions) via `/engagement-triage`. Lighter-weight review that can often be done without subagents since engagement items are shorter.

## Handling edge cases

- **Small queue (5 or fewer total):** skip subagent dispatch, pull `get_outreach_review` directly and review inline.
- **Small queue of follow-ups (5 or fewer T2+) with many T1s:** still use subagents for T1 structural review, review follow-ups inline.
- **User wants to review a specific person:** pull that person's conversation with `get_conversation` and review directly. No batch workflow.
- **Subagent can't reach MCP tools:** fall back to inline review.
- **Homogeneous T1 pattern:** if the first T1 batch all had the identical issue, fix the remaining in bulk with `bulk_manage_messages`. Confirm first.

