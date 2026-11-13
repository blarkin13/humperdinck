# Humperdinck Mail — gated owner inbox rollout

**Status: staged code, not enabled in production.** No Cloudflare Email Routing rule was changed and no real customer messages were copied. The site already forwards support@, billing@, privacy@ and legal@ to the owner's Gmail inbox. Keep that forwarding working until all steps below pass.

## Purpose

A single owner-only inbox at `https://humperdinck.studio/mail/` with thread search/filter, safe text previews, download-original (`.eml`) including attachments, open/close state, and replies from the same branded address using Resend's outbound API.

The existing 4 inbound addresses remain in place. Once accepted, route each alias to the **existing Humperdinck Worker** with Cloudflare Email Routing's **Send to Worker** action. Its `email()` handler first forwards to the verified Gmail destination, then saves a bounded private MIME copy plus sanitized text metadata to D1/R2.

## Security and privacy

- **Default disabled**: `SUPPORT_MAIL_INBOX_ENABLED` and `SUPPORT_MAIL_SEND_ENABLED` must each be exactly `true`. No incoming rule is changed by this PR.
- **Owner web session only**: server-side equality with `ANALYTICS_OWNER_ACCOUNT_ID`, no desktop bearer access; cross-origin writes denied. Neither endpoints nor attachments expose public R2 URLs.
- **Private mail**: `MAIL_MESSAGES` is private R2, no custom domain and no r2.dev public access. D1 migration `0011_support_mail.sql` holds email addresses, message bodies, subject and status; these are customer personal data. Downloaded originals are forced attachments, not inline browser content. HTML messages are reduced to inert text.
- **Limits**: inbound MIME max 5 MiB saved (larger messages still forward to Gmail); text excerpts max 20,000 characters; replies max 8,000 characters; application cap 75 replies/day, beneath Resend Free's published 100/day. API key server-side only; no API key in GitHub or client HTML. Resend API requests use idempotency keys; ambiguous delivery status must be manually reconciled before retry.
- **Retention**: Never turn on storage until the owner has approved a support-correspondence retention period, deletion/hold policy and the new privacy disclosure. No automatic purge is performed by this PR; avoid accumulating customer messages before sign-off. Customer account-deletion procedures must recognize support/legal holds and purchased records.
- **No migration of historical Gmail mail.** Only incoming mail received *after* the Worker routes are switched will appear in this inbox.

## Cloudflare preparation (safe, no routing change)

1. Ensure the private R2 bucket `humperdinck-mail-private` exists and is bound to the production Worker as `MAIL_MESSAGES` (see `wrangler.jsonc`).
2. Apply `migrations/0011_support_mail.sql` **through the repository's migration workflow**; verify tables and migration bookkeeping, and take a D1 restore bookmark first. Never rerun automatic migration blindly after manual SQL.
3. Provision `SUPPORT_MAIL_FORWARD_TO` as a **secret** with the already verified Gmail destination. Verify `ANALYTICS_OWNER_ACCOUNT_ID` is still configured.
4. Leave both inbox and sending flags OFF until owner authentication, D1/R2, MIME, forwarding and privacy tests pass.
5. Deploy the reviewed Worker build, verify the public site and account behavior did not regress. Owner login `/mail/` should display "not enabled" until activation. Non-owner users must see no mailbox content.

## Resend (free sending tier)

1. Create a free Resend account, add/verify `humperdinck.studio` as a sender domain, and add only Resend's required DKIM / sender-domain DNS records. **Do not change Cloudflare's root MX records**, existing incoming Email Routing SPF/DKIM, or root SPF blindly; choose noncolliding sender subdomain records where Resend supports them.
2. Create a **sending-only** API key and store its value in the Cloudflare Worker secret `RESEND_API_KEY` (never paste into a document, PR or browser chat).
3. Verify the authorized sender domain in Resend, then set `SUPPORT_MAIL_SEND_ENABLED=true` only after a safe synthetic reply is accepted and the recipient confirms the visible From and Reply-To headers.
4. Resend Free currently advertises 3,000 messages/month and 100/day. Exceeding free limits or other Cloudflare free service quotas can create service restrictions or billing; never enable a paid plan/overages without owner approval.

## Inbound cutover — preserve Gmail

1. With a test alias or controlled window, change its Cloudflare routing action to **Send to Worker → humperdinck**. Do **not** create a second rule with the same pattern; only the first matching rule runs.
2. Send an independent harmless test email; verify all three events: Gmail forwarded receipt, thread appears only for owner, original download works. Test a reply through Resend and confirm delivery/threading. Test malformed MIME, duplicate message-id, wrong alias, and storage outages.
3. Only after a working test alias, switch support, billing, privacy and legal one at a time. Confirm no drops. Keep rollback details for immediately restoring each original **forward** rule.
4. Open mailbox to customer traffic only after real two-account authorization, XSS, attachments, retention, mailbox backups/restore and rate/limits testing. Security and legal readiness are release gates, not automatically satisfied by a merged PR.

## Limitations / follow-up

- Private original MIME is provided as a download rather than extracting individual attachments. Never display untrusted HTML or images inline.
- The list shows the 100 most recent threads and 150 messages per thread; the search field filters loaded threads only, not historical server-wide search.
- No team access, spam filtering, customer-search index, webhook delivery/bounce reconciliation, sent-message MIME archive or Gmail history import in this first gated version.
- This task remains **P1 Support and release operations: IN PROGRESS** until owner-run end-to-end acceptance; source engineering alone is not proof of successful email delivery.
