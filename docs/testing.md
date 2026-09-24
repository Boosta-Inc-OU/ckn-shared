# Testing ckn-shared

vitest + jsdom, no build step, no network. The same stack `wcp-review-email-popup` uses for its
tracking tests, so the two suites read alike.

```bash
yarn install
yarn test                            # pass/fail
yarn test:describe                   # one line per behaviour verified
npx vitest run --sequence.shuffle    # order independence
```

## What the harness has to work around

Three properties of the shipped module shape `tests/helpers/harness.js`. All three are facts about
the code, not testing preferences.

**The keeper is read once, at import time.** `const params = document.querySelector( '#wcp_ut_data_attributes_keeper' )`
runs while the module is being evaluated, so the DOM must exist *before* the import and a different
keeper needs a different module instance. `loadTrackVisibility()` resets the module registry and
re-imports; nothing in the suite imports the module statically. A test that renders a keeper after
loading the module would be testing the previous test's keeper.

**Pushes go to a bare `dataLayer`.** Not `window.dataLayer = window.dataLayer || []` — the plain
identifier. The harness defines the global so the rest of the behaviour is observable at all.

**IntersectionObserver is faked, not polyfilled.** The fake never decides on its own that something
became visible: a test states which element crossed the threshold and when. No timers, no waiting,
no flakiness. `MutationObserver` is faked the same way for `trackVisibilityDynamic`.

The keeper fixture uses the attribute names the local stand actually resolves to
(`ga-convert-element`, `betting`, `id`, …). They are settings, not constants — the "CTA data
attributes names" ACF field — which is why every reader builds its lookup at runtime and why the
fixture copies real values instead of inventing plausible ones.

## What is covered

| File | Subject |
|---|---|
| `observer.test.js` | threshold 0.5, one event per element, non-intersecting passes ignored, `?logvisibility=1` |
| `payload.test.js` | every field of the impression payload, including the optional and the absent ones |
| `gates.test.js` | the master and visibility switches, and where they are enforced |
| `registry.test.js` | the duplicate guard, and the case it does not cover |
| `sweeps.test.js` | which elements each of the three ready-made sweeps claims |
| `contract.test.js` | the export list and one frozen reference payload |

### The two tests that are about a future change

`registry.test.js` ends with *"does not protect a caller that observes through the class directly"*.
It asserts today's behaviour on purpose. Moving the registry into `trackVisibilityClass.observe()`
must make it fail; that failure is the acceptance signal for the move, and the test is inverted in
the same commit.

`contract.test.js` asserts the export list exactly because of the planned change in how this library
is delivered: served once by `ckn-core` under a runtime global, with components resolving the same
import through Webpack `externals`. The swap is safe only while both sides expose the same names.

## What is deliberately not covered

**`js/casino-table.js`.** The ajax "Show more" loader. Its analytics boundary is one line —
`trackVisibilityCasino( newOnes )` on the rows a fragment added — but reaching it means driving
`fetch`, a buffer and an HTML fragment, which is a harness of its own rather than an addition to this
one. Worth doing; not done here.

One thing to know before writing it: that call sits inside `try { … } catch( e ) { /* ignore */ }`.
If tracking throws, the table keeps working and the impressions silently stop — the failure mode
this project keeps running into, where broken and quiet look identical from the outside.

**The scroll percentage on a real page.** jsdom has no layout, so `scrollHeight` equals the viewport
and the guarded division returns 0. The suite pins the guard; the value belongs to the live sweep.

**Whether anything reaches GA.** These tests prove the right object was pushed onto `dataLayer`.
What GTM does with it is outside the library and outside this suite.

## Fixed while writing the suite

**The ajax fragment reported one impression too many per row (1.0.27).** `trackVisibilityCasino( fragment )`
observed each row container on top of the CTAs inside it. A row carries the brand attributes but not the CTA
attribute, so it produced a `viewCasino` with a null `eventAction` — and only on the ajax path, because the
page-load sweep selects *by* that attribute. The same row therefore reported differently depending on how it
arrived.

Measured on next.local before the fix: "Show more" added 26 CTAs and 39 impressions. After: 26 and 26. The fix
applies the membership test `trackVisibilityDynamic` already used, so the two dynamic paths now agree.

Pinned by two tests in `sweeps.test.js`: the row is not reported without the attribute, and still is with it.

## Findings recorded while writing the suite

Each is pinned by a test that asserts the behaviour as it is today, not as it should be.

1. **No keeper, no mercy.** On a page without `#wcp_ut_data_attributes_keeper` the module throws a
   `TypeError` on the first sweep — `params` is `null` and `params.dataset` is read unguarded.
2. **`dataLayer` is assumed to exist.** `sendEvent()` throws a `ReferenceError` where GTM has not
   defined the array. Components that build their own payload guard it; this one does not.
3. **The class carries no switch check.** `trackVisibilityClass.sendEvent()` sends regardless of the
   admin switches — only the helper gates. Every component that extends the class repeats the check
   in its own initialiser, and one that forgets reports impressions with tracking switched off.
4. **Per-component switches are invisible here.** The helper knows only the two global toggles, not
   the resolved `data-wcp-ut-track-off` lists the core publishes. A component that wants the
   per-component switch has to apply it before calling in.

## Where this suite does not reach

The duplication that prompted it happens *between* components, on a page where several bundles of
different ages run together. No unit test can see that. The detector is a live sweep of the real
`dataLayer`, counting events against the number of CTA elements on the page.
