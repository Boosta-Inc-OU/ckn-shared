/**
 * `trackComponent()` - a component reports its own CTA elements and nothing else.
 *
 * The function exists because the older page-wide sweeps do not do that. Several components call
 * `trackVisibilityOthers()`, which selects every CTA element on the page; the first bundle to load
 * claims all of them through the registry and reports impressions on behalf of components that
 * never asked. On a casino page of the stand one component was reporting all 22 elements of the
 * page, another component's sidebar and a third one's logo included. QA reported the consequences
 * on 2026-10-13.
 *
 * So the tests below are about ownership as much as about events: what this function must *not*
 * touch matters as much as what it reports.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	events,
	loadTrackVisibility,
	observers,
	renderCasinoBlock,
	renderComponentBlock,
	renderCta,
	renderKeeper,
	resetPage,
} from './helpers/harness.js';

const SLUG = 'ckn-constructor-promo-casino';
const OTHER = 'ckn-details';

/** The keeper of a core that publishes the declared set, with this component in it. */
function declaredKeeper( overrides = {} ) {
	return renderKeeper( {
		'data-wcp-ut-track-components': SLUG + ',' + OTHER,
		'data-wcp-ut-track-off': '',
		'data-wcp-ut-track-visibility-off': '',
		...overrides,
	} );
}

describe( 'scoping', () => {
	beforeEach( () => resetPage() );

	it( 'reports the CTA elements inside its own block', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );
		const button = renderCta( { convertElement: 'promo-casino', casinoName: '7 Bit' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [ button ] );

		observers[ 0 ].intersect( button );

		expect( events() ).toHaveLength( 1 );
		expect( events()[ 0 ].eventAction ).toBe( 'promo-casino' );
	} );

	it( 'leaves every CTA element outside its block alone', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );
		const mine = renderCta( { convertElement: 'promo-casino' }, { parent: block } );
		const sidebar = renderCta( { convertElement: 'sidebar' } );
		const logo = renderCta( { convertElement: 'casino_page_logo' } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [ mine ] );
		expect( observers[ 0 ].observed.has( sidebar ) ).toBe( false );
		expect( observers[ 0 ].observed.has( logo ) ).toBe( false );
		expect( window._cknObservedElements.has( sidebar ) ).toBe( false );
		expect( window._cknObservedElements.has( logo ) ).toBe( false );
	} );

	it( 'takes the block itself when the block is the CTA element', async () => {
		declaredKeeper();
		const card = renderCta( { convertElement: 'similar_offers' } );

		card.classList.add( 'js-my-card' );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-my-card' ) ).toEqual( [ card ] );
	} );

	it( 'reports a block that both is and contains a CTA element once each, in document order', async () => {
		declaredKeeper();
		const card = renderCta( { convertElement: 'cart_block' } );

		card.classList.add( 'js-my-card' );

		const inner = renderCta( { convertElement: 'cart_button' }, { parent: card } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-my-card' ) ).toEqual( [ card, inner ] );
	} );

	it( 'covers every block of the component on the page', async () => {
		declaredKeeper();
		const first = renderComponentBlock( 'js-promo-casino' );
		const second = renderComponentBlock( 'js-promo-casino' );

		renderCta( { convertElement: 'promo-casino' }, { parent: first } );
		renderCta( { convertElement: 'promo-casino' }, { parent: second } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toHaveLength( 2 );
	} );

	it( 'searches only the root it is given, which is how an ajax fragment is handled', async () => {
		declaredKeeper();
		const onPage = renderComponentBlock( 'js-promo-casino' );

		renderCta( { convertElement: 'promo-casino' }, { parent: onPage } );

		const fragment = document.createElement( 'div' );
		const appended = renderComponentBlock( 'js-promo-casino', { parent: fragment } );
		const fresh = renderCta( { convertElement: 'promo-casino' }, { parent: appended } );

		document.body.appendChild( fragment );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino', { root: fragment } ) ).toEqual( [ fresh ] );
	} );

	it( 'says nothing and starts no observer when the component is not on the page', async () => {
		declaredKeeper();
		renderCta( { convertElement: 'sidebar' } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [] );
		expect( observers ).toHaveLength( 0 );
	} );

	it( 'says nothing when the block is there but carries no CTA element', async () => {
		declaredKeeper();
		renderComponentBlock( 'js-promo-casino' );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [] );
		expect( observers ).toHaveLength( 0 );
	} );
} );

/**
 * The registry is what keeps one element from being reported twice, and claiming is also how a
 * switched-off component stays silent: a page-wide sweep skips whatever is already claimed, so
 * elements left unclaimed would be reported by it, under the global flags, with the component's own
 * switch ignored.
 */
