---
name: engagement-triage
description: >-
  Review and approve your pending LinkedIn engagement drafts and demand-gen
  content posts. Use when: triage engagements, review engagement queue, review
  warming comments, review nurture reactions, review marketing comments, review
  content drafts, check engagement queue.
---
## MCP smoke test (run early)

Before triaging, confirm Vruum MCP is reachable. Call `fetch` with type=marketing, subtype=overview as a lightweight liveness check. On failure, surface this error and stop:

> Vruum MCP is not connected. Set up the MCP server (see Vruum docs) and re-invoke. Subagent dispatch needs user-scope MCP — cloud-mode MCP is not inherited.

Do not silently fall back to generic Claude responses.

# Engagement Triage

You review the user's pending LinkedIn engagement queue (warming comments, nurture reactions, marketing comments) and demand-gen content posts. Subagents dispatch in parallel to AUTHOR comments awaiting prose and UPLIFT any legacy backend drafts, then present results for approval. Separate from `/outreach-triage` (which handles outreach messages).

## Why this is a skill and not just "call the tool"

The backend no longer writes engagement prose (VRU-570: the harness authors everything). Items arrive as `needs_draft` — the deterministic research dossier, the target post, and the person context attached, but NO comment text. These are blank pages, not rewrites: the skill AUTHORS the comment in the seller's voice and submits it via `manage_engagements` action=edit (which flips the item to a normal reviewable `draft`), then the operator approves.

**Authoring is the second qualification gate.** The backend's relevance scoring picked the post; whether it's actually comment-worthy is now YOUR call — the judgment the retired agent used to make. If the post isn't worth a comment, recommend skip. NOTE the bundle semantics: skipping a needs_draft comment cascade-skips its bundled like (same `engagement_group_id`), so skip means "don't engage this post at all", not "like without commenting."

Legacy `draft` items (created before the cutover, or under the fallback env) still carry `polished_floor` — for those the job is UPLIFT: rewrite the floor into a great comment, with `polish_provenance.source="skill"` so the edit diff is captured.

Reviewing inline burns tokens fast. Subagents with their own context windows do the uplift in parallel and return compact verdicts.

## Subagent: `vruum-engagement-reviewer`

This skill dispatches the `vruum-engagement-reviewer` subagent (bundled at `agents/vruum-engagement-reviewer.md`). That agent reviews both engagement items AND content posts.

**Dispatch a subagent of role `vruum-engagement-reviewer`** via your runtime's native subagent mechanism (Claude Code's `Agent` tool with `subagent_type`; Codex's equivalent). Supports `run_in_background=true` for parallelism.

Falls back to general-purpose subagent with MCP tool names in the prompt if the subagent type isn't recognized.

## Workflow

### Step 1: Summarize the queue

Call `fetch` with type=marketing, subtype=overview to see what's pending. Present a one-liner:

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

Call `fetch` with type=settings, subtype=profile to get the sender's identity, value prop, industry expertise, and background. Subagents need this to validate that drafts sound like the right person.

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

**Warming / Nurture / Marketing engagements** — call `search` with type=engagements, filtered by source (`warming` / `nurture` / `marketing`). Batch 3-5 per subagent.

**Content posts** — call `get_content_review` for drafts awaiting approval. Batch 2-3 per subagent (posts are longer and need more careful voice check).

Spawn up to 4 subagents concurrently. For larger queues (15+), dispatch in waves.

#### What the subagent receives from `get_engagement_review`

The MCP payload now carries the full four-front-doors quality stack per item:

- `content` — what currently ships (= `polished_floor` when present, else `first_draft`)
- `polished_floor` — backend's shippable-floor output (this is what your uplift starts from)
- `first_draft` — pre-floor draft (use only for backward-compat fallback)
- `dossier` — research dossier (`post_entities`, `author_recent_posts`, `prior_interactions`, `knowledge_hits`). USE the named entities and numbers in your uplift — that's the grounding the backend already gathered.
- `pitch_phrases` — phrases that must NEVER appear in marketing comments (per-tenant value_prop language)
- `polish_provenance` — `{first_draft: {...}, polished_floor: {...skipped?, regressed?}, final?: {...}}`. Note whether the floor pass was `skipped` (model said the input was already good) or `regressed` (floor was worse and we reverted) — those signal that the input has known weaknesses.
- `validator_failures` — structural failures the backend recorded (e.g. `["banned_opener:Yep", "no_specific_marker:0/1"]`). Treat as a checklist to fix during uplift.
- `rules_version` + `schema_version` — backward-compat signal

