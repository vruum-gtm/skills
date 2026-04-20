---
name: engagement-triage
description: "Review and approve your pending LinkedIn engagement drafts and demand-gen content posts. Use when: triage engagements, review engagement queue, review warming comments, review nurture reactions, review marketing comments, review content drafts, check engagement queue."
---

# /engagement-triage

You review the user's pending LinkedIn engagement drafts (warming comments, nurture reactions, marketing comments) and demand-gen content posts, dispatching review subagents in parallel and presenting results for approval. Separate from `/outreach-triage` (which handles outreach messages).

## Why this is a skill and not just "call the tool"

Each engagement item carries context — the post being engaged with, the target persona, the sender's own voice and positioning, the draft comment. Reviewing inline burns tokens fast. Subagents with their own context windows do the review work and return compact verdicts.

## Subagent: `vruum-engagement-reviewer`

This skill dispatches the `vruum-engagement-reviewer` subagent (bundled at `agents/vruum-engagement-reviewer.md`). That agent reviews both engagement items AND content posts.

**Dispatch via the Agent tool** with `subagent_type: "vruum-engagement-reviewer"`. Supports `run_in_background=true` for parallelism.

Falls back to general-purpose subagent with MCP tool names in the prompt if the subagent type isn't recognized.

## Workflow

### Step 1: Summarize the queue

Call `get_marketing_overview` (single-company view) to see what's pending. Present a one-liner:

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

**Subagent prompt — engagement items:**

```
You are an engagement review agent.

{SENDER PROFILE block}

Engagement IDs: {comma_separated_engagement_ids}
Queue type: {warming | nurture | marketing}

Call get_engagement_review with engagement_ids="{ids}" and content_length="full" to load your items. Each item includes the original post, the target persona, match analysis, budget status, bundle info, and the draft comment.

For each item:
1. Voice fit — does the draft sound like the sender? (check SENDER PROFILE above; flag anything generic or out-of-voice)
2. Relevance — does the comment add value to the post's conversation, or is it a thin "great post!" type?
3. Relationship stage — is the engagement appropriate for where you are with this person? (warming = not yet in outreach, nurture = mid-conversation, marketing = brand surfacing)
4. AI tells — generic phrases, em dashes, overused words, robotic cadence
5. Strategic fit — is this specific post worth engaging with for this specific person, or is it a thin excuse?

If the draft needs editing, call manage_engagement with action=edit. If it's bad enough to drop entirely (off-persona, low-value, stale post), recommend skip.

Return:
ENGAGEMENT: {id} | TARGET: {person name} | TYPE: {warming|nurture|marketing} | RECOMMENDATION: {approve|edited|skip} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"}
```

**Subagent prompt — content posts:**

```
You are a content review agent.

{SENDER PROFILE block}

Post IDs: {comma_separated_post_ids}

Call get_content_review with post_ids="{ids}" and content_length="full" to load drafts. Each includes the post text, scheduled time, past-performance stats for similar posts, and calendar context.

For each post:
1. Voice fit — sounds like the sender? (SENDER PROFILE above; flag anything generic)
2. Hook quality — does the first line stop scroll? Is it specific and worth reading further?
3. AI tells — em dashes, AI-vocabulary ("delve", "robust", "comprehensive"), uniform sentence length, generic openers
4. Strategic fit — does this post serve the sender's ICP and positioning, or is it generic thought-leadership?
5. Calendar fit — appropriate timing relative to other recent posts? (get_content_review returns calendar context)

If the post needs editing, call manage_content_post with action=edit. If it's bad enough to reject, recommend reject.

Return:
POST: {id} | SCHEDULED: {time} | RECOMMENDATION: {approve|edited|reject} | CONFIDENCE: {high|medium|low} | REASONING: {1-2 sentences} | EDITED: {yes/no} | ISSUES_FOUND: {list or "none"} | HOOK_RATING: {1-10}
```

### Step 5: Present results — show drafts before approving

Group by recommendation:

1. **Clean approvals** — show the draft and a one-line "why it's good". Bulk-approve with one response.
2. **Edited drafts** — show the new version, what changed, why. User reviews each.
3. **Skip / reject** — show the draft and the issue. One action to confirm.

For content posts, always walk through one at a time — they're user-visible and higher stakes than a comment.

### Step 6: User overrides

- Pull full context for any item
- Adjust any subagent edit before approving
- Skip the whole queue type ("actually, don't review marketing, just warming")
- Ask to see a specific person's engagement history (`get_engagement_queue` filtered by person_id)

## Edge cases

**Tiny queue (10 or fewer total):** skip subagents, review inline with the user. Subagent overhead isn't worth it.

**Only warming, no content:** skip Step 4's content-post branch.

**Subagent can't reach Vruum MCP:** fall back to inline review. Tell the user: "Subagents can't reach Vruum MCP — run `claude mcp add --transport http --scope user vruum-local https://api.vruum.ai/mcp` once (OAuth), then retry."

**User wants to see past performance before approving content:** `get_content_review` already returns past performance stats per post — reference them in your presentation so the user can calibrate.

## After triage

Offer:
- "Want to review your outreach queue next?" (runs `/outreach-triage`)
- "Check your marketing overview?" (calls `get_marketing_overview` for a recap)
