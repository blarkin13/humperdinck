# Humperdinck — independent beta and buyer-validation protocol

**Status: PREPARED, NOT RECRUITED. Owner: Brian. Engineering and research support: ChatGPT.**  
**Launch Tasks:** row 36 (P1). Last prepared November 10, 2026. No recruitment, interviews, sales, consent collection or external outreach has occurred through this document.

## Objective and falsifiable questions

We need **independent evidence**, beyond the developer's own devices and impressions, that first-time creators can (1) understand the landing page, (2) install or access the software safely, (3) generate usable audio, (4) find help when stuck, and (5) say whether they would buy a properly disclosed Pro offer. Do not extrapolate market demand from page views, likes, click counts, or a hypothetical “yes” alone.

Questions:
- Can a new person understand what runs locally, what needs the network, and what hardware limitations apply?
- Can they get from site → download → first successful audio without intervention?
- How do quality, speed, installation friction, and stability compare to their current method?
- Is $49 lifetime Pro compelling given its proposed voice-design/cloning capabilities, device terms, and limitations? Distinguish preference from actual purchase.

## Sampling and recruitment — proposed pilot, not achieved

Invite **12 independent testers** (target four primary Windows users, four Apple Silicon Mac users, four Linux users), with a spread of CPUs, RAM, audio workflow and technical confidence. For the initial quantitative funnel, analyze all invited/started/completed denominators; don't treat tiny samples as representative. Include at least:
- 4 audiobook, long-form narration or podcast creators;
- 4 video/YouTube voiceover or tutorial creators;
- 4 educators, accessibility/audio or indie creative users.

These are target quotas; overlap is acceptable. Exclude the owner, primary developers and people who cannot freely criticize the software from the primary completion/willingness-to-pay measures. Record recruitment channel to avoid pretending a convenience sample is random.

Recruit **with permission**, via personal opt-in, niche creator communities' approved feedback threads, maker groups, and small creator communities where the owner participates. Check each community's rules *before* posting. Don't mass-DM, automate promotional replies, buy reviews or solicit fraudulent Product Hunt votes. Offer beta access and optional guided feedback, not payment coercion. Do not ask testers for copyrighted or third-party voice recordings; use built-in/consented material.

### Safe invitation (owner to send after review)

> I'm building Humperdinck, a desktop-first voice and narration studio. I'm looking for a few independent Windows, Mac and Linux testers to try a short first-run workflow and give candid feedback on installation, audio quality and what a paid edition would need to be worth buying. It's a beta, so issues are expected. Participation is optional; I won't ask for private recordings or account credentials. Details: https://humperdinck.studio/ . If you're interested, reply with your OS, approximate RAM and how you create audio. Please don't install an unsigned build if your system security blocks it.

### Optional screening (keep separate from public GitHub)

1. Your main operating system, version, RAM and (if known) GPU; no serial numbers or device IDs.
2. Your use case: narration / video voiceover / podcast / education / accessibility / other.
3. Current voice/audio tools and frequency of use; optional price of current tool.
4. Whether willing to do a 20–30 minute **optional** usability test, and whether an audio/screenshare recording is allowed separately (default no).
5. Contact permission and preferred method, with a clear opt-out. Do **not** publish names/emails.

## Test session protocol

Consent and safety before a test:
- Explain that it is beta software; no guarantee of uninterrupted performance or any particular model availability. Never encourage bypassing Gatekeeper, Smart App Control or OS security. Offer a browser-only observation path when installers are blocked.
- Ask each participant to use **synthetic, self-authored text**, built-in preset voices or their own **explicitly authorized** recordings only. No public figure cloning, private scripts, identifying screen details, third-party voices or copyrighted excerpts.
- Do not collect or require recordings, voice files, authentication tokens, browser history, device IDs or raw verbose logs. If a participant volunteers a screen recording, obtain distinct, revocable permission and agree on storage/retention before collecting it. Default: notes only.
- Share the privacy and consent policies available on the website. Participation and contact use require opt-in; never assume marketing consent from testing consent.

**Observer:** do not instruct unless the tester becomes stuck; note where they naturally look first. Use neutral language, avoiding hints about desired answers.

