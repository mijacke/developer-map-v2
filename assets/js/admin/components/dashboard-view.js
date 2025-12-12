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

const [{ escapeHtml }] = await Promise.all([
    import(`../utils/html.js?ver=${ver}`),
]);

const TOOLBAR_ICONS = {
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    chevron: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
    back: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
};

const ACTION_ICONS = {
    open: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.9598 17.4821L19.6287 5.49985C20.5944 5.02976 21.2663 4.04695 21.2663 2.9C21.2663 1.29891 19.9674 0 18.3663 0C16.9607 0 15.7891 1.00166 15.524 2.3287L7.3892 3.49102C6.90403 2.5694 5.94674 1.93343 4.83314 1.93343C3.23205 1.93343 1.93314 3.23234 1.93314 4.83343C1.93314 5.92383 2.54301 6.86198 3.43215 7.35759L2.39482 13.5845C1.03443 13.824 0 15.0049 0 16.4334C0 18.0345 1.29891 19.3334 2.9 19.3334C3.93559 19.3334 4.83923 18.7856 5.3505 17.9684L17.436 20.6541C17.6123 22.0861 18.8198 23.2 20.3 23.2C21.9011 23.2 23.2 21.9011 23.2 20.3C23.2 18.9266 22.2418 17.7822 20.9598 17.4821ZM4.30099 13.909L5.33832 7.68239C6.51166 7.47562 7.44256 6.56821 7.67572 5.40444L15.8105 4.24241C16.1965 4.97495 16.88 5.5245 17.7068 5.71793L19.0379 17.7002C18.549 17.9388 18.1366 18.3063 17.8483 18.765L5.76404 16.0793C5.64891 15.1409 5.09211 14.3489 4.30099 13.909Z" fill="#2E1F7E"/></svg>',
    edit: '<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.99414 15.2877C1.99416 17.79 2.47827 19.4353 3.54395 20.4644C4.61213 21.4958 6.3227 21.9644 8.91895 21.9644H15.584C18.1806 21.9644 19.8909 21.4957 20.959 20.4644C22.0247 19.4354 22.5088 17.7902 22.5088 15.2877V13.1422C22.5089 12.6732 22.9013 12.3079 23.3652 12.3101C23.8237 12.3101 24.2103 12.6687 24.2168 13.1304C24.3661 16.3022 24.1111 18.9516 22.8447 20.8004C21.5625 22.6721 19.2932 23.6609 15.5869 23.6324H15.583C13.7562 23.5923 11.929 23.6751 10.1455 23.6695C8.38109 23.664 6.69074 23.5707 5.22559 23.1685C3.75499 22.7648 2.49702 22.0457 1.61816 20.7828C0.741989 19.5234 0.263834 17.7531 0.289062 15.2886V15.2857C0.33034 13.521 0.244166 11.7602 0.25 10.0357C0.255772 8.3316 0.352901 6.69676 0.770508 5.27887C1.19013 3.85419 1.93677 2.63863 3.24316 1.79059C4.54383 0.946463 6.3716 0.485869 8.91895 0.508362V0.507385H11.1406C11.4041 0.507393 11.621 0.607205 11.7695 0.772034C11.914 0.932426 11.9814 1.13978 11.9814 1.33942C11.9814 1.53921 11.9143 1.74741 11.7695 1.90778C11.6208 2.07248 11.4032 2.17197 11.1396 2.17145H11.1318V2.17047C8.19979 2.07322 5.89969 2.19213 4.34082 3.09625C2.82145 3.97765 1.94819 5.64801 1.99414 8.8443V15.2877Z" fill="#2E1F7E" stroke="#2E1F7E" stroke-width="0.5"/><path d="M19.4894 0.25C20.6352 0.25 21.7542 0.800077 22.8342 1.84277C23.9131 2.88445 24.4875 3.96743 24.4875 5.08203C24.4875 6.19654 23.9129 7.2793 22.8342 8.32129L14.0754 16.7744L14.0676 16.7822L14.0666 16.7812C13.5286 17.2598 12.8627 17.5815 12.1457 17.709L12.1359 17.7109L8.7912 18.1748C8.01463 18.294 7.18442 18.0896 6.60272 17.5332L6.59784 17.5283C6.04202 16.9641 5.79366 16.1755 5.93378 15.4043L6.41522 12.1807L6.4162 12.1709C6.54829 11.4716 6.88513 10.8237 7.38397 10.3037L7.39081 10.2969L16.1447 1.84473C17.2253 0.800587 18.3439 0.250143 19.4894 0.25ZM8.17206 12.2334C8.15028 12.3165 8.12715 12.4128 8.10468 12.5205C8.0356 12.8517 7.96789 13.2707 7.90546 13.6982C7.84307 14.1255 7.78654 14.5564 7.73846 14.9111C7.69156 15.2573 7.65132 15.5481 7.62128 15.6758L7.6203 15.6748C7.56891 15.9155 7.63718 16.1655 7.80585 16.3545C8.00307 16.5195 8.27068 16.588 8.53046 16.5352C8.65989 16.5073 8.95678 16.4682 9.31366 16.4229C9.68165 16.3761 10.1298 16.3214 10.5744 16.2607C11.0197 16.2 11.4571 16.1347 11.8019 16.0684C11.9049 16.0486 11.9976 16.027 12.0793 16.0078L8.17206 12.2334ZM9.20135 10.8887L13.4748 15.0146L19.4308 9.26367C17.5524 8.41348 16.0404 6.95302 15.1613 5.13379L9.20135 10.8887ZM19.4865 1.90527C18.8344 1.90544 18.1468 2.25078 17.3439 3.02637L16.4758 3.86426C17.1943 5.78128 18.7605 7.29287 20.7541 7.98535L21.6301 7.14062C22.4351 6.36408 22.7883 5.70392 22.7883 5.08398C22.7883 4.46401 22.4352 3.80371 21.6301 3.02637C20.8266 2.25069 20.1388 1.90527 19.4865 1.90527Z" fill="#2E1F7E" stroke="#2E1F7E" stroke-width="0.5"/></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

function safeText(value, fallback = '—') {
    if (value === null || value === undefined || value === '') {
        return escapeHtml(fallback);
    }
    return escapeHtml(String(value));
}

function slugifyStatus(label) {
    if (!label) return 'unknown';
    return label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-)|(-$)/g, '') || 'unknown';
}

