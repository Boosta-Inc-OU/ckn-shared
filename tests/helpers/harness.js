/**
 * A page small enough to reason about, for driving js/track-visibility.js.
 *
 * Three things about the module under test shape this file, and all three are properties of the
 * shipped code rather than choices made here.
 *
 * It reads the keeper once, at import time: `const params = document.querySelector( '#wcp_ut_...' )`
 * runs while the module is being evaluated. So the DOM has to exist *before* the import, and every
 * test that needs a different keeper needs a fresh module instance. `loadTrackVisibility()` does
 * both, and nothing in these tests imports the module statically.
 *
 * It pushes to a bare `dataLayer`, not `window.dataLayer`. On a page without GTM that is a
 * ReferenceError, which is a real finding rather than a testing detail - see docs/testing.md. The
 * harness defines the global so the rest of the behaviour can be observed at all.
 *
 * It needs an IntersectionObserver, which jsdom does not implement. The fake below is not a
 * polyfill: it never decides on its own that something became visible. A test says which element
 * crossed the threshold and when, so there is no waiting and no flakiness.
 */

import { vi } from 'vitest';

const MODULE_PATH = '../../js/track-visibility.js';

export const KEEPER_ID = 'wcp_ut_data_attributes_keeper';

/**
 * The keeper as next.local actually prints it.
 *
 * The values are attribute *names*, not data: they come from the "CTA data attributes names" ACF
 * setting and differ per install, which is why every reader builds its lookup at runtime. These are
 * the ones the local stand resolves to, copied verbatim so a test cannot quietly assume a name the
 * real site does not use.
 */
export const DEFAULT_KEEPER = {
	'data-wcp-ut-data-layer': 'on',
	'data-wcp-ut-data-layer-visibility': 'on',
	'data-wcp-ut-convert-element': 'ga-convert-element',
	'data-wcp-ut-casino-name': 'betting',
	'data-wcp-ut-casino-id': 'id',
	'data-wcp-ut-position': 'position',
	'data-wcp-ut-apikos-id': 'apikos-id',
	'data-wcp-ut-bonus-name': 'bonus-name',
	'data-wcp-ut-page-type': 'home',
	'data-wcp-ut-user-geo': 'EN',
	'data-wcp-ut-user-id': '',
};

/** Every observer the module created during a test, in creation order. */
export const observers = [];

class FakeIntersectionObserver {
	constructor( callback, options ) {
		this.callback = callback;
		this.options = options;
		this.observed = new Set();
		this.unobserved = [];
		this.disconnected = false;
		observers.push( this );
	}

	observe( element ) {
		this.observed.add( element );
	}

	unobserve( element ) {
		this.observed.delete( element );
		this.unobserved.push( element );
	}

	disconnect() {
		this.disconnected = true;
	}

	/** Declares that these elements crossed the threshold, in this order. */
	intersect( ...elements ) {
		this.callback(
			elements.map( target => ( { target, isIntersecting: true } ) ),
			this
		);
	}

	/** A pass that does not cross the threshold: the callback must ignore it. */
	leave( ...elements ) {
		this.callback(
			elements.map( target => ( { target, isIntersecting: false } ) ),
			this
		);
	}
}

/** MutationObserver records, so trackVisibilityDynamic can be driven by hand too. */
export const mutationObservers = [];

class FakeMutationObserver {
	constructor( callback ) {
		this.callback = callback;
		this.target = null;
		this.options = null;
		mutationObservers.push( this );
	}

	observe( target, options ) {
		this.target = target;
		this.options = options;
	}

	disconnect() {}

	/** Declares that these nodes were added to the page. */
	addNodes( ...nodes ) {
		this.callback( [ { addedNodes: nodes } ], this );
	}
}

/**
 * Resets everything the module touches between tests.
 *
 * The observed-element registry lives on `window` and deliberately outlives a single sweep, so a
 * test that forgot to clear it would see another test's elements.
 */
export function resetPage( { search = '' } = {} ) {
	document.body.innerHTML = '';
	document.head.innerHTML = '';
	observers.length = 0;
	mutationObservers.length = 0;

	delete window._cknObservedElements;
	delete window.geo_casino_data;

	globalThis.dataLayer = [];
	window.dataLayer = globalThis.dataLayer;

	window.IntersectionObserver = FakeIntersectionObserver;
	window.MutationObserver = FakeMutationObserver;
	globalThis.IntersectionObserver = FakeIntersectionObserver;
	globalThis.MutationObserver = FakeMutationObserver;

	window.history.replaceState( {}, '', `/${ search }` );
}

/** Puts the keeper in the page. Call before loading the module, never after. */
export function renderKeeper( overrides = {} ) {
	const attributes = { ...DEFAULT_KEEPER, ...overrides };
	const keeper = document.createElement( 'span' );

	keeper.id = KEEPER_ID;

	Object.entries( attributes ).forEach( ( [ name, value ] ) => {
		if ( value !== null ) {
			keeper.setAttribute( name, value );
		}
	} );

	document.body.appendChild( keeper );

	return keeper;
}

/**
 * A CTA element as `wcp_ut_get_redirect_attr_list()` prints it.
 *
 * Keys are the *logical* names; they are translated through the keeper, exactly as the module does,
 * so a test never hardcodes `data-betting` and cannot drift from the attribute-name setting.
 */
export function renderCta( values = {}, { parent = document.body, keeper = DEFAULT_KEEPER } = {} ) {
	const map = {
		convertElement: keeper[ 'data-wcp-ut-convert-element' ],
		casinoName: keeper[ 'data-wcp-ut-casino-name' ],
		casinoId: keeper[ 'data-wcp-ut-casino-id' ],
		position: keeper[ 'data-wcp-ut-position' ],
		apikosId: keeper[ 'data-wcp-ut-apikos-id' ],
		bonusName: keeper[ 'data-wcp-ut-bonus-name' ],
	};

	const element = document.createElement( 'a' );

	Object.entries( values ).forEach( ( [ key, value ] ) => {
		if ( map[ key ] && value !== null ) {
			element.setAttribute( `data-${ map[ key ] }`, value );
		}
	} );

	parent.appendChild( element );

	return element;
}

/** A casino constructor block, the only container the shared sweep treats specially. */
export function renderCasinoBlock() {
	const block = document.createElement( 'div' );

	block.classList.add( 'js-constructor-casino' );
	document.body.appendChild( block );

	return block;
}

/**
 * Loads a fresh instance of the shipped module.
 *
 * The module is never imported statically anywhere in this suite: it captures the keeper on
 * evaluation, so one instance per DOM is the only honest way to test it.
 */
export async function loadTrackVisibility() {
	vi.resetModules();

	return import( MODULE_PATH );
}

/** Only the analytics pushes, ignoring anything GTM itself would add. */
export function events() {
	return globalThis.dataLayer.filter( entry => entry && entry.event === 'GAevent' );
}
