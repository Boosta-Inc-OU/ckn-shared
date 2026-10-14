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
                // Run only once: release the element before calling out, so a callback that throws
                // can neither leave it observed nor abort the rest of this batch. The browser hands
                // several entries to one call, and an exception thrown here used to lose every
                // element after it - silently, because nothing on the page reports it.
                this.unobserve(entry.target);

                try {
                    this.callback(entry.target);
                } catch (e) {
                    console.error('[ckn-shared] visibility callback failed', e);
                }
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

		// GTM may not have defined dataLayer yet, or at all: a site with no container, a container
		// that failed to load, or one injected after the first element came into view. Queue the
		// event the way GTM's own snippet does rather than throwing.
		window.dataLayer = window.dataLayer || [];
		window.dataLayer.push(data);

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
 * @param {ParentNode}  [options.root=document]          Where to look - an inserted fragment, for ajax.
 * @param {Element}     [options.keeper]                 The keeper element; defaults to the page's own.
 * @param {boolean}     [options.onBlockVisible=false]   Report a block's elements when the block
 *                      itself comes into view, rather than each element when it does. For a block
 *                      whose contents are collapsed behind a spoiler, where the question the
 *                      analytics answers is whether the reader reached the block at all.
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

	// Kept per block rather than in one flat list: with onBlockVisible a block reports its own
	// elements and nobody else's, and a page may hold several blocks of the same component.
	const blocks = [];

	root.querySelectorAll( selector ).forEach( block => {
		const elements = [];

		// A block may carry the CTA attribute itself - a referral card is one element, not a
		// container with one inside - so matching the block is not the same as searching it.
		if ( block.matches( ctaSelector ) ) {
			elements.push( block );
		}

		block.querySelectorAll( ctaSelector ).forEach( element => elements.push( element ) );

		if ( elements.length ) {
			blocks.push( { block, elements } );
		}
	} );

	if ( ! blocks.length ) {
		return [];
	}

	if ( ! window._cknObservedElements ) {
		window._cknObservedElements = new Set();
	}

	const registry = window._cknObservedElements;

	blocks.forEach( entry => {
		entry.fresh = entry.elements.filter( element => ! registry.has( element ) );
	} );

	const fresh = blocks.reduce( ( all, entry ) => all.concat( entry.fresh ), [] );

	if ( ! fresh.length ) {
		return [];
	}

	fresh.forEach( element => registry.add( element ) );

	if ( ! isComponentVisibilityEnabled( keeper, slug ) ) {
		return [];
	}

	if ( options.onBlockVisible ) {
		const blockObserver = new trackVisibilityClass( seen => {
			const entry = blocks.find( candidate => candidate.block === seen );

			if ( entry ) {
				entry.fresh.forEach( element => blockObserver.sendEvent( element ) );
			}
		} );

		blocks.forEach( entry => {
			if ( entry.fresh.length ) {
				blockObserver.observe( entry.block );
			}
		} );

		return fresh;
	}

	const observer = new trackVisibilityClass( element => observer.sendEvent( element ) );

	fresh.forEach( element => observer.observe( element ) );

	return fresh;
}

/**
 * The page's last-resort sweep: every CTA element no component claimed for itself.
 *
 * `trackComponent()` is what a component calls, and once every component that prints CTA elements
 * calls it this function has nothing left to do. Until then some elements have no owner - a block
 * reusing another component's templates, a sticky banner, the logos in the footer - and without a
 * sweep their impressions would simply stop. So this exists to be removed, and the count it returns
 * is the measure of how far that is: on a page where it reports zero, every element has an owner.
 *
 * It must run after every component has claimed its own, which is a scheduling decision and
 * therefore the caller's: the components claim from their `DOMContentLoaded` handlers, so the
 * caller defers this past that queue. Run too early it is not a fallback but a competitor, and the
 * component that loses is the one whose bundle happened to come later.
 *
 * Unlike `trackVisibilityOthers()` it excludes nothing by class. The registry already says what is
 * taken, and the casino constructor's own sweep has run by then; rows that arrive later over ajax
 * are not in the page yet and are handled by that component when they are.
 *
 * The switches still decide whether anything is sent - `trackVisibility()` applies them - but the
 * returned list does not depend on them, so the count stays usable as a measure with tracking off.
 *
 * @param {Object}     [options]
 * @param {ParentNode} [options.root=document]
 * @param {Element}    [options.keeper]
 *
 * @return {Element[]} The unclaimed elements, before the switches are consulted.
 */
export function trackRemaining( options = {} ) {
	const keeper = options.keeper !== undefined ? options.keeper : params;

	if ( ! keeper || ! keeper.dataset ) {
		return [];
	}

	const convertElement = keeper.dataset.wcpUtConvertElement;

	if ( ! convertElement ) {
		return [];
	}

	const root = options.root || document;
	const registry = window._cknObservedElements instanceof Set ? window._cknObservedElements : null;
	const all = Array.from( root.querySelectorAll( '[data-' + convertElement + ']' ) );
	const unclaimed = registry ? all.filter( element => ! registry.has( element ) ) : all;

	if ( unclaimed.length ) {
		trackVisibility( unclaimed );
	}

	return unclaimed;
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
