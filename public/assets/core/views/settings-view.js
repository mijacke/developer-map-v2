import { SETTINGS_SECTIONS } from '../constants.js';
import { escapeHtml } from '../utils/html.js';
import { getAvailableFonts } from '../data.js';

const ICONS = {
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    back: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
};

export function renderSettingsView(state, data) {
    const showBackButton = state.settingsSection !== SETTINGS_SECTIONS.OVERVIEW;
    
    return `
        <section class="dm-settings">
            <header class="dm-settings__header">
                ${showBackButton ? `
                    <button type="button" class="dm-settings__back" data-dm-settings="${SETTINGS_SECTIONS.OVERVIEW}">
                        <span class="dm-settings__back-icon">${ICONS.back}</span>
                        <span>Späť na prehľad</span>
                    </button>
                ` : ''}
                <h1>${getSectionTitle(state.settingsSection)}</h1>
            </header>
            <div class="dm-settings__surface">
                ${state.settingsSection === SETTINGS_SECTIONS.OVERVIEW ? renderSettingsOverview() : ''}
                ${state.settingsSection === SETTINGS_SECTIONS.TYPES ? renderSettingsTypes(data) : ''}
                ${state.settingsSection === SETTINGS_SECTIONS.STATUSES ? renderSettingsStatuses(data) : ''}
                ${state.settingsSection === SETTINGS_SECTIONS.COLORS ? renderSettingsColors(data) : ''}
                ${state.settingsSection === SETTINGS_SECTIONS.FONTS ? renderSettingsFonts(data) : ''}
            </div>
        </section>
    `;
}

function getSectionTitle(section) {
    switch (section) {
        case SETTINGS_SECTIONS.TYPES:
            return 'Typy';
        case SETTINGS_SECTIONS.STATUSES:
            return 'Stavy';
        case SETTINGS_SECTIONS.COLORS:
            return 'Základné farby mapy';
        case SETTINGS_SECTIONS.FONTS:
            return 'Font písma';
        default:
            return 'Nastavenia';
    }
}

function renderSettingsOverview() {
    const rows = [
        { label: 'Typ', icon: ICONS.edit, target: SETTINGS_SECTIONS.TYPES },
        { label: 'Stav', icon: ICONS.edit, target: SETTINGS_SECTIONS.STATUSES },
        { label: 'Základné farby mapy', icon: ICONS.edit, target: SETTINGS_SECTIONS.COLORS },
        { label: 'Fonty', icon: ICONS.edit, target: SETTINGS_SECTIONS.FONTS },
    ];
    return `
        <div class="dm-card dm-card--settings">
            <h2>Prehľad nastavení</h2>
            <div class="dm-settings__list">
                ${rows
                    .map(
                        (row) => `
                            <div class="dm-settings__item">
                                <span>${row.label}</span>
                                <div class="dm-settings__item-actions">
                                    <button type="button" class="dm-icon-button dm-icon-button--edit" data-dm-settings="${row.target}" aria-label="Upraviť ${row.label}" title="Upraviť">
                                        <span class="dm-icon-button__icon" aria-hidden="true">${row.icon}</span>
                                    </button>
                                </div>
                            </div>
                        `,
                    )
                    .join('')}
            </div>
        </div>
    `;
}