describe( 'the shared registry', () => {
	beforeEach( () => resetPage() );

	it( 'claims its elements, so a later page-wide sweep skips them', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );
		const button = renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent, trackVisibilityOthers } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-promo-casino' );
		trackVisibilityOthers();

		expect( observers ).toHaveLength( 1 );

		observers[ 0 ].intersect( button );

		expect( events() ).toHaveLength( 1 );
	} );

	it( 'claims its elements even when the component is switched off, so nobody else reports them', async () => {
		declaredKeeper( { 'data-wcp-ut-track-off': SLUG } );
		const block = renderComponentBlock( 'js-promo-casino' );
		const button = renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent, trackVisibilityOthers } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [] );
		expect( window._cknObservedElements.has( button ) ).toBe( true );

		trackVisibilityOthers();

		expect( events() ).toEqual( [] );
	} );

	/*
	 * The transitional case, and the reason the six page-wide sweeps have to go in one pass: while
	 * one of them still runs first, a scoped component finds its own elements already taken and can
	 * do nothing about it. The element still gets an impression - from the wrong component.
	 */
	it( 'gives up on elements another sweep has already claimed, rather than reporting them twice', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );
		const button = renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent, trackVisibilityOthers } = await loadTrackVisibility();

		trackVisibilityOthers();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [] );

		observers[ 0 ].intersect( button );

		expect( events() ).toHaveLength( 1 );
	} );

	it( 'reports an element once even if the component calls it twice', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );
		const button = renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-promo-casino' );
		trackComponent( SLUG, '.js-promo-casino' );

		expect( observers ).toHaveLength( 1 );

		observers[ 0 ].intersect( button );

		expect( events() ).toHaveLength( 1 );
	} );
} );

/**
 * The switches. The core resolves the three-state rule server side and publishes the result, so the
 * rule itself is never re-implemented here - but which published value applies depends on whether
 * the component declared itself, and that is the part this codebase has already got wrong once.
 */
describe( 'the switches', () => {
	beforeEach( () => resetPage() );

	async function impressions( keeperOverrides, slug = SLUG ) {
		renderKeeper( keeperOverrides );

		const block = renderComponentBlock( 'js-promo-casino' );
		const button = renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		trackComponent( slug, '.js-promo-casino' );

		if ( observers.length ) {
			observers[ 0 ].intersect( button );
		}

		return events();
	}

	const declared = { 'data-wcp-ut-track-components': SLUG, 'data-wcp-ut-track-off': '', 'data-wcp-ut-track-visibility-off': '' };

	it( 'reports when the component is declared and in neither list', async () => {
		expect( await impressions( declared ) ).toHaveLength( 1 );
	} );

	it( 'stays silent when the component is named in the analytics list', async () => {
		expect( await impressions( { ...declared, 'data-wcp-ut-track-off': SLUG } ) ).toEqual( [] );
	} );

	it( 'stays silent when the component is named in the impressions list', async () => {
		expect( await impressions( { ...declared, 'data-wcp-ut-track-visibility-off': SLUG } ) ).toEqual( [] );
	} );

	it( 'is not fooled by a slug that merely contains its own', async () => {
		expect( await impressions( { ...declared, 'data-wcp-ut-track-off': SLUG + '-extended' } ) ).toHaveLength( 1 );
	} );

	it( 'ignores spaces around the slugs, which the core does not promise to strip', async () => {
		expect( await impressions( { ...declared, 'data-wcp-ut-track-off': ' ' + OTHER + ' , ' + SLUG + ' ' } ) ).toEqual( [] );
	} );

	/*
	 * A declared component can be forced on while the master switch is off; the core has already
	 * applied that, which is why the list is the answer and the global flag is not consulted. Read
	 * the other way round this would silence a component the administrator deliberately turned on.
	 */
	it( 'reports a declared component that is forced on while the master switch is off', async () => {
		expect( await impressions( {
			...declared,
			'data-wcp-ut-data-layer': 'off',
			'data-wcp-ut-data-layer-visibility': 'off',
		} ) ).toHaveLength( 1 );
	} );

	/*
	 * The defect this codebase shipped once: reading the resolved lists for a component that never
	 * declared itself. It can never appear in them, so an empty list reads as "enabled" and the
	 * master switch is bypassed. The declared set is published exactly so this is decidable.
	 */
	it( 'falls back to the master switch for a component that is not in the declared set', async () => {
		expect( await impressions( {
			'data-wcp-ut-track-components': OTHER,
			'data-wcp-ut-track-off': '',
			'data-wcp-ut-track-visibility-off': '',
			'data-wcp-ut-data-layer': 'off',
		} ) ).toEqual( [] );
	} );

	it( 'falls back to the master switch against a core too old to publish the declared set', async () => {
		expect( await impressions( { 'data-wcp-ut-data-layer': 'off' } ) ).toEqual( [] );
		resetPage();
		expect( await impressions( { 'data-wcp-ut-data-layer-visibility': 'off' } ) ).toEqual( [] );
		resetPage();
		expect( await impressions( {} ) ).toHaveLength( 1 );
	} );

	it( 'treats anything other than the exact string "on" as off', async () => {
		expect( await impressions( { 'data-wcp-ut-data-layer': '1' } ) ).toEqual( [] );
	} );
} );

