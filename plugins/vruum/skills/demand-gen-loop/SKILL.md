---
name: demand-gen-loop
description: >-
  Run the full demand-gen motion end to end from your harness — set a goal,
  build the audience, co-produce the creative, get explicit approval, boost the
  published post, then monitor engagement and bridge engagers into outreach.
  Hands off to the specialist skills behind a HARD approval gate. Use when: run
  demand gen, demand gen loop, goal to boosted post, launch a paid post, boost a
  post, sponsor a post, full marketing motion, paid amplification.
---
# Demand-Gen Loop

You guide the seller through the whole demand-gen motion in one session: **goal → audience → creative → approve → boost → monitor**. You are a tour guide, not a textbook — you orient on the seller's real numbers, then **hand off** to the specialist skill that owns each piece. The value here is the *spine* that connects them and the **hard approval gate** that sits in front of any spend, not a re-explanation of work another skill already does.

**The rule that overrides everything: nothing spends and nothing publishes until the seller has explicitly approved copy, creative, budget, AND audience.** Default every step to `draft`. The loop can run all the way to "ready to boost" on its own; the seller's money and their public feed are the two things only they can authorize.

## Step 1: Goal intake — ground on who they are

Before talking about creative, read the account so the goal is grounded in their real ICP, signal, and history — never from memory:

- `fetch` type=seller_signals → what the seller actually has to say (their calls, posts, notes, knowledge). This is the raw material for the angle.
- `fetch` type=stats subtype=outreach → sends, replies, meetings — the demand baseline this post is trying to move.
- `fetch` type=settings subtype=profile → company profile / ICP completeness.

If `seller_signals` comes back empty (no calls/posts/notes yet), say so plainly and run a **profile-only** goal: build the angle from the company profile and the seller's stated objective alone. Don't invent signal you don't have.

Then settle a one-line goal with the seller in plain language: *who* they want to reach and *what* they want them to do (book a call, learn about a launch, hear a point of view). Hold that goal — every later step references it.

## Step 2: Audience — preview the cohort, iterate to the right one

Turn the goal into targeting criteria and **preview before committing**:

- `search` with `type="people"` and the criteria (include `filters={research_status: "all"}` so stub imports are visible). Read the **total count** and show a **5-row sample** (name, title, company, persona, the attributes that matched).
- Iterate the criteria conversationally until the cohort is the right size and shape for the goal. An empty preview means the criteria are too tight — loosen and re-run; never proceed to boost on a zero-count audience.

This is the same segmentation conversation `/campaign-builder` runs — **do not reproduce its steps here.** If the seller wants to turn this cohort into an outreach campaign too, hand off to **`/campaign-builder`**. For the boost itself the audience is **firmographic facets** — LinkedIn-native attribute targeting (titles, seniorities, industries, locations, company sizes), the same way LinkedIn's own boost targets. Resolve names to entity URNs FIRST via `fetch type='ads' subtype='targeting_entities'` (facet + q), then hold the resolved `{facets}` map. **`locations` is required** — a campaign without a location facet is rejected. (`{matched_audience_id}` still works when a pre-uploaded audience exists; `{criteria}`-built matched audiences are partner-gated on LinkedIn's side and return a clear error pointing back to facets.)

Hold the settled audience (the resolved `{facets}` map — shown to the seller as plain names with counts where available — or a `matched_audience_id`). It is one of the four things the seller approves in Step 4.

## Step 3: Creative — copy, then the visual (image OR video)

**Copy — hand off, don't write it here.** Invoke **`/create-content`** to co-produce the on-voice post. That skill owns author resolution, signal grounding, the steer→draft loop, and the publish guards — narrate it as it works, but never reproduce its drafting procedure. It leaves you a **draft** content post (its id is what Step 5 boosts). Keep the post a draft for now — publish is gated behind the seller's approval in Step 4. Two post-level decisions to settle WITH the copy (both settable at draft/edit):

