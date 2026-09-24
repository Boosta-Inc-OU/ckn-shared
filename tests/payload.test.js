/**
 * The impression payload, pinned key by key.
 *
 * This is the contract the rest of the platform reads: GTM triggers match on these names, and the
 * monitor decides whether a component is outdated by finding them in a built bundle. The key set is
 * therefore asserted *exactly* rather than with "contains", so adding a field fails this suite
 * instead of arriving in GA unannounced - the same rule ckn-core applies to its platform payload.
 *
 * The vocabulary below is the one introduced in 1.0.23. Before it the same event went out as
 * `eventName / element / bname / bid`, and a component built against that release still sends the
 * old names today; that difference is the whole reason these tests exist.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	events,
	loadTrackVisibility,
	renderCasinoBlock,
	renderCta,
	renderKeeper,
	resetPage,
} from './helpers/harness.js';

const FULL_CTA = {
	convertElement: 'cart_button',
	casinoName: '7 Bit',
	casinoId: '4755',
	apikosId: '249',
	bonusName: '100% bonus + 100 spins for free',
	position: '1',
};

async function send( cta ) {
	const { trackVisibilityClass } = await loadTrackVisibility();
	const observer = new trackVisibilityClass( () => {} );

	observer.sendEvent( cta );

	return events()[ 0 ];
}

describe( 'impression payload', () => {
	beforeEach( () => resetPage() );

	it( 'carries exactly these keys and nothing else', async () => {
		renderKeeper();
		const payload = await send( renderCta( FULL_CTA ) );

		expect( Object.keys( payload ).sort() ).toEqual( [
			'aid',
			'bonusName',
			'event',
			'eventAction',
			'eventCategory',
			'eventLabel',
			'eventLabelID',
			'geoUser',
			'pageType',
			'position',
			'scrollPercentage',
			'userID',
		] );
	} );

	it( 'reads every brand value through the keeper, never through a fixed attribute name', async () => {
		renderKeeper();
		const payload = await send( renderCta( FULL_CTA ) );

		expect( payload ).toMatchObject( {
			event: 'GAevent',
			eventCategory: 'viewCasino',
			eventAction: 'cart_button',
			eventLabel: '7 Bit',
			eventLabelID: '4755',
			aid: '249',
			bonusName: '100% bonus + 100 spins for free',
			position: '1',
		} );
	} );

	it( 'takes the page-level parameters off the keeper', async () => {
		renderKeeper( {
			'data-wcp-ut-page-type': 'casino',
			'data-wcp-ut-user-geo': 'DE',
			'data-wcp-ut-user-id': '42',
		} );

		const payload = await send( renderCta( FULL_CTA ) );

		expect( payload ).toMatchObject( { pageType: 'casino', geoUser: 'DE', userID: '42' } );
	} );

	it( 'falls back to an empty string for the page-level parameters when the keeper omits them', async () => {
		renderKeeper( {
			'data-wcp-ut-page-type': null,
			'data-wcp-ut-user-geo': null,
			'data-wcp-ut-user-id': null,
		} );

		const payload = await send( renderCta( FULL_CTA ) );

		expect( payload ).toMatchObject( { pageType: '', geoUser: '', userID: '' } );
	} );

	it( 'omits position entirely when the element does not carry it', async () => {
		renderKeeper();
		const payload = await send( renderCta( { ...FULL_CTA, position: null } ) );

		expect( 'position' in payload ).toBe( false );
	} );

	it( 'sends an empty bonus name rather than null when the element has none', async () => {
		renderKeeper();
		const payload = await send( renderCta( { ...FULL_CTA, bonusName: null } ) );

		expect( payload.bonusName ).toBe( '' );
	} );

	/*
	 * getAttribute returns null for a missing attribute and the payload passes it through. Pinned as
	 * it behaves, not as it ideally would: a consumer reading eventLabel has to cope with null, and
	 * silently "fixing" it here would change what GA receives.
	 */
	it( 'passes a missing brand attribute through as null', async () => {
		renderKeeper();
		const payload = await send( renderCta( { convertElement: 'cart_button' } ) );

		expect( payload.eventLabel ).toBeNull();
		expect( payload.eventLabelID ).toBeNull();
		expect( payload.aid ).toBeNull();
	} );

	it( 'numbers the casino block the element sits in, counting from one', async () => {
		renderKeeper();
		renderCasinoBlock();
		const second = renderCasinoBlock();
		const cta = renderCta( FULL_CTA, { parent: second } );

		const payload = await send( cta );

		expect( payload.geoPosition ).toBe( 2 );
	} );

	it( 'leaves geoPosition out for an element outside any casino block', async () => {
		renderKeeper();
		const payload = await send( renderCta( FULL_CTA ) );

		expect( 'geoPosition' in payload ).toBe( false );
	} );

	/*
	 * jsdom has no layout, so scrollHeight equals the viewport height and the guarded division
	 * returns 0. That is the value under test here - the guard, not the arithmetic. The percentage
	 * on a real page is covered by the live sweep instead.
	 */
	it( 'reports a zero scroll percentage on a page it cannot measure, without dividing by zero', async () => {
		renderKeeper();
		const payload = await send( renderCta( FULL_CTA ) );

		expect( payload.scrollPercentage ).toBe( 0 );
	} );
} );