/**
 * `onBlockVisible` - report the block's elements when the block is reached, not when each element
 * is seen.
 *
 * For a block whose contents sit behind a spoiler. Chrome does not render the contents of a closed
 * `<details>`, so an IntersectionObserver on them never fires however far the reader scrolls: the
 * offer cards of ckn-similar-offers produced no impression at all until the reader opened the
 * spoiler. That is literally correct - the cards were not seen - but the question the analytics is
 * meant to answer there is whether the reader reached the block, and the block's own heading is
 * visible the whole time. Decided by the product owner on 2026-10-14.
 *
 * The trade-off is deliberate and worth knowing when reading the reports: an impression in this
 * mode means "the reader reached the block", so its click-through rate is not comparable with that
 * of a card that was on screen in full.
 */
describe( 'onBlockVisible', () => {
	beforeEach( () => resetPage() );

	it( 'reports every element of a block when the block itself comes into view', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-similar-offers' );
		const first = renderCta( { convertElement: 'similar_offers', casinoName: '7 Bit' }, { parent: block } );
		const second = renderCta( { convertElement: 'similar_offers', casinoName: 'Rolletto' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-similar-offers', { onBlockVisible: true } ) ).toEqual( [ first, second ] );

		// The block is what is watched, not the cards.
		expect( Array.from( observers[ 0 ].observed ) ).toEqual( [ block ] );

		observers[ 0 ].intersect( block );

		expect( events().map( entry => entry.eventLabel ) ).toEqual( [ '7 Bit', 'Rolletto' ] );
	} );

	it( 'reports nothing while the block has not been reached', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-similar-offers' );

		renderCta( { convertElement: 'similar_offers' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-similar-offers', { onBlockVisible: true } );

		expect( events() ).toEqual( [] );
	} );

	it( 'reports each block separately, with only its own elements', async () => {
		declaredKeeper();
		const first = renderComponentBlock( 'js-similar-offers' );
		const second = renderComponentBlock( 'js-similar-offers' );
		const mine = renderCta( { convertElement: 'similar_offers', casinoName: 'First' }, { parent: first } );

		renderCta( { convertElement: 'similar_offers', casinoName: 'Second' }, { parent: second } );

		const { trackComponent } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-similar-offers', { onBlockVisible: true } );

		expect( observers[ 0 ].observed.size ).toBe( 2 );

		observers[ 0 ].intersect( first );

		expect( events().map( entry => entry.eventLabel ) ).toEqual( [ 'First' ] );
		expect( events()[ 0 ].eventLabel ).toBe( 'First' );
		expect( mine ).toBeTruthy();
	} );

	it( 'reports a block once, so scrolling back past it sends nothing more', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-similar-offers' );

		renderCta( { convertElement: 'similar_offers' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-similar-offers', { onBlockVisible: true } );

		observers[ 0 ].intersect( block );
		observers[ 0 ].intersect( block );

		expect( events() ).toHaveLength( 1 );
		expect( observers[ 0 ].unobserved ).toEqual( [ block ] );
	} );

	it( 'still claims the elements, so no other sweep reports them element by element', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-similar-offers' );
		const card = renderCta( { convertElement: 'similar_offers' }, { parent: block } );

		const { trackComponent, trackVisibilityOthers } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-similar-offers', { onBlockVisible: true } );
		trackVisibilityOthers();

		expect( observers ).toHaveLength( 1 );
		expect( window._cknObservedElements.has( card ) ).toBe( true );
	} );

	it( 'obeys the component switch like any other mode', async () => {
		declaredKeeper( { 'data-wcp-ut-track-visibility-off': SLUG } );
		const block = renderComponentBlock( 'js-similar-offers' );

		renderCta( { convertElement: 'similar_offers' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-similar-offers', { onBlockVisible: true } ) ).toEqual( [] );
		expect( observers ).toHaveLength( 0 );
	} );

	it( 'watches the elements, not the block, when the mode is off', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-similar-offers' );
		const card = renderCta( { convertElement: 'similar_offers' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-similar-offers' );

		expect( Array.from( observers[ 0 ].observed ) ).toEqual( [ card ] );
	} );
} );

describe( 'arguments it refuses', () => {
	beforeEach( () => resetPage() );

	it( 'does nothing without a slug or without a selector, rather than sweeping the page', async () => {
		declaredKeeper();
		renderCta( { convertElement: 'sidebar' } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( '', '.js-promo-casino' ) ).toEqual( [] );
		expect( trackComponent( SLUG, '' ) ).toEqual( [] );
		expect( trackComponent( SLUG ) ).toEqual( [] );
		expect( trackComponent() ).toEqual( [] );
		expect( observers ).toHaveLength( 0 );
		expect( window._cknObservedElements ).toBeUndefined();
	} );

	it( 'does nothing on a page with no keeper at all, and does not throw', async () => {
		const block = renderComponentBlock( 'js-promo-casino' );

		renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent } = await loadTrackVisibility();

		expect( () => trackComponent( SLUG, '.js-promo-casino' ) ).not.toThrow();
		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [] );
	} );

	it( 'does nothing when the keeper names no CTA attribute', async () => {
		renderKeeper( { 'data-wcp-ut-convert-element': null } );

		const { trackComponent } = await loadTrackVisibility();

		expect( trackComponent( SLUG, '.js-promo-casino' ) ).toEqual( [] );
	} );
} );

/**
 * `trackRemaining()` - the page's last-resort sweep, and the measure of its own obsolescence.
 *
 * Every CTA element a component did not claim for itself. Nine components still print CTA elements
 * and call nothing, so without this their impressions would stop; the count it returns is what says
 * when it can finally be deleted.
 *
 * Scheduling is the caller's job and is not tested here: it is one `setTimeout` in the core runtime
 * and has no behaviour of its own. What is tested is that the function takes exactly what nobody
 * claimed, and that the count means the same thing whether tracking is on or off - otherwise it
 * could not be used as a measure.
 */
describe( 'trackRemaining', () => {
	beforeEach( () => resetPage() );

	it( 'takes the elements no component claimed, and leaves the claimed ones alone', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );
		const owned = renderCta( { convertElement: 'promo-casino' }, { parent: block } );
		const orphan = renderCta( { convertElement: 'block-of-logos' } );

		const { trackComponent, trackRemaining } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-promo-casino' );

		expect( trackRemaining() ).toEqual( [ orphan ] );
		expect( window._cknObservedElements.has( owned ) ).toBe( true );
		expect( window._cknObservedElements.has( orphan ) ).toBe( true );
	} );

	it( 'reports nothing when every element already has an owner', async () => {
		declaredKeeper();
		const block = renderComponentBlock( 'js-promo-casino' );

		renderCta( { convertElement: 'promo-casino' }, { parent: block } );

		const { trackComponent, trackRemaining } = await loadTrackVisibility();

		trackComponent( SLUG, '.js-promo-casino' );

		expect( trackRemaining() ).toEqual( [] );
		expect( observers ).toHaveLength( 1 );
	} );

	it( 'takes everything on a page where no component claimed anything', async () => {
		declaredKeeper();
		const first = renderCta( { convertElement: 'block-of-logos' } );
		const second = renderCta( { convertElement: 'sticky_banner_cta' } );

		const { trackRemaining } = await loadTrackVisibility();

		expect( trackRemaining() ).toEqual( [ first, second ] );
	} );

	it( 'reports an element once: a second pass finds it claimed', async () => {
		declaredKeeper();
		const orphan = renderCta( { convertElement: 'block-of-logos' } );

		const { trackRemaining } = await loadTrackVisibility();

		expect( trackRemaining() ).toEqual( [ orphan ] );
		expect( trackRemaining() ).toEqual( [] );

		observers[ 0 ].intersect( orphan );

		expect( events() ).toHaveLength( 1 );
	} );

	/*
	 * The count has to mean "elements with no owner", not "elements that were reported", or it
	 * cannot be used to tell when the sweep may be deleted.
	 */
	it( 'counts the unclaimed elements even with tracking switched off', async () => {
		renderKeeper( { 'data-wcp-ut-data-layer': 'off' } );
		const orphan = renderCta( { convertElement: 'block-of-logos' } );

		const { trackRemaining } = await loadTrackVisibility();

		expect( trackRemaining() ).toEqual( [ orphan ] );
		expect( observers ).toHaveLength( 0 );
		expect( events() ).toEqual( [] );
	} );

	it( 'excludes nothing by class: the casino constructor is covered by the registry, not a selector', async () => {
		declaredKeeper();
		const casino = renderCasinoBlock();
		const inside = renderCta( { convertElement: 'cart_button' }, { parent: casino } );

		const { trackVisibilityCasino, trackRemaining } = await loadTrackVisibility();

		trackVisibilityCasino();

		expect( trackRemaining() ).toEqual( [] );
		expect( window._cknObservedElements.has( inside ) ).toBe( true );
	} );

	it( 'does nothing on a page with no keeper, and does not throw', async () => {
		renderCta( { convertElement: 'block-of-logos' } );

		const { trackRemaining } = await loadTrackVisibility();

		expect( () => trackRemaining() ).not.toThrow();
		expect( trackRemaining() ).toEqual( [] );
	} );
} );
