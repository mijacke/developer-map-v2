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

const [{ SETTINGS_SECTIONS }, { escapeHtml }, { getAvailableFonts }] = await Promise.all([
    import(`../constants.js?ver=${ver}`),
    import(`../utils/html.js?ver=${ver}`),
    import(`../data.js?ver=${ver}`),
]);

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
                ${state.settingsSection === SETTINGS_SECTIONS.FRONTEND_STYLING ? renderSettingsFrontendStyling(data) : ''}
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
        case SETTINGS_SECTIONS.FRONTEND_STYLING:
            return 'Farba frontendu';
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
        { label: 'Farby frontendu', icon: ICONS.edit, target: SETTINGS_SECTIONS.FRONTEND_STYLING },
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

    const selectedFont = (data.selectedFont && data.selectedFont.id) || (fonts[0] && fonts[0].id) || 'aboreto';

    if (!fonts.length) {
        return `
        <div class="dm-card dm-card--settings">
            <h2>Fonty</h2>
            <p style="margin: 0; color: var(--dm-text-muted);">Nie sú dostupné žiadne fonty.</p>
        </div>`;
    }

    return `
        <div class="dm-card dm-card--settings dm-fonts-section">
            <div class="dm-fonts-header">
                <div class="dm-fonts-header__content">
                    <h2 style="margin: 0; font-size: 24px; font-weight: 700; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Typografia</h2>
                    <p style="margin: 8px 0 0 0; color: var(--dm-text-muted); font-size: 14px; line-height: 1.5;">Vyberte font pre administračné rozhranie pluginu</p>
                </div>
            </div>
            
            <div class="dm-fonts-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 24px;">
                ${fonts
            .map(
                (item) => `
                            <div class="dm-font-card ${selectedFont === item.id ? 'dm-font-card--active' : ''}" 
                                 style="position: relative; padding: 24px; background: ${selectedFont === item.id ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.08) 100%)' : 'rgba(255, 255, 255, 0.7)'}; border-radius: 20px; border: 2px solid ${selectedFont === item.id ? 'rgba(102, 126, 234, 0.4)' : 'rgba(0, 0, 0, 0.06)'}; backdrop-filter: blur(10px); transition: all 0.3s ease; cursor: pointer; overflow: hidden;"
                                 data-dm-select-font="${escapeHtml(item.id)}">
                                
                                ${selectedFont === item.id ? `
                                    <div style="position: absolute; top: 16px; right: 16px; width: 28px; height: 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                ` : ''}
                                
                                <div style="margin-bottom: 16px;">
                                    <h3 style="margin: 0 0 4px 0; font-family: ${item.value}; font-size: 22px; font-weight: 600; color: var(--dm-text); letter-spacing: ${item.id === 'aboreto' ? '0.05em' : '0'};">${escapeHtml(item.label.replace(' (predvolený)', ''))}</h3>
                                    <span style="display: inline-block; padding: 4px 10px; background: ${selectedFont === item.id ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(0, 0, 0, 0.05)'}; color: ${selectedFont === item.id ? 'white' : 'var(--dm-text-muted)'}; font-size: 11px; font-weight: 600; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;">${selectedFont === item.id ? 'Aktívny' : escapeHtml(item.description)}</span>
                                </div>
                                
                                <div style="padding: 20px; background: rgba(255, 255, 255, 0.8); border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.04); font-family: ${item.value};">
                                    <p style="margin: 0 0 12px 0; font-size: 28px; font-weight: 700; color: var(--dm-text); line-height: 1.2; letter-spacing: ${item.id === 'aboreto' ? '0.03em' : '-0.01em'};">Aa Bb Cc</p>
                                    <p style="margin: 0 0 8px 0; font-size: 15px; color: var(--dm-text); line-height: 1.6;">Developer Map modernizuje správu projektov.</p>
                                    <p style="margin: 0; font-size: 13px; color: var(--dm-text-muted); letter-spacing: 0.1em;">0123456789 • @#$%</p>
                                </div>
                                    
                                ${selectedFont !== item.id ? `
                                    <button 
                                        type="button" 
                                        class="dm-button dm-button--dark"
                                        style="width: 100%; margin-top: 16px; padding: 12px 20px; border-radius: 12px; font-weight: 600; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; color: white; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);"
                                        data-dm-select-font="${escapeHtml(item.id)}"
                                        aria-label="Vybrať ${escapeHtml(item.label)}">
                                        Použiť tento font
                                    </button>
                                ` : `
                                    <div style="width: 100%; margin-top: 16px; padding: 12px 20px; border-radius: 12px; font-weight: 600; background: rgba(102, 126, 234, 0.1); color: #667eea; text-align: center; font-size: 14px;">
                                        ✓ Aktuálne používaný
                                    </div>
                                `}
                            </div>
                        `,
            )
            .join('')}
            </div>
        </div>
    `;
}