function resolveStatus(floor, statuses) {
    if (!floor) {
        return { label: 'Neznáme', variant: 'unknown' };
    }

    // Try to find status by ID
    const statusById = floor.statusId && statuses?.length > 0
        ? statuses.find((status) => String(status.id) === String(floor.statusId))
        : null;
    
    // Get label from various sources
    const label = statusById?.label ?? floor.statusLabel ?? floor.status ?? 'Neznáme';
    const hasExplicitStatus = Boolean(statusById || floor.status || floor.statusLabel);
    const normalized = slugifyStatus(label);

    return {
        label,
        variant: hasExplicitStatus ? normalized : 'unknown',
    };
}

function renderDashboardAction(type, modal, payload, label) {
    const iconMarkup = ACTION_ICONS[type] ?? '';
    const attributes = [
        'type="button"',
        `class="dm-icon-button dm-icon-button--${escapeHtml(type)}"`,
        `aria-label="${escapeHtml(label)}"`,
        `title="${escapeHtml(label)}"`,
        modal ? `data-dm-modal="${escapeHtml(modal)}"` : '',
        payload ? `data-dm-payload="${escapeHtml(String(payload))}"` : '',
    ]
        .filter(Boolean)
        .join(' ');

    return `
        <button ${attributes}>
            <span class="dm-icon-button__icon" aria-hidden="true">${iconMarkup}</span>
        </button>
    `;
}

function renderStatusBadge(status) {
    return `
        <span class="dm-status dm-status--${escapeHtml(status.variant)}">
            ${escapeHtml(status.label)}
        </span>
    `;
}

