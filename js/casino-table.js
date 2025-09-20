import {trackVisibilityCasino} from "./track-visibility.js";

export default class CasinoTableAjaxLoader {
	bufferSize = 1;
	#isLoadingFragments = false;
	#hasFragmentsYet = true;
	static HOOKS = [];

	/**
	 * @param {Element} root
	 */
	constructor(root) {
		this.fragments = [];
		this.$root = root;
		this.showNextFragment = this.showNextFragment.bind(this);

		const btn = this.$loadMoreButton;
		this.next = btn ? (btn.dataset ? btn.dataset.query : btn.getAttribute('data-query')) : null;
	}

	init() {
		const btn = this.$loadMoreButton;

		if (btn) {
			btn.addEventListener('click', this.showNextFragment);
		}

		this.fullFillBuffer();
	}

	destroy() {
		const btn = this.$loadMoreButton;

		if (btn) {
			btn.removeEventListener('click', this.showNextFragment);
		}
	}

	/**
	 * @param {Function} hookFunction
	 */
	static addRebindHook(hookFunction) {
        if (typeof hookFunction === 'function') {
            CasinoTableAjaxLoader.HOOKS.push(hookFunction);
        }
    }

	/**
	 * @return {Element|null}
	 */
	get $loadMoreButton() {
		return this.$root ? this.$root.querySelector('.js-ajax-load') : null;
	}

	/**
	 * @return {void}
	 */
	lockUi() {
		const btn = this.$loadMoreButton;

		if (!btn) return;

		btn.classList.add('loading');
		btn.setAttribute('disable', 'true');
	}

	/**
	 * @return {void}
	 */
	unLockUi() {
		const btn = this.$loadMoreButton;

		if (!btn) return;

		btn.classList.remove('loading');
		btn.setAttribute('disable', 'false');
	}

	isAllFragmentsLoaded() {
		return !this.#hasFragmentsYet && this.fragments.length === 0;
	}

	/**
	 * @return {Promise<void>}
	 */
	async showNextFragment() {
		if (this.fragments.length > 0) {
			const fragment = this.fragments.pop();
			const root = this.$root;
			const container = root.querySelector('.js-fragment-table-body');
			const oldCasinos = Array.from(root.querySelectorAll('.js-fragment-table-body > .js-referral'));

			if (container && typeof fragment === 'string') {
				container.insertAdjacentHTML('beforeend', fragment);
			}

			const casinos = Array.from(root.querySelectorAll('.js-fragment-table-body > .js-referral'));

			await this.fullFillBuffer();

			CasinoTableAjaxLoader.HOOKS.forEach(hook => {
				try { hook(); } catch(e) { console.error(e); }
			});

			// Determine newly added nodes: casinos minus oldCasinos
			const oldSet = new Set(oldCasinos);
			const newOnes = casinos.filter(el => !oldSet.has(el));

			try {
				trackVisibilityCasino(newOnes);
			} catch(e) { /* ignore */ }

			// TODO: Add Automation
			/*try {
				Automation.setupMarkers();
			} catch(Err) {
				console.error(`Automation failed ( caller: showNextFragment ) - ${Err}`)
			}*/
		} else {
			const success = await this.loadNextFragment();

			if (success) {
				await this.showNextFragment();
			}
		}

		if (this.isAllFragmentsLoaded()) {
			const btn = this.$loadMoreButton;

			if (btn) {
				btn.style.display = 'none';
			}
		}
	}

	/**
	 * @return {Promise<void>}
	 */
	async fullFillBuffer() {
		while (this.fragments.length < this.bufferSize) {
			const success = await this.loadNextFragment();

			if (!success) {
				break;
			}
		}
	}

	/**
	 * @return {Promise<boolean>}
	 */
	async loadNextFragment() {
		if (this.#isLoadingFragments) {
			return false;
		}

		if (!this.next) {
			return false;
		}

		this.lockUi();
		this.#isLoadingFragments = true;

		const response = await fetch(this.next);
		const json = await response.json();
		const fragments = json.fragments;

		let fragment = typeof fragments === 'object' ?
			fragments['.js-fragment-table-body'] :
			null;

		fragment = typeof fragment === 'string' ? fragment.trim() : null;

		if (!fragment) {
			this.#hasFragmentsYet = false;

			this.#isLoadingFragments = false;
			this.unLockUi();
			return false;
		}

		this.fragments.unshift(fragment);
		this.next = json.next ?? null;
		this.#hasFragmentsYet = json['has_fragments_yet'];

		this.#isLoadingFragments = false;
		this.unLockUi();

		return true;
	}
}
