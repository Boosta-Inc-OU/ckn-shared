# ckn-shared

The library every kit.next component compiles into its own bundle. Two things live here: the SCSS
layer (variables, grid, legacy mixins) and the impression-tracking runtime.

**The one thing to understand before changing anything.** This package is consumed as an ordinary
npm dependency and inlined by Webpack Encore into `dist/<component>.<hash>.js`. Publishing a new
version changes nothing on any live site. The code reaches production only when a component is
reinstalled, rebuilt and deployed — so a release here is a promise, not a delivery, and a version
range in a component's `package.json` (`"latest"` included) does not change that.

The consequence is the reason this package now has tests. Sixteen components carry a copy of
`js/track-visibility.js`, pinned by their own `yarn.lock`, and those copies span 1.0.3 to 1.0.26. On
a page they all run side by side.

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
