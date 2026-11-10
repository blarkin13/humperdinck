# Humperdinck — task tracking instructions for Claude and all coding agents

The owner has explicitly set this workflow. Follow it on **every** task update.

**Live task tracker:** https://docs.google.com/spreadsheets/d/1YOVU4yKVWPPokc-RNrsSIFSx5eZmyGNRfat2oMePujE/edit?gid=1330604559

**Authoritative full task history:** https://docs.google.com/document/d/1kieGUQmSskXfnHud94hTTne43Vv_rBXSLj-Z5pb4qw4/edit

## Task register: all priorities

- Maintain every task in priority categories P0, P1, P2, and P3 when such tasks exist. No P3 tasks existed in the Nov 10 snapshot; do not invent tasks to fill a priority.
- Spreadsheet: one row per work item; concise priority, task name, status, current status note, contributors/assignee, short PR/commit identifiers, and **one** accountable person or entity in "Pending on".
- "Pending on" must be **a single named person or entity**, not "anyone", combinations like "Engineering + Brian", or a list. For the Production monitoring and incident alert acceptance task, **Pending on = Brian**. Completed rows use "None".
- Spreadsheet "Completion evidence": **short references only** (e.g. `Merged PRs #145, #146`, `PR #188; see Development Status`, or `Verified; see Development Status`). Never paste chronological research, CI logs, test steps, multi-paragraph notes, links or all acceptance criteria into a cell.
- Do not collapse work done by different people into a falsely attributed completion. "Suggested assignee" is only a coordination field; record who actually performed work from evidence, e.g. Claude / ChatGPT / Brian, with the relevant PR, test or owner report, separately from assigned owner.

## Development Status document: full detailed historical evidence

- This is the permanent **per-task** history for all active and completed tasks, with task description, acceptance/completion criteria, owner(s) and actual contributors, dated actions, PR numbers/commit SHAs, tests and CI outcomes, owner verification, limitations, blockers and final proof. Do not only archive completed tasks; track all priorities.
- The Nov 10 full-history register includes **all 42 existing task rows**, including full text previously stored in the spreadsheet, before compression. Older historical failures and "OPEN" statements must remain labelled as history even after a later merge.
- **Append** new dated progress under the corresponding task; preserve historical evidence. Do not replace, delete or silently rewrite old entries. Distinguish code merged, deployed, CI passed, and independently human-verified.
- Maintain the existing Google Doc headings and formatting; do not accidentally turn detailed paragraphs into H1 headings.
- Where a task is completed, link exact acceptance proof in the Doc. The spreadsheet needs only a short merger/verification reference and the current status.
- Never store passwords, private keys, secret values, personal voice recordings, or account recovery codes in either artifact.

## Document organization (owner requirement, November 10)

- **Section 1, Development Tasks** is the living, full-evidence record, placed near the very front of the Google Doc. It has two primary subsections: **A. What Still Needs to Be Done** and **B. What Has Been Done**. For incomplete tasks, keep the blocker or next step explicit ahead of the complete history. For completed tasks, keep the complete steps, contributors, testing, PRs, final proof and limitations. Group both sections by P0/P1/P2/P3 as applicable, retaining the source sheet row number. Update the existing task heading and keep it in the correct subsection when status changes.
- **Section 2, Historical Engineering Record** retains old milestone summaries and snapshots for audit only. Never add ordinary ongoing updates to Section 2 or create competing status dashboards. Add each new dated update to the matching task in Section 1 instead.
- Do **not** maintain parallel "Completed / What still needs doing / Future state" summaries as independent status sources. Any such news belongs as an update to the relevant task description. Group the task register by priority P0, P1, P2 and P3 only when tasks exist.
- Sections covering old engineering milestones and release notes are **historical context**, not a separate current task backlog. Keep them for traceability without mistaking an older open/pending statement for the latest state.
- Never append a free-floating multi-paragraph report to the end of the document without associating it with the matching task. Do not rewrite or discard the owner's preserved evidence when improving navigation and headings.
- For cross-cutting updates, reference the relevant existing tasks; create a new task only when truly outside the present scope and approved. Keep the Google Sheet concise and avoid contradicting its single Pending on owner.

## First-party voice rights (owner decision, November 10)

Brian confirms the seven built-in Humperdinck reference voices were made from his own recordings blended with Qwen. **Do not ask him to sign a release giving himself permission to use his own voice.** Record his first-party provenance statement and technical sample hashes, check any genuinely third-party sources and exact model/license terms, and leave legal advice to counsel if needed. A draft self-signature form was retired; it is not a launch gate. Continue to enforce commercial-release approval for actual third-party sound archives, frozen native dependencies, NOTICE obligations and any outside speaker recordings. Keep P0 status truthful until those remaining gates are verified.

## Changes and coordination

1. Read the tracker and relevant Development Status task first.
2. Add dated full evidence to Development Status, with the actual worker/owner and realistic scope; **confirm that archival succeeds before shortening tracker cells**.
3. Update only the corresponding spreadsheet row(s), keeping "Pending on" a single person/entity.
4. Preserve owner-authorized feature/pricing and release scope. Do not add requirements or redo completed acceptance without explicit owner direction.
5. If editing GitHub task guidance, keep these instructions in `CLAUDE.md` and `AGENTS.md` consistent.

This file is a durable instruction to Claude. Updating it does not itself deliver a live chat message to an independently running Claude session.
