/**
 * The duplicate-impression guard, and the hole in it.
 *
 * Several components sweep the *whole page* for CTA elements rather than their own block, so on a
 * normal page three to five of them observe the same element. What keeps that from sending the
 * impression three to five times is a registry on `window`, added in 1.0.25: the helper skips
 * anything already in it and registers whatever it takes on.
 *
 * Two properties of that design are load-bearing and are pinned below. It is global, so it only
 * works while every observer on the page participates - a component built before 1.0.25 does not,
 * and its extra events are the duplication this suite was written for. And it lives in the helper
 * rather than in the class, so a component that extends the class bypasses it entirely.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { loadTrackVisibility, observers, renderCta, renderKeeper, resetPage } from './helpers/harness.js';

describe( 'the observed-element registry', () => {
	beforeEach( () => resetPage() );

	it( 'creates the registry on the window and puts every observed element in it', async () => {
		renderKeeper();
		const first = renderCta( { convertElement: 'cart_block' } );
		const second = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ first, second ] );

		expect( window._cknObservedElements ).toBeInstanceOf( Set );
		expect( window._cknObservedElements.size ).toBe( 2 );
		expect( window._cknObservedElements.has( first ) ).toBe( true );
	} );

	it( 'reuses a registry another sweep already created', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		window._cknObservedElements = new Set();

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		expect( window._cknObservedElements.size ).toBe( 1 );
	} );

	it( 'skips an element a previous sweep already watches, and starts no observer for it', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );
		trackVisibility( [ cta ] );

		// The second sweep had nothing fresh, so it never reached the observer at all.
		expect( observers ).toHaveLength( 1 );
	} );

	it( 'watches only the new elements when a sweep partly overlaps an earlier one', async () => {
		renderKeeper();
		const already = renderCta( { convertElement: 'cart_block' } );
		const fresh = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ already ] );
		trackVisibility( [ already, fresh ] );

		expect( observers ).toHaveLength( 2 );
		expect( observers[ 1 ].observed.has( fresh ) ).toBe( true );
		expect( observers[ 1 ].observed.has( already ) ).toBe( false );
	} );

	it( 'registers nothing while the switches are off, so a later sweep is still free to observe', async () => {
		renderKeeper( { 'data-wcp-ut-data-layer': 'off' } );
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		expect( window._cknObservedElements ).toBeUndefined();
	} );

	/*
	 * The known hole, pinned as it is today.
	 *
	 * A component that extends trackVisibilityClass - six of them do, to send their own payload -
	 * observes through the class and never touches the registry, in either direction: it does not
	 * skip elements someone else watches, and it does not announce its own. Today that is harmless
	 * only because those components look at their own blocks and nobody else's; ckn-similar-offers,
	 * which does share elements with the page-wide sweep, has to join the registry by hand.
	 *
	 * When the registry moves into the class, this test is the one that must be inverted - and its
	 * failure is the signal that the move actually took effect.
	 */
	it( 'does not protect a caller that observes through the class directly', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility, trackVisibilityClass } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		const observer = new trackVisibilityClass( () => {} );

		observer.observe( cta );

		// Two live observers on one element: the helper's, and the subclass-style one.
		expect( observers ).toHaveLength( 2 );
		expect( observers[ 0 ].observed.has( cta ) ).toBe( true );
		expect( observers[ 1 ].observed.has( cta ) ).toBe( true );
	} );
} );
