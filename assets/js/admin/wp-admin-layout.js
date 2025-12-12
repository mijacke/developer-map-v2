/**
 * WordPress Admin Layout Manager
 * 
 * Dynamicky meria a aplikuje offsety pre vlastný panel/editor a modály vo WordPress admin rozhraní,
 * aby nezaliezali pod ľavé menu, horný admin bar ani pravý scrollbar.
 * 
 * Features:
 * - Automatické meranie reálnej šírky WP menu a výšky admin baru
 * - Živé meranie šírky scrollbaru na pravej strane
 * - Reaguje na fold/unfold menu
 * - Sleduje resize okna a zmeny scrollbaru
 * - MutationObserver pre zmeny v DOM
 * - Aplikuje offsety na všetky overlaye (editor + modály)
 * - Čistý vanilla JS, žiadne závislosti
 * 
 * @version 1.2.0
 * @date 2025-11-03
 */

export class WPAdminLayoutManager {
    constructor(targetSelectors = ['.dm-editor-overlay', '.dm-modal-overlay']) {
        this.targetSelectors = Array.isArray(targetSelectors) ? targetSelectors : [targetSelectors];
        this.targets = [];
        
        // WordPress admin selektory
        this.selectors = {
            adminBar: '#wpadminbar',
            adminMenu: '#adminmenuwrap',
            adminMenuMain: '#adminmenu',
            body: 'body'
        };
        
        // Cache pre DOM elementy
        this.elements = {
            adminBar: null,
            adminMenu: null,
            adminMenuMain: null,
            body: null
        };
        
        // Aktuálne offsety
        this.offsets = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0
        };
        
        // Debounce timer a flags
        this.resizeTimer = null;
        this.resizeDelay = 150;
        this.scrollCheckScheduled = false;
        
        // MutationObserver
        this.observer = null;
        
