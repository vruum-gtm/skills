---
name: engagement-triage
description: >-
  Review and approve your pending LinkedIn engagement drafts and demand-gen
  content posts. Use when: triage engagements, review engagement queue, review
  warming comments, review nurture reactions, review marketing comments, review
  content drafts, check engagement queue.
---

## Auto-update check

Before starting, run `~/.vruum/bin/vruum-skills-update-check` (path relative to this repo). Interpret output:
- `UPGRADE_AVAILABLE <old> <new>` → mention the available upgrade in one line and offer `/vruum-upgrade`. Then continue.
- `JUST_UPGRADED <old> <new>` → acknowledge in one line, then continue.
- Empty → proceed silently.

Never block skill execution on this check.

# Engagement Triage

You review the user's pending LinkedIn engagement drafts (warming comments, nurture reactions, marketing comments) and demand-gen content posts, dispatching review subagents in parallel and presenting results for approval. Separate from `/outreach-triage` (which handles outreach messages).

## Why this is a skill and not just "call the tool"

Each engagement item carries context — the post being engaged with, the target persona, the sender's own voice and positioning, the draft comment. Reviewing inline burns tokens fast. Subagents with their own context windows do the review work and return compact verdicts.

## Subagent: `vruum-engagement-reviewer`

This skill dispatches the `vruum-engagement-reviewer` subagent (bundled at `agents/vruum-engagement-reviewer.md`). That agent reviews both engagement items AND content posts.

**Dispatch via the Agent tool** with `subagent_type: "vruum-engagement-reviewer"`. Supports `run_in_background=true` for parallelism.

Falls back to general-purpose subagent with MCP tool names in the prompt if the subagent type isn't recognized.

## Workflow

### Step 1: Summarize the queue

Call `get_marketing_overview` to see what's pending. Present a one-liner:

"X warming drafts, Y nurture drafts, Z marketing drafts, N content posts pending."

If everything is 0, say "Engagement queue is clear" and stop.

### Step 2: Choose scope

Ask the user:
- A) Full triage — warming → nurture → marketing → content, in order
- B) Warming only (LinkedIn comments on target posts to warm up a prospect before outreach)
- C) Nurture only (reactions + comments on customers/prospects mid-conversation)
- D) Marketing only (comments on broader demand-gen posts to surface your brand)
- E) Content posts only (your own outgoing LinkedIn posts)

If the user just says "go", default to A.

### Step 3: Pull sender identity (REQUIRED before dispatch)

Call `get_company_profile` to get the sender's identity, value prop, industry expertise, and background. Subagents need this to validate that drafts sound like the right person.

Include a SENDER PROFILE block in every subagent prompt:
```
SENDER PROFILE:
Name: {sender name}
Company: {company name}
What you do: {value_proposition}
Expertise: {target_industries}
Background: {founder_background}
```

### Step 4: Dispatch per queue

For each queue type the user selected, call the appropriate list endpoint, get IDs + lightweight context (no full content yet), then dispatch subagents.

**Warming / Nurture / Marketing engagements** — call `get_engagement_queue` filtered by `type` (`warming` / `nurture` / `marketing`). Batch 3-5 per subagent.

**Content posts** — call `get_content_review` for drafts awaiting approval. Batch 2-3 per subagent (posts are longer and need more careful voice check).

Spawn up to 4 subagents concurrently. For larger queues (15+), dispatch in waves.

Subagent prompt template:

```
You are an engagement review agent for {company_name}.

SENDER PROFILE:
{sender_profile_block}

Engagement IDs: {comma_separated_ids}

Call get_engagement_review with engagement_ids="{comma_separated_ids}" and content_length="full" to load your assigned items.

For each engagement:
1. Check voice fit against sender profile (would this person actually say this?)
2. Check relevance to the prospect's post
3. Check for AI tells (generic phrasing, hollow flattery, buzzwords)
4. Check for over-pitching (warming comments should NOT sell)
5. Rate quality: genuine value-add vs generic engagement

If a comment needs fixes, edit it via manage_engagement. Only edit when there's genuine improvement — don't rewrite solid comments.

IMPORTANT: Do NOT approve or skip engagements. Return recommendations only.

Return a structured summary for each item:
ENGAGEMENT: {id} | TYPE: {reaction|comment} | PERSON: {name} | SOURCE: {warming|nurture|marketing} | RECOMMENDATION: {approve|edited|flag|skip} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | COMMENT_TEXT: {the comment text, or "reaction" for likes}
```

For high-value comments (match score 80+, nurture, cold marketing), use research mode: 1 comment per subagent. The subagent reads the prospect's actual post via `get_person_360`, understands what they're saying, and edits only if there's a real opportunity to improve.

### Step 5: Present results — always show content

Do NOT approve engagements without showing them to the user.

**Reactions:** Present as a batch with count. "12 warming reactions — all look good. Approve?" If any flagged, show those individually.

**Comments:** Always show the actual comment text for every comment. Group by recommendation:

1. **Clean approvals**: Show comment text and one-line note. User can bulk-approve.
2. **Edited comments**: Show the new comment, what changed, and why. User reviews each.
3. **Flagged/skipped**: Show the issue and recommendation.

**Content posts:** Always show full post text with calendar context and past performance. User approves individually.

### Step 6: Skip cascade

When skipping an engagement because the prospect is a bad fit (not because the comment quality is poor), offer to stop the outreach/warming plan:

"Keith Hemmert (match score 33) — weak fit, no evidence of relevant practice. Skip this engagement and stop warming for this person?"

This bundles skip + stop plan since a bad-fit engagement almost always means warming should stop entirely. Only offer the cascade for fit-based skips, not quality-based edits.

### Step 7: Early pattern detection

After the first batch returns for any engagement type:

- **All reactions clean:** "First batch of reactions all approved. N more look similar — approve the rest?" Apply without more agents.
- **All comments have the same issue** (e.g., all too generic, all missing sender voice): Flag the pattern to the user. "First 8 comments are all generic 'great post' style — likely a prompt issue. Want me to edit them all with the same fix, or skip the batch?"
- **Systematic voice mismatch:** If comments consistently don't sound like the sender, flag it as a segment/prompt config issue rather than fixing each one individually.

### Step 8: Summary

After all queues are processed, present a summary:
- Total items reviewed
- Approved (with user confirmation)
- Edited and approved
- Flagged for review
- Skipped
- Plans stopped (from skip cascades)
- Content posts approved/scheduled

## Edge cases

- Queue <= 10 items: skip subagent dispatch, review inline
- Single item: review directly, no subagents
- Subagent MCP errors: fall back to inline review
- **Homogeneous pattern detected**: If first batch all has the same issue, apply fix to remaining without more agents. Confirm with the user first.