function renderSettingsTypes(data) {
    return `
        <div class="dm-card dm-card--settings">
            <h2>Typy</h2>
            <div class="dm-settings__list">
                ${data.types
                    .map(
                        (item) => `
                            <div class="dm-settings__item">
                                <div class="dm-pill">
                                    <span class="dm-pill__dot" style="background:${item.color}"></span>
                                    ${item.label}
                                </div>
                                <div class="dm-settings__item-actions">
                                    <button type="button" class="dm-icon-button dm-icon-button--edit" data-dm-modal="edit-type" data-dm-payload="${escapeHtml(String(item.id))}" data-dm-type-id="${escapeHtml(String(item.id))}" data-dm-type-label="${escapeHtml(item.label)}" aria-label="Upraviť ${escapeHtml(item.label)}" title="Upraviť">
                                        <span class="dm-icon-button__icon" aria-hidden="true">${ICONS.edit}</span>
                                    </button>
                                    <button type="button" class="dm-icon-button dm-icon-button--delete" data-dm-modal="delete-type" data-dm-payload="${escapeHtml(String(item.id))}" data-dm-type-id="${escapeHtml(String(item.id))}" data-dm-type-label="${escapeHtml(item.label)}" aria-label="Zmazať ${escapeHtml(item.label)}" title="Zmazať">
                                        <span class="dm-icon-button__icon" aria-hidden="true">${ICONS.delete}</span>
                                    </button>
                                </div>
                            </div>
                        `,
                    )
                    .join('')}
            </div>
            <div class="dm-card__footer dm-card__footer--right">
                <button class="dm-button dm-button--dark" data-dm-modal="add-type">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                    Pridať typ
                </button>
            </div>
        </div>
    `;
}

function renderSettingsStatuses(data) {
    return `
        <div class="dm-card dm-card--settings">
            <h2>Stavy</h2>
            <div class="dm-settings__list">
                ${data.statuses
                    .map(
                        (item) => `
                            <div class="dm-settings__item">
                                <div class="dm-pill">
                                    <span class="dm-pill__dot" style="background:${escapeHtml(String(item.color))}"></span>
                                    ${escapeHtml(item.label)}
                                </div>
                                <div class="dm-settings__item-actions">
                                    <button type="button" class="dm-icon-button dm-icon-button--edit" data-dm-modal="edit-status" data-dm-payload="${escapeHtml(String(item.id))}" aria-label="Upraviť ${escapeHtml(item.label)}" title="Upraviť">
                                        <span class="dm-icon-button__icon" aria-hidden="true">${ICONS.edit}</span>
                                    </button>
                                    <button type="button" class="dm-icon-button dm-icon-button--delete" data-dm-modal="delete-status" data-dm-payload="${escapeHtml(String(item.id))}" aria-label="Zmazať ${escapeHtml(item.label)}" title="Zmazať">
                                        <span class="dm-icon-button__icon" aria-hidden="true">${ICONS.delete}</span>
                                    </button>
                                </div>
                            </div>
                        `,
                    )
                    .join('')}
            </div>
            <div class="dm-card__footer dm-card__footer--right">
                <button class="dm-button dm-button--dark" data-dm-modal="add-status">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                    Pridať stav
                </button>
            </div>
        </div>
    `;
}

function renderSettingsColors(data) {
    const colors = Array.isArray(data.colors) ? data.colors : [];

    if (!colors.length) {
        return `
        <div class="dm-card dm-card--settings">
            <h2>Základné farby mapy</h2>
            <p style="margin: 0; color: var(--dm-text-muted);">Žiadne farby zatiaľ nie sú definované.</p>
        </div>`;
    }

    return `
        <div class="dm-card dm-card--settings">
            <h2>Základné farby mapy</h2>
            <div class="dm-settings__list">
                ${colors
                    .map(
                        (item) => `
                            <div class="dm-settings__item">
                                <div class="dm-pill">
                                    <span class="dm-pill__dot" style="background:${item.value || '#cccccc'}"></span>
                                    ${item.name || item.label || 'Bez názvu'}
                                </div>
                                <div class="dm-settings__item-actions">
                                    <button type="button" class="dm-icon-button dm-icon-button--edit" data-dm-modal="edit-color" data-dm-payload="${item.id}" aria-label="Upraviť ${item.name || item.label || 'farbu'}" title="Upraviť">
                                        <span class="dm-icon-button__icon" aria-hidden="true">${ICONS.edit}</span>
                                    </button>
                                </div>
                            </div>
                        `
                    )
                    .join('')}
            </div>
        </div>
    `;
}

