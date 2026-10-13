/**
 * Track visibility of conversion elements
 */

const params = document.querySelector('#wcp_ut_data_attributes_keeper');

function getScrollPercentage() {
	const scrollTop = window.scrollY;
	const docHeight = document.documentElement.scrollHeight - window.innerHeight;
	return docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
}

export class trackVisibilityClass {
    constructor(callback, options = {}) {
        this.callback = callback;
        this.options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.5,
			isTest: this.isTest(),
            ...options
        };

        this.observer = new IntersectionObserver(this._handleIntersect.bind(this), this.options);
    }

    _handleIntersect(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                this.callback(entry.target);
                this.unobserve(entry.target); // Run only once, then stop observing
            }
        });
    }

    observe(element) {
        this.observer.observe(element);
    }

    unobserve(element) {
        this.observer.unobserve(element);
    }

    disconnect() {
        this.observer.disconnect();
    }

	isTest() {
		const urlParams = new URLSearchParams(window.location.search);

		if ( urlParams.get('logvisibility') == 1 ) {
			return true;
		}

		return false;
	}

	sendEvent(element) {
		const data = {
			event: 'GAevent',
			eventCategory: 'viewCasino',
			eventAction: element.getAttribute('data-' + params.dataset.wcpUtConvertElement),
			eventLabel: element.getAttribute('data-' + params.dataset.wcpUtCasinoName),
			eventLabelID: element.getAttribute('data-' + params.dataset.wcpUtCasinoId),
			aid: element.getAttribute('data-' + params.dataset.wcpUtApikosId),
			bonusName: element.getAttribute('data-' + params.dataset.wcpUtBonusName) || '',
			scrollPercentage: getScrollPercentage(),
			pageType: params.dataset.wcpUtPageType || '',
			geoUser: params.dataset.wcpUtUserGeo || '',
			userID: params.dataset.wcpUtUserId || '',
		}

		const casinoBlock = element.closest('.js-constructor-casino');
		if (casinoBlock) {
			data.geoPosition = Array.from(
				document.querySelectorAll('.js-constructor-casino')
			).indexOf(casinoBlock) + 1;
		}

		if ( element.getAttribute('data-' + params.dataset.wcpUtPosition) ) {
			data.position = element.getAttribute('data-' + params.dataset.wcpUtPosition);
		}

		dataLayer.push(data);

		if ( this.options.isTest ) {
			this.logEvent(data);
		}
	}

	logEvent(data) {
		console.info(data);
	}
}

export function trackVisibility(elements) {
	if ( params.dataset.wcpUtDataLayer === 'on' && params.dataset.wcpUtDataLayerVisibility === 'on' ) {
		if ( !window._cknObservedElements ) {
			window._cknObservedElements = new Set();
		}

		const fresh = Array.from(elements).filter(el => !window._cknObservedElements.has(el));

		if ( !fresh.length ) return;

        const observer = new trackVisibilityClass(element => {
			observer.sendEvent(element);
        });

		fresh.forEach(element => {
			window._cknObservedElements.add(element);
			observer.observe(element);
		});
    }
}

/**
 * Splits a comma separated list of component slugs, as the core publishes it.
 *
 * An empty attribute is an empty list, not a list with one empty entry.
 */
function toSlugs( list ) {
	return String( list ).split( ',' ).map( slug => slug.trim() ).filter( Boolean );
}

/**
 * Whether the core knows about this component's own analytics switch.
 *
 * `ckn-core` resolves the three-state rule (inherit / on / off) server side and publishes two
 * already-resolved lists of slugs, but only for the components that declared themselves through the
 * `ckn/core/tracking/components` filter. A slug that never declared itself can never appear in
 * either list, so an empty list says nothing about it - reading the lists anyway reports "enabled"
 * while the master switch is off, which is a defect this codebase has already shipped once.
 *
 * The declared set is published as a third attribute precisely so that the question can be answered
 * instead of guessed. An older core does not print it; there the global flags are the whole truth.
 */
export function isComponentDeclared( keeper, slug ) {
	const declared = keeper && keeper.dataset ? keeper.dataset.wcpUtTrackComponents : undefined;

	return typeof declared === 'string' && toSlugs( declared ).includes( slug );
}

/**
 * Whether this component may send analytics events at all.
 *
 * For a declared component the published list is the whole answer: the core has already applied the
 * master switch and the per-component state to it, including the case where the component is forced
 * on while the master switch is off. For anything else the master switch decides.
 */
export function isComponentEnabled( keeper, slug ) {
	if ( ! keeper || ! keeper.dataset ) {
		return false;
	}

	if ( isComponentDeclared( keeper, slug ) ) {
		return ! toSlugs( keeper.dataset.wcpUtTrackOff || '' ).includes( slug );
	}

	return keeper.dataset.wcpUtDataLayer === 'on';
}

/**
 * Whether this component may send impression events, assuming tracking itself is on.
 *
 * Visibility is a second axis rather than a second on/off for the same thing, so it is always an
 * additional condition - the core composes it the same way.
 */
export function isComponentVisibilityEnabled( keeper, slug ) {
	if ( ! isComponentEnabled( keeper, slug ) ) {
		return false;
	}

	if ( isComponentDeclared( keeper, slug ) ) {
		return ! toSlugs( keeper.dataset.wcpUtTrackVisibilityOff || '' ).includes( slug );
	}

	return keeper.dataset.wcpUtDataLayerVisibility === 'on';
}

