# Humperdinck — public launch distribution and communication plan

**Status: COMMUNICATION PLAN PREPARED — PUBLICATION HELD UNTIL OWNER RELEASE DECISION.**  
**Launch Tasks:** row 37 (P1). Prepared November 10, 2026; reconciled November 13, 2026. Owner approval, actual release acceptance and channel publication required.

## Positioning and source-of-truth claims

**One-line positioning:** “Create the voice. Tell the story.” Local-first desktop tools for voice creation, narration and voiceover. For Windows, Apple Silicon Mac and Linux hardware supported by specific models/builds.

**Audience priority:** (1) independent video/tutorial creators; (2) audiobook, podcast and narration makers; (3) educators, indie developers and privacy-conscious audio creators.

**Distinctive promise:** local speech generation on supported hardware after initial setup; voice library and narration controls in a desktop-oriented workflow. **Not** “every feature fully offline”: initial model downloads, account, online studio, downloads, updates and commerce may need internet. Voice cloning/design only with rights and signed speaker consent.

**Use publicly now when factually verified:** Free studio and current supported exports; browser preview; model selection; local-first architecture; compatibility requirements and limitations. Direct visitors to the official help/requirements page and current downloads section.

**Hold for Pro release:** a **planned $49 lifetime license** with 10-device terms, Pro Qwen design/cloning, account activation and offline license features. Do not claim the paid checkout is live, Pro is generally available, an installer is signed/notarized, all three OSes support all engines, or any unapproved voice pack ships. Check live site text and legal terms immediately before posting. Never promise “unlimited compute,” universal CPU speed, “perfect cloning,” privacy guarantees beyond the actual system or automatic consent verification.

**Strict feature exclusions:** No community library of downloadable cloned voices and no public AI song-cover platform. Do not add these to marketing or roadmaps.

## Launch gates before external promotion

Launch-readiness is not established by this document. Confirm these against the task tracker and exact release commit **before** public paid-release messaging:
1. Row 16 release gate and pricing approved; P0 commercial rights/consent/retention cleared; production merchant and tax/payment reconciliation accepted (rows 2, 7, 10, 11, 16, 21).
2. Publisher-signing/OS warnings accurately disclosed; signed/notarized status verified for the exact release or copy explicitly limits the claim (rows 19, 20).
3. Release artifacts match approved source version; downloadable Windows, macOS, Linux binaries, updater manifest/signatures, published SHA256 and actual representative installation tests are verified. Site links must return current release.
4. Help and requirements pages, support@ contact path, privacy/licensing/refunds and current Free/Pro differences match what ships. Account, checkout and refund issues resolved before purchase invitation.
5. Website test: desktop/mobile breakpoints, keyboard accessibility, CTA links, download-click correctness, live analytics read access and excluded owner test traffic as appropriate. Do not mistake clicks for installations.
6. Prepared demos use generated/original text and licensed or consented voices; publishing permissions and file provenance are archived.
7. A named launch-day operator can triage issues; rollback/stop-release plan exists; support and production alerting are accepted.

Until those gates pass, promote **beta testing / Free available features only**, with limitations.

## Distribution surfaces (in recommended order)

| Surface | Why | Preparatory action | Publication guard |
|---|---|---|---|
| Humperdinck website | Canonical explanation, screenshots and downloads | QA main CTA, requirements, help, exact artifacts and analytics | Only verified release links |
| Existing creator contacts and opt-in beta list | High-intent evaluation | Invite genuine feedback (see BETA_RECRUITMENT_AND_BUYER_VALIDATION.md) | Consent to contact; no purchased list |
| YouTube short demo | Demonstrate actual workflow and speed | Record a 60–90 s uncut first-generation example + full walkthrough; label hardware/model | No synthetic voice impersonation or misleading editing |
| Product Hunt | Broad early-adopter feedback | Prepare maker profile, logo, 3+ genuine product visuals, short demo, tagline, description and maker comment | Launch when production app actually works; ask for feedback, not upvotes |
| Reddit creator/audio communities | Detailed practical feedback | Participate authentically; read each community's rules and obtain moderator approval where required | No mass cross-posts, unsolicited DMs or repeated promotional links |
| Maker communities / indie software forums | Technical audience, beta testers | Post focused build story, performance tradeoffs, requests for bug reports | Do not imply a third-party endorsement |
| SEO/help/tutorial pages | Ongoing search discovery | Validate canonical, sitemap, technical walkthroughs, indexing and analytics | Ranking/indexing not guaranteed |
| Optional launch email | Notify people who *explicitly opted into* marketing updates | Send one launch note and a clearly functioning unsubscribe mechanism | Keep consent evidence and honor opt-outs |