function renderSettingsFrontendStyling(data) {
    const currentColor = data.frontendAccentColor || '#4d38ff';

    // Fixed preset colors (cannot be changed by user)
    const presetColors = [
        { value: '#4d38ff', label: 'Fialová', isDefault: true },
        { value: '#ef4444', label: 'Červená' },
        { value: '#10b981', label: 'Zelená' },
        { value: '#3b82f6', label: 'Modrá' },
    ];

    // Check if current color is a preset or custom
    const isPreset = presetColors.some(p => p.value === currentColor);
    const isCustomActive = !isPreset;
    const customColor = isCustomActive ? currentColor : '#000000';

    // All options including Vlastná
    const allOptions = [
        ...presetColors,
        { value: 'custom', label: 'Vlastná', isCustom: true }
    ];

    const optionButtons = allOptions.map(option => {
        const isActive = option.isCustom ? isCustomActive : currentColor === option.value;
        const dotColor = option.isCustom ? (isCustomActive ? currentColor : '#000000') : option.value;
        return `
            <button 
                type="button" 
                class="dm-color-option${isActive ? ' dm-color-option--active' : ''}"
                ${option.isCustom ? 'data-dm-custom-color-btn' : `data-dm-frontend-color-preset="${escapeHtml(option.value)}"`}
                style="${isActive ? `--active-color: ${dotColor};` : ''}"
            >
                <span class="dm-color-option__dot" style="background: ${escapeHtml(dotColor)};" ${option.isCustom ? 'data-dm-custom-dot' : ''}></span>
                <span class="dm-color-option__label">${escapeHtml(option.label)}${option.isDefault ? ' (predvolená)' : ''}</span>
            </button>
        `;
    }).join('');

    return `
        <div class="dm-card dm-card--settings dm-frontend-styling-section">
            <style>
                .dm-frontend-styling-section .dm-color-options {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 12px;
                    margin-top: 20px;
                }
                .dm-frontend-styling-section .dm-color-option {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 18px;
                    border: 2px solid rgba(0,0,0,0.08);
                    border-radius: 14px;
                    background: rgba(255,255,255,0.9);
                    cursor: pointer;
                    font-family: inherit;
                }
                .dm-frontend-styling-section .dm-color-option--active {
                    border-color: var(--active-color, #4d38ff);
                    background: color-mix(in srgb, var(--active-color, #4d38ff) 8%, white);
                }
                .dm-frontend-styling-section .dm-color-option__dot {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    flex-shrink: 0;
                    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
                }
                .dm-frontend-styling-section .dm-color-option__label {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--dm-text, #1c134f);
                }
                .dm-frontend-styling-section .dm-color-option--active .dm-color-option__label {
                    color: var(--active-color, #4d38ff);
                }
                .dm-frontend-styling-section .dm-preview-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 20px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.95) 100%);
                    border-radius: 16px;
                    border: 1px solid rgba(0,0,0,0.06);
                    margin-top: 24px;
                    flex-wrap: wrap;
                }
                .dm-frontend-styling-section .dm-preview-card__picker {
                    width: 56px;
                    height: 56px;
                    border: none;
                    border-radius: 14px;
                    padding: 0;
                    cursor: pointer;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    appearance: none;
                    background: none;
                }
                .dm-frontend-styling-section .dm-preview-card__picker::-webkit-color-swatch-wrapper {
                    padding: 0;
                }
                .dm-frontend-styling-section .dm-preview-card__picker::-webkit-color-swatch {
                    border: none;
                    border-radius: 14px;
                }
                .dm-frontend-styling-section .dm-preview-card__picker::-moz-color-swatch {
                    border: none;
                    border-radius: 14px;
                }
                .dm-frontend-styling-section .dm-preview-card__info {
                    flex: 1;
                    min-width: 120px;
                }
                .dm-frontend-styling-section .dm-preview-card__title {
                    font-size: 16px;
                    font-weight: 700;
                    color: var(--dm-text, #1c134f);
                    margin: 0;
                }
                .dm-frontend-styling-section .dm-preview-card__input {
                    font-size: 14px;
                    color: var(--dm-text-muted, #6b7280);
                    font-family: monospace;
                    background: rgba(0,0,0,0.04);
                    padding: 6px 12px;
                    border-radius: 6px;
                    border: 1px solid transparent;
                    margin-top: 6px;
                    width: 100px;
                }
                .dm-frontend-styling-section .dm-preview-card__input:focus {
                    outline: none;
                    border-color: var(--dm-accent, #4d38ff);
                    background: white;
                }
                @media (max-width: 480px) {
                    .dm-frontend-styling-section .dm-color-options {
                        grid-template-columns: 1fr;
                    }
                    .dm-frontend-styling-section .dm-preview-card {
                        flex-direction: column;
                        text-align: center;
                    }
                }
            </style>

            <div class="dm-fonts-header">
                <div class="dm-fonts-header__content">
                    <h2 style="margin: 0; font-size: 24px; font-weight: 700; background: linear-gradient(135deg, ${escapeHtml(currentColor)} 0%, ${escapeHtml(currentColor)}99 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Farba frontendu</h2>
                    <p style="margin: 8px 0 0 0; color: var(--dm-text-muted); font-size: 14px; line-height: 1.5;">Vyberte farbu akcentu pre tabuľky lokalít na frontende</p>
                </div>
            </div>
            
            <div class="dm-color-options">
                ${optionButtons}
            </div>

            <div class="dm-preview-card" data-dm-custom-preview style="display: ${isCustomActive ? 'flex' : 'none'};">
                <input type="color" class="dm-preview-card__picker" value="${escapeHtml(customColor)}" data-dm-frontend-color-picker />
                <div class="dm-preview-card__info">
                    <p class="dm-preview-card__title">Vlastná farba</p>
                    <input type="text" class="dm-preview-card__input" value="${escapeHtml(customColor)}" data-dm-frontend-color-input maxlength="7" />
                </div>
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
        </div >
        `;
}