/**
 * Impressions for the CTA elements of one component, and nothing else on the page.
 *
 * This is the function a component should call. The older `trackVisibilityOthers()` sweeps every CTA
 * element on the page, and several components call it, so the first bundle to load claims all of
 * them through the registry and reports impressions on behalf of components that never asked:
 * measured on a casino page, one component was reporting all 22 elements, including another
 * component's sidebar and a third one's logo. Nothing in the traffic shows which component a given
 * impression belongs to, the per-component switch cannot work, and coverage silently depends on
 * which plugins happen to be active. QA reported the consequences on 2026-10-13.
 *
 * Scoping is the whole fix: a component passes the selector of its own block and gets the CTA
 * elements inside it, the block itself included when it carries the attribute directly.
 *
 * The elements are claimed in the registry **before** the switches are consulted, deliberately. A
 * page-wide sweep skips whatever is already claimed, so claiming is what lets a component that is
 * switched off actually stay silent; leaving its elements unclaimed would hand them to the sweep,
 * which knows only the global flags.
 *
 * @param {string}      slug     The component's slug, as declared to `ckn/core/tracking/components`.
 * @param {string}      selector Selector of the component's own block.
 * @param {Object}      [options]
 * @param {ParentNode}  [options.root=document] Where to look - an inserted fragment, for ajax.
 * @param {Element}     [options.keeper]        The keeper element; defaults to the page's own.
 *
 * @return {Element[]} The elements now under observation. Empty is a normal answer: no block on the
 *                     page, the component switched off, or the elements already claimed by someone
 *                     else - while any page-wide sweep still exists, that last case is possible.
 */
export function trackComponent( slug, selector, options = {} ) {
	if ( typeof slug !== 'string' || ! slug || typeof selector !== 'string' || ! selector ) {
		return [];
	}

	const keeper = options.keeper !== undefined ? options.keeper : params;

	if ( ! keeper || ! keeper.dataset ) {
		return [];
	}

	const convertElement = keeper.dataset.wcpUtConvertElement;

	if ( ! convertElement ) {
		return [];
	}

	const root = options.root || document;
	const ctaSelector = '[data-' + convertElement + ']';
	const elements = [];

	root.querySelectorAll( selector ).forEach( block => {
		// A block may carry the CTA attribute itself - a referral card is one element, not a
		// container with one inside - so matching the block is not the same as searching it.
		if ( block.matches( ctaSelector ) ) {
			elements.push( block );
		}

		block.querySelectorAll( ctaSelector ).forEach( element => elements.push( element ) );
	} );

	if ( ! elements.length ) {
		return [];
	}

	if ( ! window._cknObservedElements ) {
		window._cknObservedElements = new Set();
	}

	const registry = window._cknObservedElements;
	const fresh = elements.filter( element => ! registry.has( element ) );

	if ( ! fresh.length ) {
		return [];
	}

	fresh.forEach( element => registry.add( element ) );

	if ( ! isComponentVisibilityEnabled( keeper, slug ) ) {
		return [];
	}

	const observer = new trackVisibilityClass( element => observer.sendEvent( element ) );

	fresh.forEach( element => observer.observe( element ) );

	return fresh;
}

/**
 * Track visibility on whole page except casino constructor blocks
 */
export function trackVisibilityOthers() {
    const elements = document.querySelectorAll('[data-' + params.dataset.wcpUtConvertElement + ']:not(.js-constructor-casino [data-' + params.dataset.wcpUtConvertElement + '])');

	trackVisibility(elements);
}

/**
 * Track visibility in casino constructor block only
 *
 * @param fragment Casinos fragment loaded after click on "Show more" button
 * @param onload Page onload flag
 */
export function trackVisibilityCasino(fragment = null, onload = false) {
	const geoStatus = typeof window.geo_casino_data !== 'undefined' ? window.geo_casino_data.geo_status : 0;
	if ( geoStatus === 0 || !onload ) { // Skip tracking on page onload if GEO is enabled
		let elements = document.querySelectorAll('.js-constructor-casino [data-' + params.dataset.wcpUtConvertElement + ']');

		if ( fragment ) {
			const selector = '[data-' + params.dataset.wcpUtConvertElement + ']';

			elements = [];
			fragment.forEach( item => {
				// A row container carries the brand data but not the CTA attribute, so reporting it
				// unconditionally sent an extra impression with an empty action - and only for rows
				// that arrived over ajax, since the page-load sweep selects by this same attribute.
				if ( item.matches(selector) ) {
					elements.push(item);
				}

				elements.push(...item.querySelectorAll(selector));
			} );
		}

		trackVisibility(elements);
	}
}

/**
 * Track visibility dynamically added elements
 */
export function trackVisibilityDynamic() {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.matches('[data-' + params.dataset.wcpUtConvertElement + ']')) {
                    trackVisibility([node]);
                } else if (node.nodeType === 1) {
                    const elements = node.querySelectorAll('[data-' + params.dataset.wcpUtConvertElement + ']');

                    if (elements.length > 0) {
                        trackVisibility(Array.from(elements));
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
