const getModuleVersion = () => {
    try {
        const url = new URL(import.meta.url);
        const fromUrl = url.searchParams.get('ver');
        if (fromUrl) {
            return fromUrl;
        }
    } catch (error) {
        // ignore
    }
    return (typeof window !== 'undefined' && window.dmRuntimeConfig?.ver) || Date.now();
};

const ver = encodeURIComponent(String(getModuleVersion()));

const [constants, mapsView, dashboardView, settingsView] = await Promise.all([
    import(`../constants.js?ver=${ver}`),
    import(`./maps-view.js?ver=${ver}`),
    import(`./dashboard-view.js?ver=${ver}`),
    import(`./settings-view.js?ver=${ver}`),
]);

const { APP_VIEWS } = constants;
const { renderMapsView } = mapsView;
const { renderDashboardView } = dashboardView;
const { renderSettingsView } = settingsView;

export function renderAppShell(state, data, { renderHeader, assetsBase }) {
    return `
        <div class="dm-app">
            ${renderHeader(state, assetsBase)}
            <div class="dm-page">
                ${state.view === APP_VIEWS.MAPS ? renderMapsView(state, data) : ''}
                ${state.view === APP_VIEWS.DASHBOARD ? renderDashboardView(state, data) : ''}
                ${state.view === APP_VIEWS.SETTINGS ? renderSettingsView(state, data) : ''}
            </div>
        </div>
    `;
}
