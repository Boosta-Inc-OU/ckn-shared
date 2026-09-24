/**
 * The three ready-made sweeps, and which elements each one claims.
 *
 * Between them they decide how much of the page a single component takes responsibility for, which
 * is why several components end up watching the same elements. The boundaries are pinned here so a
 * change in scope is visible rather than inferred from a live page.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	loadTrackVisibility,
	mutationObservers,
	observers,
	renderCasinoBlock,
	renderCta,
	renderKeeper,
	resetPage,
} from './helpers/harness.js';

describe( 'trackVisibilityOthers', () => {
	beforeEach( () => resetPage() );

	it( 'takes every CTA outside the casino blocks and leaves those inside alone', async () => {
		renderKeeper();
		const block = renderCasinoBlock();
		const inside = renderCta( { convertElement: 'cart_button' }, { parent: block } );
		const outside = renderCta( { convertElement: 'sidebar' } );

		const { trackVisibilityOthers } = await loadTrackVisibility();

		trackVisibilityOthers();

		expect( observers[ 0 ].observed.has( outside ) ).toBe( true );
		expect( observers[ 0 ].observed.has( inside ) ).toBe( false );
	} );

	it( 'ignores an element that carries no CTA attribute', async () => {
		renderKeeper();
		renderCta( {} );

		const { trackVisibilityOthers } = await loadTrackVisibility();

		trackVisibilityOthers();

		expect( observers ).toHaveLength( 0 );
	} );
} );

describe( 'trackVisibilityCasino', () => {
	beforeEach( () => resetPage() );

	it( 'takes the CTAs inside the casino blocks and nothing else', async () => {
		renderKeeper();
		const block = renderCasinoBlock();
		const inside = renderCta( { convertElement: 'cart_button' }, { parent: block } );
		const outside = renderCta( { convertElement: 'sidebar' } );

		const { trackVisibilityCasino } = await loadTrackVisibility();

		trackVisibilityCasino();

		expect( observers[ 0 ].observed.has( inside ) ).toBe( true );
		expect( observers[ 0 ].observed.has( outside ) ).toBe( false );
	} );

	/*
	 * Guarded with typeof since 1.0.25. Before that the global was read bare, so a page without the
	 * geo plugin threw a ReferenceError here and took the rest of the component's boot with it - the
	 * exact failure a component still pinned to 1.0.3 can produce today.
	 */
	it( 'survives a page where the geo plugin never defined its global', async () => {
		renderKeeper();
		const block = renderCasinoBlock();
		const cta = renderCta( { convertElement: 'cart_button' }, { parent: block } );

		const { trackVisibilityCasino } = await loadTrackVisibility();

		expect( () => trackVisibilityCasino() ).not.toThrow();
		expect( observers[ 0 ].observed.has( cta ) ).toBe( true );
	} );

	it( 'skips the page-load sweep while geo replacement is pending, and runs once it is done', async () => {
		renderKeeper();
		const block = renderCasinoBlock();
		renderCta( { convertElement: 'cart_button' }, { parent: block } );

		window.geo_casino_data = { geo_status: 1 };

		const { trackVisibilityCasino } = await loadTrackVisibility();

		// onload: the markup is about to be replaced, so observing it now would watch dead nodes.
		trackVisibilityCasino( null, true );
		expect( observers ).toHaveLength( 0 );

		// The rebind hook calls it again without the onload flag.
		trackVisibilityCasino();
		expect( observers ).toHaveLength( 1 );
	} );

	it( 'observes the CTAs of a freshly loaded fragment, not the rest of the page', async () => {
		renderKeeper();
		const block = renderCasinoBlock();
		const existing = renderCta( { convertElement: 'cart_button' }, { parent: block } );

		const row = document.createElement( 'div' );
		const nested = renderCta( { convertElement: 'cart_logo' }, { parent: row } );

		const { trackVisibilityCasino } = await loadTrackVisibility();

		trackVisibilityCasino( [ row ] );

		expect( observers[ 0 ].observed.has( nested ) ).toBe( true );
		expect( observers[ 0 ].observed.has( existing ) ).toBe( false );
	} );

	/*
	 * A row that arrives over ajax must report exactly what the same row reports when the page
	 * rendered it directly.
	 *
	 * The fragment branch used to observe the row container unconditionally, on top of the CTAs
	 * inside it. The container carries the brand attributes but not the CTA attribute, so it
	 * produced an extra viewCasino with a null eventAction - one per loaded row, and only ever on
	 * the ajax path, because the page-load sweep selects by the CTA attribute. Measured on
	 * next.local: "Show more" added 26 CTAs and 39 impressions.
	 */
	it( 'does not report the fragment row itself when it carries no CTA attribute', async () => {
		renderKeeper();
		renderCasinoBlock();

		const row = document.createElement( 'div' );

		// A row as the table prints it: brand data, no CTA attribute of its own.
		row.setAttribute( 'data-betting', '7 Bit' );
		row.setAttribute( 'data-id', '4755' );
		renderCta( { convertElement: 'cart_logo' }, { parent: row } );

		const { trackVisibilityCasino } = await loadTrackVisibility();

		trackVisibilityCasino( [ row ] );

		expect( observers[ 0 ].observed.has( row ) ).toBe( false );
	} );

	it( 'still reports the fragment row when it does carry the CTA attribute', async () => {
		renderKeeper();
		renderCasinoBlock();

		const row = renderCta( { convertElement: 'cart_block', casinoName: '7 Bit' } );

		const { trackVisibilityCasino } = await loadTrackVisibility();

		trackVisibilityCasino( [ row ] );

		expect( observers[ 0 ].observed.has( row ) ).toBe( true );
	} );
} );

describe( 'trackVisibilityDynamic', () => {
	beforeEach( () => resetPage() );

	it( 'watches the whole body for added nodes', async () => {
		renderKeeper();

		const { trackVisibilityDynamic } = await loadTrackVisibility();

		trackVisibilityDynamic();

		expect( mutationObservers[ 0 ].target ).toBe( document.body );
		expect( mutationObservers[ 0 ].options ).toEqual( { childList: true, subtree: true } );
	} );

	it( 'picks up a CTA that is itself the added node', async () => {
		renderKeeper();

		const { trackVisibilityDynamic } = await loadTrackVisibility();

		trackVisibilityDynamic();

		const added = renderCta( { convertElement: 'cart_button' } );

		mutationObservers[ 0 ].addNodes( added );

		expect( observers[ 0 ].observed.has( added ) ).toBe( true );
	} );

	it( 'picks up CTAs nested inside an added node', async () => {
		renderKeeper();

		const { trackVisibilityDynamic } = await loadTrackVisibility();

		trackVisibilityDynamic();

		const wrapper = document.createElement( 'div' );
		const nested = renderCta( { convertElement: 'cart_button' }, { parent: wrapper } );

		document.body.appendChild( wrapper );
		mutationObservers[ 0 ].addNodes( wrapper );

		expect( observers[ 0 ].observed.has( nested ) ).toBe( true );
	} );

	it( 'ignores an added node that contains no CTA', async () => {
		renderKeeper();

		const { trackVisibilityDynamic } = await loadTrackVisibility();

		trackVisibilityDynamic();

		mutationObservers[ 0 ].addNodes( document.createElement( 'div' ) );

		expect( observers ).toHaveLength( 0 );
	} );
} );
