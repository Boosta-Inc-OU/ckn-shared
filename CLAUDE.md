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

## The guard, and the hole in it

Several components sweep the **whole page** for CTA elements rather than their own block, so three
to five of them observe the same element. What keeps the impression single is `window._cknObservedElements`,
a registry the `trackVisibility()` helper reads and writes.

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

vitest with jsdom. 43 tests, no build step, no network.

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
