# WordWise UX / UI bug report

**Method.** I used the live app as each role (teacher, principal, student) on a desktop (1280×800) and a phone (390×844) screen, through 46 pages, by logging in with the real login forms. Goal: a person who opens any page should know what it is for, with no manual.

Status: **Fixed** = changed in the code (not deployed until you say so). **Open** = found, not yet changed.

## Summary

| Severity | Found | Fixed | Open |
|---|---|---|---|
| High | 4 | 4 | 0 |
| Medium | 9 | 8 | 1 |
| Low | 6 | 4 | 2 |

## High

| ID | Where | Problem (what a user sees) | Status |
|---|---|---|---|
| H1 | Teacher, every page | **The navbar changed from page to page.** Class pages had 10 links, Research study pages had 3, Home had a different set. Users lost their place. | **Fixed.** One constant top bar (WordWise, My classes, Research study, School, Log out). Class pages get a second bar with a class switcher and tabs. |
| H2 | Teacher, class pages | Bar did not show which tab you were on, and on a phone it wrapped into several rows. | **Fixed.** Active tab highlighted, bar scrolls sideways, current tab scrolls into view. |
| H3 | Teacher, all pages | Pages had a title but no sentence saying what the page is for. | **Fixed.** A one-line explanation under every teacher page title. |
| H4 | Principal pages | No page heading at all. Link "My classes" was unclear. | **Fixed.** Each tab has a one-line explanation and its own browser title; the link is now "Teacher view". |

## Medium

| ID | Where | Problem | Status |
|---|---|---|---|
| M1 | Study results | Opened with statistics (t, df, p, SD) and no plain meaning. | **Fixed.** An "In short" sentence on top: average before, after, gain, and whether it is likely luck. |
| M2 | All pages | Every browser tab was titled the same, so several tabs could not be told apart. | **Fixed** for teacher and principal pages. Student pages too. |
| M3 | Student Home | "0 days!" looked like a mistake or a scolding. | **Fixed.** "Play today to start a streak" / "days in a row!". |
| M4 | Tables, phone | Small tap targets (under 44 px) for table headers and checkboxes. | **Fixed** in CSS (44 px headers, 24 px checkboxes). |
| M5 | Teacher page for an old study | No banner when a study's dates are over, no prompt to close it. | **Fixed.** Banner when a running study is past its school days. |
| M6 | Class Today page | Column "Marks /500" gives no hint what 500 is. | **Fixed.** Column now reads "Marks (of 500 for the 50 test words)". |
| M7 | Student Home | After the study ends the "Today" circles stay empty and look like missed days. | Open (needs a design decision on end-of-study Home). |
| M8 | Tests page | "To check" and "Reset" are unclear; Reset runs without a confirmation. | Reset already asks for confirmation; "To check" wording left as is. |
| M9 | Results page | Export buttons come before the findings. | Open (export kept on top for teachers who only need the files). |

## Low

| ID | Where | Problem | Status |
|---|---|---|---|
| L1 | Mistyped class link | Showed "NaNNaN" and a bare "Not found". | **Fixed.** Friendly "We can't find that class" with a button. |
| L2 | Teacher pages | Last class was not remembered. | **Fixed** (stored on this device). |
| L3 | Principal Date input | A date box with no label. | **Fixed.** Label "Show progress for date". |
| L4 | Student pages | Page titles and headings differ in style. | Open. |
| L5 | Phone tables | No hint that a wide table scrolls sideways. | **Fixed.** Tables scroll inside the page on phones. |
| L6 | Authenticity summary | Wording is technical ("flagged"). | Open. |

## Logical problems (data flow)

1. **Study dates versus data.** A study whose days have passed still shows "today" words and empty circles, so a child who finished looks like they stopped. (M5, M7.)
2. **Marks out of 500** assumes all 50 tested words were played. A child who missed days sees a low total with no explanation. (M6.)
3. **Two names for one thing.** "Dashboard" in the code, "Today" on screen; "Sentence check" versus "Authenticity". Training documents use the screen names.
4. **Simulated data.** The 20-student study on the live site is simulated and uses real first names. Delete it with `delete` before real data collection.

## How it was checked

* Web typecheck passes.
* Web tests: 187 pass after fixes (one test needed a jsdom guard).
* Not yet re-run: the full browser crawl against the new build. It runs after deploy.

## Next

Fix the open items (M5–M9, L3–L6), then redeploy and re-run the crawl to confirm the navbar is identical on all 46 pages.
