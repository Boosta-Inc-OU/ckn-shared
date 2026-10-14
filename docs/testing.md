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

**`dataLayer` is defined up front, as GTM's snippet would.** The harness creates it so most tests
read like a live page; the tests about a page without a container delete it themselves. Since 1.0.30
the module creates it when missing, so deleting it is a scenario rather than a crash.

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
| `component.test.js` | `trackComponent()`: scoping, the registry, and the per-component switch |

### `component.test.js` and its negative control

`trackComponent()` is the scoped entry point a component should call. The suite was written against
a defect that had already shipped, so every test was shown to fail on a broken version before it was
trusted:

| Mutation | Expected result |
|---|---|
| Sweep the whole page again instead of the component's block | 2 failures of 67 |
| Claim the elements after the switches are consulted, not before | 1 failure |
| Read the resolved lists without checking the declared set | 3 failures |
| Ignore the resolved lists and trust the global flags only | 4 failures |
| Forget that a block can carry the CTA attribute itself | 2 failures |
| With `onBlockVisible`, report every element of the component rather than the block's own | 1 failure |
| Ignore `onBlockVisible` and watch the elements as usual | 3 failures |
| Have `trackRemaining()` take every element instead of the unclaimed ones | 4 failures |
| Make its returned count depend on the switches | 1 failure |

One harness change came out of this: the fake `IntersectionObserver` now drops elements it no
longer watches, the way a real one does. Without that the "reported once" rule could not be tested
at all - the tracker unobserves after the first report, and a fake that kept delivering reported a
second time and looked like a defect in the code under test.

The third and fourth are the two halves of the same question and are worth keeping apart: reading
the lists for an undeclared component reports "enabled" with the master switch off, and ignoring
them for a declared one silences a component an administrator deliberately switched on.

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

**An impression batch died with the first failing callback (1.0.30).** `sendEvent()` pushed to a bare
`dataLayer`, and `_handleIntersect()` called the callback *before* `unobserve` with nothing catching. Where GTM
had not defined the array by the first intersection - a site with no container, a container blocked or injected
late - the first element threw a `ReferenceError`, stayed observed (so the browser never revisited it) and took
every element after it in the same IntersectionObserver batch with it. Nothing on the page reported any of that.

`sendEvent()` now does `window.dataLayer = window.dataLayer || []` as GTM's own snippet does, and
`_handleIntersect()` unobserves first and wraps the callback in a `try/catch` that logs
`[ckn-shared] visibility callback failed`. Payload, threshold, registry and switches are untouched.

Found by a second developer investigating the same QA report on a stand without GTM, and adopted here on its
merits. It is **not** what the 2026-10-13 report was about: the site QA tested carries the standard container
snippet, which creates `dataLayer` inline before any component runs. The report's cause was ownership - see the
section on `trackComponent()` in `CLAUDE.md`. Two separate defects in the same function.

Pinned by four tests: two in `contract.test.js` (created when missing, appended to when present) and two in
`observer.test.js` (the rest of a batch still reports, and the failing element is released).

## Findings recorded while writing the suite

Each is pinned by a test that asserts the behaviour as it is today, not as it should be.

1. **No keeper, no mercy.** On a page without `#wcp_ut_data_attributes_keeper` the module throws a
   `TypeError` on the first sweep — `params` is `null` and `params.dataset` is read unguarded.
2. ~~**`dataLayer` is assumed to exist.**~~ Fixed in 1.0.30 - see the finding below.
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
