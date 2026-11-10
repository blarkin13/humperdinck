# Humperdinck — Support alias acceptance checklist
Updated November 10, 2026. This supplements [Support and Release Operations](./SUPPORT_AND_RELEASE_OPERATIONS.md). It is an **acceptance checklist**, not a claim that messages were sent or received.

## Current verified evidence (read-only)

| Alias | Cloudflare rule and verified forwarding destination | Independent recipient evidence | Authenticated brand reply identity |
| --- | --- | --- | --- |
| support@humperdinck.studio | PASS | PASS — November 9 Inbox message and owner receipt confirmation | NOT VERIFIED |
| billing@humperdinck.studio | PASS | NOT VERIFIED | NOT VERIFIED |
| privacy@humperdinck.studio | PASS | NOT VERIFIED | NOT VERIFIED |
| legal@humperdinck.studio | PASS | NOT VERIFIED | NOT VERIFIED |

Cloudflare Email Routing: all four rules enabled, one verified destination, disabled catch-all. Nov 10 Gmail read-only searches since Nov 8 found no incoming evidence for the three untested aliases; this is not evidence of misdelivery. The support confirmation is an incoming **Inbox** item from Nov 9; an earlier item in **Sent** alone is not proof of delivery. Avoid exposing the forwarding destination address, sender identities, message bodies or raw headers in GitHub issues or CI.

## Independent sender end-to-end test

Use an external email account **not** forwarding to the destination mailbox. Generate a unique random marker locally, e.g. `HDK-ALIAS-QA-<date>-<short-random>` (not a production secret). Send one short, harmless email to each unverified alias. Do not use customer information, recordings, recovery codes, payment records or signed consent material.

**Sample safe subject:** `HDK routing QA | billing | <marker>`
**Sample safe body:** `Routing acceptance test. Please do not take customer action. This message contains no customer data.`

For each alias, inspect Gmail's received **Inbox**, **All Mail** and **Spam**. Record only the marker, original `To` alias, whether `From` is genuinely independent, local receipt timestamp, and PASS/FAIL. Search by `to:billing@humperdinck.studio`, etc., but account for provider rewrapping and check message details if recipient labels differ. Never count a `SENT` copy or a Cloudflare rule as received-message proof.

### Reply-as acceptance

Cloudflare Email Routing handles forwarding only; it does not supply an authenticated SMTP sender for Gmail. In Gmail, an approved **Send mail as** alias requires a legitimate SMTP/verified sending arrangement. Verify sender-domain SPF/DKIM/DMARC alignment with the actual outbound provider before displaying the brand address to customers. Do not impersonate a sender through an unverified `From` header. From the verified sender, send one reply to the independent tester and check visible `From`, `Reply-To`, delivered Inbox status, and authentication results. Until then, reply from the existing legitimate Gmail identity and avoid promising a branded reply sender.

## Inbox ownership and incident handling acceptance

- Confirm a named primary and backup person to inspect Gmail's support, billing, privacy and legal messages. Proposed initial cadence during beta: twice per business day, plus emergency handling for severe incidents. This is an internal target, not a customer SLA.
- Review Spam and All Mail for missed routed items, especially new aliases; ensure account notification rules and Gmail filters do not silently archive them.
- Confirm how the backup operator is contacted if Gmail or the owner account is unavailable. Keep backup credentials out of GitHub.
- Keep case records confidential and minimal: random case ID, alias, broad category, severity, date, current owner, next action and closure; never publicly store account IDs, voices, signed consents or payment references.
- For privacy/deletion, use authenticated case review and the privacy runbook; incoming email is not a destructive action authorization.
- For revenue, refund and entitlement concerns, verify inside the merchant/account control plane. Do not solicit card numbers.
- Verify GitHub and Cloudflare issue notifications reach the designated mailbox and cannot be mistaken for customer support requests.

## Close criteria for Development Status row 26

1. Four aliases have independently verified inbound receipt, evidence retained privately.
2. A legitimate outbound brand identity is accepted, or the owner explicitly approves truthful Gmail-only replies and corresponding website wording.
3. Primary/backup inbox checks are assigned, with a tested backup escalation channel.
4. A support incident can be categorized, escalated, resolved and recorded using redacted evidence.
5. An owner accepts the operating procedure, with no unapproved customer response-time guarantees.

**As of November 10:** row 26 remains PENDING. PR for automated website contact-link checks is source-code quality evidence, not end-to-end mail delivery acceptance.
