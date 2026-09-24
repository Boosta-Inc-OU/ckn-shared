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
	 * sendEvent writes to a bare `dataLayer`, not to `window.dataLayer = window.dataLayer || []`.
	 * On a page where GTM has not defined the array - a stand without the container, or a container
	 * that failed to load - this throws instead of doing nothing. Pinned as it behaves; the
	 * components that build their own payload do guard it, this one does not.
	 */
	it( 'throws rather than staying silent on a page where GTM never defined dataLayer', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibilityClass } = await loadTrackVisibility();
		const observer = new trackVisibilityClass( () => {} );

		delete globalThis.dataLayer;

		expect( () => observer.sendEvent( cta ) ).toThrow( ReferenceError );
	} );
} );
