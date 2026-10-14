# ckn-shared

Two layers live here: the SCSS layer (variables, grid, legacy mixins), which every kit.next component
compiles into its own bundle, and the impression-tracking runtime, which `ckn-core` serves once per
page.

**The one thing to understand before changing anything: publishing here is not a delivery, and how
far from one depends on which half you touched.**

The SCSS is consumed as an ordinary npm dependency and compiled into `dist/<component>.<hash>.js` by
Webpack Encore, so a change under `scss/` reaches a live site only when every component that uses it
is reinstalled, rebuilt and deployed. A version range in a component's `package.json` (`"latest"`
included) does not change that.

The JavaScript used to work the same way and no longer does: since `ckn-core` 1.0.43 it is served
from there, once per page, and a change under `js/` reaches every component with a deploy of that one
plugin. The next section explains why the two halves differ.

The old model is the reason this package has tests at all. Sixteen components each carried their own
copy of `js/track-visibility.js`, pinned by their own `yarn.lock`, spanning 1.0.3 to 1.0.26, and on a
page they all ran side by side - which is how impressions came to be reported twice. The tests exist
so that the copies cannot drift apart silently again, and the export contract they pin is what makes
the move into `ckn-core` safe.

## Two layers, delivered differently

This package holds an SCSS layer and a JavaScript runtime, and since `ckn-core` 1.0.43 they reach a
page by different routes. Knowing which is which saves re-deriving it from a component that appears
to contradict itself.

**The JavaScript is no longer compiled into components.** `ckn-core` depends on this package, builds
`js/track-visibility.js` and `js/casino-table.js` into one file and publishes them as
`window.CKN.tracking` and `window.CKN.casinoTable`. Components keep their import statements exactly
as they were; their Webpack config marks those two module paths as `externals` resolving to those
globals, so no library code enters a component bundle. A page carries one copy instead of sixteen,
and an update to this library reaches production with a deploy of `ckn-core` alone.

Note the two globals have different shapes, because the modules are imported differently: the tracker
is imported for its named exports, so its global is the namespace; `casino-table` is imported for its
default export and then constructed, so its global is the class itself. Publishing the namespace for
the second one makes Webpack hand that object to `new`, which fails with "is not a constructor" - and
only on the pages that build a table.

**The SCSS still compiles into each component**, and that is not an oversight. Sass is substitution at
compile time: nothing survives into the browser for an external to point at. `scss/variables/variables.scss`
is 189 lines that emit no CSS rules at all - each line maps a Sass name to a custom property, and the
runtime half is already served once per page by the stylization layer.

The grid is the one part that does emit rules, so it is duplicated across every component that uses
it, each copy under its own hashed class name. `ckn-core/CLAUDE.md` has the measurements and why that
was left alone.

**What this means when releasing.** A change under `js/` now reaches sites through `ckn-core`: publish
here, then `yarn upgrade` and rebuild there. A change under `scss/` still reaches sites only when each
component is rebuilt and deployed - the old model, unchanged. The warning at the top of this file
applies to the SCSS layer, and no longer to the JavaScript.

## The impression contract

`js/track-visibility.js` publishes `viewCasino`. The payload vocabulary changed at **1.0.23**
(`eventName / element / bname / bid` became `eventCategory / eventAction / eventLabel / eventLabelID`
plus five page-level fields), and the duplicate-impression guard arrived two releases later at
**1.0.25**. A component built in between sends the current field names and still re-reports
impressions another component has already reported — nothing in the traffic distinguishes it from a
healthy one.

`tests/contract.test.js` freezes both the export list and one reference payload. A diff there is
either an analytics change agreed with whoever owns the GTM configuration, or a regression.

## Scoped tracking: `trackComponent()`

`trackComponent( slug, selector )` is what a component should call. It takes the CTA elements inside
that component's own block, claims them in the registry, applies the component's own switch and
observes them - and touches nothing else on the page.

It exists because the page-wide sweeps below do not do that, and the consequences reached QA on
2026-10-13. Measured on a casino page of the stand: one component was observing all 22 CTA elements
of the page, another component's sidebar and a third one's logo included. No component tracked its
own markup, nothing in the traffic said which component an impression belonged to, and coverage
depended on which plugins happened to be active and in which order they loaded.

Two details in it are load-bearing:

- **The elements are claimed before the switches are consulted.** A page-wide sweep skips whatever
  is already claimed, so claiming is what lets a component that is switched off actually stay
  silent. Elements left unclaimed would be reported by the sweep, under the global flags, with the
  component's own switch ignored.
