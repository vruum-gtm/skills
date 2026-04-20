---
name: diagnose-reply
description: "Diagnose why a reply happened — what worked or didn't in the outreach that triggered it. Use when: why did they reply, what worked, diagnose reply, reply diagnosis, analyze this reply, what caused this reply, reply analysis."
---

# /diagnose-reply

You diagnose individual replies to understand what worked (or didn't) in the outreach that preceded them. This turns every reply into a learning event.

## Step 1: Identify the reply

The operator will reference a person, a reply, or a conversation. Use `get_person_360` with `for_company` to load the full context: conversation thread, outreach plan, match analysis.

If the operator doesn't specify a person, ask: "Which reply do you want to diagnose? Give me a name, company, or message."

## Step 2: Read the conversation

From the person_360 response, read the full conversation thread. Identify:

- Which touch triggered the reply (the last outreach message before the reply)
- What strategy angle was used in that message
- What channel it was on
- What personalization hooks were in the message
- What CTA was used (question, calendar link, statement)
- What the reply actually says (positive, negative, question, objection)

## Step 3: Diagnose

Call `get_performance_metrics` with `for_company`, `view='funnel'`, and the segment_id to get segment-level reply rates by channel.

Synthesize a diagnosis:

"**Reply diagnosis: [person name]**

**The message that got the reply:** T3 via LinkedIn DM, 'workflow_pain' angle, referenced their recent job posting for DevOps engineer (specific signal), ended with a question about their current tooling.

**Why it likely worked:**
- Channel: LinkedIn DM has [X]% reply rate in this segment (vs [Y]% email)
- Angle: 'workflow_pain' converts at [X]% in this segment ([Z]x above average)
- Signal: Referenced a specific, verifiable company signal (job posting)
- CTA: Question CTA has [X]x lift over statement CTAs

**What's different from the ghosted messages:**
- T1 and T2 used 'cost_replacement' angle (segment average: [X]%)
- T1 had surface-level personalization (company name only)
- T2 had no question CTA

**The pattern:** This person responded when the message got specific about THEIR situation (job posting = current hiring pain) and asked a genuine question. The earlier touches were generic."

## Step 4: Suggest action

**If positive reply** (interested, wants to learn more, asks a question):
- "This combination is worth repeating: [angle + specific signal + CTA style]. Note it in your segment's strategy so the next batch follows the same shape."

**If negative reply** (not interested, wrong person, bad timing):
- "This is the [N]th rejection using the '[angle]' strategy in this segment. If the pattern holds, consider deprioritizing this angle for the segment."

**If objection or question** (pricing, timing, skepticism):
- "This is a live conversation. The reply response draft should address [specific objection]. Check the outreach queue — there may be a draft pending."

## Notes

- This skill is diagnostic, not prescriptive. It explains what happened; acting on the pattern (deprioritizing an angle, repeating a winning combination) is a separate, deliberate decision.
- When the conversation has many touches, focus on the touch that triggered the reply, not the full sequence.
- Always compare against segment averages to distinguish signal from noise. One data point doesn't make a pattern.
- If `get_performance_metrics` doesn't have enough data for the segment, say so: "Not enough segment data to compare against. This is a single data point."
