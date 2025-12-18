import { APP_VIEWS } from '../constants.js';
import { escapeHtml } from '../utils/html.js';

// Plugin version - should match PHP version
const PLUGIN_VERSION = '0.4.4';

const getBrandIcons = (base) => ({
    logo: `<img src="${base}/img/Logo.svg" alt="Logo" style="display: block; width: auto; height: clamp(32px, 5vw, 48px);" />`,
    mark: `<img src="${base}/img/Brand_logo.svg" alt="FuuDobre" style="display: block; width: 100%; height: auto;" />`
});


const getNavIcons = (base) => ({
    settings: `<img src="${base}/img/Settings_btn.svg" width="24" height="24" alt="Settings" />`,
    docs: `<img src="${base}/img/Docs_btn.svg" width="24" height="24" alt="Docs" />`,
    search: `<img src="${base}/img/Search.svg" width="24" height="24" alt="Search" />`,
});

export function renderHeader(state, assetsBase) {
    const icons = getNavIcons(assetsBase || '');
    const brandIcons = getBrandIcons(assetsBase || '');
    const settingsActive = state.view === APP_VIEWS.SETTINGS ? ' is-active' : '';
    const guidesActive = state.view === APP_VIEWS.GUIDES ? ' is-active' : '';
    const html = `
        <header class="dm-topbar">
            <button type="button" class="dm-topbar__brand" data-dm-nav="maps" aria-label="Developer Map" title="Developer Map">
                <span class="dm-topbar__logo" aria-hidden="true">${brandIcons.logo}</span>
                <div class="dm-topbar__brand-text">
                    <span class="dm-topbar__title">Developer Map</span>
                    <span class="dm-topbar__version">Version ${PLUGIN_VERSION}</span>
                </div>
                <span class="dm-topbar__mark" aria-hidden="true">${brandIcons.mark}</span>
                <span class="dm-topbar__sr">Developer Map by FuuDobre</span>
            </button>
            <div class="dm-topbar__right">
                <div class="dm-topbar__search">
                    <span class="dm-topbar__search-icon" aria-hidden="true">${icons.search}</span>
                    <input type="search" placeholder="Vyhľadať mapu..." aria-label="Vyhľadať mapu" data-dm-role="search" data-dm-preserve-focus="topbar-search" value="${escapeHtml(state.searchTerm)}" />
                </div>
                <button type="button" class="dm-topbar__link${settingsActive}" data-dm-nav="settings">
                    <span class="dm-topbar__link-icon" aria-hidden="true">${icons.settings}</span>
                    <span>Nastavenia</span>
                </button>
                <button type="button" class="dm-topbar__link${guidesActive}" data-dm-nav="guides">
                    <span class="dm-topbar__link-icon" aria-hidden="true">${icons.docs}</span>
                    <span>Návody</span>
                </button>
            </div>
        </header>
    `;
    return html;
}
