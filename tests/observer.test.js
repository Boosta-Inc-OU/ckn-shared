/**
 * The observation mechanism itself: threshold, once-per-element, and the test mode.
 *
 * These are the rules every block's analytics spec repeats - 50% of the element's height, one event
 * per element per page load, scrolling back does not send it again - so they are pinned here once
 * rather than in each consumer.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { events, loadTrackVisibility, observers, renderCta, renderKeeper, resetPage } from './helpers/harness.js';

describe( 'trackVisibilityClass', () => {
	beforeEach( () => resetPage() );

	it( 'observes at half the element height, which is what every spec asks for', async () => {
		renderKeeper();

		const { trackVisibilityClass } = await loadTrackVisibility();
		const observer = new trackVisibilityClass( () => {} );

		expect( observer.options.threshold ).toBe( 0.5 );
		expect( observer.options.root ).toBeNull();
		expect( observer.options.rootMargin ).toBe( '0px' );
	} );

	it( 'reports an element once and then stops watching it', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibilityClass } = await loadTrackVisibility();

		const seen = [];
		const observer = new trackVisibilityClass( element => seen.push( element ) );

		observer.observe( cta );
		observers[ 0 ].intersect( cta );

		expect( seen ).toEqual( [ cta ] );
		expect( observers[ 0 ].unobserved ).toEqual( [ cta ] );

		// Scrolling away and back cannot reach the callback again: the element is no longer watched.
		expect( observers[ 0 ].observed.has( cta ) ).toBe( false );
	} );

	it( 'ignores a pass that does not cross the threshold', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibilityClass } = await loadTrackVisibility();

		const seen = [];
		const observer = new trackVisibilityClass( element => seen.push( element ) );

		observer.observe( cta );
		observers[ 0 ].leave( cta );

		expect( seen ).toEqual( [] );
		expect( observers[ 0 ].observed.has( cta ) ).toBe( true );
	} );

	it( 'stays quiet unless the page asks for the test mode', async () => {
		renderKeeper();

		const { trackVisibilityClass } = await loadTrackVisibility();

		expect( new trackVisibilityClass( () => {} ).options.isTest ).toBe( false );
	} );

	it( 'turns on the test mode for ?logvisibility=1 and mirrors the payload to the console', async () => {
		resetPage( { search: '?logvisibility=1' } );
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button', casinoName: '7 Bit', casinoId: '4755' } );

		const { trackVisibilityClass } = await loadTrackVisibility();

		const logged = [];
		const observer = new trackVisibilityClass( () => {} );

		observer.logEvent = payload => logged.push( payload );

		expect( observer.options.isTest ).toBe( true );

		observer.sendEvent( cta );

		expect( logged ).toHaveLength( 1 );
		expect( logged[ 0 ] ).toEqual( events()[ 0 ] );
	} );

	/*
	 * The browser hands several entries to one call. Until 1.0.30 the handler called the callback
	 * before unobserving and caught nothing, so one failing element took every element after it in
	 * the same batch down with it - and left itself observed, which the browser never revisits.
	 * A missing `dataLayer` was the way this actually happened in production.
	 */
	it( 'reports the rest of a batch when one element throws', async () => {
		renderKeeper();
		const first = renderCta( { convertElement: 'cart_button' } );
		const second = renderCta( { convertElement: 'sidebar' } );
		const third = renderCta( { convertElement: 'cart_logo' } );

		const { trackVisibilityClass } = await loadTrackVisibility();

		const seen = [];
		const observer = new trackVisibilityClass( element => {
			if ( element === first ) {
				throw new Error( 'callback blew up' );
			}

			seen.push( element );
		} );

		[ first, second, third ].forEach( element => observer.observe( element ) );
		observers[ 0 ].intersect( first, second, third );

		expect( seen ).toEqual( [ second, third ] );
	} );

	it( 'releases an element whose callback threw, rather than watching it forever', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibilityClass } = await loadTrackVisibility();

		const observer = new trackVisibilityClass( () => {
			throw new Error( 'callback blew up' );
		} );

		observer.observe( cta );
		observers[ 0 ].intersect( cta );

		expect( observers[ 0 ].unobserved ).toContain( cta );
		expect( observers[ 0 ].observed.has( cta ) ).toBe( false );
	} );

	it( 'lets a caller override the observer options', async () => {
		renderKeeper();

		const { trackVisibilityClass } = await loadTrackVisibility();
		const observer = new trackVisibilityClass( () => {}, { threshold: 0.25 } );

		expect( observer.options.threshold ).toBe( 0.25 );
	} );
} );