- **The per-component switch is read from the resolved lists only for a declared component.** The
  core publishes `data-wcp-ut-track-components` (since `ckn-core` 1.0.45) for exactly that: a slug
  missing from `data-wcp-ut-track-off` means "enabled" for a declared component and nothing at all
  for an undeclared one, which can never be listed. Reading the lists without that distinction
  reports "enabled" while the master switch is off - a defect this codebase has shipped once. Against
  an older core the attribute is absent and the global flags decide, as before.

**`onBlockVisible`** reports a block's elements when the block itself comes into view, rather than
each element when it does. For contents collapsed behind a spoiler: Chrome does not render what is
inside a closed `<details>`, so an observer on those elements never fires however far the reader
scrolls - `ckn-similar-offers` sent no impressions at all until the reader opened the block. The
mode answers "did the reader reach the block", which is what the analytics is for there, and the
block's own heading is visible the whole time. Decided by the product owner on 2026-10-14. An
impression in this mode is not comparable with one from an element seen in full, which is worth
knowing when reading the reports.

`tests/component.test.js` covers all of it; the mutation table is in `docs/testing.md`.

## `trackRemaining()` - the sweep that exists to be deleted

Every CTA element no component claimed for itself. Nine components still print CTA elements and
call nothing, so without a sweep their impressions would stop; `ckn-core` 1.0.47 runs this one per
page, deferred past every component's `DOMContentLoaded` handler, and publishes the count as
`CKN.unclaimed`.

That count is the measure of this function's own obsolescence: zero on a page means every element
there has an owner. Measured on the stand today - homepage 0, slot page 0, casino page **9**
(ckn-related-casinos, which reuses another component's templates and has no tracker).

Two properties are deliberate. It excludes nothing by class, unlike `trackVisibilityOthers()`: the
registry already says what is taken. And the list it returns does not depend on the switches - the
switches still decide what is *sent* - so the count stays usable as a measure with tracking off.

The scheduling is the caller's, not this function's: run without the deferral it is not a fallback
but a competitor, and the component that loses is whichever bundle happened to load later.

## The guard, and the hole in it

Several components sweep the **whole page** for CTA elements rather than their own block, so three
to five of them observe the same element. What keeps the impression single is `window._cknObservedElements`,
a registry the `trackVisibility()` helper reads and writes.

Those sweeps are being removed component by component in favour of `trackComponent()`; while any of
them is still on a page, a scoped component can find its own elements already claimed and go quiet,
so the last page-wide sweep left on a page has to be the one that runs last.

Two properties of that design are load-bearing:

- **It is global**, so it works only while every observer on the page participates. A component
  built before 1.0.25 does not, and its extra events are the duplication this suite exists for. The
  page is protected only as far as its oldest deployed bundle allows.
- **It lives in the helper, not in the class.** A component extending `trackVisibilityClass` to send
  its own payload bypasses the registry in both directions. Six components do exactly that;
  `ckn-similar-offers` is the one whose elements overlap the page-wide sweep, and it has to join the
  registry by hand.

`tests/registry.test.js` pins both, including the hole. When the registry moves into the class, the
last test in that file is the one that must be inverted — its failure is the signal that the move
took effect.

## Running the tests

```bash
yarn install
yarn test              # pass/fail
yarn test:describe     # spells out what each test verified
npx vitest run --sequence.shuffle   # order independence
```

vitest with jsdom. 84 tests, no build step, no network.

Details, the deliberately uncovered parts, and the findings the suite recorded along the way:
`docs/testing.md`.

## Releasing

`package.json` carries the version and `files` limits the published tarball to `js`, `scss` and
`README.md` — tests, config and this document stay in the repository. Verify with
`npm pack --dry-run` before publishing.

Adding tests alone is not a release: nothing in `js/` or `scss/` changed, so the version stays put.

Publishing is only the first half of a `js/` change. The code sits in the registry until `ckn-core`
takes it:

```bash
cd <…>/plugins/ckn-core
yarn upgrade @refactoryteam/ckn-shared --latest
yarn build
grep -c _cknObservedElements assets/dist/tracking.js   # the duplicate guard must be in there
```

Then bump `ckn-core` - the `Version:` header **and** the `PLUGIN_VERSION` constant, which is what
busts the cache on the served runtime - and deploy it. No component is touched.

A `scss/` change has no such shortcut: every component that uses the changed file has to be
reinstalled, rebuilt and deployed.