        // Bind metódy
        this.handleResize = this.handleResize.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.handleMenuTransition = this.handleMenuTransition.bind(this);
        this.updateLayout = this.updateLayout.bind(this);
    }
    
    /**
     * Inicializuje layout manager
     */
    init() {
        // Cache WordPress admin elementy
        this.cacheElements();
        
        // Nájdi všetky target elementy
        this.findTargets();
        
        if (this.targets.length === 0) {
            // Toto nie je chyba - editor/modály sa zobrazujú až neskôr
            // Len nastav listeners, aby sme boli pripravení
            this.attachListeners();
            this.setupObserver();
            return true; // Vráť true, aby nedošlo k console.warn
        }
        
        // Počiatočné meranie
        this.updateLayout();
        
        // Nastav event listeners
        this.attachListeners();
        
        // Nastav MutationObserver pre zmeny v DOM
        this.setupObserver();
        
        return true;
    }
    
    /**
     * Nájde všetky target elementy (editor, modály)
     */
    findTargets() {
        this.targets = [];
        let foundCount = 0;
        this.targetSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            foundCount += elements.length;
            elements.forEach(el => {
                if (!this.targets.includes(el)) {
                    this.targets.push(el);
                }
            });
        });
    }
    
    /**
     * Cache WordPress admin DOM elementy
     */
    cacheElements() {
        this.elements.adminBar = document.querySelector(this.selectors.adminBar);
        this.elements.adminMenu = document.querySelector(this.selectors.adminMenu);
        this.elements.adminMenuMain = document.querySelector(this.selectors.adminMenuMain);
        this.elements.body = document.body;
    }
    
    /**
     * Zmeria aktuálne rozmery WordPress admin UI a scrollbaru
     */
    measureAdminUI() {
        const measurements = {
            menuWidth: 0,
            adminBarHeight: 0,
            scrollbarWidth: 0,
            isFolded: false,
            isAutoFold: false,
            hasAdminBar: false,
            hasAdminMenu: false,
            hasScrollbar: false
        };
        
        // Zmeraj admin bar výšku
        if (this.elements.adminBar) {
            const barRect = this.elements.adminBar.getBoundingClientRect();
            measurements.adminBarHeight = barRect.height;
            measurements.hasAdminBar = true;
        }
        
        // Zmeraj menu šírku
        if (this.elements.adminMenu) {
            measurements.hasAdminMenu = true;
            
            // Zisti či je menu folded
            measurements.isFolded = this.elements.body.classList.contains('folded');
            measurements.isAutoFold = this.elements.body.classList.contains('auto-fold');
            
            // Zmeraj REÁLNU šírku menu
            const menuRect = this.elements.adminMenu.getBoundingClientRect();
            measurements.menuWidth = menuRect.width;
            
            // Ak je šírka 0, skús alternatívne meranie
            if (measurements.menuWidth === 0 && this.elements.adminMenuMain) {
                const mainMenuRect = this.elements.adminMenuMain.getBoundingClientRect();
                measurements.menuWidth = mainMenuRect.width;
            }
            
            // Fallback na štandardné hodnoty ak meranie zlyhá
            if (measurements.menuWidth === 0) {
                if (measurements.isFolded || measurements.isAutoFold) {
                    measurements.menuWidth = 36; // Folded menu width
                } else {
                    measurements.menuWidth = 160; // Expanded menu width
                }
            }
        }
        
        // Zmeraj šírku scrollbaru (rozdiel medzi window.innerWidth a clientWidth)
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollbarWidth > 0) {
            measurements.scrollbarWidth = scrollbarWidth;
            measurements.hasScrollbar = true;
        }
        
        return measurements;
    }
    
    /**
     * Aktualizuje layout všetkých targets (editor + modály) na základe meraní
     */
    updateLayout() {
        // Refresh targets - môžu sa pridať/odstrániť modály dynamicky
        const previousTargetCount = this.targets.length;
        this.findTargets();
        
        if (this.targets.length === 0) return;
        
        const measurements = this.measureAdminUI();
        
        // Vypočítaj offsety
        const leftOffset = measurements.hasAdminMenu ? measurements.menuWidth : 0;
        const topOffset = measurements.hasAdminBar ? measurements.adminBarHeight : 0;
        const rightOffset = measurements.hasScrollbar ? measurements.scrollbarWidth : 0;
        
        // Aplikuj ak sa zmenili offsety ALEBO ak pribudli/ubudli targets (nové modály)
        const targetsChanged = this.targets.length !== previousTargetCount;
        const offsetsChanged = this.offsets.left !== leftOffset || 
                               this.offsets.top !== topOffset || 
                               this.offsets.right !== rightOffset;
        
        if (offsetsChanged || targetsChanged) {
            this.offsets.left = leftOffset;
            this.offsets.top = topOffset;
            this.offsets.right = rightOffset;
            
            this.applyOffsets();
        }
    }
    
    /**
     * Aplikuje offsety na všetky targets (editor + modály)
     */
    applyOffsets() {
        if (this.targets.length === 0) return;
        
        // Aplikuj na každý target element
        this.targets.forEach(target => {
            // Aplikuj CSS custom properties
            target.style.setProperty('--wp-admin-menu-width', `${this.offsets.left}px`);
            target.style.setProperty('--wp-admin-bar-height', `${this.offsets.top}px`);
            target.style.setProperty('--wp-scrollbar-width', `${this.offsets.right}px`);
            
            // Aplikuj aj ako inline styles pre istotu
            target.style.left = `${this.offsets.left}px`;
            target.style.top = `${this.offsets.top}px`;
            target.style.right = `${this.offsets.right}px`;
            target.style.width = `calc(100vw - ${this.offsets.left}px - ${this.offsets.right}px)`;
            target.style.height = `calc(100vh - ${this.offsets.top}px)`;
        });
    }
    
    /**
     * Nastav event listeners
     */
    attachListeners() {
        // Window resize s debounce (zachytáva aj zmeny scrollbaru)
        window.addEventListener('resize', this.handleResize);
        
        // Scroll events - zmeny scrollbaru (objavenie/zmiznutie)
        window.addEventListener('scroll', this.handleScroll);
        
        // MutationObserver pre <html> a <body> - zachytáva zmeny overflow/height ktoré ovplyvňujú scrollbar
        const scrollObserver = new MutationObserver(() => {
            // Debounce pomocou requestAnimationFrame
            if (!this.scrollCheckScheduled) {
                this.scrollCheckScheduled = true;
                requestAnimationFrame(() => {
                    this.scrollCheckScheduled = false;
                    this.updateLayout();
                });
            }
        });
        
        scrollObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: true,
            subtree: false
        });
        
        scrollObserver.observe(this.elements.body, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: true,
            subtree: false
        });
        
        // Body class changes (fold/unfold)
        if (this.elements.body) {
            // Sleduj zmeny tried na body
            const bodyObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        // Delay pre dokončenie CSS transitions
                        setTimeout(() => {
                            this.updateLayout();
                        }, 350); // WordPress menu transition je 300ms
                    }
                });
            });
            
            bodyObserver.observe(this.elements.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
        
        // Menu transition end
        if (this.elements.adminMenu) {
            this.elements.adminMenu.addEventListener('transitionend', this.handleMenuTransition);
        }
        
        // Admin bar events (pre mobilné breakpointy)
        if (this.elements.adminBar) {
            // Pozoruj zmeny na admin bare
            const barObserver = new MutationObserver(() => {
                this.updateLayout();
            });
            
            barObserver.observe(this.elements.adminBar, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }
    }
    
    /**
     * Handle window resize s debounce
     */
    handleResize() {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.updateLayout();
        }, this.resizeDelay);
    }
    
    /**
     * Handle scroll event - detekuje zmeny scrollbaru
     */
    handleScroll() {
        if (!this.scrollCheckScheduled) {
            this.scrollCheckScheduled = true;
            requestAnimationFrame(() => {
                this.scrollCheckScheduled = false;
                this.updateLayout();
            });
        }
    }
    
    /**
     * Handle menu transition end
     */
    handleMenuTransition(event) {
        // Aktualizuj len pri width transitions
        if (event.propertyName === 'width' || event.propertyName === 'margin-left') {
            this.updateLayout();
        }
    }
    
    /**
     * Nastav MutationObserver pre sledovanie DOM zmien
     */
    setupObserver() {
        this.observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            
            mutations.forEach((mutation) => {
                // Sleduj pridanie/odstránenie admin elementov
                if (mutation.addedNodes.length || mutation.removedNodes.length) {
                    const relevantChange = Array.from(mutation.addedNodes)
                        .concat(Array.from(mutation.removedNodes))
                        .some(node => {
                            if (node.nodeType !== Node.ELEMENT_NODE) return false;
                            const el = node;
                            return el.id === 'wpadminbar' || 
                                   el.id === 'adminmenuwrap' || 
                                   el.id === 'adminmenu';
                        });
                    
                    if (relevantChange) {
                        shouldUpdate = true;
                        this.cacheElements(); // Re-cache elements
                    }
                }
            });
            
            if (shouldUpdate) {
                setTimeout(() => {
                    this.updateLayout();
                }, 100);
            }
        });
        
        // Sleduj celý document body
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    /**
     * Vyčistí event listeners a observers
     */
    destroy() {
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('scroll', this.handleScroll);
        
        if (this.elements.adminMenu) {
            this.elements.adminMenu.removeEventListener('transitionend', this.handleMenuTransition);
        }
        
        // Disconnect observer
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        // Clear timer a flags
        clearTimeout(this.resizeTimer);
        this.scrollCheckScheduled = false;
        
        // Reset styles pre všetky targets
        this.targets.forEach(target => {
            target.style.removeProperty('--wp-admin-menu-width');
            target.style.removeProperty('--wp-admin-bar-height');
            target.style.removeProperty('--wp-scrollbar-width');
            target.style.left = '';
            target.style.top = '';
            target.style.right = '';
            target.style.width = '';
            target.style.height = '';
        });
        
        this.targets = [];
    }
    
    /**
     * Manuálne vynúti update
     */
    forceUpdate() {
        this.cacheElements();
        this.updateLayout();
    }
    
    /**
     * Získaj aktuálne offsety
     */
    getOffsets() {
        return { ...this.offsets };
    }
}

/**
 * Helper funkcia pre rýchlu inicializáciu
 */
export function initWPAdminLayout(targetSelectors = ['.dm-editor-overlay', '.dm-modal-overlay']) {
    const manager = new WPAdminLayoutManager(targetSelectors);
    const initialized = manager.init();
    return initialized ? manager : null;
}

export default WPAdminLayoutManager;
