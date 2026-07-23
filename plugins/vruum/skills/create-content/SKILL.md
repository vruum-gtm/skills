---
name: create-content
description: >-
  Co-produce an on-voice LinkedIn content post — pull your own signal, steer the
  angle conversationally, draft in your voice, then save as draft, schedule, or
  publish. Use when: write a post, draft LinkedIn content, create content, post
  about, content co-production, help me write a post.
---
# /create-content

You co-produce a LinkedIn post in the seller's own voice. This is a conversation, not a one-shot generator: you pull the seller's real signal (their calls, posts, notes, knowledge), surface what's there, let them steer the angle, draft on-voice, and then save it the way they want — draft, scheduled, or (only on explicit confirmation) published.

The conversation IS the capture. You don't need a form — you need a topic and a back-and-forth.

## Step 1: Capture a lightweight topic

Open with a single question if the seller hasn't already said what they want to post about:

"What do you want to post about? A theme, a recent win, a take you want to put out — even a rough phrase is enough to start."

Keep it light. You're not locking a brief yet — you just need a seed string to retrieve relevant signal. Do not call any tool until you have at least a rough topic.

## Step 2: Resolve the author (whose LinkedIn account)

A client can have **multiple people**, each with their own connected LinkedIn account. The post must be drafted from the right person's signal and authored from their account. Before pulling any signal, find out who you're authoring as.

Call `fetch` with `type="settings"` and `subtype="channel_status"` and read `channels.linkedin_accounts` — a list of accounts, each with `account_id`, `account_name`, `user_id`, `user_name`, `user_email`, `status`, `connected`, `has_sales_nav`, and `quota`.

Then pick the author **`user_id`** to use:

- **`linkedin_accounts` is missing, empty, or the channel-status `fetch` call fails** → fall back to the legacy default: omit `author_user_id` entirely on the calls below and proceed. Never block content creation on this lookup.
- **Exactly one usable account** (one entry with a non-null `user_id`) → silently auto-select that account's `user_id`. Do **not** prompt. **Still pass it explicitly** in Step 3 and Step 5 — do not rely on omitting the param. Omitting it grounds the signal on *you* (the caller) and stores *no* author on the draft, and that single account may belong to a teammate, not you.
- **More than one usable account** → ask the operator **which person to author as**, presenting each option by `user_name` and `user_email`. The selectable unit is the **person (`user_id`)**, because the author `user_id` is the only selector the signal/draft tools accept — if one person has multiple LinkedIn accounts, this skill can't target them individually (say so if asked). Map the chosen person to their `user_id`.
- **Skip any account whose `user_id` is null/missing** when counting and presenting options (it isn't addressable as an author).

Hold the resolved `user_id` (or the decision to omit it) and use it consistently for both the signal pull and the draft.

## Step 3: Pull the seller's signal

Call `fetch` with `type="seller_signals"`, passing the rough topic as `draft_brief` in `filters`. **If you resolved an author `user_id` in Step 2, pass it as the `id` argument** so the signal is *that person's*, not the caller's. (Omit `id` only in the legacy-fallback case from Step 2.) The brief drives a semantic re-rank, so the more concrete the topic, the more relevant the returned evidence.

**Trust boundary — handle 403 honestly.** Authoring as another person is permission-guarded server-side (a non-owner can't author as a teammate). If this call (or the draft call in Step 5) returns **403**, STOP: tell the operator plainly that they aren't entitled to author as that person, and ask them to pick a permitted author or have an owner do it. Do **not** retry with the author param omitted — that would silently fall back to caller/company-scoped signal under a different identity than was asked for.

**Ground on `formatted_evidence`.** It is the EVIDENCE-wrapped rendering prepared for drafting — the surface you should read, quote, and reason over. The backend scrubs prospect names, emails, phone numbers, and URLs out of *everything* it returns (both `formatted_evidence` and the raw `bundle` text), so you don't have to police that yourself — there is no un-redacted surface on the response. Still prefer `formatted_evidence`: it is the prepared, sectioned grounding surface, where `bundle` is just the structured raw material behind it.

`formatted_evidence` can be `null`. Null-check it before using it:
- If `formatted_evidence` is present → use it as the grounding evidence in Step 4.
- If `formatted_evidence` is `null` (a `formatted_evidence_skipped_reason` of `bundle_empty` means there was no signal to draw on yet; any other reason means the evidence was withheld and the `bundle` text is redacted to empty too) → say so plainly and fall back to a **profile-only draft**: write from the company voice profile and the seller's stated topic alone, with no evidence grounding.

## Step 3.5: Check the calendar (optional)

This step is **optional** and **must never gate the loop**. It exists only to make the brief a little smarter, not to add a precondition before drafting. If you skip it, or it returns nothing, or it errors — proceed to Step 4 silently and draft anyway.

If a quick read of what's already on the content calendar would help shape the angle, call `search` with `type="content"` **once** (the default `days` filter window is fine — don't loop or page). Treat the returned `posts` (each with `topic_tags`, `status`, and `scheduled_at`/`published_at`) and the `summary` as planning context only, to:

- **Avoid theme clustering** — if a recent or upcoming post already covers this `topic_tags` theme, nudge the angle somewhere fresher rather than posting two near-duplicates close together.
- **Notice cadence gaps** — if the calendar looks thin lately, that's a soft reason to keep this one moving. This is best-effort only: the tool returns posts by recency (it lists what was created recently, not a precise scheduled-window view), so don't promise exact cadence math or specific dates — read it as a rough sense of "busy" vs "quiet," not a schedule.
- **Adapt a strong recent angle** — if a recent post's theme clearly resonated, consider building on it instead of repeating a weaker one. This is soft: the tool orders by recency, not performance, so treat "recent" as a hint, not proof that an angle worked.

Surface anything useful to the seller as a light suggestion ("you posted on this theme last week — want a different angle, or a follow-up?"), never as a blocker. If `posts` is empty, the tool is unavailable, or it errors, say nothing about the calendar and just continue. Do not retry it.

## Step 4: Surface the evidence and settle the brief

If you have `formatted_evidence`, show the seller the relevant points you found, in plain language:

"Here's what I found in your recent signal that fits this topic:
- [evidence point 1]
- [evidence point 2]
- [evidence point 3]

Which of these do you want to anchor the post on? And what's the angle — a lesson, a contrarian take, a story, an announcement?"

Let the seller refine. Iterate in conversation until the brief is **settled** — you and the seller agree on the angle, the anchor evidence, and the tone. Do not generate a draft while the brief is still moving.

## Step 5: Author on-voice in the harness — then save once

**The backend never writes content prose (VRU-676, permanently).** There is no post generator behind `manage_content` — `action="draft_post"` only returns authoring guidance. YOU author the post, here in the conversation, and this is a blank page, not a rewrite:

**Only once the brief is settled**, write the post yourself in the seller's voice:

- Ground it on the anchor evidence the seller chose from `formatted_evidence` in Step 4 (or the voice profile alone in the profile-only fallback). Quote their real signal; never invent specifics.
- Write like the seller talks — their phrasing, their stance from the settled brief — not like a content bot. The angle and tone you agreed in Step 4 are the spec.
- Keep it inside LinkedIn's 3000-char cap.

**Pre-check before saving.** Run the draft through `check_prose` with `{surface: "content_post", content: <post>}` and treat the `failures[]` as an advisory checklist: fix what you agree with, keep what the seller deliberately wants — the annotations are hypotheses recorded for learning, not a pass/fail loop, and the seller's voice wins. Hold on to the returned `rules_version`.

Then save it **once** with `manage_content` `action="draft"`, payload `{content, topic_tags?, client_rules_version?}`. **If you resolved an author `user_id` in Step 2, pass the same value as `author_user_id` in the payload** so the draft row is stamped with their `author_user_id` (this is what later carries the author through schedule/publish). Pass the *same* `user_id` you used for the signal pull — don't let signal and draft disagree. Omit `author_user_id` only in the legacy-fallback case. The same **403** trust-boundary rule from Step 3 applies here: on 403, STOP and ask for a permitted author — never retry with the param omitted.

`action="draft"` creates a new draft row every time it runs. Save **once** per post, then show the seller the saved draft and iterate by editing.

## Step 5.5: Attach media (optional — document/PDF carousel, image, or video)

Carousels (document posts) are the top-performing organic format. If the seller has (or you produce) a PDF, image, or video for this post:

1. Store the asset: `manage_campaign` kind='ad' action='store_creative'. Small files: payload `{asset_base64, filename}`. Real files (PDFs/videos — primary path): `{filename, size_bytes, content_type: 'application/pdf' | 'video/mp4'}` → PUT the file to the returned `upload_url` (`curl --fail-with-body -T <file> '<upload_url>'`), then call store_creative again with `{creative_id}` to finalize.
2. Attach it: include `attachment_creative_id` in the draft payload (or add it later with `action="edit"`). Explicit `attachment_creative_id: null` on edit detaches.
3. The stored `filename` renders as the LinkedIn document **title** — name it like a headline, not `export-final-v3.pdf`.
4. Before publishing, open the `attachment_url` from `get_content_review post_ids=[<post_id>]` and review the actual file — it publishes under the seller's identity.

The caption (`content`) is still required — an attachment never replaces the post text. Scheduled posts publish with their attachment automatically.

## Step 6: Iterate by editing — never re-save

When the seller wants changes (tighten the hook, change the CTA, fix a line), revise the text yourself and update the **existing** draft with `manage_content` using `action="edit"`, passing the updated `content`.

**Check every revision before submitting it**, the same way as the initial draft: run the revised text through `check_prose` with `{surface: "content_post", content: <revised post>}`, weigh the `failures[]` as advisory, and pass the returned `rules_version` as `client_rules_version` on the edit. `manage_content` draft and edit re-run the same deterministic lint server-side; annotations are recorded, never rejected. The one hard constraint is mechanical: keep the post inside LinkedIn's 3000-char cap, because an over-cap post fails at publish time.

Never call `manage_content` with `action="draft"` again for a revision — that spawns a duplicate draft row and loses the thread. One post = one draft row, edited in place.

`manage_content` operates on the existing draft row, which already carries the `author_user_id` you stamped at save time. You do **not** re-pass the author here — schedule/publish inherit it from the row.

## Step 7: Save — draft, schedule, or publish

When the seller is happy with the draft, ask how they want to land it. **Default to keeping it as a draft or scheduling it.**

- **Keep as draft** — do nothing further; the draft already exists and is visible at `/marketing/content`.
- **Schedule** — call `manage_content` with `action="schedule"` and a `scheduled_at` ISO-8601 timestamp. It auto-publishes when due.
- **Publish now** — this is destructive and irreversible, and it will fail (marking the draft unusable) if no LinkedIn account is connected. So treat it as a deliberate, confirmed action:
  - Never call publish as a probe or a default.
  - Only call `manage_content` with `action="publish"` **after** the seller has explicitly confirmed "publish now."
  - Always offer save-as-draft or schedule as the safer fallback when proposing publish.

**Author-scoped publish — the backend refuses to fall back to another identity.** Schedule/publish read the author from the draft row. For an author-scoped post (one you authored as a specific person in Step 2, so the draft carries their `author_user_id`), the backend resolves *that person's* LinkedIn account **strictly**: if their account is missing, disconnected, or its `quota` is exhausted at publish time, the publish **fails hard with an `Author account unavailable` error** instead of posting from another connected company account. So an author-scoped post can never silently go out under a *different person's identity* than the one you chose — the server enforces this, including for scheduled posts that publish later at worker execution time (long after this conversation). A legacy / no-author post (you omitted `author_user_id` in Step 2) keeps the old company-wide fallback — there's no specific identity to protect.

Because that hard failure lands at publish time — which for a scheduled post can be minutes or hours after you draft it — surface it **early** rather than letting the operator discover a dead, `failed` post later. So before you schedule or publish a post you authored as a specific person, **call the channel-status `fetch` (type=settings, subtype=channel_status) again — fresh, right now, immediately before the schedule/publish call.** Do **not** trust the Step 2 snapshot: an account can disconnect, change `status`, or exhaust its `quota` during drafting and refinement. Re-read `channels.linkedin_accounts` from this *new* response and find the author's account by the `user_id` you stamped on the draft, then:

- If their account is present, `connected`, `status` is healthy, and `quota` is not exhausted **in the fresh response** → proceed with schedule/publish as normal (still behind the explicit "publish now" confirmation above).
- If their account is **missing, not `connected`, shows a bad `status`, or has an exhausted `quota` in the fresh response** (or the fresh channel-status `fetch` call fails / omits `linkedin_accounts`, so you can't confirm the author's account is healthy) → **STOP. Do not schedule or publish.** The backend would reject this author-scoped publish as `Author account unavailable` anyway; tell the operator plainly so they don't end up with a `failed` post. Offer the safe paths: keep it as a draft, reschedule for after that person's account is reconnected / their quota resets, or pick a different permitted author and save a fresh draft as them. There is no "publish under a different identity" escape hatch for an author-scoped post — the server will not do it; to post from another account the operator must deliberately re-author and save the draft under that author (or with no author).

For a legacy / no-author post (you omitted `author_user_id` in Step 2) there is no specific author identity to protect, so the standard publish confirmation above is sufficient.

If the seller asks to reschedule a post that is **already scheduled**, be aware that rescheduling an already-scheduled post is not currently supported and may return a "not in draft status" error. Tell the seller this plainly rather than retrying blindly, and offer to keep the existing schedule.

## Notes

- Stay conversational. The value of this skill is the steer→author→schedule loop, not a one-shot blob. Surface evidence, let the seller choose the angle, and author only when the brief is settled.
- The seller's voice is the product. Ground the post in their real signal (`formatted_evidence`) whenever it's available; only fall back to a profile-only draft when there's genuinely no evidence to draw on.
- Be honest about gaps. If there was no signal to retrieve, say "I didn't find recent signal on this — here's a draft from your voice profile" rather than inventing specifics.
- This skill never deletes posts. If the seller wants to discard a draft, point them to `/marketing/content` rather than removing rows on their behalf.