function normaliseText(value) {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function matchesSearchTerm(floor, searchTerm) {
    if (!searchTerm) return true;
    const needle = normaliseText(searchTerm);
    if (!needle) return true;
    const candidates = [
        normaliseText(floor?.name),
        normaliseText(floor?.designation),
        normaliseText(floor?.label),
        normaliseText(floor?.type),
    ].filter(Boolean);
    return candidates.some((value) => value.includes(needle));
}

function resolveStatusId(floor, statuses) {
    if (!floor) return '';
    if (floor.statusId) return String(floor.statusId);
    if (floor.statusKey) return String(floor.statusKey);
    const label = floor.statusLabel ?? floor.status;
    if (!label || !Array.isArray(statuses)) {
        return '';
    }
    const match = statuses.find((status) => normaliseText(status.label) === normaliseText(label));
    return match ? String(match.id) : '';
}

function matchesStatusFilter(floor, statusFilter, statuses) {
    if (!statusFilter) return true;
    return resolveStatusId(floor, statuses) === statusFilter;
}

function formatArea(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return escapeHtml('—');
    }
    const normalised = raw.toLowerCase().replace(/\s+/g, '');
    if (normalised.endsWith('m²') || normalised.endsWith('m2')) {
        const display = raw.replace(/m2$/i, 'm²');
        return escapeHtml(display);
    }
    return escapeHtml(`${raw} m²`);
}

function normaliseCurrencyDisplay(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return '';
    }
    let result = raw.replace(/\beur\b/gi, '€');
    result = result.replace(/\s+/g, ' ').trim();
    if (result.includes('€')) {
        result = result.replace(/\s*€\s*/g, ' € ').replace(/\s+/g, ' ').trim();
        if (result.startsWith('€')) {
            const remainder = result.slice(1).trim();
            if (remainder) {
                result = `${remainder} €`;
            } else {
                result = '€';
            }
        } else if (!result.endsWith('€')) {
            const parts = result.split('€');
            if (parts.length === 2) {
                const prefix = parts[0].trim();
                const suffix = parts[1].trim();
                result = suffix ? `${prefix} € ${suffix}` : `${prefix} €`;
            }
        }
        return result.replace(/\s+/g, ' ').trim();
    }
    return `${result} €`;
}

function formatPrice(value) {
    const display = normaliseCurrencyDisplay(value);
    if (!display || display === '€') {
        return escapeHtml('—');
    }
    return escapeHtml(display);
}

function formatRent(value) {
    const display = normaliseCurrencyDisplay(value);
    if (!display) {
        return escapeHtml('—');
    }
    const normalised = display.toLowerCase().replace(/\s+/g, '');
    const hasPerMonth = normalised.includes('€/mes') || normalised.includes('€/mesiac');
    if (hasPerMonth) {
        const cleaned = display
            .replace(/€\s*\/\s*mesiac/gi, '€ /mes')
            .replace(/€\s*\/\s*mes/gi, '€ /mes')
            .replace(/\s+/g, ' ')
            .trim()
            .replace('€ /mes', '€/mes');
        if (!cleaned || cleaned === '€/mes') {
            return escapeHtml('—');
        }
        return escapeHtml(cleaned);
    }
    const base = display.replace(/\s*€$/, '').trim();
    if (!base) {
        return escapeHtml('—');
    }
    return escapeHtml(`${base} €/mes`);
}

function parsePriceValue(rawPrice) {
    if (rawPrice === null || rawPrice === undefined) return null;
    let cleaned = String(rawPrice)
        .replace(/\s/g, '')
        .replace(/[€$£₤₿¥₹₽₴₪₫₵₢₣₦₱₲₳₵₡₮₩₭₺₼₸₶₯₠₧₷₨₰₥٫]+/g, '')
        .replace(/,/g, '.')
        .replace(/[^0-9.+-]/g, '');
    if (!cleaned) return null;

    const isNegative = cleaned.startsWith('-');
    if (isNegative || cleaned.startsWith('+')) {
        cleaned = cleaned.slice(1);
    }

    if (!cleaned) return null;

    const parts = cleaned.split('.');
    if (parts.length > 2) {
        const fraction = parts.pop();
        cleaned = parts.join('') + '.' + fraction;
    }

    const numeric = parseFloat((isNegative ? '-' : '') + cleaned);
    return Number.isFinite(numeric) ? numeric : null;
}