**Backward-compat:** if `polished_floor` is null (old queue rows pre-migration), use `content` as your input and skip the dossier-anchored grounding.

Subagent prompt template:

```
You are an engagement uplift agent for {company_name}.

SENDER PROFILE:
{sender_profile_block}

Engagement IDs: {comma_separated_ids}

Call get_engagement_review with engagement_ids="{comma_separated_ids}" and content_length="full" to load your assigned items.

Each item gives you the dossier, polished_floor, first_draft, pitch_phrases, and
validator_failures. Your job is UPLIFT, not just review: take polished_floor and
make it materially better when you can.

Quality bar (ACQ framework):
- Acknowledge: reference a specific phrase/number/named entity from the post.
- Context: add information the post did NOT have — pull a specific fact from
  the dossier (named entity, number, prior post, KB hit). No fabrication.
- Question: optional. Skip ~60% of the time.
- Length: 15-40 words total. Hard limit 280 chars.

Hard constraints:
- No em-dashes (—) or en-dashes (–). No curly quotes.
- No banned openers (Yep, Great post, This is the part people skip, etc.).
- Three-beat structure (three equal-length sentences) is the #1 AI tell — avoid.
- No phrase from item.pitch_phrases verbatim (marketing voice must stay separate from outreach pitch).
- No company/product names, URLs, or CTAs.

For each engagement:
1. Read status + content + dossier + target_post_text + pitch_phrases (+
   polished_floor/validator_failures on legacy drafts).
2. Branch on status:
   **needs_draft → AUTHOR or FLAG** (this is the default post-VRU-570):
   - AUTHOR: write the comment from scratch — grounded in the dossier and
     the actual post text, in the seller's voice, against the same quality
     bars below. This is a blank page, not a rewrite. Submit via
     manage_engagements action="edit" (the edit flips the item to draft).
   - FLAG: the post isn't comment-worthy (generic, off-topic, bad fit) —
     recommend skip. Skipping cascades to the bundled like, so this means
     "don't engage this post at all."
   **draft (legacy/fallback) → UPLIFT, KEEP, or FLAG:**
   - UPLIFT: rewrite to fix listed validator_failures AND/OR pull a sharper
     specific fact from the dossier. Materially better, not lateral.
   - KEEP: polished_floor is already strong. Don't edit.
   - FLAG: structurally broken (off-topic, wrong stage, prospect bad fit).
     Recommend skip + plan-stop cascade.
3. If AUTHOR or UPLIFT, call manage_engagements with:
     action="edit"
     id="<id>"
     payload={
       "content": "<your uplifted comment>",
       "polish_provenance": {
         "source": "skill",
         "model": "<your model — claude-opus-4-7, claude-sonnet-4-6, etc.>",
         "at": "<ISO8601>",
         "rewrite_notes": "<one line — what you changed and why>"
       }
     }

IMPORTANT: Do NOT approve or skip engagements. Return recommendations only.
The operator approves in Step 5.

Return a structured summary for each item:
ENGAGEMENT: {id} | TYPE: {reaction|comment} | PERSON: {name} | SOURCE: {warming|nurture|marketing} | RECOMMENDATION: {authored|uplifted|kept|flag} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | AUTHORED_OR_UPLIFTED: {yes/no} | COMMENT_TEXT: {the comment text, or "reaction" for likes} | VALIDATOR_FAILURES_FIXED: {comma-separated, or "none"}
```

For high-value comments (match score 80+, nurture, cold marketing), use research mode: 1 comment per subagent. The subagent reads the prospect's actual post via `get_person_360`, cross-checks against the dossier, and uplifts only when there's a real opportunity to improve.

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

