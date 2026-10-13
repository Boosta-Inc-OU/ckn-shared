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