| Step | Participant prompt | Evidence to capture (without private content) |
|---|---|---|
| 1. Positioning | Open https://humperdinck.studio/ and say what this tool does and for whom | Accurate unaided description, confusion, seconds |
| 2. Compatibility | Find whether your computer can run it and any model/first-download caveats | Correct requirements found; barriers |
| 3. Acquire | Find the correct installer for your OS, or choose browser studio if needed | Link found; download succeeded; installer signature warning |
| 4. First session | Start safely and find a voice/preset and narration entry | Install/start outcome, time, stuck steps |
| 5. First output | Use a supplied 2–3 sentence *fictional* script; generate and listen | First successful output yes/no, elapsed time, error text sanitized |
| 6. Export | Export audio in an available supported format | Usable artifact yes/no; no need to upload artifact |
| 7. Correction | Change one line, regenerate and find help if something fails | Recovery success, assistance required |
| 8. Pricing | Show an *accurate, explicitly hypothetical* $49 one-time Pro offer with exact proposed features and limitations | Unprompted value response, buying intent, objections |

For a recording-free fictional test script: “The lighthouse stood above the quiet harbor. At sunrise, a small boat passed under the cliffs. The keeper opened the window and watched the sea.”

For testers who cannot install safely, classify “blocked at OS security / incompatibility,” not “passed”; offer screenshot-based buyer comprehension, but exclude from installation success denominator only if explicitly reporting a separate non-installer sample.

## Feedback questions (ask in this order)

1. What did you think Humperdinck would do before touching it?
2. Which part was hardest or most confusing? What did you expect there?
3. What is the most important job you would realistically use it for next week?
4. Rate setup ease, voice naturalness, consistency, speed, controls and trust, 1–5; explain the lowest.
5. Would you use the Free version instead of your current option? Why or why not?
6. What was missing or broken enough to stop you from returning?
7. What do you believe Pro adds, based only on the explanation? What feels unclear?
8. For the **hypothetical $49 lifetime Pro offer**, how disappointed would you be if you could not get it? (Very / somewhat / not disappointed). Why?
9. At $49 today, after seeing the actual capability limitations, would you: buy now if the checkout were live; request a reminder; keep Free; or decline? Ask what they would give up instead. **Do not collect payment or create a fake purchase.**
10. If Pro became available, may we contact you once about launch? (Separate explicit yes/no, not prechecked.)

Prefer behavioral results over intent. For stronger willingness-to-pay evidence, once live merchant approval and checkout consent are available, independently count real purchase conversions and refunds. An email waitlist or “would buy” answer is interest, not payment.

## Measures and proposed decision thresholds

These are **pilot acceptance hypotheses** to revise before running; no results exist yet.

| Metric | Denominator | Proposed signal |
|---|---|---|
| First successful audio without assisted troubleshooting | People attempting supported installation and speech generation | Aim ≥ 8 of 12 overall, report OS breakdown |
| Successful export | People who reached output task | Aim ≥ 80%; record actual counts |
| Critical problems | Unique completed sessions | No unmitigated P0 safety, privacy, security or data-loss issue |
| Task comprehension | All completing site step | Aim ≥ 10 of 12 accurately explain local-first with caveats |
| Purchase behavior | People shown accurate hypothetical Pro proposition | Report counts for each response; **no threshold** substitutes for paid conversion |
| Return intention | People who reached audio task | Quote reasons and compare against actual follow-up use if explicitly consented |

Avoid averages without raw denominators. Include people who drop out and reasons when known; do not fabricate metrics. Segment by OS/use case but don't report precise personal details.

## Recording and triage

Store contact details and consent evidence in a **private access-controlled** tool, separate from the public repository. Create a random beta ID, e.g. `BETA-2026-001`. In a sanitized ledger record only: beta ID, session date, OS family, approximate RAM band, use-case category, step pass/fail, time-to-first-audio if known, blocker category, comfort ratings, pricing response, issue link, follow-up permission flag. Never attach raw scripts, audio, email, signed consent, unredacted screenshots or crash dumps to GitHub.

If an issue appears, open a repository issue with a beta ID and sanitized repro:
`[BETA] OS / version — expected vs actual — minimal synthetic steps — severity — candidate fix — acceptance`.
Escalate any release-blocking defect into the relevant existing P0/P1 launch row. P0 privacy/security/consent issues are launch blockers. Maintain a decision log: fix before launch / known limitation with disclosure / post-launch backlog / invalid or duplicate.

## Reporting and completion gate

At pilot end, produce: invitations sent, opt-ins, sessions started/completed, OS split, funnel counts, top five issues with severity and PRs, verbatim anonymized feedback with permission, hypothetical purchase interest *clearly labeled*, and go/no-go recommendation. Obtain owner's signoff.

**Row 36 can be COMPLETE only after real independent recruitment, sessions and documented results.** Preparing these materials alone moves it to **IN PROGRESS**, not COMPLETE.