function renderSettingsFonts(data) {
    const fonts = Array.isArray(data.availableFonts) && data.availableFonts.length > 0
        ? data.availableFonts
        : getAvailableFonts();

    const selectedFont = (data.selectedFont && data.selectedFont.id) || (fonts[0] && fonts[0].id) || 'inter';

    if (!fonts.length) {
        return `
        <div class="dm-card dm-card--settings">
            <h2>Fonty</h2>
            <p style="margin: 0; color: var(--dm-text-muted);">Nie sú dostupné žiadne fonty.</p>
        </div>`;
    }
    
    return `
        <div class="dm-card dm-card--settings">
            <h2>Fonty</h2>
            <p style="margin-bottom: 16px; color: var(--dm-text-muted);">Vyberte font, ktorý sa použije vo všetkých častiach administračného rozhrania pluginu.</p>
            <div class="dm-settings__list">
                ${fonts
                    .map(
                        (item) => `
                            <div class="dm-settings__item ${selectedFont === item.id ? 'dm-settings__item--selected' : ''}" style="flex-direction: column; align-items: flex-start;">
                                <div style="display: flex; align-items: center; gap: 12px; width: 100%; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                        ${selectedFont === item.id ? 
                                            '<span style="color: var(--dm-action); font-weight: 600; font-size: 18px;">✓</span>' : 
                                            '<span style="width: 20px;"></span>'
                                        }
                                        <div style="display: flex; flex-direction: column; gap: 2px;">
                                            <span style="font-family: ${item.value}; font-size: 18px; font-weight: 600;">${escapeHtml(item.label)}</span>
                                            <span style="font-size: 12px; color: var(--dm-text-muted);">${escapeHtml(item.description)}</span>
                                        </div>
                                    </div>
                                    <div class="dm-settings__item-actions">
                                        <button 
                                            type="button" 
                                            class="dm-button ${selectedFont === item.id ? 'dm-button--secondary' : 'dm-button--dark'}" 
                                            data-dm-select-font="${escapeHtml(item.id)}"
                                            ${selectedFont === item.id ? 'disabled' : ''}
                                            aria-label="Vybrať ${escapeHtml(item.label)}" 
                                            title="${selectedFont === item.id ? 'Aktuálne vybraný' : 'Vybrať'}">
                                            ${selectedFont === item.id ? 'Vybraný' : 'Vybrať'}
                                        </button>
                                    </div>
                                </div>
                                <div style="margin-top: 8px; padding: 12px; background: rgba(99, 102, 241, 0.05); border-radius: 8px; width: 100%; font-family: ${item.value};">
                                    <p style="margin: 0; font-size: 14px; line-height: 1.6;">
                                        Vzorový text: Developer Map je nástroj pre správu projektov. Čísla: 0123456789
                                    </p>
                                </div>
                            </div>
                        `,
                    )
                    .join('')}
            </div>
        </div>
    `;
}

function renderFormPlaceholder(title) {
    return `
        <div class="dm-form">
            <h3>${title}</h3>
            <div class="dm-form__grid">
                <div class="dm-field">
                    <select required class="dm-field__input">
                        <option>Bytovka</option>
                    </select>
                    <label class="dm-field__label">Nadradené</label>
                </div>
                <div class="dm-field">
                    <select required class="dm-field__input">
                        <option>Pozemok</option>
                    </select>
                    <label class="dm-field__label">Typ<span class="dm-field__required">*</span></label>
                </div>
                <div class="dm-field">
                    <input required type="text" value="1" autocomplete="off" class="dm-field__input" />
                    <label class="dm-field__label">Názov<span class="dm-field__required">*</span></label>
                    <small>max 100 znakov</small>
                </div>
                <div class="dm-field">
                    <input required type="text" value="l1" autocomplete="off" class="dm-field__input" />
                    <label class="dm-field__label">Označenie<span class="dm-field__required">*</span></label>
                    <small>max 5 znakov</small>
                </div>
                <div class="dm-field">
                    <input required type="url" autocomplete="off" class="dm-field__input" />
                    <label class="dm-field__label">URL<span class="dm-field__required">*</span></label>
                    <small>max 100 znakov</small>
                </div>
            </div>
        </div>
    `;
}
