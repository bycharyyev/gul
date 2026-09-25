# Design and app behaviour review

**Reviewed:** 2026-09-26 · **Method:** the live storefront measured in a browser (load, structure,
accessibility basics), the Flutter app read screen by screen and run on a physical Android phone
(update cards, push, forced update), and counts from the code. **Not done:** moderated user testing,
a full accessibility audit with a screen reader, iOS. Findings say which of these they rest on.

Priority: **P0** blocks launch · **P1** this quarter · **P2** when touched.

## Summary

The interface is coherent and technically careful: one brand system (violet to teal), three languages
end to end on mobile (a single hard-coded string found), a retry state on most mobile screens, a
storefront that loads in under a second. The gaps are in **behaviour under bad conditions** (offline,
slow networks), **accessibility depth**, and **consent**, and they matter more here than average
because the audience is in Turkmenistan, where connectivity and access to foreign services vary.

## Measured

Storefront home (`gulyaly.com`, desktop, live):

| Check | Result |
|---|---|
| Load event / time to first byte | 0.83 s / 0.36 s |
| Requests / transferred | 53 / 482 KB, no file above 200 KB |
| Images without alt text | 0 of 10 |
| Buttons without an accessible name, inputs without a label | 0, 0 |
| `lang`, single `h1`, viewport, meta description, canonical, Open Graph image | all present |

Mobile app (from the code, see FACTS.md): 13 feature areas, 41 screens, 53 test files; a retry or error state in 29
feature files; 25 tooltips or semantic labels and 10 `Semantics` widgets across the app; exactly one
accessibility test (large text scale).

## Findings

| ID | Pri | Finding | Basis |
|---|---|---|---|
| U-01 | P0 | A customer can pay and see "completed" for a top-up nobody delivered (mock gateway) | code and configuration |
| U-02 | P1 | The app has no notion of being offline | code |
| U-03 | P1 | Accessibility is shallow: few semantic labels, one test | code |
| U-04 | P1 | The cookie banner does not control anything | code and live |
| U-05 | P1 | Turkmen text has not been reviewed by a native speaker | process |
| U-06 | P2 | The update prompt has no destination until `update_url` is set | device test |
| U-07 | P2 | Release APK is larger than it needs to be | build |
| U-08 | P2 | The admin console is large for a small team | code |

### U-01 · "Completed" without delivery

With `TOPUP_GATEWAY=mock` and `TOPUP_ALLOW_MOCK_IN_PRODUCTION=true` (currently set), a paid order is
marked `COMPLETED` without contacting an operator. For a demo that is convenient; for the first real
customer it is the worst possible behaviour, because the app tells them it worked. This is a launch
blocker, tracked with the same item in the unit-economics review (E-02).

### U-02 · Offline and slow networks

There is no connectivity package and only one file mentions offline handling. Errors show a retry
button (good), but a person with an unstable connection sees empty error screens instead of the last
data they had. Only feed videos are cached on the device.
**Fix:** a small connectivity banner, and stale-while-revalidate caching for the catalogue, the
person's orders and their chats, so the last known state is shown with a "last updated" note.

### U-03 · Accessibility

Ten `Semantics` widgets and 25 tooltips across roughly 130 files means many icon-only controls have
no spoken name; the single accessibility test only checks large text. The storefront is better (no
missing alt text or labels on the page measured).
**Fix:** label every icon button, add a test that walks each main screen for controls without a
label, check colour contrast of the gradient surfaces, and try the top-up flow with TalkBack.

### U-04 · Consent

The banner says "Мы используем cookie…" and offers one button; analytics with session replay loads
either way (see security finding S-09). For users it is a promise the product does not keep; for the
business it is a compliance risk. Make it a real choice, and load analytics only after "accept".

### U-05 · Turkmen text

All Turkmen copy, including the 26 default push templates and the update prompts, was written
without a native reviewer. Wrong wording in a payments product costs trust quickly.
**Fix:** one review pass by a native speaker; keep the source of truth in one place (A-06).

### U-06 to U-08

- **U-06** The update cards work (recommended, required-by-date, blocking; verified on a phone), but
  the button appears only when the Remote Config parameter `update_url` holds an `https` address. It is
  empty today; set it to the download link, or the Google Play page once published.
- **U-07** Release builds run with shrinking off (`--no-shrink`) because the R8 step hung on the
  build machine, so the arm64 APK is about 29 MB. Fixing the hang would roughly halve it.
- **U-08** 44 admin page files for a small team. Group them by role (finance, catalogue, content,
  support, platform) and hide what a role cannot use; the role model already exists.

## Behaviours verified on a device

Push (rich notification with a round picture, per-category channels, tap opens the right screen,
opens counted); forced-update levels 1 and 2 including the block appearing at the deadline without a
restart (level 3 shows the same blocking screen and is unit-tested, not tried separately on the
phone); crash report reaching Firebase; maintenance notice card. Not verified: iOS, cold-start tap
routing, a second account on the same phone, live pushes for chat, support, cargo and feed.

## Keeping this current

When a screen, flow or state changes, update the affected finding in the same PR. Re-measure the
storefront with the same checks (load, requests, missing alt, unlabelled controls) after any large
front-end change, and put the new numbers in the table with the date.
