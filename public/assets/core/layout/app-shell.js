import { APP_VIEWS } from '../constants.js';
import { renderMapsView } from '../views/maps-view.js';
import { renderDashboardView } from '../views/dashboard-view.js';
import { renderSettingsView } from '../views/settings-view.js';
import { renderGuidesView } from '../views/guides-view.js';

export function renderAppShell(state, data, { renderHeader, assetsBase }) {
    return `
        <div class="dm-app">
            ${renderHeader(state, assetsBase)}
            <div class="dm-page">
                ${state.view === APP_VIEWS.MAPS ? renderMapsView(state, data) : ''}
                ${state.view === APP_VIEWS.DASHBOARD ? renderDashboardView(state, data) : ''}
                ${state.view === APP_VIEWS.SETTINGS ? renderSettingsView(state, data) : ''}
                ${state.view === APP_VIEWS.GUIDES ? renderGuidesView(state, data) : ''}
            </div>
        </div>
    `;
}