- **Identity** — `author_identity: 'member'` (a person's profile → the boost runs as a **Thought Leader Ad**, awareness/engagement only, and the author must be authorized via `manage_campaign` kind='ad' action='authorize_author') or `'organization'` (the **Company Page** → all objectives, incl. clicks; needs the Page set once via action='set_page').
- **Destination** — if the goal is clicks, put the `external_link` on the post NOW (UTMs are stamped automatically). WEBSITE_VISIT without a destination is rejected at boost time.

**Visual — generate or supply it, then store it as a draft.**

- **Image**: generate with your own image tools, then store via `manage_campaign` kind='ad' action='store_creative', payload `{asset_base64 (raw base64, no data: URL prefix — renamed from image_base64 in VRU-726), generation_prompt, filename?, generation_provenance: {model, tool, generated_at, notes}}`.
- **Document / PDF carousel** (≤25MB — VRU-726, the top organic format): produce the PDF with your own tools, then store via the same action — small files: `{asset_base64, filename: 'my-deck.pdf'}` (no generation_prompt needed); real files (primary path): `{filename, size_bytes, content_type:'application/pdf'}` → returns a **presigned upload_url**; `curl --fail-with-body -T my-deck.pdf '<upload_url>'`, then call store_creative again with `{creative_id}` to finalize. The `filename` becomes the rendered LinkedIn carousel **title**. Attach to a post with `manage_content` action='draft'|'edit' payload `{attachment_creative_id}`, open the `attachment_url` from `get_content_review post_ids=[...]` to review the actual file, then publish.
- **Video** (mp4, ≤200MB, 3s–30min): store via the same action — `{media_url: <public https url>}` for a hosted file, or `{filename, size_bytes, content_type:'video/mp4'}` for the presigned flow above. Optional `{thumbnail_base64}`. **media_url stores are async** — poll `fetch type='ads' subtype='creative' id=<creative_id>` until `upload_status` leaves `'uploading'`; a `'failed'` status with a probe-code error means re-export the file, not retry. Videos attach to posts the same way (`attachment_creative_id` at draft/edit — the old publish-time `creative_id` param is retired), which also makes **scheduled video posts** carry their media.
- A stored creative (document/PDF, image, or video) attaches to the organic post at **draft/edit** (`manage_content` payload `{attachment_creative_id}`; explicit null detaches) — one asset serves the organic post AND the ad, and attachments persist on the row so scheduled posts publish with their media.

A video creative can ALSO run without any post as **Direct Sponsored Content** (`boost` with `creative_id` instead of `content_post_id`) — but DSC is **metrics-only**: no organic post means no engager bridge. Prefer the published-post path when the bridge matters.

## Step 4: HARD approval gate — the money-and-feed checkpoint

This is the load-bearing step. **Before any publish or any spend**, lay out all the pieces together and get the seller's explicit go-ahead on each — the original four PLUS the identity/objective pair VRU-659 added:

0. **Identity + objective** — which identity the ad runs under (`member` ⇒ Thought Leader Ad / `organization` ⇒ Company Page) and the LinkedIn objective (e.g. `WEBSITE_VISIT` for clicks — requires the destination link; `thought_leader` allows only BRAND_AWARENESS/ENGAGEMENT). Show the destination URL (with its UTMs) when there is one.

1. **Copy** — the exact post text from `/create-content`.
2. **Creative** — the stored visual (generation prompt + provenance).
3. **Budget** — the daily/total budget you're about to commit. Budget rides the money-gate: state the number in plain currency and get an explicit "yes, spend this."
4. **Audience** — the targeting (the facet names — titles/seniorities/industries/locations — or the `matched_audience_id`).

Invariants — these never bend:

- **No spend or publish before approval.** Until the seller has approved all four, you do not call publish and you do not call boost. Period.
- **Always default to draft.** Both the stored creative and the boost default to `draft`. Draft is the resting state; "live" is something the seller turns on, never something you assume.
- **Never auto-boost without explicit budget approval.** Do **not** call boost with `approval_mode='auto'` unless the seller has explicitly approved the specific budget in this step. `approval_mode='auto'` is what pushes real paid spend to LinkedIn; absent an explicit budget yes, you pass `approval_mode='draft'` (or omit it — draft is the default) so the campaign lands in the approval queue instead of spending.

If the seller hesitates on any of the four, stop at draft and leave the loop resumable — nothing is lost, nothing has spent.

## Step 5: Launch — publish, then boost

Only after the Step 4 approvals:

0. **Identity prerequisites (first run only)** — a Page campaign needs the Company Page set (`manage_campaign` kind='ad' action='set_page'; call with no organization_urn to discover the candidates); a Thought Leader Ad needs the author authorized (action='authorize_author'). Errors from boost name the exact fixing call — run it and retry rather than improvising.
1. **Publish the organic post** — first make sure the approved media is attached to the draft (`manage_content action=edit` payload `{attachment_creative_id}` — the old publish-time `creative_id` param is retired and now returns a 400), then `manage_content action=publish` on the draft from `/create-content`. This inherits `/create-content`'s author guard: if the chosen author's LinkedIn account isn't connected/healthy, publish fails hard rather than posting under another identity — surface that to the seller, don't retry blindly. **Wait for the post to actually be `published`** (a video publish transfers media and can take a while — re-read the post before boosting; never boost a still-publishing post).
2. **Boost the published post** — `manage_campaign` kind='ad' action='boost', payload `{content_post_id: <the just-published post id>, vehicle?, objective: <the approved objective>, budget: {daily_budget_cents | total_budget_cents}, audience: {facets} OR {matched_audience_id}, duration_days?, approval_mode}`. Vehicle is inferred from the post's identity — pass the objective explicitly (the default is BRAND_AWARENESS, which is NOT what a click campaign wants). Use the `approval_mode` the seller authorized in Step 4 — `draft` unless they explicitly approved the budget for `auto`. The boost double-submit case is handled for you (idempotent per source + audience + vehicle + objective), so don't paper over a retry with a second call. (DSC alternative: `creative_id` instead of `content_post_id` runs the video without a post — metrics-only, no bridge.)
3. **If the campaign involves a video ad**, the LinkedIn media upload runs in the background after approval — the response tells you; poll `fetch type='ads' subtype='campaign' id=<campaign_id>` (~every 30s) until it reports live or a failure with its cause.
4. **Thought Leader boosts return a Campaign Manager handoff, not a live campaign** — LinkedIn's public API cannot attach a member's post to the campaign (verified live), so the boost/approve response comes back with `tla_manual_attach_required` plus a Campaign Manager deep link and the exact attach steps (Ads → Add ad → Sponsor existing content → Thought leader content → pick the post; the member approves sponsorship once → Launch). Relay the link + steps to the seller verbatim; this is the expected TLA flow, not an error. **While in Campaign Manager, have them verify bidding** — the default can be manual CPM (~$10/1k impressions), which barely delivers; switch to Maximum delivery. After they launch, run `manage_campaign` kind='ad' action='resume' id=<campaign_id> to sync the local status to live. Page-identity boosts are unaffected (fully API-driven end to end).

Report back what went live: the published post and whether the boost is a draft awaiting approval in the queue, pushed live, awaiting the Campaign Manager attach (thought-leader handoff), or uploading video in the background.

## Step 6: Monitor + bridge to outreach

The loop doesn't end at "boosted." Teach the operating rhythm:

- **Engagement** — `fetch` type=post_analytics (omit the id for all posts, or pass the post id) for impressions / reactions / comments and the per-post `engagers` sample. `fetch` type=ads subtype=attribution for what the paid spend is attributable to.
- **The bridge is YOU** — engagers on your own published/boosted posts are captured, researched, and ICP-scored automatically, and then they WAIT: nothing auto-enrolls into campaigns (VRU-721). ICP-passing engagers land on the engager review surface (`get_engagement_review` with `source='engagers'`; near misses shown with their scores) and the daily briefing nudges when any sit undecided past 72h. Run **`/engagement-triage`** (scope: engagers) to decide each one — campaign add or one-off via the existing tools, then record the decision with `acted_via` so the boost→engager→outcome funnel in `fetch type=ads subtype=attribution` stays measurable. Point them there — don't reproduce its review procedure.

Close by naming what shipped this session (post live, boost drafted/pushed, first engagers visible) and what the next check-in should look at.

## Hard rules

- **Hand off, never re-teach.** `/create-content` owns copy, `/campaign-builder` owns campaign segmentation, `/engagement-triage` owns engagement review. When one of them owns a step, invoke it and narrate — if you catch yourself writing a numbered sub-procedure that already lives in another skill, stop and hand off.
- **Inherit every safety gate.** The publish author guard, the boost idempotency, the approval queue — they belong to the platform and the specialist skills. Never bypass, summarize past, or pre-approve through them.
- **The approval gate is not optional and not summarizable.** Copy + creative + budget + audience, each explicitly approved, before any publish or spend. Default to draft. Never `approval_mode='auto'` without an explicit budget yes.
- **Tailor from reads, not stereotypes.** Goal, audience, and angle all cite the seller's real numbers from Step 1. If a read fails, say what you couldn't see — don't fill the gap with a guess.
