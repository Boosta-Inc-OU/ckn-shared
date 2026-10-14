/**
 * What the library promises to the outside world.
 *
 * Two audiences depend on this and neither reads the source: every component compiles these exports
 * into its bundle, and the tracking monitor decides whether a component is outdated by looking for
 * these payload field names inside a built bundle.
 *
 * The export list matters for one more reason. The plan is to stop compiling this library into each
 * component and serve it once from ckn-core instead, with the components resolving the same import
 * to a runtime global. That swap is only safe while the set of exported names is identical on both
 * sides, so it is asserted exactly rather than by presence.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { events, loadTrackVisibility, renderCta, renderKeeper, resetPage } from './helpers/harness.js';

describe( 'the public surface', () => {
	beforeEach( () => resetPage() );

	it( 'exports exactly these names', async () => {
		renderKeeper();

		const module = await loadTrackVisibility();

		expect( Object.keys( module ).sort() ).toEqual( [
			'isComponentDeclared',
			'isComponentEnabled',
			'isComponentVisibilityEnabled',
			'trackComponent',
			'trackRemaining',
			'trackVisibility',
			'trackVisibilityCasino',
			'trackVisibilityClass',
			'trackVisibilityDynamic',
			'trackVisibilityOthers',
		] );
	} );

	/*
	 * The reference payload, frozen.
	 *
	 * Its job is to survive changes that are supposed to be invisible - a rebuild, a move into the
	 * core runtime - and to fail loudly on anything that is not. A diff here is either a deliberate
	 * analytics change agreed with whoever owns the GTM configuration, or a regression.
	 */
	it( 'builds this exact payload for a fully attributed CTA', async () => {
		renderKeeper();

		const cta = renderCta( {
			convertElement: 'cart_button',
			casinoName: '7 Bit',
			casinoId: '4755',
			apikosId: '249',
			bonusName: '100% bonus + 100 spins for free',
			position: '1',
		} );

		const { trackVisibilityClass } = await loadTrackVisibility();

		new trackVisibilityClass( () => {} ).sendEvent( cta );

		expect( events()[ 0 ] ).toEqual( {
			event: 'GAevent',
			eventCategory: 'viewCasino',
			eventAction: 'cart_button',
			eventLabel: '7 Bit',
			eventLabelID: '4755',
			aid: '249',
			bonusName: '100% bonus + 100 spins for free',
			scrollPercentage: 0,
			pageType: 'home',
			geoUser: 'EN',
			userID: '',
			position: '1',
		} );
	} );

	/*
	 * GTM is not guaranteed to have defined `dataLayer` by the time the first element comes into
	 * view: a site with no container, a container that failed to load or was blocked, one injected
	 * late. Until 1.0.30 sendEvent() pushed to a bare `dataLayer` and threw a ReferenceError there,
	 * which `_handleIntersect()` did not catch - so the throw also lost every other element in the
	 * same IntersectionObserver batch. It now creates the array the way GTM's own snippet does.
	 */
	it( 'creates dataLayer on a page where GTM never defined it, instead of throwing', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibilityClass } = await loadTrackVisibility();
		const observer = new trackVisibilityClass( () => {} );

		delete globalThis.dataLayer;
		delete window.dataLayer;

		expect( () => observer.sendEvent( cta ) ).not.toThrow();
		expect( window.dataLayer ).toHaveLength( 1 );
		expect( window.dataLayer[ 0 ] ).toMatchObject( { event: 'GAevent', eventCategory: 'viewCasino' } );
	} );

	/*
	 * And an existing queue is appended to, never replaced: GTM's snippet runs first on a healthy
	 * page and whatever it queued has to survive.
	 */
	it( 'appends to a dataLayer that already exists', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibilityClass } = await loadTrackVisibility();
		const observer = new trackVisibilityClass( () => {} );

		window.dataLayer = [ { event: 'gtm.js' } ];
		globalThis.dataLayer = window.dataLayer;

		observer.sendEvent( cta );

		expect( window.dataLayer ).toHaveLength( 2 );
		expect( window.dataLayer[ 0 ] ).toEqual( { event: 'gtm.js' } );
	} );
} );
