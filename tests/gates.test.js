/**
 * The two switches an administrator actually has, and where they are enforced.
 *
 * Both live on the keeper: `data-wcp-ut-data-layer` is the master ("Turn on tracking script") and
 * `data-wcp-ut-data-layer-visibility` governs impressions only. The distinction that matters here is
 * *where* they are checked - the helper checks them, the class does not - because that is what
 * decides whether a component inherits the gate or has to implement it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { events, loadTrackVisibility, observers, renderCta, renderKeeper, resetPage } from './helpers/harness.js';

describe( 'the admin switches', () => {
	beforeEach( () => resetPage() );

	it( 'observes when both switches are on', async () => {
		renderKeeper();
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		expect( observers ).toHaveLength( 1 );
		expect( observers[ 0 ].observed.has( cta ) ).toBe( true );
	} );

	it( 'creates no observer at all when the master switch is off', async () => {
		renderKeeper( { 'data-wcp-ut-data-layer': 'off' } );
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		expect( observers ).toHaveLength( 0 );
		expect( events() ).toEqual( [] );
	} );

	it( 'creates no observer when only the visibility switch is off', async () => {
		renderKeeper( { 'data-wcp-ut-data-layer-visibility': 'off' } );
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		expect( observers ).toHaveLength( 0 );
	} );

	it( 'treats anything other than the exact string "on" as off', async () => {
		renderKeeper( { 'data-wcp-ut-data-layer': '1' } );
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		trackVisibility( [ cta ] );

		expect( observers ).toHaveLength( 0 );
	} );

	/*
	 * The gate lives in the helper, not in the class. Six components extend trackVisibilityClass to
	 * send a payload of their own and never call the helper, so they do not inherit this check - each
	 * one repeats it in its own initialiser, and a component that forgets reports impressions with
	 * tracking switched off. Pinned as the current contract so that moving the gate is a deliberate
	 * change with a failing test, not a silent one.
	 */
	it( 'does not gate a caller that uses the class directly - the class has no switch check', async () => {
		renderKeeper( { 'data-wcp-ut-data-layer': 'off', 'data-wcp-ut-data-layer-visibility': 'off' } );
		const cta = renderCta( { convertElement: 'cart_button', casinoName: '7 Bit' } );

		const { trackVisibilityClass } = await loadTrackVisibility();
		const observer = new trackVisibilityClass( () => {} );

		observer.sendEvent( cta );

		expect( events() ).toHaveLength( 1 );
	} );

	it( 'does nothing when the page has no keeper at all', async () => {
		const cta = renderCta( { convertElement: 'cart_button' } );

		const { trackVisibility } = await loadTrackVisibility();

		expect( () => trackVisibility( [ cta ] ) ).toThrow();
	} );
} );
