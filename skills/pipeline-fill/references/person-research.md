# Person research procedure

Use this procedure both inline and when delegating Phase B. Inputs are the
candidate identity and employer anchors, objective ICP, ACV floor, and Phase A
signals (possibly unknown). Use only allowed, actually available providers.
Return research; do not save a person, enroll them, or start outreach here.

1. **Check cached observations.** Resolve the existing person through `search`
   type=people and `fetch` type=person_research. Reuse source dates. A fresh
   result (normally within 14 days) is complete only when it also verifies the
   current employer through company ID or name plus a strong domain/website/
   company-page anchor. Otherwise continue resolving the missing evidence.
2. **Resolve identity.** Preserve an existing person ID. For a missing LinkedIn
   URL, `research` action=find_linkedin is available for an existing saved
   person, using only schema-supported overrides. For a new candidate verify
   identity from original allowed sources; never guess a profile URL or create
   a stub just to call an enrichment tool. If identity remains ambiguous,
   return unavailable and explain the unresolved match.
3. **Read the current profile.** When LinkedIn is permitted and connected, use
   `research_lookup` action=linkedin_fetch with company/posts requested as
   needed. This can register a view and consume activity allowance. On 429 or
   timeout do not retry or switch providers to evade the limit; return the
   unavailable/partial state. For an explicitly different source policy use
   allowed original evidence, recording any profile coverage limit.
4. **Verify current employer and tenure.** Prefer the current work-experience
   entry, not the candidate's guessed or former employer. Preserve canonical
   first/last names, role/title, role start date, employer name and anchors.
   Record a job change as evidence; do not silently retain a stale company.
5. **Find a work email if needed and authorized.** Use `research_lookup`
   action=find_email with verified first/last name and current company domain.
   Preserve provider confidence and any identity conflict. Missing email is
   pending, not automatic disqualification for a LinkedIn-capable motion.
   Do not invent an address or discard an existing person ID after a conflict.
6. **Read material beyond the profile.** Search relevant talks, interviews,
   posts and company mentions. Inspect at most five useful results per query
   and read up to two substantive pages per person before expanding scope.
   Use available host tools or connected web operations; no local tool is
   assumed. Source failures reduce coverage, not truthfulness requirements.
7. **Classify buying influence.** Senior includes founder/owner, C-suite, VP,
   director and head-of roles; mid includes senior manager, lead, principal
   and senior IC; junior includes associate/specialist/coordinator and other
   clearly non-buyer roles. For an ambiguous manager role, explain a mid-level
   inference rather than overstate authority. Tenure can support influence
   but does not prove budget authority.
8. **Extract useful signals.** Return three to five ICP-relevant topics when
   supported. Posts use `{text,posted_at?,share_url?,reaction_count?,comment_count?}`.
   Produce up to three opening hooks, each tied to a specific cited observation
   and the objective's value proposition; fewer real hooks are better than
   padded compliments. Do not imply private knowledge or fabricate quotations.
9. **Record dated triggers.** A recent role start (<12 months), topical post
   (<30 days), press mention (<6 months), or observed promotion can be a trigger.
   Preserve the original event date and URL. Do not invent a recency window
   for undated observations.
10. **Return the binding and result.** Include first/last name, current title,
    person/profile identity, employer anchors, email status/confidence, tenure,
    topics, posts, hooks, triggers, original per-field evidence and notes.
    Use `STATUS: ok|partial|linkedin_data_unavailable|company_unresolved|failed`.
    Save-ready company identity requires a canonical company ID or employer
    name plus a strong verified domain/website/company URL. If absent, report
    company_unresolved and do not invite a name-only save.

The engine owns the assessment and atomic save in Step 7, with its requested
mode and backend quality/company-binding checks. Missing Phase A evidence stays
unknown and earns no company/ACV or outbound points; do not silently redo paid
company work outside the assigned scope or claim a passing score from it.