Product Hunt's current guidance asks for a product name, tagline (≤60 characters), description (≤260), visuals and maker comment; it prohibits requests for votes. Community rules vary; Reddit bans repeated unwanted promotion. Check current platform guidance again at posting time:
- https://help.producthunt.com/en/articles/17350772-launch-guide
- https://help.producthunt.com/en/articles/17834537-4-build-your-product-page
- https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam

## Timeline keyed to launch readiness, not an invented date

**Before beta:** independent buyer-journey pilot has been owner-reported complete (Nov 13); exact participant outcomes are not claimed. Keep completed validation separate from planned media and public launch. Do not use a calendar date until dependencies are known.

**T−14 to T−7 days after launch approval:** capture real release UI, authentic audio samples and supported-OS screenshots. Draft release notes/changelog from tagged commit; rehearse downloads, first run, support route and checkout in correct environment. Build Product Hunt draft without publishing.

**T−6 to T−1:** reconfirm all P0 gates, owner-only analytics access and opt-out, signed artifacts, price/terms, support coverage and backup operators. Schedule channels only with owner approval; avoid pre-selling unapproved Pro.

**Launch day:** verify live site, installers and account checkout before posting any announcement. Publish website, then approved channel posts; personally answer questions, never ask for upvotes. Log source-tagged visits, clicks, actual installer-provider counts, support issues, genuine conversions, and failures as *separate metrics*. Decide stop/continue based on launch gates, not social attention.

**Days +1 to +7:** triage incoming issues each day, publish factual fixes with versions, answer feedback, compare audience intent with actual behavior, update FAQ; do not expose customer identities or voice recordings.

**Days +8 to +30:** summarize by channel, completion funnel, Pro paid conversion (only after genuinely live), support burden, defects and effective cost, and adjust next campaign and product backlog.

## Media assets to prepare

- 1200×630 Open Graph image (already referenced by site; visually inspect final version), brand logo with license, 3+ screenshots from exact release (Library, Narration, export or model setup).
- One 60–90 second walkthrough with transparent platform/hardware/model caption; another 15–30 second silent-caption loop for social use. No manufactured testimonials.
- Voice examples generated from self-authored text and cleared speaker permissions; provide transcript and accessibility captions. Avoid using a recognizable real speaker or copyrighted reading.
- Per-OS installer links, SHA256 sums, version label, requirements, known limitations and support URL. **Do not publish guessed file URLs.**
- Change log/release notes copied from verified merge history and tagged artifacts, not invented features.
- UTM-tagged campaign links optional. Never add visitor identifiers or private project data to URL query strings.

## Reporting dashboard (weekly)

Use a single dated operations table with channel, landing views, CTA clicks, confirmed downloads from provider, install completions reported by testers (if consented), first-audio completions, email opt-ins, verified purchases (when live), refunds, and support cases. Each number must name its source and period. Website page views are **not unique visitors**. GitHub assets have all-time download counts and do not distinguish the owner; button clicks are not completed installs. Avoid combining these denominators into a misleading conversion rate.

Suggested comparisons: landing → CTA on the *same* tracked landing session only if privacy-respecting event data actually supports it; pilot install → first-audio by anonymous beta ID; checkout initiated → verified paid status based on a vetted merchant ledger. Otherwise mark metric **unavailable**, not zero.

## Launch decision and signoff

Launch owner checks: exact Git SHA/version, successful operating-system installs, final marketing claims and Pro offer terms, payment/live commerce approval, legal/rights clearance, support coverage, monitoring alert acceptance, rollback procedure, and beta issue disposition. Record who approved and when **privately**, not in public source if personal/private.

**Row 37 tracks preparation of a usable distribution and communication plan; completed plan deliverables do not require actual third-party posting, which is a separate owner-controlled release-day action. Verify final release-specific copy/media, links, and approvals before using the drafts.** Actual launch/posting may be a separate release event; this document does not establish completion.

## November 13 reconciliation — small-business launch scope

- Launch has **exactly four built-in Humperdinck voices**: Sarah, Jason, Kenny and Jerry. Do not reference additional launch voices or suggest a community voice library.
- The owner confirmed the independent beta/buyer-journey pilot is complete. Do not imply a specific sample size or any paid purchases from that confirmation.
- Support, billing, privacy and legal email aliases have been owner-tested in both Humperdinck Mail and Gmail. Keep these as support channels without new mail-archiving work.
- Marketing **planning** may be accepted independently of public publication. Final posts, video, release screenshots, paid checkout claims and any launch date require release-specific owner verification. No fixed date, new mandatory promotion channel, spending commitment or external counsel approval is introduced by this plan.
- A practical minimum launch is: verified website download CTA and requirements page, one accurate short announcement, a usable help/support route, and a brief authentic desktop demo if available. Product Hunt, Reddit and optional opt-in email remain discretionary rather than prerequisites.