export function renderDashboardView(state, data) {
    const project = data.projects.find((item) => item.id === state.activeProjectId) ?? data.projects[0];
    const floors = project?.floors ?? [];
    const statuses = data.statuses ?? [];
    const projectImageUrl = project?.image ?? project?.imageUrl ?? '';

    const statusFilter = String(state.dashboardStatusFilter ?? '').trim();
    const searchTerm = String(state.dashboardSearchTerm ?? '');
    const priceOrder = String(state.dashboardPriceOrder ?? '').trim();

    const filteredFloors =
        floors.length > 0
            ? floors.filter((floor) => matchesSearchTerm(floor, searchTerm)).filter((floor) => matchesStatusFilter(floor, statusFilter, statuses))
            : [];

    const orderedFloors =
        filteredFloors.length > 1 && (priceOrder === 'asc' || priceOrder === 'desc')
            ? [...filteredFloors].sort((a, b) => {
                  const priceA = parsePriceValue(a.price);
                  const priceB = parsePriceValue(b.price);
                  if (priceA === null && priceB === null) return 0;
                  if (priceA === null) return priceOrder === 'asc' ? 1 : -1;
                  if (priceB === null) return priceOrder === 'asc' ? -1 : 1;
                  return priceOrder === 'asc' ? priceA - priceB : priceB - priceA;
              })
            : filteredFloors;

    const tableRows =
        orderedFloors.length > 0
            ? orderedFloors
                  .map((floor) => {
                      const status = resolveStatus(floor, statuses);
                      const designation = floor.designation ?? floor.shortcode ?? floor.label;

                      return `
                        <tr role="row">
                            <td role="cell" data-label="Typ">${safeText(floor.type)}</td>
                            <td role="cell" data-label="Názov">${safeText(floor.name)}</td>
                            <td role="cell" data-label="Označenie">${safeText(designation)}</td>
                            <td role="cell" data-label="Rozloha">${formatArea(floor.area)}</td>
                            <td role="cell" data-label="Cena">${formatPrice(floor.price)}</td>
                            <td role="cell" data-label="Prenájom">${formatRent(floor.rent)}</td>
                            <td role="cell" data-label="Stav">${renderStatusBadge(status)}</td>
                            <td role="cell" data-label="Akcie" class="dm-dashboard__cell--actions">
                                ${renderDashboardAction(
                                    'edit',
                                    'edit-location',
                                    floor.id,
                                    'Upraviť',
                                )}
                                ${renderDashboardAction(
                                    'open',
                                    'draw-coordinates',
                                    floor.id,
                                    'Editor súradníc',
                                )}
                                ${renderDashboardAction(
                                    'delete',
                                    'delete-map',
                                    floor.id,
                                    'Zmazať',
                                )}
                            </td>
                        </tr>
                    `;
                  })
                  .join('')
            : `
                <tr role="row" class="dm-dashboard__empty-row">
                    <td role="cell" colspan="8" class="dm-dashboard__empty-cell">
                        <div class="dm-dashboard__empty-state" role="group" aria-label="Žiadne lokality">
                            <span class="dm-dashboard__empty-icon" aria-hidden="true">${TOOLBAR_ICONS.plus}</span>
                            <h3>Žiadne lokality</h3>
                            <p>V tomto projekte zatiaľ nie sú žiadne lokality.</p>
                            <button type="button" class="dm-dashboard__add dm-dashboard__add--ghost dm-dashboard__empty-action" data-dm-modal="add-location">
                                <span class="dm-dashboard__add-icon" aria-hidden="true">${TOOLBAR_ICONS.plus}</span>
                                Pridať prvú lokalitu
                            </button>
                        </div>
                    </td>
                </tr>
            `;

    return `
        <section class="dm-dashboard">
            <div class="dm-dashboard__card">
                <header class="dm-dashboard__card-head">
                    <div class="dm-dashboard__heading">
                        <div class="dm-dashboard__heading-top">
                            <div class="dm-dashboard__heading-text">
                                <h1>Zoznam lokalít</h1>
                                <p>${escapeHtml(project?.name ?? '')}</p>
                            </div>
                            <button type="button" class="dm-button dm-button--dark dm-dashboard__back" data-dm-back>
                                <span class="dm-dashboard__back-icon" aria-hidden="true">${TOOLBAR_ICONS.back}</span>
                                Vrátit sa na mapy
                            </button>
                        </div>
                    </div>
                    ${projectImageUrl ? `
                    <div class="dm-dashboard__project-image">
                        <img src="${escapeHtml(projectImageUrl)}" alt="${escapeHtml(project?.name ?? 'Mapa projektu')}" />
                    </div>
                    ` : ''}
                    <div class="dm-dashboard__toolbar" role="search">
                        <p class="dm-dashboard__toolbar-heading">Zoznam lokalít</p>
                        <label class="dm-dashboard__search">
                            <span class="dm-dashboard__search-icon" aria-hidden="true">${TOOLBAR_ICONS.search}</span>
                            <input
                                type="search"
                                name="dm-dashboard-search"
                                placeholder="Vyhľadať lokalitu..."
                                autocomplete="off"
                                aria-label="Vyhľadať lokalitu"
                                data-dm-preserve-focus="dashboard-search"
                                data-dm-dashboard-search
                                value="${escapeHtml(searchTerm)}"
                            />
                        </label>
                        <div class="dm-field dm-dashboard__select">
                            <select id="dm-dashboard-status" name="dm-dashboard-status" class="dm-field__input" data-dm-select data-dm-dashboard-status>
                                <option value=""${statusFilter === '' ? ' selected' : ''}>Všetky stavy</option>
                                ${statuses
                                    .map(
                                        (status) =>
                                            `<option value="${escapeHtml(String(status.id))}"${String(status.id) === statusFilter ? ' selected' : ''}>${escapeHtml(status.label)}</option>`,
                                    )
                                    .join('')}
                            </select>
                            <label class="dm-field__label" for="dm-dashboard-status">Stav</label>
                        </div>
                        <div class="dm-field dm-dashboard__select">
                            <select id="dm-dashboard-price" name="dm-dashboard-price" class="dm-field__input" data-dm-select data-dm-dashboard-price>
                                <option value=""${priceOrder === '' ? ' selected' : ''}>Všetky ceny</option>
                                <option value="asc"${priceOrder === 'asc' ? ' selected' : ''}>Najnižšia</option>
                                <option value="desc"${priceOrder === 'desc' ? ' selected' : ''}>Najvyššia</option>
                            </select>
                            <label class="dm-field__label" for="dm-dashboard-price">Cena</label>
                        </div>
                        <button type="button" class="dm-dashboard__add" data-dm-modal="add-location">
                            <span class="dm-dashboard__add-icon" aria-hidden="true">${TOOLBAR_ICONS.plus}</span>
                            Pridať lokalitu
                        </button>
                    </div>
                </header>
                <div class="dm-dashboard__table-wrapper">
                    <table class="dm-dashboard__table" role="table">
                        <thead>
                            <tr role="row">
                                <th scope="col">Typ</th>
                                <th scope="col">Názov</th>
                                <th scope="col">Označenie</th>
                                <th scope="col">Rozloha</th>
                                <th scope="col">Cena</th>
                                <th scope="col">Prenájom</th>
                                <th scope="col">Stav</th>
                                <th scope="col">Akcie</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    `;
}
