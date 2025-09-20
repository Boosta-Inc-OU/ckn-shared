/**
 * Track visibility of conversion elements
 */

const params = document.querySelector('#wcp_ut_data_attributes_keeper');

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
			eventName: 'viewCasino',
			element: element.getAttribute('data-' + params.dataset.wcpUtConvertElement),
			bname: element.getAttribute('data-' + params.dataset.wcpUtCasinoName),
			bid: element.getAttribute('data-' + params.dataset.wcpUtCasinoId),
			aid: element.getAttribute('data-' + params.dataset.wcpUtApikosId),
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
        const observer = new trackVisibilityClass(element => {
			observer.sendEvent(element);
        });

        elements.forEach(element => observer.observe(element));
    }
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
	if ( geo_casino_data.geo_status === 0 || !onload ) { // Skip tracking on page onload if GEO is enabled
		let elements = document.querySelectorAll('.js-constructor-casino [data-' + params.dataset.wcpUtConvertElement + ']');

		if ( fragment ) {
			elements = [];
			fragment.forEach( item => {
				elements.push(item);
				elements.push(...item.querySelectorAll('[data-' + params.dataset.wcpUtConvertElement + ']'));
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
