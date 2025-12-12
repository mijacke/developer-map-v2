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

const [{ MAP_SECTIONS }, { escapeHtml }] = await Promise.all([
    import(`../constants.js?ver=${ver}`),
    import(`../utils/html.js?ver=${ver}`),
]);

export function renderMapsView(state, data) {
    const projectsCount = data.projects?.length ?? 0;
    const totalFloors = data.projects?.reduce((sum, p) => sum + (p.floors?.length ?? 0), 0) ?? 0;
    const subtitle = projectsCount > 0
        ? `${projectsCount} ${projectsCount === 1 ? 'projekt' : projectsCount <= 4 ? 'projekty' : 'projektov'} • ${totalFloors} ${totalFloors === 1 ? 'lokalita' : totalFloors <= 4 ? 'lokality' : 'lokalít'}`
        : 'Spravujte developerské projekty a ich mapy.';

    return `
        <section class="dm-main-surface">
            <header class="dm-main-surface__header">
                <div class="dm-main-surface__title">
                    <h1>Developer Map</h1>
                    <p>${subtitle}</p>
                </div>
            </header>
            <div class="dm-main-surface__content">
                ${renderMapList(data, state)}
            </div>
        </section>
    `;
}



const ACTION_ICONS = {
    open: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.9598 17.4821L19.6287 5.49985C20.5944 5.02976 21.2663 4.04695 21.2663 2.9C21.2663 1.29891 19.9674 0 18.3663 0C16.9607 0 15.7891 1.00166 15.524 2.3287L7.3892 3.49102C6.90403 2.5694 5.94674 1.93343 4.83314 1.93343C3.23205 1.93343 1.93314 3.23234 1.93314 4.83343C1.93314 5.92383 2.54301 6.86198 3.43215 7.35759L2.39482 13.5845C1.03443 13.824 0 15.0049 0 16.4334C0 18.0345 1.29891 19.3334 2.9 19.3334C3.93559 19.3334 4.83923 18.7856 5.3505 17.9684L17.436 20.6541C17.6123 22.0861 18.8198 23.2 20.3 23.2C21.9011 23.2 23.2 21.9011 23.2 20.3C23.2 18.9266 22.2418 17.7822 20.9598 17.4821ZM4.30099 13.909L5.33832 7.68239C6.51166 7.47562 7.44256 6.56821 7.67572 5.40444L15.8105 4.24241C16.1965 4.97495 16.88 5.5245 17.7068 5.71793L19.0379 17.7002C18.549 17.9388 18.1366 18.3063 17.8483 18.765L5.76404 16.0793C5.64891 15.1409 5.09211 14.3489 4.30099 13.909Z" fill="#2E1F7E"/></svg>',
    edit: '<svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.99414 15.2877C1.99416 17.79 2.47827 19.4353 3.54395 20.4644C4.61213 21.4958 6.3227 21.9644 8.91895 21.9644H15.584C18.1806 21.9644 19.8909 21.4957 20.959 20.4644C22.0247 19.4354 22.5088 17.7902 22.5088 15.2877V13.1422C22.5089 12.6732 22.9013 12.3079 23.3652 12.3101C23.8237 12.3101 24.2103 12.6687 24.2168 13.1304C24.3661 16.3022 24.1111 18.9516 22.8447 20.8004C21.5625 22.6721 19.2932 23.6609 15.5869 23.6324H15.583C13.7562 23.5923 11.929 23.6751 10.1455 23.6695C8.38109 23.664 6.69074 23.5707 5.22559 23.1685C3.75499 22.7648 2.49702 22.0457 1.61816 20.7828C0.741989 19.5234 0.263834 17.7531 0.289062 15.2886V15.2857C0.33034 13.521 0.244166 11.7602 0.25 10.0357C0.255772 8.3316 0.352901 6.69676 0.770508 5.27887C1.19013 3.85419 1.93677 2.63863 3.24316 1.79059C4.54383 0.946463 6.3716 0.485869 8.91895 0.508362V0.507385H11.1406C11.4041 0.507393 11.621 0.607205 11.7695 0.772034C11.914 0.932426 11.9814 1.13978 11.9814 1.33942C11.9814 1.53921 11.9143 1.74741 11.7695 1.90778C11.6208 2.07248 11.4032 2.17197 11.1396 2.17145H11.1318V2.17047C8.19979 2.07322 5.89969 2.19213 4.34082 3.09625C2.82145 3.97765 1.94819 5.64801 1.99414 8.8443V15.2877Z" fill="#2E1F7E" stroke="#2E1F7E" stroke-width="0.5"/><path d="M19.4894 0.25C20.6352 0.25 21.7542 0.800077 22.8342 1.84277C23.9131 2.88445 24.4875 3.96743 24.4875 5.08203C24.4875 6.19654 23.9129 7.2793 22.8342 8.32129L14.0754 16.7744L14.0676 16.7822L14.0666 16.7812C13.5286 17.2598 12.8627 17.5815 12.1457 17.709L12.1359 17.7109L8.7912 18.1748C8.01463 18.294 7.18442 18.0896 6.60272 17.5332L6.59784 17.5283C6.04202 16.9641 5.79366 16.1755 5.93378 15.4043L6.41522 12.1807L6.4162 12.1709C6.54829 11.4716 6.88513 10.8237 7.38397 10.3037L7.39081 10.2969L16.1447 1.84473C17.2253 0.800587 18.3439 0.250143 19.4894 0.25ZM8.17206 12.2334C8.15028 12.3165 8.12715 12.4128 8.10468 12.5205C8.0356 12.8517 7.96789 13.2707 7.90546 13.6982C7.84307 14.1255 7.78654 14.5564 7.73846 14.9111C7.69156 15.2573 7.65132 15.5481 7.62128 15.6758L7.6203 15.6748C7.56891 15.9155 7.63718 16.1655 7.80585 16.3545C8.00307 16.5195 8.27068 16.588 8.53046 16.5352C8.65989 16.5073 8.95678 16.4682 9.31366 16.4229C9.68165 16.3761 10.1298 16.3214 10.5744 16.2607C11.0197 16.2 11.4571 16.1347 11.8019 16.0684C11.9049 16.0486 11.9976 16.027 12.0793 16.0078L8.17206 12.2334ZM9.20135 10.8887L13.4748 15.0146L19.4308 9.26367C17.5524 8.41348 16.0404 6.95302 15.1613 5.13379L9.20135 10.8887ZM19.4865 1.90527C18.8344 1.90544 18.1468 2.25078 17.3439 3.02637L16.4758 3.86426C17.1943 5.78128 18.7605 7.29287 20.7541 7.98535L21.6301 7.14062C22.4351 6.36408 22.7883 5.70392 22.7883 5.08398C22.7883 4.46401 22.4352 3.80371 21.6301 3.02637C20.8266 2.25069 20.1388 1.90527 19.4865 1.90527Z" fill="#2E1F7E" stroke="#2E1F7E" stroke-width="0.5"/></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

const HEADER_ICONS = {
    list: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-filter-icon lucide-list-filter"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>',
    type: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-filter-icon lucide-list-filter"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>',
    actions: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-filter-icon lucide-list-filter"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>',
    embed: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-filter-icon lucide-list-filter"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>',
    copy: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
};

function renderActionButton(type, label, attributes = {}) {
    const iconMarkup = ACTION_ICONS[type] ?? '';
    const attributeString = Object.entries(attributes)
        .filter(([, value]) => value !== undefined && value !== null && value !== false)
        .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
        .join(' ');
    const inlineAttributes = attributeString ? ` ${attributeString}` : '';
    return `
        <button type="button" class="dm-icon-button dm-icon-button--${escapeHtml(type)}"${inlineAttributes} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
            <span class="dm-icon-button__icon" aria-hidden="true">${iconMarkup}</span>
        </button>
    `;
}

function renderColumnHeader(label, iconKey, extraClass = '') {
    const iconMarkup = HEADER_ICONS[iconKey] ?? '';
    const classNames = `dm-board__cell dm-board__cell--head${extraClass ? ' ' + extraClass : ''}`;
    return `
        <div class="${classNames}" role="columnheader">
            <span class="dm-board__header-icon" aria-hidden="true">${iconMarkup}</span>
            <span>${escapeHtml(label)}</span>
        </div>
    `;
}

function formatShortcode(mapKey) {
    const key = String(mapKey ?? '').trim();
    return key ? `[dm_map map_key=\"${key}\"]` : '[dm_map]';
}

function normaliseText(value) {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function matchesProject(project, needle) {
    if (!needle) {
        return true;
    }
    const candidates = [
        normaliseText(project?.name),
        normaliseText(project?.type),
        normaliseText(project?.label),
        normaliseText(project?.designation),
    ].filter(Boolean);
    return candidates.some((value) => value.includes(needle));
}

function matchesFloor(floor, needle) {
    if (!needle) {
        return true;
    }
    const candidates = [
        normaliseText(floor?.name),
        normaliseText(floor?.label),
        normaliseText(floor?.designation),
        normaliseText(floor?.type),
    ].filter(Boolean);
    return candidates.some((value) => value.includes(needle));
}

function getProjectParentId(project) {
    const raw = project?.parentId;
    if (raw === null || typeof raw === 'undefined') {
        return '';
    }
    const candidate = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (!candidate || candidate === 'none' || candidate === 'null') {
        return '';
    }
    const selfId = String(project?.id ?? '').trim();
    if (selfId && candidate === selfId) {
        return '';
    }
    return candidate;
}

function renderMapList(data, state) {
    const projects = data.projects ?? [];
    const projectById = new Map();
    projects.forEach((project) => {
        const key = String(project?.id ?? '').trim();
        if (key) {
            projectById.set(key, project);
        }
    });

    const childProjectsMap = new Map();
    projects.forEach((project) => {
        const parentId = getProjectParentId(project);
        const projectId = String(project?.id ?? '').trim();
        if (!parentId || !projectId || !projectById.has(parentId)) {
            return;
        }
        if (!childProjectsMap.has(parentId)) {
            childProjectsMap.set(parentId, []);
        }
        childProjectsMap.get(parentId).push(project);
    });

    const topLevelProjects = projects.filter((project) => {
        const parentId = getProjectParentId(project);
        if (!parentId) {
            return true;
        }
        return !projectById.has(parentId);
    });

    const needle = normaliseText(state.searchTerm);
    const hasNeedle = Boolean(needle);

    const projectMatchesNeedle = (project, visited = new Set()) => {
        if (!hasNeedle) {
            return true;
        }
        if (!project) {
            return false;
        }
        const projectId = String(project?.id ?? '').trim();
        const nextVisited = new Set(visited);
        if (projectId) {
            if (visited.has(projectId)) {
                return false;
            }
            nextVisited.add(projectId);
        }
        if (matchesProject(project, needle)) {
            return true;
        }
        const floors = Array.isArray(project?.floors) ? project.floors : [];
        if (floors.some((floor) => matchesFloor(floor, needle))) {
            return true;
        }
        const children = childProjectsMap.get(projectId) ?? [];
        return children.some((child) => projectMatchesNeedle(child, nextVisited));
    };

    const visibleProjects = hasNeedle
        ? topLevelProjects.filter((project) => projectMatchesNeedle(project, new Set()))
        : topLevelProjects;

    const renderContext = {
        childProjectsMap,
        hasNeedle,
        needle,
        projectMatchesNeedle,
    };

    return `
        <div class="dm-board dm-board--list">
            <div class="dm-board__scroll">
                <div class="dm-board__table" role="table" aria-label="Zoznam máp">
                    <div class="dm-board__head" role="row">
                        ${renderColumnHeader('Zoznam', 'list')}
                        ${renderColumnHeader('Typ', 'type')}
                        ${renderColumnHeader('Akcie', 'actions', 'dm-board__cell--head-actions')}
                        ${renderColumnHeader('Vloženie na web', 'embed')}
                    </div>
                    ${visibleProjects
            .map((project) => renderProjectRow(project, renderContext, { depth: 0 }))
            .join('')}
                </div>
            </div>
            <div class="dm-board__footer">
                <button class="dm-board__cta" data-dm-modal="add-map">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                    Pridať mapu
                </button>
            </div>
        </div>
    `;
}

function renderProjectRow(project, context, options = {}) {
    const { childProjectsMap, hasNeedle, needle, projectMatchesNeedle } = context;
    const depth = options.depth ?? 0;
    const projectId = String(project?.id ?? '').trim();
    const fallbackKey = project.publicKey ?? project.id ?? '';
    const resolvedKeyCandidate = project.shortcode ?? fallbackKey;
    const resolvedKey = String(resolvedKeyCandidate ?? '').trim() || String(fallbackKey ?? '').trim();
    const parentShortcode = formatShortcode(resolvedKey);
    const toggleIcon = `
        <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
    `;
    const projectImage = project.image ?? '';

    const parentMatches = hasNeedle ? matchesProject(project, needle) : false;

    const rawChildProjects = childProjectsMap.get(projectId) ?? [];
    const childProjects = hasNeedle
        ? rawChildProjects.filter((child) =>
            parentMatches ? true : projectMatchesNeedle(child, new Set(projectId ? [projectId] : []))
        )
        : rawChildProjects;
    const floors = Array.isArray(project?.floors) ? project.floors : [];
    const renderableFloors = hasNeedle && !parentMatches
        ? floors.filter((floor) => matchesFloor(floor, needle))
        : floors;
    const totalChildren = childProjects.length + renderableFloors.length;
    const shouldAutoExpand = hasNeedle && totalChildren > 0;

    const rowClasses = ['dm-board__row', 'dm-board__row--project', 'dm-board__row--parent'];
    if (depth > 0) {
        rowClasses.push('dm-board__row--nested');
        rowClasses.push('dm-board__row--child');
        rowClasses.push('dm-board__row--child-map');
        rowClasses.push(`dm-board__row--depth-${Math.min(depth, 3)}`);
    }

    if (shouldAutoExpand) {
        rowClasses.push('is-expanded');
    }

    const thumbClasses = ['dm-board__thumb', 'dm-board__thumb--project', 'dm-board__thumb--clickable'];
    if (depth > 0) {
        thumbClasses.push('dm-board__thumb--nested');
    }

    const childProjectsMarkup = childProjects
        .map((childProject) => renderProjectRow(childProject, context, { depth: depth + 1 }))
        .join('');

    const floorsMarkup = renderableFloors
        .map((floor, index) => renderFloorRow(floor, resolvedKey, index, depth + 1))
        .join('');

    const childrenMarkup = totalChildren > 0
        ? `
            <div class="dm-board__children" data-dm-children="${escapeHtml(projectId)}">
                <div class="dm-board__children-inner">
                    ${childProjectsMarkup}${floorsMarkup}
                </div>
            </div>
        `
        : '';

    return `
        <div class="${rowClasses.join(' ')}" role="row" data-dm-parent-id="${escapeHtml(projectId)}">
            <div class="dm-board__cell dm-board__cell--main" role="cell">
                <div class="${thumbClasses.join(' ')}" data-dm-project="${escapeHtml(projectId)}" role="button" tabindex="0" aria-label="${escapeHtml(`Otvoriť projekt ${project.name}`)}">
                    <img src="${escapeHtml(projectImage)}" alt="${escapeHtml(`Náhľad projektu ${project.name}`)}" loading="lazy" />
                </div>
                <span class="dm-board__label">${escapeHtml(project.name)}</span>
                ${totalChildren > 0 ? `<span class="dm-board__children-count">${totalChildren}</span>` : ''}
            </div>
            <div class="dm-board__cell dm-board__cell--type" role="cell" data-label="Typ:">${escapeHtml(project.type)}</div>
            <div class="dm-board__cell dm-board__cell--actions" role="cell" data-label="Akcie:">
                 ${renderActionButton('edit', 'Upraviť', {
        'data-dm-modal': 'edit-map',
        'data-dm-payload': projectId,
    })}
                ${renderActionButton('open', 'Editor súradníc', {
        'data-dm-modal': 'draw-coordinates',
        'data-dm-payload': projectId,
    })}
                ${renderActionButton('delete', 'Zmazať', {
        'data-dm-modal': 'delete-map',
        'data-dm-payload': projectId,
    })}
            </div>
            <div class="dm-board__cell dm-board__cell--shortcode" role="cell" data-label="Shortcode:">
                <code>
                    <span>${escapeHtml(parentShortcode)}</span>
                    <button type="button" class="dm-copy-button" data-dm-copy="${escapeHtml(parentShortcode)}" aria-label="Kopírovať shortcode" title="Kopírovať do schránky">
                        <span class="dm-copy-button__icon" aria-hidden="true">${HEADER_ICONS.copy}</span>
                    </button>
                </code>
            </div>
            ${totalChildren > 0 ? `
                <button type="button" class="dm-board__toggle" data-dm-toggle="${escapeHtml(projectId)}" aria-expanded="${shouldAutoExpand ? 'true' : 'false'}" aria-label="${shouldAutoExpand ? 'Zabaliť poschodia' : 'Rozbaliť poschodia'}">
                    <span class="dm-board__toggle-icon">${toggleIcon}</span>
                </button>
            ` : ''}
        </div>
        ${childrenMarkup}
    `;
}

function renderFloorRow(floor, parentShortcodeKey, index, depth = 1) {
    const floorImage = floor.image ?? '';
    const baseParentKey = String(parentShortcodeKey ?? '').trim();
    const fallbackIndex = typeof index === 'number' ? index : 0;
    let floorKey = '';
    if (typeof floor.shortcode === 'string' && floor.shortcode.trim()) {
        floorKey = floor.shortcode.trim();
    } else if (baseParentKey) {
        floorKey = `${baseParentKey}-${fallbackIndex + 1}`;
    } else if (floor.id) {
        floorKey = String(floor.id);
    }
    const floorShortcode = formatShortcode(floorKey);
    const rowClasses = ['dm-board__row', 'dm-board__row--floor', 'dm-board__row--child'];
    if (depth > 1) {
        rowClasses.push('dm-board__row--nested');
    }
    rowClasses.push(`dm-board__row--depth-${Math.min(depth, 3)}`);

    return `
        <div class="${rowClasses.join(' ')}" role="row" data-dm-child-id="${floor.id}">
            <div class="dm-board__cell dm-board__cell--main" role="cell">
                <div class="dm-board__thumb dm-board__thumb--floor dm-board__thumb--clickable" data-dm-modal="draw-coordinates" data-dm-payload="${floor.id}" role="button" tabindex="0" aria-label="${escapeHtml(`Editor súradníc ${floor.name}`)}">
                    <img src="${escapeHtml(floorImage)}" alt="${escapeHtml(`Pôdorys ${floor.name}`)}" loading="lazy" />
                    <span class="dm-board__thumb-floor-highlight"></span>
                </div>
                <span class="dm-board__label">${escapeHtml(floor.name)}</span>
            </div>
            <div class="dm-board__cell dm-board__cell--type" role="cell" data-label="Typ:">${escapeHtml(floor.type)}</div>
            <div class="dm-board__cell dm-board__cell--actions" role="cell" data-label="Akcie:">
                ${renderActionButton('edit', 'Upraviť', {
        'data-dm-modal': 'edit-location',
        'data-dm-payload': floor.id,
    })}
                ${renderActionButton('open', 'Editor súradníc', {
        'data-dm-modal': 'draw-coordinates',
        'data-dm-payload': floor.id,
    })}
                ${renderActionButton('delete', 'Zmazať', {
        'data-dm-modal': 'delete-map',
        'data-dm-payload': floor.id,
    })}
            </div>
            <div class="dm-board__cell dm-board__cell--shortcode" role="cell" data-label="Shortcode:">
                <code>
                    <span>${escapeHtml(floorShortcode)}</span>
                    <button type="button" class="dm-copy-button" data-dm-copy="${escapeHtml(floorShortcode)}" aria-label="Kopírovať shortcode" title="Kopírovať do schránky">
                        <span class="dm-copy-button__icon" aria-hidden="true">${HEADER_ICONS.copy}</span>
                    </button>
                </code>
            </div>
        </div>
    `;
}
