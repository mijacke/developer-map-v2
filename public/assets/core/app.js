// Dynamic imports with cache-busting for production compatibility
const getVersion = () => (typeof window !== 'undefined' && window.dmRuntimeConfig?.ver) || Date.now();

async function loadModules() {
    const ver = getVersion();
    const base = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));

    const [constants, data, layout, modals, storage, wpAdmin, header] = await Promise.all([
        import(`${base}/constants.js?ver=${ver}`),
        import(`${base}/data.js?ver=${ver}`),
        import(`${base}/layout/app-shell.js?ver=${ver}`),
        import(`${base}/modals/index.js?ver=${ver}`),
        import(`${base}/storage-client.js?ver=${ver}`),
        import(`${base}/wp-admin-layout.js?ver=${ver}`),
        import(`${base}/layout/header.js?ver=${ver}`)
    ]);

    return {
        APP_VIEWS: constants.APP_VIEWS,
        MAP_SECTIONS: constants.MAP_SECTIONS,
        SETTINGS_SECTIONS: constants.SETTINGS_SECTIONS,
        DRAW_VIEWBOX: constants.DRAW_VIEWBOX,
        createInitialData: data.createInitialData,
        getDefaultTypes: data.getDefaultTypes,
        getDefaultStatuses: data.getDefaultStatuses,
        getDefaultColors: data.getDefaultColors,
        getAvailableFonts: data.getAvailableFonts,
        renderAppShell: layout.renderAppShell,
        renderHeader: header.renderHeader,
        renderModal: modals.renderModal,
        renderLocalitiesPopup: modals.renderLocalitiesPopup,
        createStorageClient: storage.createStorageClient,
        WPAdminLayoutManager: wpAdmin.WPAdminLayoutManager,
        assetsBase: base
    };
}

/**
 * Initialise the Developer Map dashboard inside the provided root element.
 * @param {{
 *   root: HTMLElement;
 *   runtimeConfig: Record<string, unknown>;
 *   projectConfig?: object;
 *   storageClient?: ReturnType<typeof createStorageClient>;
 * }} options
 */
export async function initDeveloperMap(options) {
    const { root, runtimeConfig, storageClient: providedStorage } = options;

    // Load all modules with cache-busting
    const modules = await loadModules();
    const {
        APP_VIEWS, MAP_SECTIONS, SETTINGS_SECTIONS, DRAW_VIEWBOX,
        createInitialData, getDefaultTypes, getDefaultStatuses, getDefaultColors, getAvailableFonts,
        renderAppShell, renderHeader, renderModal, renderLocalitiesPopup, createStorageClient, WPAdminLayoutManager, assetsBase
    } = modules;

    if (!root || !(root instanceof HTMLElement)) {
        throw new Error('Developer Map: initDeveloperMap requires a valid root element.');
    }

    if (root.dataset.dmHydrated === '1') {
        return root.__dmInstance;
    }

    let storage = providedStorage || null;
    if (!storage) {
        try {
            storage = createStorageClient(runtimeConfig || {});
        } catch (storageError) {
            console.warn('[Developer Map] Failed to initialise storage client', storageError);
            storage = null;
        }
    }
    const storageCache = {
        colors: null,
        types: null,
        statuses: null,
        projects: null,
        expanded: [],
        images: {},
        availableFonts: null,
        selectedFont: null,
        fontBundle: null,
    };

    const data = createInitialData();

    function cloneForStorage(value) {
        if (value === null || value === undefined) {
            return value;
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            console.warn('[Developer Map] Failed to clone value for storage', error);
            return value;
        }
    }

    function persistValue(key, value) {
        if (!storage || typeof storage.set !== 'function') {
            return;
        }
        const payload = cloneForStorage(value);
        Promise.resolve(storage.set(key, payload)).catch((error) => {
            console.warn('[Developer Map] Failed to persist key', key, error);
        });
    }

    function removePersistedValue(key) {
        if (!storage || typeof storage.remove !== 'function') {
            return;
        }
        Promise.resolve(storage.remove(key)).catch((error) => {
            console.warn('[Developer Map] Failed to remove key', key, error);
        });
    }

    function applyImageToEntity(entity, payload) {
        if (!entity || typeof entity !== 'object' || !payload || typeof payload !== 'object') {
            return;
        }
        if (payload.url) {
            entity.image = payload.url;
            entity.imageUrl = payload.url;
        }
        if (payload.id) {
            entity.image_id = payload.id;
        }
        if (payload.alt) {
            entity.imageAlt = payload.alt;
        }
    }

    function cleanDemoImages(projects) {
        if (!Array.isArray(projects)) {
            return false;
        }
        let changed = false;
        const demoPatterns = [
            'demo-building-placeholder',
            'demo-floorplan-placeholder',
            'demo-building-draw',
            'demo-pointer',
            'Screenshot-2025-10-18'
        ];

        projects.forEach((project) => {
            if (project.image && typeof project.image === 'string') {
                const hasDemo = demoPatterns.some(pattern => project.image.includes(pattern));
                if (hasDemo) {
                    project.image = '';
                    changed = true;
                }
            }
            if (Array.isArray(project.floors)) {
                project.floors.forEach((floor) => {
                    if (floor.image && typeof floor.image === 'string') {
                        const hasDemo = demoPatterns.some(pattern => floor.image.includes(pattern));
                        if (hasDemo) {
                            floor.image = '';
                            changed = true;
                        }
                    }
                });
            }
        });

        return changed;
    }

    function migrateHashIdsToSequential() {
        let changed = false;

        // Migrate types
        if (Array.isArray(data.types)) {
            const typeIdMap = new Map();
            let typeCounter = 1;

            data.types.forEach((type, index) => {
                if (type && type.id) {
                    const oldId = String(type.id);
                    // Check if it's a hash ID (contains dash followed by random chars)
                    if (/^type-[a-z0-9]{6,}-[a-z0-9]+$/.test(oldId) || /^type-[a-z0-9]{6,}$/.test(oldId)) {
                        const newId = `type-${typeCounter++}`;
                        typeIdMap.set(oldId, newId);
                        type.id = newId;
                        changed = true;
                    } else if (/^type-(\d+)$/.test(oldId)) {
                        // It's already sequential, track the counter
                        const num = parseInt(oldId.match(/^type-(\d+)$/)[1], 10);
                        if (num >= typeCounter) {
                            typeCounter = num + 1;
                        }
                    }
                }
            });

            // Update type references in projects/floors
            if (changed && data.projects) {
                data.projects.forEach(project => {
                    if (project.type && typeIdMap.has(project.type)) {
                        project.type = typeIdMap.get(project.type);
                    }
                    if (Array.isArray(project.floors)) {
                        project.floors.forEach(floor => {
                            if (floor.type && typeIdMap.has(floor.type)) {
                                floor.type = typeIdMap.get(floor.type);
                            }
                        });
                    }
                });
            }
        }

        // Migrate statuses
        if (Array.isArray(data.statuses)) {
            const statusIdMap = new Map();
            let statusCounter = 1;

            data.statuses.forEach((status, index) => {
                if (status && status.id) {
                    const oldId = String(status.id);
                    // Check if it's a hash ID
                    if (/^status-[a-z0-9]{6,}-[a-z0-9]+$/.test(oldId) || /^status-[a-z0-9]{6,}$/.test(oldId)) {
                        const newId = `status-${statusCounter++}`;
                        statusIdMap.set(oldId, newId);
                        status.id = newId;
                        changed = true;
                    } else if (/^status-(\d+)$/.test(oldId)) {
                        // It's already sequential, track the counter
                        const num = parseInt(oldId.match(/^status-(\d+)$/)[1], 10);
                        if (num >= statusCounter) {
                            statusCounter = num + 1;
                        }
                    }
                }
            });

            // Update status references in floors
            if (changed && data.projects) {
                data.projects.forEach(project => {
                    if (Array.isArray(project.floors)) {
                        project.floors.forEach(floor => {
                            if (floor.status && statusIdMap.has(floor.status)) {
                                floor.status = statusIdMap.get(floor.status);
                            }
                            if (floor.statusLabel && statusIdMap.has(floor.statusLabel)) {
                                floor.statusLabel = statusIdMap.get(floor.statusLabel);
                            }
                        });
                    }
                });
            }
        }

        // Migrate colors
        if (Array.isArray(data.colors)) {
            let colorCounter = 1;

            data.colors.forEach((color, index) => {
                if (color && color.id) {
                    const oldId = String(color.id);
                    // Check if it's a hash ID
                    if (/^color-[a-z0-9]{6,}-[a-z0-9]+$/.test(oldId) || /^color-[a-z0-9]{6,}$/.test(oldId)) {
                        color.id = `color-${colorCounter++}`;
                        changed = true;
                    } else if (/^color-(\d+)$/.test(oldId)) {
                        // It's already sequential, track the counter
                        const num = parseInt(oldId.match(/^color-(\d+)$/)[1], 10);
                        if (num >= colorCounter) {
                            colorCounter = num + 1;
                        }
                    }
                }
            });
        }

        return changed;
    }

    function applyStoredImages(projects) {
        if (!Array.isArray(projects)) {
            return;
        }
        const images = storageCache.images;
        if (!images || typeof images !== 'object') {
            return;
        }
        Object.entries(images).forEach(([key, payload]) => {
            if (!key) {
                return;
            }
            const parts = key.split('__');
            if (parts.length < 2) {
                return;
            }
            const [type, ...rest] = parts;
            const targetId = rest.join('__');
            if (!targetId) {
                return;
            }
            if (type === 'project') {
                const project = projects.find((item) => String(item.id) === targetId);
                if (project) {
                    applyImageToEntity(project, payload);
                }
                return;
            }
            if (type === 'floor') {
                projects.forEach((project) => {
                    const floor = Array.isArray(project?.floors)
                        ? project.floors.find((item) => String(item.id) === targetId)
                        : null;
                    if (floor) {
                        applyImageToEntity(floor, payload);
                    }
                });
            }
        });
    }

    function cleanupOrphanImages(projects) {
        if (!storageCache.images || typeof storageCache.images !== 'object') {
            return false;
        }
        if (!Array.isArray(projects)) {
            return false;
        }

        // Vytvor set všetkých existujúcich ID projektov a lokalít
        const validProjectIds = new Set();
        const validFloorIds = new Set();

        projects.forEach((project) => {
            if (project && project.id) {
                validProjectIds.add(String(project.id));
            }
            if (Array.isArray(project?.floors)) {
                project.floors.forEach((floor) => {
                    if (floor && floor.id) {
                        validFloorIds.add(String(floor.id));
                    }
                });
            }
        });

        // Nájdi a vymaž orphan obrázky
        let cleaned = false;
        const imageKeys = Object.keys(storageCache.images);

        imageKeys.forEach((key) => {
            if (!key || typeof key !== 'string') {
                return;
            }

            const parts = key.split('__');
            if (parts.length < 2) {
                // Neplatný kľúč, vymaž ho
                delete storageCache.images[key];
                cleaned = true;
                return;
            }

            const [type, ...rest] = parts;
            const targetId = rest.join('__');

            if (!targetId) {
                // Neplatný kľúč, vymaž ho
                delete storageCache.images[key];
                cleaned = true;
                return;
            }

            if (type === 'project') {
                if (!validProjectIds.has(targetId)) {
                    // Projekt už neexistuje, vymaž obrázok
                    delete storageCache.images[key];
                    cleaned = true;
                }
            } else if (type === 'floor') {
                if (!validFloorIds.has(targetId)) {
                    // Lokalita už neexistuje, vymaž obrázok
                    delete storageCache.images[key];
                    cleaned = true;
                }
            } else {
                // Neznámy typ, vymaž ho
                delete storageCache.images[key];
                cleaned = true;
            }
        });

        if (cleaned) {
            // Ulož vyčistené obrázky do databázy
            persistValue('dm-images', storageCache.images);
        }

        return cleaned;
    }

    function getEntityImageSelection(entity) {
        if (!entity || typeof entity !== 'object') {
            return null;
        }
        const url = entity.image ?? entity.imageUrl ?? '';
        const id = entity.image_id ?? null;
        const alt = entity.imageAlt ?? entity.name ?? '';
        if (!url && !id) {
            return null;
        }
        return {
            id,
            url,
            alt,
        };
    }

    function persistEntityImage(entityType, entityId, selection) {
        if (!selection || !selection.id || !storage || typeof storage.saveImage !== 'function') {
            return;
        }
        const safeId = String(entityId ?? '').trim();
        if (!safeId) {
            return;
        }
        const prefix = entityType === 'floor' ? 'floor__' : 'project__';
        const entityKey = `${prefix}${safeId}`;
        const provisional = {
            id: selection.id,
            url: selection.url,
            alt: selection.alt || '',
            entity_id: entityKey,
            key: 'dm-projects',
        };
        storageCache.images[entityKey] = provisional;
        Promise.resolve(
            storage.saveImage({
                key: 'dm-projects',
                entityId: entityKey,
                attachmentId: selection.id,
            })
        )
            .then((response) => {
                if (response && response.image) {
                    storageCache.images[entityKey] = response.image;
                }
            })
            .catch((error) => {
                console.warn('[Developer Map] Failed to persist image reference', error);
            });
    }

    function repairProjectSchema(projects) {
        if (!Array.isArray(projects)) {
            return false;
        }
        let mutated = false;
        const remapKeys = (entity) => {
            if (!entity || typeof entity !== 'object') {
                return;
            }
            const keyMap = {
                imageurl: 'imageUrl',
                imagealt: 'imageAlt',
                statusid: 'statusId',
                statuslabel: 'statusLabel',
                parentid: 'parentId',
            };
            Object.entries(keyMap).forEach(([legacy, modern]) => {
                if (Object.prototype.hasOwnProperty.call(entity, legacy)) {
                    if (!Object.prototype.hasOwnProperty.call(entity, modern)) {
                        entity[modern] = entity[legacy];
                    }
                    delete entity[legacy];
                    mutated = true;
                }
            });
        };
        projects.forEach((project) => {
            remapKeys(project);
            if (project && Object.prototype.hasOwnProperty.call(project, 'parentId')) {
                const rawParentId = project.parentId;
                const trimmedParentId =
                    typeof rawParentId === 'string' || typeof rawParentId === 'number'
                        ? String(rawParentId).trim()
                        : '';
                const selfId = String(project.id ?? '').trim();
                if (!trimmedParentId || (selfId && trimmedParentId === selfId)) {
                    if (project.parentId !== null) {
                        project.parentId = null;
                        mutated = true;
                    }
                } else {
                    const parentExists = projects.some((candidate) => String(candidate?.id ?? '') === trimmedParentId);
                    if (parentExists) {
                        if (project.parentId !== trimmedParentId) {
                            project.parentId = trimmedParentId;
                            mutated = true;
                        } else {
                            project.parentId = trimmedParentId;
                        }
                    } else if (project.parentId !== null) {
                        project.parentId = null;
                        mutated = true;
                    }
                }
            }
            if (Array.isArray(project?.floors)) {
                project.floors.forEach((floor) => remapKeys(floor));
            }
        });
        return mutated;
    }

    // Load colors from storage cache
    function loadColors() {
        if (Array.isArray(storageCache.colors)) {
            return cloneForStorage(ensureColorsHaveNames(storageCache.colors));
        }
        return null;
    }

    function ensureColorsHaveNames(colors) {
        if (!Array.isArray(colors)) {
            return [];
        }

        const defaults = getDefaultColors();
        const defaultNameMap = new Map(defaults.map((color) => [color.id, color.name]));

        return colors.map((color, index) => {
            if (!color || typeof color !== 'object') {
                return color;
            }

            const next = { ...color };
            const rawLabel = typeof next.label === 'string' ? next.label.trim() : '';
            const rawName = typeof next.name === 'string' ? next.name.trim() : '';
            const validLabel = rawLabel && rawLabel.toLowerCase() !== 'undefined' ? rawLabel : '';
            const validName = rawName && rawName.toLowerCase() !== 'undefined' ? rawName : '';

            const fallbackName = validLabel || defaultNameMap.get(next.id) || `Farba ${index + 1}`;

            if (!validName) {
                next.name = fallbackName;
            } else {
                next.name = validName;
            }

            if (!validLabel) {
                next.label = next.name;
            }

            return next;
        });
    }

    function haveColorsChanged(original, next) {
        if (!Array.isArray(original) || !Array.isArray(next)) {
            return true;
        }

        if (original.length !== next.length) {
            return true;
        }

        for (let index = 0; index < next.length; index += 1) {
            const a = original[index] || {};
            const b = next[index] || {};
            if ((a.id || '') !== (b.id || '')) {
                return true;
            }
            if ((a.value || '').trim() !== (b.value || '').trim()) {
                return true;
            }
            if ((a.name || '').trim() !== (b.name || '').trim()) {
                return true;
            }
            if ((a.label || '').trim() !== (b.label || '').trim()) {
                return true;
            }
        }

        return false;
    }

    // Apply colors to CSS custom properties
    function applyColors(colors) {
        if (!colors || !Array.isArray(colors)) return;

        const colorMap = {
            'Farba tlačidiel': '--dm-button-color',
        };

        const staticTextColor = '#1C134F';
        root.style.setProperty('--dm-heading-color', staticTextColor);
        root.style.setProperty('--dm-content-text-color', staticTextColor);
        root.style.setProperty('--dm-text', staticTextColor);
        root.style.setProperty('--dm-map-modal-heading-color', staticTextColor);
        root.style.setProperty('--dm-toolbar-text-color', staticTextColor);
        root.style.setProperty('--dm-map-modal-content-color', staticTextColor);

        colors.forEach((color) => {
            // Support both 'name' and 'label' properties
            const colorName = color.name || color.label;
            if (!color || typeof colorName !== 'string') return;
            const label = colorName.trim();
            if (!label) return;

            if (label === 'Farba nadpisov' && typeof color.value === 'string' && color.value.trim()) {
                root.style.setProperty('--dm-map-modal-heading-color', color.value.trim());
                return;
            }

            if (label === 'Farba obsahových textov' && typeof color.value === 'string' && color.value.trim()) {
                const contentColor = color.value.trim();
                root.style.setProperty('--dm-toolbar-text-color', contentColor);
                root.style.setProperty('--dm-map-modal-content-color', contentColor);
                return;
            }

            const varName = colorMap[label];
            if (varName && typeof color.value === 'string' && color.value.trim()) {
                root.style.setProperty(varName, color.value.trim());
            }
        });
    }

    // Save colors via storage client
    function saveColors(colors) {
        const normalised = ensureColorsHaveNames(colors);
        const previous = Array.isArray(storageCache.colors) ? cloneForStorage(storageCache.colors) : null;
        storageCache.colors = cloneForStorage(normalised);
        data.colors = ensureColorsHaveNames(normalised);
        if (!previous || haveColorsChanged(previous, storageCache.colors)) {
            persistValue('dm-colors', storageCache.colors);
        }
    }

    function resolveString(value, fallback) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        } else if (value !== undefined && value !== null) {
            const str = String(value).trim();
            if (str) {
                return str;
            }
        }
        return fallback;
    }

    function normaliseAvailableFonts(fonts) {
        const defaults = getAvailableFonts();
        const defaultMap = new Map(defaults.map((font) => [font.id, font]));
        const list = Array.isArray(fonts) ? fonts : [];

        if (!list.length) {
            return defaults.map((font) => ({ ...font }));
        }

        const normalised = [];
        const usedIds = new Set();

        list.forEach((item, index) => {
            if (!item || typeof item !== 'object') {
                return;
            }
            const fallbackDefault = (item.id && defaultMap.get(item.id)) || defaults[index] || null;
            const fallbackId = fallbackDefault?.id || `font-${index + 1}`;
            const id = resolveString(item.id, fallbackId);
            if (!id || usedIds.has(id)) {
                return;
            }
            const base = fallbackDefault || {};
            const fallbackLabel = resolveString(base.label, `Font ${index + 1}`);
            const label = resolveString(item.label ?? item.name, fallbackLabel);
            const baseValue = resolveString(base.value, '');
            const safeLabel = label.replace(/'/g, "\\'");
            const fallbackValue = baseValue || `'` + safeLabel + `', sans-serif`;
            const value = resolveString(item.value ?? item.family, fallbackValue);
            const fallbackDescription = resolveString(base.description, '');
            const description = resolveString(item.description, fallbackDescription);
            normalised.push({
                id,
                label,
                value,
                description,
            });
            usedIds.add(id);
        });

        if (!normalised.length) {
            return defaults.map((font) => ({ ...font }));
        }

        return normalised;
    }

    // Load selected font from storage cache
    function loadSelectedFont() {
        if (storageCache.selectedFont && typeof storageCache.selectedFont === 'object') {
            return cloneForStorage(storageCache.selectedFont);
        }
        if (storageCache.fontBundle && storageCache.fontBundle.selected && typeof storageCache.fontBundle.selected === 'object') {
            return cloneForStorage(storageCache.fontBundle.selected);
        }
        return null;
    }

    function loadAvailableFonts() {
        if (Array.isArray(storageCache.availableFonts)) {
            return cloneForStorage(storageCache.availableFonts);
        }
        if (storageCache.fontBundle && Array.isArray(storageCache.fontBundle.available)) {
            return cloneForStorage(storageCache.fontBundle.available);
        }
        return null;
    }

    function persistFontBundle({ persist = true } = {}) {
        const payload = {};
        if (Array.isArray(storageCache.availableFonts) && storageCache.availableFonts.length > 0) {
            payload.available = cloneForStorage(storageCache.availableFonts);
        }
        if (storageCache.selectedFont && typeof storageCache.selectedFont === 'object') {
            payload.selected = cloneForStorage(storageCache.selectedFont);
        }
        const hasPayload = Object.keys(payload).length > 0;
        const nextBundle = hasPayload ? cloneForStorage(payload) : null;
        const previousSerial = storageCache.fontBundle ? JSON.stringify(storageCache.fontBundle) : null;
        const nextSerial = nextBundle ? JSON.stringify(nextBundle) : null;
        storageCache.fontBundle = nextBundle;
        if (previousSerial === nextSerial || !persist) {
            return;
        }
        if (hasPayload) {
            persistValue('dm-fonts', payload);
            if (payload.selected) {
                persistValue('dm-selected-font', payload.selected);
            } else {
                removePersistedValue('dm-selected-font');
            }
        } else {
            removePersistedValue('dm-fonts');
            removePersistedValue('dm-selected-font');
        }
    }

    function setAvailableFonts(fonts, { persist = true } = {}) {
        const normalised = normaliseAvailableFonts(fonts);
        data.availableFonts = normalised;
        storageCache.availableFonts = cloneForStorage(normalised);
        persistFontBundle({ persist });
        return normalised;
    }

    function normaliseSelectedFont(fontData, fonts) {
        const list = Array.isArray(fonts) ? fonts : [];
        if (!list.length) {
            return normaliseSelectedFont(fontData, normaliseAvailableFonts(getAvailableFonts()));
        }

        if (fontData && typeof fontData === 'object') {
            const explicitId = resolveString(fontData.id, '');
            if (explicitId) {
                const base = list.find((font) => font.id === explicitId);
                if (base) {
                    return { ...base, ...fontData, id: base.id };
                }
            }
        }

        if (typeof fontData === 'string' && fontData.trim()) {
            const candidate = list.find((font) => font.id === fontData.trim());
            if (candidate) {
                return { ...candidate };
            }
        }

        const fallback = list.find((font) => font.id === 'inter') || list[0];
        return fallback ? { ...fallback } : null;
    }

    function isSameFont(a, b) {
        if (!a || !b) {
            return false;
        }
        return a.id === b.id && a.value === b.value && a.label === b.label;
    }

    // Apply selected font to CSS
    function applySelectedFont(fontData) {
        if (!fontData || !fontData.value) return;

        // Apply font to root element - this will cascade to all children
        const fontFamily = fontData.value;

        let fontStyleElement = document.getElementById('dm-font-styles');
        if (!fontStyleElement) {
            fontStyleElement = document.createElement('style');
            fontStyleElement.id = 'dm-font-styles';
            document.head.appendChild(fontStyleElement);
        }

        // Use CSS custom property to make font changes easier
        fontStyleElement.textContent = `
            #dm-root.dm-root {
                font-family: ${fontFamily} !important;
            }
        `;
    }

    // Save selected font via storage client
    function saveSelectedFont(fontData) {
        if (!Array.isArray(data.availableFonts) || data.availableFonts.length === 0) {
            setAvailableFonts(getAvailableFonts(), { persist: false });
        }
        const fonts = Array.isArray(data.availableFonts) ? data.availableFonts : normaliseAvailableFonts(getAvailableFonts());
        const normalisedFont = normaliseSelectedFont(fontData, fonts);
        if (!normalisedFont) {
            return;
        }
        const previous = data.selectedFont;
        data.selectedFont = normalisedFont;
        storageCache.selectedFont = cloneForStorage(normalisedFont);
        if (!Array.isArray(storageCache.availableFonts)) {
            storageCache.availableFonts = cloneForStorage(fonts);
        }
        persistFontBundle();
    }

    // Convert status label to CSS class name
    function slugifyStatus(label) {
        if (!label) return 'unknown';
        return label
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-)|(-$)/g, '') || 'unknown';
    }

    // Convert hex color to RGB
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // Apply status styles dynamically
    function applyStatusStyles(statuses) {
        if (!statuses || !Array.isArray(statuses)) return;

        // Remove existing status styles if present
        let styleElement = document.getElementById('dm-status-styles');
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'dm-status-styles';
            document.head.appendChild(styleElement);
        }

        // Generate CSS for each status
        const cssRules = statuses.map((status) => {
            if (!status || !status.label || !status.color) return '';

            const className = slugifyStatus(status.label);
            const color = status.color;
            const rgb = hexToRgb(color);

            if (!rgb) return '';

            // Generate background with alpha transparency and text color
            const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;

            // Use the status color for text
            const textColor = color;

            return `
#dm-root .dm-status.dm-status--${className} {
    background: ${bgColor} !important;
    color: ${textColor} !important;
}`;
        }).filter(Boolean).join('\n');

        styleElement.textContent = cssRules;
    }

    // Load expanded projects from storage cache
    function loadExpandedProjects() {
        return Array.isArray(storageCache.expanded) ? [...storageCache.expanded] : [];
    }

    // Save expanded projects via storage
    function saveExpandedProjects(expandedIds) {
        storageCache.expanded = Array.isArray(expandedIds) ? [...expandedIds] : [];
        persistValue('dm-expanded-projects', storageCache.expanded);
    }

    // Load projects (maps) from storage cache
    function loadProjects() {
        if (Array.isArray(storageCache.projects)) {
            return cloneForStorage(storageCache.projects);
        }
        return null;
    }

    // Save projects (maps) via storage
    function saveProjects(projects) {
        if (Array.isArray(projects)) {
            ensureProjectShortcodes(projects);
        }
        storageCache.projects = cloneForStorage(projects);
        persistValue('dm-projects', storageCache.projects);
    }

    // Load types from storage cache
    function loadTypes() {
        if (Array.isArray(storageCache.types)) {
            return cloneForStorage(storageCache.types);
        }
        return null;
    }

    // Save types via storage
    function saveTypes(types) {
        storageCache.types = cloneForStorage(types);
        persistValue('dm-types', storageCache.types);
    }

    // Load statuses from storage cache
    function loadStatuses() {
        if (Array.isArray(storageCache.statuses)) {
            return cloneForStorage(storageCache.statuses);
        }
        return null;
    }

    // Save statuses via storage
    function saveStatuses(statuses) {
        storageCache.statuses = cloneForStorage(statuses);
        persistValue('dm-statuses', storageCache.statuses);
        applyStatusStyles(statuses);
    }

    async function hydrateStorage() {
        if (!storage || typeof storage.list !== 'function') {
            return;
        }
        try {
            const response = await storage.list();
            const dataset = response?.data && typeof response.data === 'object' ? response.data : response;
            if (dataset && typeof dataset === 'object') {
                if (Array.isArray(dataset['dm-colors'])) {
                    storageCache.colors = ensureColorsHaveNames(cloneForStorage(dataset['dm-colors']));
                }
                if (Array.isArray(dataset['dm-types'])) {
                    storageCache.types = cloneForStorage(dataset['dm-types']);
                }
                if (Array.isArray(dataset['dm-statuses'])) {
                    storageCache.statuses = cloneForStorage(dataset['dm-statuses']);
                }
                if (Array.isArray(dataset['dm-projects'])) {
                    storageCache.projects = cloneForStorage(dataset['dm-projects']);
                }
                if (Array.isArray(dataset['dm-expanded-projects'])) {
                    storageCache.expanded = [...dataset['dm-expanded-projects']];
                }
                if (dataset['dm-images'] && typeof dataset['dm-images'] === 'object') {
                    storageCache.images = { ...dataset['dm-images'] };
                }

                let fontsHydrated = false;
                if (dataset['dm-fonts'] && typeof dataset['dm-fonts'] === 'object') {
                    const fontPayload = dataset['dm-fonts'];
                    if (Array.isArray(fontPayload.available)) {
                        const normalised = normaliseAvailableFonts(fontPayload.available);
                        storageCache.availableFonts = cloneForStorage(normalised);
                    }
                    const fontsForSelection = Array.isArray(storageCache.availableFonts)
                        ? cloneForStorage(storageCache.availableFonts)
                        : normaliseAvailableFonts(getAvailableFonts());
                    if (fontPayload.selected && typeof fontPayload.selected === 'object') {
                        const selected = normaliseSelectedFont(fontPayload.selected, fontsForSelection);
                        if (selected) {
                            storageCache.selectedFont = cloneForStorage(selected);
                        }
                    }
                    const bundle = {};
                    if (Array.isArray(storageCache.availableFonts)) {
                        bundle.available = cloneForStorage(storageCache.availableFonts);
                    }
                    if (storageCache.selectedFont && typeof storageCache.selectedFont === 'object') {
                        bundle.selected = cloneForStorage(storageCache.selectedFont);
                    }
                    storageCache.fontBundle = Object.keys(bundle).length ? bundle : null;
                    fontsHydrated = true;
                }

                if (!fontsHydrated && dataset['dm-selected-font'] && typeof dataset['dm-selected-font'] === 'object') {
                    const fonts = Array.isArray(storageCache.availableFonts)
                        ? cloneForStorage(storageCache.availableFonts)
                        : normaliseAvailableFonts(getAvailableFonts());
                    const selected = normaliseSelectedFont(dataset['dm-selected-font'], fonts);
                    if (selected) {
                        storageCache.selectedFont = cloneForStorage(selected);
                    }
                }
            }
        } catch (error) {
            console.warn('[Developer Map] Failed to hydrate storage', error);
        }
        if (!Array.isArray(storageCache.expanded) || storageCache.expanded.length === 0) {
            try {
                const expandedResponse = await storage.get('dm-expanded-projects');
                if (expandedResponse && Array.isArray(expandedResponse.value)) {
                    storageCache.expanded = [...expandedResponse.value];
                }
            } catch (getError) {
                console.warn('[Developer Map] Failed to fetch expanded projects', getError);
            }
        }
    }

    await hydrateStorage();

    function normaliseTypes() {
        if (!Array.isArray(data.types)) {
            data.types = [];
            return;
        }
        let changed = false;
        data.types = data.types.map((type) => {
            if (type && typeof type === 'object') {
                let nextId = type.id;
                if (nextId === null || nextId === undefined) {
                    nextId = generateId('type');
                    changed = true;
                } else {
                    const strId = String(nextId).trim();
                    if (!strId) {
                        nextId = generateId('type');
                        changed = true;
                    } else if (typeof nextId !== 'string' || nextId !== strId) {
                        nextId = strId;
                        changed = true;
                    }
                }
                let nextLabel = 'Typ';
                if (typeof type.label === 'string') {
                    const trimmed = type.label.trim();
                    nextLabel = trimmed || 'Typ';
                    if (trimmed !== type.label) {
                        changed = true;
                    }
                } else if (type.label !== undefined && type.label !== null) {
                    nextLabel = String(type.label).trim() || 'Typ';
                    changed = true;
                }
                let nextColor = '#7C3AED';
                if (typeof type.color === 'string') {
                    const trimmedColor = type.color.trim();
                    nextColor = trimmedColor || '#7C3AED';
                    if (trimmedColor !== type.color) {
                        changed = true;
                    }
                } else if (type.color !== undefined && type.color !== null) {
                    nextColor = String(type.color).trim() || '#7C3AED';
                    changed = true;
                }
                return {
                    ...type,
                    id: nextId,
                    label: nextLabel,
                    color: nextColor,
                };
            }
            changed = true;
            return {
                id: generateId('type'),
                label: String(type ?? 'Typ'),
                color: '#7C3AED',
            };
        });
        if (changed) {
            saveTypes(data.types);
        }
    }

    // Initialize colors
    const savedColors = loadColors();
    if (savedColors && savedColors.length > 0) {
        const normalisedColors = ensureColorsHaveNames(savedColors);
        data.colors = normalisedColors;
        if (haveColorsChanged(savedColors, normalisedColors)) {
            saveColors(normalisedColors);
        }
    } else {
        // Create default colors on first installation
        data.colors = ensureColorsHaveNames(getDefaultColors());
        saveColors(data.colors);
    }
    data.colors = ensureColorsHaveNames(data.colors);
    applyColors(data.colors);

    // Initialize fonts
    const storedFonts = loadAvailableFonts();
    const hadStoredFonts = Array.isArray(storedFonts) && storedFonts.length > 0;
    let availableFonts = hadStoredFonts
        ? normaliseAvailableFonts(storedFonts)
        : normaliseAvailableFonts(getAvailableFonts());

    availableFonts = setAvailableFonts(availableFonts, { persist: true });

    const savedFont = loadSelectedFont();
    let selectedFont = normaliseSelectedFont(savedFont || { id: 'inter' }, availableFonts);

    if (!savedFont || !selectedFont) {
        selectedFont = normaliseSelectedFont({ id: 'inter' }, availableFonts);
    }

    saveSelectedFont(selectedFont);
    applySelectedFont(selectedFont);

    // Initialize types
    const savedTypes = loadTypes();
    if (savedTypes && savedTypes.length > 0) {
        data.types = savedTypes;
    } else {
        // Create default types on first installation
        data.types = getDefaultTypes();
        saveTypes(data.types);
    }
    normaliseTypes();

    function sanitiseStatusId(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const str = String(value).trim();
        if (!str || str === 'undefined' || str === 'null') {
            return '';
        }
        return str;
    }

    function sanitiseStatusLabel(value) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed || 'Stav';
        }
        if (value === null || value === undefined) {
            return 'Stav';
        }
        const str = String(value).trim();
        return str || 'Stav';
    }

    function sanitiseStatusColor(value) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
                return trimmed.toUpperCase();
            }
            if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
                return `#${trimmed.toUpperCase()}`;
            }
            return '#22C55E';
        }
        if (value === null || value === undefined) {
            return '#22C55E';
        }
        const str = String(value).trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(str)) {
            return str.toUpperCase();
        }
        if (/^[0-9A-Fa-f]{6}$/.test(str)) {
            return `#${str.toUpperCase()}`;
        }
        return '#22C55E';
    }

    function normaliseStatuses() {
        if (!Array.isArray(data.statuses)) {
            data.statuses = [];
            return;
        }

        const usedIds = new Set();
        let changed = false;

        const pickId = (preferred, fallback) => {
            const preferredId = sanitiseStatusId(preferred);
            const fallbackId = sanitiseStatusId(fallback);
            let candidate = preferredId || fallbackId;
            if (!candidate) {
                candidate = generateId('status');
            }
            while (!candidate || usedIds.has(candidate)) {
                candidate = generateId('status');
            }
            if (!preferredId || candidate !== preferredId) {
                changed = true;
            }
            usedIds.add(candidate);
            return candidate;
        };

        data.statuses = data.statuses.map((status, index) => {
            const source = status && typeof status === 'object' ? status : { label: status };
            const nextId = pickId(source.id, `status-${index + 1}`);
            const nextLabel = sanitiseStatusLabel(source.label);
            const nextColor = sanitiseStatusColor(source.color);

            if (
                String(source.id ?? '') !== nextId ||
                source.label !== nextLabel ||
                source.color !== nextColor ||
                source !== status
            ) {
                changed = true;
            }

            return {
                ...source,
                id: nextId,
                label: nextLabel,
                color: nextColor,
            };
        });

        if (changed) {
            saveStatuses(data.statuses);
        }
    }

    function normaliseRegionGeometryPoints(points) {
        if (!Array.isArray(points)) {
            return [];
        }
        return points
            .map((point) => {
                if (Array.isArray(point) && point.length >= 2) {
                    const x = Number(point[0]);
                    const y = Number(point[1]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) {
                        return null;
                    }
                    return [Number(x.toFixed(4)), Number(y.toFixed(4))];
                }
                if (point && typeof point === 'object') {
                    const x = Number(point.x ?? point[0]);
                    const y = Number(point.y ?? point[1]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) {
                        return null;
                    }
                    return [Number(x.toFixed(4)), Number(y.toFixed(4))];
                }
                return null;
            })
            .filter(Boolean);
    }

    function normaliseRegionDefinition(region, fallbackLabel, index) {
        if (!region || typeof region !== 'object') {
            return null;
        }

        const geometrySource =
            region.geometry && typeof region.geometry === 'object' ? region.geometry : region;
        const points = normaliseRegionGeometryPoints(geometrySource.points ?? geometrySource);

        const id =
            typeof region.id === 'string' && region.id.trim()
                ? region.id.trim()
                : generateId('region');
        const label =
            typeof region.label === 'string' && region.label.trim()
                ? region.label.trim()
                : `${fallbackLabel || 'Region'} ${index + 1}`;
        const statusId = sanitiseStatusId(region.statusId ?? region.status ?? '');
        const statusLabel =
            typeof region.statusLabel === 'string' && region.statusLabel.trim()
                ? region.statusLabel.trim()
                : '';

        const children = Array.isArray(region.children)
            ? region.children
                .map((childId) => {
                    const str = String(childId ?? '').trim();
                    return str ? str : null;
                })
                .filter(Boolean)
            : [];

        const next = {
            id,
            label,
            statusId,
            status: statusId,
            statusLabel,
            geometry: {
                type: 'polygon',
                points,
            },
            children,
        };

        if (region.meta && typeof region.meta === 'object') {
            const metaCopy = { ...region.meta };
            if (Object.prototype.hasOwnProperty.call(metaCopy, 'hatchClass')) {
                delete metaCopy.hatchClass;
            }
            if (Object.keys(metaCopy).length) {
                next.meta = metaCopy;
            }
        }

        const detailUrlCandidate = (() => {
            const metaUrl = typeof region.meta?.detailUrl === 'string' ? region.meta.detailUrl.trim() : '';
            if (metaUrl) {
                return metaUrl;
            }
            const topLevel = typeof region.detailUrl === 'string' ? region.detailUrl.trim() : '';
            return topLevel;
        })();
        if (detailUrlCandidate) {
            if (!next.meta || typeof next.meta !== 'object') {
                next.meta = {};
            }
            next.meta.detailUrl = detailUrlCandidate;
            next.detailUrl = detailUrlCandidate;
        } else if (next.meta && Object.prototype.hasOwnProperty.call(next.meta, 'detailUrl')) {
            delete next.meta.detailUrl;
        }

        const extras = { ...region };
        delete extras.id;
        delete extras.label;
        delete extras.status;
        delete extras.statusId;
        delete extras.statusLabel;
        delete extras.hatchClass;
        delete extras.geometry;
        delete extras.meta;
        delete extras.children;
        delete extras.detailUrl;
        Object.keys(extras).forEach((key) => {
            if (!Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = extras[key];
            }
        });

        return next;
    }

    function ensureEntityRegions(entity, index, contextLabel) {
        if (!entity || typeof entity !== 'object') {
            return false;
        }

        const fallbackLabel =
            (typeof entity.label === 'string' && entity.label.trim()) ||
            (typeof entity.name === 'string' && entity.name.trim()) ||
            contextLabel ||
            'Region';

        const regionsSource = Array.isArray(entity.regions) ? entity.regions : [];
        const nextRegions = [];

        regionsSource.forEach((region, regionIndex) => {
            const normalised = normaliseRegionDefinition(region, fallbackLabel, regionIndex);
            if (normalised) {
                nextRegions.push(normalised);
            }
        });

        if (!nextRegions.length && entity.geometry && typeof entity.geometry === 'object') {
            const legacyRegion = normaliseRegionDefinition(
                {
                    label: fallbackLabel,
                    status: entity.status ?? entity.statusKey ?? '',
                    statusId: entity.statusId ?? entity.status ?? '',
                    statusLabel: entity.statusLabel ?? '',
                    geometry: entity.geometry,
                    meta:
                        entity.meta && typeof entity.meta === 'object'
                            ? (() => {
                                const metaCopy = { ...entity.meta };
                                if (Object.prototype.hasOwnProperty.call(metaCopy, 'hatchClass')) {
                                    delete metaCopy.hatchClass;
                                }
                                return metaCopy;
                            })()
                            : undefined,
                },
                fallbackLabel,
                0
            );
            if (legacyRegion) {
                nextRegions.push(legacyRegion);
            }
        }

        const previousSerialised = JSON.stringify(Array.isArray(entity.regions) ? entity.regions : []);
        const nextSerialised = JSON.stringify(nextRegions);

        const hadGeometry = Boolean(entity.geometry);
        if (hadGeometry) {
            delete entity.geometry;
        }

        entity.regions = nextRegions;

        return previousSerialised !== nextSerialised || hadGeometry;
    }

    function ensureProjectRegions(projects) {
        if (!Array.isArray(projects)) {
            return false;
        }

        let mutated = false;
        projects.forEach((project, projectIndex) => {
            const projectChanged = ensureEntityRegions(
                project,
                projectIndex,
                `Projekt ${projectIndex + 1}`
            );
            if (projectChanged) {
                mutated = true;
            }
            if (Array.isArray(project?.floors)) {
                project.floors.forEach((floor, floorIndex) => {
                    const floorChanged = ensureEntityRegions(
                        floor,
                        floorIndex,
                        project?.name ?? `Projekt ${projectIndex + 1}`
                    );
                    if (floorChanged) {
                        mutated = true;
                    }
                });
            }
        });

        return mutated;
    }

    function ensureProjectPublicKeys(projects) {
        if (!Array.isArray(projects)) {
            return false;
        }

        let mutated = false;
        const used = new Set();

        projects.forEach((project, index) => {
            if (!project || typeof project !== 'object') {
                return;
            }
            let candidate = typeof project.publicKey === 'string' ? project.publicKey.trim() : '';
            if (!candidate) {
                candidate = slugifyKey(project.name ?? project.title ?? `mapa-${index + 1}`);
            } else {
                candidate = slugifyKey(candidate);
            }
            const base = candidate || `mapa-${index + 1}`;
            let unique = base;
            let suffix = 1;
            while (used.has(unique)) {
                unique = `${base}-${suffix}`;
                suffix += 1;
            }
            if (project.publicKey !== unique) {
                project.publicKey = unique;
                mutated = true;
            }
            used.add(unique);
        });

        return mutated;
    }

    function ensureProjectShortcodes(projects) {
        if (!Array.isArray(projects)) {
            return false;
        }

        let mutated = false;

        projects.forEach((project) => {
            if (!project || typeof project !== 'object') {
                return;
            }

            const parentKey = typeof project.publicKey === 'string' && project.publicKey.trim()
                ? project.publicKey.trim()
                : slugifyKey(project.name ?? project.title ?? project.id ?? 'mapa');

            if (project.shortcode !== parentKey) {
                project.shortcode = parentKey;
                mutated = true;
            }

            if (!Array.isArray(project.floors)) {
                return;
            }

            let ordinal = 1;
            project.floors.forEach((floor) => {
                if (!floor || typeof floor !== 'object') {
                    return;
                }

                const expected = `${parentKey}-${ordinal}`;
                if (floor.shortcode !== expected) {
                    floor.shortcode = expected;
                    mutated = true;
                }
                ordinal += 1;
            });
        });

        return mutated;
    }

    function ensureProjectFrontendSettings(projects) {
        if (!Array.isArray(projects)) {
            return false;
        }
        let mutated = false;
        projects.forEach((project) => {
            if (!project || typeof project !== 'object') {
                return;
            }
            if (!project.frontend || typeof project.frontend !== 'object') {
                project.frontend = {};
                mutated = true;
            }
            const tableSettings = project.frontend.locationTable;
            if (!tableSettings || typeof tableSettings !== 'object') {
                project.frontend.locationTable = {
                    enabled: false,
                    scope: 'current',
                    includeParent: false,
                };
                mutated = true;
                return;
            }
            if (!Object.prototype.hasOwnProperty.call(tableSettings, 'enabled')) {
                tableSettings.enabled = false;
                mutated = true;
            } else {
                tableSettings.enabled = Boolean(tableSettings.enabled);
            }
            if (
                !tableSettings.scope ||
                (tableSettings.scope !== 'current' && tableSettings.scope !== 'hierarchy')
            ) {
                tableSettings.scope = 'current';
                mutated = true;
            }
            if (!Object.prototype.hasOwnProperty.call(tableSettings, 'includeParent')) {
                tableSettings.includeParent = false;
                mutated = true;
            } else {
                tableSettings.includeParent = Boolean(tableSettings.includeParent);
            }
        });
        return mutated;
    }

    function ensureFloorStatusReferences() {
        if (!Array.isArray(data.projects) || data.projects.length === 0) {
            return false;
        }
        if (!Array.isArray(data.statuses) || data.statuses.length === 0) {
            return false;
        }

        const validIds = new Set(data.statuses.map((status) => sanitiseStatusId(status?.id)));
        const labelLookup = new Map();
        data.statuses.forEach((status) => {
            if (!status || typeof status !== 'object') {
                return;
            }
            const labelKey =
                typeof status.label === 'string' ? status.label.trim().toLowerCase() : '';
            const statusId = sanitiseStatusId(status.id);
            if (labelKey && statusId && !labelLookup.has(labelKey)) {
                labelLookup.set(labelKey, statusId);
            }
        });
        const fallbackId = sanitiseStatusId(data.statuses[0]?.id);

        let updated = false;

        data.projects.forEach((project) => {
            if (!project || typeof project !== 'object' || !Array.isArray(project.floors)) {
                return;
            }
            project.floors.forEach((floor) => {
                if (!floor || typeof floor !== 'object') {
                    return;
                }
                const currentId = sanitiseStatusId(floor.statusId);
                let nextId = currentId;

                if (nextId && !validIds.has(nextId)) {
                    const label =
                        (typeof floor.statusLabel === 'string' && floor.statusLabel.trim()) ||
                        (typeof floor.status === 'string' && floor.status.trim()) ||
                        '';
                    if (label) {
                        const match = labelLookup.get(label.toLowerCase());
                        nextId = match || '';
                    } else {
                        nextId = '';
                    }
                }

                if (!nextId && fallbackId) {
                    nextId = fallbackId;
                }

                if (nextId !== currentId || String(floor.statusId ?? '') !== nextId) {
                    floor.statusId = nextId;
                    updated = true;
                }

                if (Array.isArray(floor.regions)) {
                    floor.regions = floor.regions.map((region, regionIndex) => {
                        if (!region || typeof region !== 'object') {
                            return region;
                        }
                        const existingStatusId = sanitiseStatusId(region.statusId ?? region.status ?? '');
                        let resolvedStatusId = existingStatusId;
                        if (resolvedStatusId && !validIds.has(resolvedStatusId)) {
                            const labelKey =
                                typeof region.statusLabel === 'string'
                                    ? region.statusLabel.trim().toLowerCase()
                                    : '';
                            const fallbackMatch = labelKey ? labelLookup.get(labelKey) : '';
                            resolvedStatusId = fallbackMatch || '';
                        }
                        if (!resolvedStatusId && fallbackId) {
                            resolvedStatusId = fallbackId;
                        }
                        if (resolvedStatusId && !validIds.has(resolvedStatusId)) {
                            resolvedStatusId = '';
                        }

                        const statusLabel =
                            resolvedStatusId && validIds.has(resolvedStatusId)
                                ? data.statuses.find(
                                    (status) => sanitiseStatusId(status?.id) === resolvedStatusId,
                                )?.label ?? region.statusLabel ?? ''
                                : region.statusLabel ?? '';

                        const normalisedGeometry = normaliseRegionGeometryPoints(
                            (region.geometry && region.geometry.points) || region.geometry || [],
                        );

                        const nextRegion = {
                            ...region,
                            statusId: resolvedStatusId,
                            status: resolvedStatusId,
                            statusLabel,
                            geometry: {
                                type: 'polygon',
                                points: normalisedGeometry.length ? normalisedGeometry : [],
                            },
                        };

                        if (
                            nextRegion.statusId !== (region.statusId ?? '') ||
                            nextRegion.status !== (region.status ?? '') ||
                            nextRegion.statusLabel !== (region.statusLabel ?? '')
                        ) {
                            updated = true;
                        }
                        return nextRegion;
                    });
                }
            });
        });

        return updated;
    }

    // Initialize statuses
    const savedStatuses = loadStatuses();
    if (savedStatuses && savedStatuses.length > 0) {
        data.statuses = savedStatuses;
    } else {
        // Create default statuses on first installation
        data.statuses = getDefaultStatuses();
        saveStatuses(data.statuses);
    }
    normaliseStatuses();
    applyStatusStyles(data.statuses);

    // Initialize projects from storage
    let projectsDirty = false;
    const savedProjects = loadProjects();
    if (savedProjects && savedProjects.length) {
        // Check if projects have images (for backward compatibility)
        const hasImages = savedProjects.some((p) => p?.image || p?.imageUrl || p?.imageurl);
        if (!hasImages) {
            removePersistedValue('dm-projects');
            if (ensureProjectRegions(data.projects)) {
                projectsDirty = true;
            }
            if (ensureProjectPublicKeys(data.projects)) {
                projectsDirty = true;
            }
            projectsDirty = true;
        } else {
            data.projects = savedProjects;
            const repairedSchema = repairProjectSchema(data.projects);
            if (repairedSchema) {
                projectsDirty = true;
            }
            if (ensureProjectRegions(data.projects)) {
                projectsDirty = true;
            }
            if (ensureProjectPublicKeys(data.projects)) {
                projectsDirty = true;
            }
            // Clean demo images from storage
            if (cleanDemoImages(data.projects)) {
                projectsDirty = true;
            }
            // Migrate hash IDs to sequential IDs
            const migratedIds = migrateHashIdsToSequential();
            if (migratedIds) {
                projectsDirty = true;
                // Save migrated types, statuses, and colors
                saveTypes(data.types);
                saveStatuses(data.statuses);
                saveColors(data.colors);
            }
        }
    } else {
        if (ensureProjectRegions(data.projects)) {
            projectsDirty = true;
        }
        if (ensureProjectPublicKeys(data.projects)) {
            projectsDirty = true;
        }
        projectsDirty = true;
    }

    if (ensureProjectShortcodes(data.projects)) {
        projectsDirty = true;
    }
    if (ensureProjectFrontendSettings(data.projects)) {
        projectsDirty = true;
    }

    const repairedProjects = ensureFloorStatusReferences();
    if (repairedProjects) {
        projectsDirty = true;
    }
    if (projectsDirty) {
        saveProjects(data.projects);
    }
    applyStoredImages(data.projects);

    // Vyčisti orphan obrázky (obrázky pre neexistujúce projekty/lokality)
    cleanupOrphanImages(data.projects);

    // Clear expanded projects on page load (fresh start)
    removePersistedValue('dm-expanded-projects');
    storageCache.expanded = [];

    const state = {
        view: APP_VIEWS.MAPS,
        mapSection: MAP_SECTIONS.LIST,
        settingsSection: SETTINGS_SECTIONS.OVERVIEW,
        activeProjectId: data.projects[0]?.id ?? null,
        searchTerm: '',
        dashboardSearchTerm: '',
        dashboardStatusFilter: '',
        dashboardPriceOrder: '',
        modal: null,
        runtimeConfig,
    };

    let customSelectControllers = [];
    let customSelectDocEventsBound = false;
    let mediaFrame = null;
    let wpAdminLayoutManager = null;

    function findMapItem(itemId) {
        if (!itemId) {
            return null;
        }
        const soughtId = String(itemId);
        for (const project of data.projects ?? []) {
            if (String(project.id) === soughtId) {
                const parentIdRaw = project?.parentId;
                const parentId = typeof parentIdRaw === 'string' || typeof parentIdRaw === 'number'
                    ? String(parentIdRaw).trim()
                    : '';
                const parentProject = parentId
                    ? (data.projects ?? []).find((candidate) => String(candidate?.id ?? '') === parentId) ?? null
                    : null;
                return { item: project, type: 'project', parent: parentProject };
            }
            for (const floor of project.floors ?? []) {
                if (String(floor.id) === soughtId) {
                    return { item: floor, type: 'floor', parent: project };
                }
            }
        }
        return null;
    }

    function generateId(prefix) {
        const safePrefix = prefix || 'entity';

        // Get the appropriate collection based on prefix
        let collection = [];
        switch (safePrefix) {
            case 'type':
                collection = data.types || [];
                break;
            case 'status':
                collection = data.statuses || [];
                break;
            case 'color':
                collection = data.colors || [];
                break;
            case 'project':
                collection = data.projects || [];
                break;
            case 'floor':
                // Get all floors from all projects
                collection = (data.projects || []).flatMap(p => p.floors || []);
                break;
            case 'region':
                // Get all regions from all floors in all projects
                collection = (data.projects || []).flatMap(p =>
                    (p.floors || []).flatMap(f => f.regions || [])
                );
                break;
            default:
                // For unknown types, use random ID as fallback
                const randomPart = Math.random().toString(36).slice(2, 8);
                return `${safePrefix}-${randomPart}`;
        }

        // Find the highest numeric ID in the collection
        let maxNumber = 0;
        const pattern = new RegExp(`^${safePrefix}-(\\d+)$`);

        collection.forEach(item => {
            if (item && item.id) {
                const match = String(item.id).match(pattern);
                if (match && match[1]) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNumber) {
                        maxNumber = num;
                    }
                }
            }
        });

        // Return next sequential ID
        return `${safePrefix}-${maxNumber + 1}`;
    }

    function ensureBadge(name, fallback = 'M') {
        if (typeof name === 'string' && name.trim().length) {
            return name.trim().charAt(0).toUpperCase();
        }
        return fallback || 'M';
    }

    function slugifyKey(input, fallback = 'mapa') {
        if (typeof input !== 'string') {
            return fallback;
        }
        const normalised = input
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-{2,}/g, '-');
        return normalised || fallback;
    }

    function generateProjectPublicKey(sourceName, exclude = []) {
        const used = new Set(
            exclude
                .map((project) => (project && typeof project.publicKey === 'string' ? project.publicKey.trim() : ''))
                .filter(Boolean),
        );
        const base = slugifyKey(sourceName || 'mapa');
        let candidate = base;
        let suffix = 1;
        while (used.has(candidate)) {
            candidate = `${base}-${suffix}`;
            suffix += 1;
        }
        used.add(candidate);
        return candidate;
    }

    function collectModalFields() {
        const form = root.querySelector('.dm-modal__form');
        const typeForm = root.querySelector('[data-dm-type-form]');
        const statusForm = root.querySelector('[data-dm-status-form]');

        // Handle status form
        if (statusForm) {
            const statusId = statusForm.getAttribute('data-dm-status-id') || '';
            const nameInput = statusForm.querySelector('[data-dm-status-name]');
            const colorInput = statusForm.querySelector('[data-dm-status-color]');
            const hexInput = statusForm.querySelector('[data-dm-status-hex]');

            return {
                elements: {
                    statusIdInput: { value: statusId },
                    nameInput,
                    colorInput,
                    hexInput,
                },
            };
        }

        // Handle type form
        if (typeForm) {
            const typeId = typeForm.getAttribute('data-dm-type-id') || '';
            const nameInput = typeForm.querySelector('[data-dm-type-name]');
            const colorInput = typeForm.querySelector('[data-dm-type-color]');
            const hexInput = typeForm.querySelector('[data-dm-type-hex]');

            return {
                elements: {
                    typeIdInput: { value: typeId },
                    nameInput,
                    colorInput,
                    hexInput,
                },
            };
        }

        // Handle map form
        if (!form) {
            return null;
        }

        const nameInput = form.querySelector('input[data-dm-field="name"]');
        const typeSelect = form.querySelector('select[data-dm-field="map-type"]');
        const parentSelect = form.querySelector('select[data-dm-field="parent"]');

        const nameValue = nameInput ? nameInput.value.trim() : '';

        let typeValue = '';
        if (typeSelect) {
            const selected = typeSelect.value;
            typeValue = selected ? selected.trim() : '';
        }

        let parentId = null;
        if (parentSelect) {
            const rawValue = parentSelect.value;
            const candidate = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
            parentId = candidate && candidate !== 'none' ? candidate : null;
        } else if (state.modal && state.modal.parentId) {
            parentId = state.modal.parentId;
        }

        return {
            name: nameValue,
            type: typeValue,
            parentId,
            elements: {
                nameInput,
                typeSelect,
                parentSelect,
            },
        };
    }

    function collectLocationFields() {
        const form = root.querySelector('.dm-modal__form');
        if (!form) {
            return null;
        }

        const nameInput = form.querySelector('input[data-dm-field="name"]');
        const typeSelect = form.querySelector('select[data-dm-field="location-type"]');
        const statusSelect = form.querySelector('select[data-dm-field="location-status"]');
        const parentSelect = form.querySelector('select[data-dm-field="parent"]');
        const urlInput = form.querySelector('input[data-dm-field="url"]');
        const detailUrlInput = form.querySelector('input[data-dm-field="detail-url"]');
        const areaInput = form.querySelector('input[data-dm-field="area"]');
        const suffixInput = form.querySelector('input[data-dm-field="suffix"]');
        const prefixInput = form.querySelector('input[data-dm-field="prefix"]');
        const designationInput = form.querySelector('input[data-dm-field="designation"]');
        const priceInput = form.querySelector('input[data-dm-field="price"]');
        const rentInput = form.querySelector('input[data-dm-field="rent"]');

        const nameValue = nameInput ? nameInput.value.trim() : '';
        const typeValue = typeSelect ? (typeSelect.value || '').trim() : '';
        const statusOption = (() => {
            if (!statusSelect) {
                return null;
            }
            if (typeof statusSelect.selectedOptions !== 'undefined') {
                return statusSelect.selectedOptions.length ? statusSelect.selectedOptions[0] : null;
            }
            const index = statusSelect.selectedIndex;
            if (typeof index === 'number' && index >= 0) {
                return statusSelect.options[index] ?? null;
            }
            return null;
        })();
        const statusValue = statusOption ? statusOption.textContent.trim() : statusSelect ? (statusSelect.value || '').trim() : '';
        const statusIdValue = (() => {
            const raw = statusOption?.dataset?.statusId ?? statusOption?.getAttribute?.('data-status-id') ?? '';
            if (raw) {
                return sanitiseStatusId(raw);
            }
            if (statusValue) {
                const normalized = statusValue.trim();
                const match = data.statuses?.find((item) => String(item.label ?? '').trim() === normalized);
                if (match?.id) {
                    return sanitiseStatusId(match.id);
                }
            }
            if (state.modal?.statusId) {
                return sanitiseStatusId(state.modal.statusId);
            }
            return '';
        })();
        const urlValue = urlInput ? urlInput.value.trim() : '';
        const detailUrlValue = detailUrlInput ? detailUrlInput.value.trim() : '';
        const areaValue = areaInput ? areaInput.value.trim() : '';
        const suffixValue = suffixInput ? suffixInput.value.trim() : 'm²';
        const prefixValue = prefixInput ? prefixInput.value.trim() : '';
        const designationValue = designationInput ? designationInput.value.trim() : '';
        const priceValue = priceInput ? priceInput.value.trim() : '';
        const rentValue = rentInput ? rentInput.value.trim() : '';

        let parentId = null;
        if (parentSelect) {
            const rawValue = parentSelect.value;
            const candidate = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
            parentId = candidate && candidate !== 'none' ? candidate : null;
        } else if (state.modal && state.modal.parentId) {
            parentId = state.modal.parentId;
        }

        return {
            name: nameValue,
            type: typeValue,
            status: statusValue,
            statusId: statusIdValue,
            parentId,
            url: urlValue,
            detailUrl: detailUrlValue,
            area: areaValue,
            suffix: suffixValue,
            prefix: prefixValue,
            designation: designationValue,
            price: priceValue,
            rent: rentValue,
            elements: {
                nameInput,
                typeSelect,
                statusSelect,
                detailUrlInput,
            },
        };
    }

    root.dataset.dmHydrated = '1';
    root.classList.add('dm-root');

    function captureFocusState() {
        if (typeof document === 'undefined') {
            return null;
        }
        const active = document.activeElement;
        if (!active || !root.contains(active)) {
            return null;
        }
        const preserveKey = active.getAttribute('data-dm-preserve-focus');
        if (!preserveKey) {
            return null;
        }
        let selectionStart = null;
        let selectionEnd = null;
        if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
            selectionStart = active.selectionStart;
            selectionEnd = active.selectionEnd;
        }
        return {
            key: preserveKey,
            selectionStart,
            selectionEnd,
            scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
            scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        };
    }

    function restoreFocusState(focusState) {
        if (!focusState) {
            return;
        }
        const target = root.querySelector(`[data-dm-preserve-focus="${focusState.key}"]`);
        if (target && typeof target.focus === 'function') {
            target.focus();
            if (
                focusState.selectionStart !== null &&
                focusState.selectionEnd !== null &&
                typeof target.setSelectionRange === 'function'
            ) {
                try {
                    target.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
                } catch (err) {
                    // Ignore selection errors for inputs that do not support setSelectionRange.
                }
            }
        }
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
            window.scrollTo(focusState.scrollX ?? 0, focusState.scrollY ?? 0);
        }
    }

    function setState(patch) {
        const focusState = captureFocusState();
        const next = typeof patch === 'function' ? patch(state) : patch;

        // WP Admin Layout Manager sa už nedestroyuje - zostáva aktívny pre všetky modály
        // Manager sa automaticky refresh-uje v render() cez ensureWPAdminLayout()

        Object.assign(state, next);
        render();
        restoreFocusState(focusState);
    }

    function openModal(modalType, rawPayload = null, metadata = null) {
        const normalizedType = typeof modalType === 'string' ? modalType : null;
        let normalizedPayload =
            rawPayload === null || rawPayload === undefined || rawPayload === 'null' || rawPayload === 'undefined'
                ? null
                : String(rawPayload);
        if (normalizedPayload) {
            normalizedPayload = normalizedPayload.trim();
            if (!normalizedPayload) {
                normalizedPayload = null;
            }
        }

        const meta = metadata && typeof metadata === 'object' ? metadata : {};
        const typeLabelHint = typeof meta.typeLabel === 'string' ? meta.typeLabel.trim() : '';
        const typeIdHint = meta.typeId ? String(meta.typeId) : '';
        if (!normalizedPayload && typeIdHint) {
            normalizedPayload = typeIdHint;
        }

        if (!normalizedType) {
            setState({ modal: null });
            return;
        }

        if (normalizedType === 'edit-map' && normalizedPayload) {
            const result = findMapItem(normalizedPayload);
            if (result) {
                if (result.type === 'floor') {
                    setState({
                        modal: {
                            type: 'edit-location',
                            payload: String(result.item.id),
                            parentId: result.parent ? String(result.parent.id) : null,
                            targetType: 'floor',
                            statusId: sanitiseStatusId(result.item.statusId || result.item.statusKey || ''),
                            status: String(result.item.status ?? result.item.statusLabel ?? '').trim(),
                        },
                    });
                    return;
                }
                setState({
                    modal: {
                        type: normalizedType,
                        payload: String(result.item.id),
                        parentId: result.parent ? String(result.parent.id) : (result.type === 'project' && result.item.parentId ? String(result.item.parentId) : null),
                        imageSelection: getEntityImageSelection(result.item),
                        imagePreview: result.item.image ?? result.item.imageUrl ?? null,
                        targetType: result.type,
                    },
                });
                return;
            }
        }

        if (normalizedType === 'edit-location' && normalizedPayload) {
            const result = findMapItem(normalizedPayload);
            if (result && result.type === 'floor') {
                setState({
                    modal: {
                        type: normalizedType,
                        payload: String(result.item.id),
                        parentId: result.parent ? String(result.parent.id) : null,
                        targetType: 'floor',
                        statusId: sanitiseStatusId(result.item.statusId || result.item.statusKey || ''),
                        status: String(result.item.status ?? result.item.statusLabel ?? '').trim(),
                        imageSelection: getEntityImageSelection(result.item),
                        imagePreview: result.item.image ?? result.item.imageUrl ?? null,
                    },
                });
                return;
            }
        }

        if (normalizedType === 'add-map') {
            setState({
                modal: {
                    type: normalizedType,
                    payload: null,
                    parentId: null,
                    imagePreview: null,
                    imageSelection: null,
                    targetType: 'project',
                },
            });
            return;
        }

        if (normalizedType === 'add-location') {
            const parentId = normalizedPayload ?? (state.activeProjectId ? String(state.activeProjectId) : null);
            setState({
                modal: {
                    type: normalizedType,
                    payload: null,
                    parentId,
                    targetType: 'floor',
                    imagePreview: null,
                    imageSelection: null,
                },
            });
            return;
        }

        if (normalizedType === 'delete-map' && normalizedPayload) {
            const result = findMapItem(normalizedPayload);
            if (result) {
                setState({
                    modal: {
                        type: normalizedType,
                        payload: String(result.item.id),
                        itemName: result.item.name || 'túto položku',
                    },
                });
                return;
            }
        }

        if (normalizedType === 'edit-type') {
            if (!normalizedPayload && typeLabelHint) {
                const labelMatch = data.types.find((type) => String(type.label).trim() === typeLabelHint);
                if (labelMatch) {
                    normalizedPayload = String(labelMatch.id);
                }
            }
            if (!normalizedPayload) {
                console.warn('[Developer Map] Missing type id for edit-type modal. Aborting.');
                return;
            }

            const typeItem = data.types.find((type) => String(type.id) === normalizedPayload);
            if (typeItem) {
                setState({
                    modal: {
                        type: normalizedType,
                        payload: String(typeItem.id),
                        itemName: typeItem.label,
                    },
                });
                return;
            }
            console.warn('[Developer Map] Type not found in openModal, but continuing with payload:', normalizedPayload);
        }

        if (normalizedType === 'add-type') {
            setState({
                modal: {
                    type: normalizedType,
                    payload: null,
                },
            });
            return;
        }

        if (normalizedType === 'delete-type') {
            if (!normalizedPayload && typeLabelHint) {
                const labelMatch = data.types.find((type) => String(type.label).trim() === typeLabelHint);
                if (labelMatch) {
                    normalizedPayload = String(labelMatch.id);
                }
            }
            if (!normalizedPayload) {
                console.warn('[Developer Map] Missing type id for delete-type modal. Aborting.');
                return;
            }

            const typeItem = data.types.find((type) => String(type.id) === normalizedPayload);
            setState({
                modal: {
                    type: normalizedType,
                    payload: typeItem ? String(typeItem.id) : normalizedPayload,
                    itemName: (typeItem?.label ?? typeLabelHint) || 'vybraný typ',
                },
            });
            return;
        }

        if (normalizedType === 'edit-status') {
            if (!normalizedPayload) {
                console.warn('[Developer Map] Missing status id for edit-status modal. Aborting.');
                return;
            }

            const statusItem = data.statuses.find((status) => String(status.id) === normalizedPayload);
            if (statusItem) {
                setState({
                    modal: {
                        type: normalizedType,
                        payload: String(statusItem.id),
                        itemName: statusItem.label,
                    },
                });
                return;
            }
            console.warn('[Developer Map] Status not found in openModal, but continuing with payload:', normalizedPayload);
        }

        if (normalizedType === 'add-status') {
            setState({
                modal: {
                    type: normalizedType,
                    payload: null,
                },
            });
            return;
        }

        if (normalizedType === 'delete-status') {
            if (!normalizedPayload) {
                console.warn('[Developer Map] Missing status id for delete-status modal. Aborting.');
                return;
            }

            const statusItem = data.statuses.find((status) => String(status.id) === normalizedPayload);
            setState({
                modal: {
                    type: normalizedType,
                    payload: statusItem ? String(statusItem.id) : normalizedPayload,
                    itemName: statusItem?.label || 'vybraný stav',
                },
            });
            return;
        }

        setState({
            modal: {
                type: normalizedType,
                payload: normalizedPayload,
            },
        });
    }

    function render() {
        root.innerHTML = [renderAppShell(state, data, { renderHeader, assetsBase }), renderModal(state, data)].join('');
        applyStatusStyles(data.statuses);
        attachEventHandlers();
        adjustSearchWidth();
        enhanceSelects();
        initFloatingFieldState();
        enhanceDrawModal();
        restoreExpandedProjects();

        // Inicializuj/Refresh WP Admin Layout po každom renderi
        // requestAnimationFrame zabezpečí, že DOM je ready pred aplikovaním offsetov
        requestAnimationFrame(() => {
            ensureWPAdminLayout();
        });
    }

    function restoreExpandedProjects() {
        const expandedIds = loadExpandedProjects();
        if (!expandedIds || expandedIds.length === 0) return;

        expandedIds.forEach((projectId) => {
            const parentRow = root.querySelector(`[data-dm-parent-id="${projectId}"]`);
            const toggleButton = root.querySelector(`[data-dm-toggle="${projectId}"]`);

            if (parentRow && toggleButton) {
                parentRow.classList.add('is-expanded');
                toggleButton.setAttribute('aria-expanded', 'true');
                toggleButton.setAttribute('aria-label', 'Zabaliť poschodia');
            }
        });
    }

    function adjustSearchWidth() {
        const searchInput = root.querySelector('[data-dm-role="search"]');
        if (!searchInput) return;

        const searchContainer = searchInput.parentElement;
        if (!searchContainer) return;

        // Reset inline styles so CSS media queries always take over
        searchContainer.style.maxWidth = '';
        searchContainer.style.minWidth = '';
        searchContainer.style.flexGrow = '';
        searchContainer.style.width = '';

        // For <= 620px force full width like buttons
        if (window.innerWidth <= 620) {
            searchContainer.style.width = '100%';
            searchContainer.style.flexGrow = '1';
        }
    }

    function attachEventHandlers() {
        const headerButtons = root.querySelectorAll('[data-dm-nav]');
        headerButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                const target = event.currentTarget;
                const targetView = target.getAttribute('data-dm-nav');
                if (targetView === 'settings') {
                    setState({ view: APP_VIEWS.SETTINGS, settingsSection: SETTINGS_SECTIONS.OVERVIEW });
                } else if (targetView === 'maps') {
                    setState({ view: APP_VIEWS.MAPS, mapSection: MAP_SECTIONS.LIST });
                } else if (targetView === 'guides') {
                    setState({ view: APP_VIEWS.GUIDES });
                }
            });
        });

        const settingsNavButtons = root.querySelectorAll('[data-dm-settings]');
        settingsNavButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                const target = event.currentTarget;
                const section = target.getAttribute('data-dm-settings');
                if (!section) return;
                setState({ settingsSection: section });
            });
        });

        const projectLinks = root.querySelectorAll('[data-dm-project]');
        projectLinks.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const projectId = button.getAttribute('data-dm-project');
                if (!projectId) return;
                setState({
                    view: APP_VIEWS.DASHBOARD,
                    activeProjectId: projectId,
                    mapSection: MAP_SECTIONS.LIST,
                    dashboardSearchTerm: '',
                    dashboardStatusFilter: '',
                    dashboardPriceOrder: '',
                });
            });
        });

        // Hierarchické rozbaľovanie/zabaľovanie
        const findChildrenContainer = (row) => {
            if (!row) {
                return null;
            }
            let sibling = row.nextElementSibling;
            while (sibling) {
                if (sibling.matches('.dm-board__children')) {
                    return sibling;
                }
                if (sibling.matches('[data-dm-parent-id]')) {
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
            return null;
        };

        const collapseDescendants = (container) => {
            if (!container) {
                return [];
            }
            const collapsed = [];
            const descendantRows = container.querySelectorAll('[data-dm-parent-id]');
            descendantRows.forEach((row) => {
                const rowId = row.getAttribute('data-dm-parent-id') ?? '';
                if (row.classList.contains('is-expanded')) {
                    row.classList.remove('is-expanded');
                    if (rowId) {
                        collapsed.push(rowId);
                    }
                }
                const toggle = row.querySelector('[data-dm-toggle]');
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                    toggle.setAttribute('aria-label', 'Rozbaliť poschodia');
                }
            });
            return collapsed;
        };

        const toggleButtons = root.querySelectorAll('[data-dm-toggle]');
        toggleButtons.forEach((button) => {
            const handleToggle = () => {
                const parentId = button.getAttribute('data-dm-toggle');
                const parentRow = button.closest('[data-dm-parent-id]');
                const childrenContainer = findChildrenContainer(parentRow);
                if (!parentRow || !childrenContainer) {
                    return;
                }
                const isExpanded = parentRow.classList.contains('is-expanded');
                const expandedProjects = loadExpandedProjects();
                const updatedExpanded = new Set(expandedProjects);

                if (isExpanded) {
                    parentRow.classList.remove('is-expanded');
                    button.setAttribute('aria-expanded', 'false');
                    button.setAttribute('aria-label', 'Rozbaliť poschodia');

                    if (parentId) {
                        updatedExpanded.delete(parentId);
                    }
                    const descendantIds = collapseDescendants(childrenContainer);
                    descendantIds.forEach((id) => updatedExpanded.delete(id));
                    saveExpandedProjects(Array.from(updatedExpanded));
                } else {
                    parentRow.classList.add('is-expanded');
                    button.setAttribute('aria-expanded', 'true');
                    button.setAttribute('aria-label', 'Zabaliť poschodia');

                    if (parentId) {
                        updatedExpanded.add(parentId);
                    }
                    saveExpandedProjects(Array.from(updatedExpanded));
                }
            };

            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleToggle();
            });

            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleToggle();
                }
            });
        });

        // Add keyboard support for clickable thumbnails
        const clickableThumbs = root.querySelectorAll('.dm-board__thumb--clickable');
        clickableThumbs.forEach((thumb) => {
            thumb.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    thumb.click();
                }
            });
        });

        // Copy to clipboard functionality
        const copyButtons = root.querySelectorAll('[data-dm-copy]');

        const resolveShortcodeText = (button) => {
            const codeElement = button.closest('code');
            if (codeElement) {
                const textNode = codeElement.querySelector('span');
                if (textNode && textNode.textContent) {
                    return textNode.textContent.trim();
                }
            }
            const attributeValue = button.getAttribute('data-dm-copy');
            return attributeValue ? attributeValue.trim() : '';
        };

        const legacyCopyToClipboard = (text) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '-9999px';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();

            let succeeded = false;
            try {
                succeeded = document.execCommand('copy');
            } catch (err) {
                console.warn('Legacy clipboard copy failed:', err);
            }

            document.body.removeChild(textarea);
            return succeeded;
        };

        copyButtons.forEach((button) => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                const textToCopy = resolveShortcodeText(button);
                if (!textToCopy) {
                    console.warn('Copy button clicked but no shortcode text was found.');
                    return;
                }

                const originalContent = button.innerHTML;
                let copied = false;

                if (navigator.clipboard && window.isSecureContext) {
                    try {
                        await navigator.clipboard.writeText(textToCopy);
                        copied = true;
                    } catch (err) {
                        console.warn('Clipboard API copy failed, attempting fallback.', err);
                    }
                }

                if (!copied) {
                    copied = legacyCopyToClipboard(textToCopy);
                }

                if (!copied) {
                    console.error('Failed to copy text to clipboard.');
                    return;
                }

                // Visual feedback - len zmena ikony bez zmeny farieb
                button.innerHTML = '<span class="dm-copy-button__icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8L6.5 11.5L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg></span>';
                button.classList.add('is-copied');

                setTimeout(() => {
                    button.innerHTML = originalContent;
                    button.classList.remove('is-copied');
                }, 1500);
            });
        });

        const modalTriggers = root.querySelectorAll('[data-dm-modal]');
        modalTriggers.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const modal = button.getAttribute('data-dm-modal');
                const payload = button.getAttribute('data-dm-payload');
                const typeLabelAttr = button.getAttribute('data-dm-type-label');
                const typeIdAttr = button.getAttribute('data-dm-type-id');
                const metadata = {
                    typeLabel: typeLabelAttr ? typeLabelAttr.trim() : '',
                    typeId: typeIdAttr ? typeIdAttr.trim() : '',
                };
                openModal(modal, payload, metadata);
            });
        });

        // Font selection buttons
        const fontSelectButtons = root.querySelectorAll('[data-dm-select-font]');
        fontSelectButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const fontId = button.getAttribute('data-dm-select-font');
                const fonts = Array.isArray(data.availableFonts) && data.availableFonts.length > 0 ? data.availableFonts : getAvailableFonts();

                const selectedFont = fonts.find((f) => f.id === fontId);
                if (selectedFont) {
                    saveSelectedFont(selectedFont);
                    applySelectedFont(selectedFont);
                    render();
                }
            });
        });

        const searchInput = root.querySelector('[data-dm-role="search"]');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                setState({ searchTerm: String(event.target.value ?? '') });
            });
        }

        const dashboardSearchInput = root.querySelector('[data-dm-dashboard-search]');
        if (dashboardSearchInput) {
            dashboardSearchInput.addEventListener('input', (event) => {
                setState({ dashboardSearchTerm: String(event.target.value ?? '') });
            });
        }

        const dashboardStatusSelect = root.querySelector('[data-dm-dashboard-status]');
        if (dashboardStatusSelect) {
            dashboardStatusSelect.addEventListener('change', (event) => {
                setState({ dashboardStatusFilter: String(event.target.value ?? '') });
            });
        }

        const dashboardPriceSelect = root.querySelector('[data-dm-dashboard-price]');
        if (dashboardPriceSelect) {
            dashboardPriceSelect.addEventListener('change', (event) => {
                const nextValue = String(event.target.value ?? '');
                const allowed = nextValue === 'asc' || nextValue === 'desc' ? nextValue : '';
                setState({ dashboardPriceOrder: allowed });
            });
        }

        const backButtons = root.querySelectorAll('[data-dm-back]');
        backButtons.forEach((button) => {
            button.addEventListener('click', () => {
                setState({ view: APP_VIEWS.MAPS, mapSection: MAP_SECTIONS.LIST });
            });
        });

        const modalCloseButtons = root.querySelectorAll('[data-dm-close-modal]');
        modalCloseButtons.forEach((button) => {
            button.addEventListener('click', () => {
                setState({ modal: null });
            });
        });

        const modalOverlay = root.querySelector('.dm-modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (event) => {
                if (event.target === modalOverlay) {
                    setState({ modal: null });
                }
            });
        }

        if (state.modal && ['add-map', 'edit-map', 'add-location', 'edit-location'].includes(state.modal.type)) {
            bindMapModalEvents();
        }

        if (state.modal && ['add-type', 'edit-type'].includes(state.modal.type)) {
            bindTypeModalEvents();
        }
        if (state.modal && ['add-status', 'edit-status'].includes(state.modal.type)) {
            bindStatusModalEvents();
        }

        // Color picker sync
        const colorInputs = root.querySelectorAll('[data-dm-color-input]');
        colorInputs.forEach((input) => {
            const colorId = input.getAttribute('data-dm-color-input');
            const textInput = root.querySelector(`[data-dm-color-text="${colorId}"]`);

            if (textInput) {
                input.addEventListener('input', (event) => {
                    textInput.value = event.target.value;
                    updateFieldFilledState(textInput);
                    updateFieldFilledState(input);
                });

                textInput.addEventListener('input', (event) => {
                    const value = event.target.value.trim();
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        input.value = value;
                        updateFieldFilledState(input);
                    }
                });
            }
        });

        // Save color button
        const saveColorButtons = root.querySelectorAll('[data-dm-save-color]');
        saveColorButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const colorId = button.getAttribute('data-dm-save-color');
                const colorInput = root.querySelector(`[data-dm-color-input="${colorId}"]`);

                if (colorInput) {
                    const newValue = colorInput.value;
                    const colorIndex = data.colors.findIndex((c) => c.id === colorId);

                    if (colorIndex !== -1) {
                        data.colors[colorIndex].value = newValue;
                        saveColors(data.colors);
                        applyColors(data.colors);
                        setState({ modal: null });
                    }
                }
            });
        });

        // Cleanup orphan images button
        const cleanupOrphanImagesButton = root.querySelector('[data-dm-cleanup-orphan-images]');
        if (cleanupOrphanImagesButton) {
            cleanupOrphanImagesButton.addEventListener('click', () => {
                const cleaned = cleanupOrphanImages(data.projects);
                if (cleaned) {
                    alert('Orphan obrázky boli úspešne vyčistené z databázy!');
                } else {
                    alert('Žiadne orphan obrázky neboli nájdené.');
                }
            });
        }

        // Confirm delete button
        const confirmDeleteButton = root.querySelector('[data-dm-confirm-delete]');
        if (confirmDeleteButton) {
            confirmDeleteButton.addEventListener('click', handleConfirmDelete);
        }

        // Disable default browser tooltips
        const elementsWithTitle = root.querySelectorAll('[title]');
        elementsWithTitle.forEach((element) => {
            const originalTitle = element.getAttribute('title');

            element.addEventListener('mouseenter', () => {
                element.setAttribute('data-dm-title', originalTitle);
                element.removeAttribute('title');
            });

            element.addEventListener('mouseleave', () => {
                const storedTitle = element.getAttribute('data-dm-title');
                if (storedTitle) {
                    element.setAttribute('title', storedTitle);
                    element.removeAttribute('data-dm-title');
                }
            });
        });
    }

    function bindMapModalEvents() {
        const mediaTrigger = root.querySelector('[data-dm-media-trigger]');
        if (mediaTrigger) {
            mediaTrigger.addEventListener('click', handleMediaTriggerClick);
        }

        const parentSelect = root.querySelector('select[data-dm-field="parent"]');
        if (parentSelect) {
            parentSelect.addEventListener('change', (event) => {
                const rawValue = event.target.value;
                const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
                const nextParentId = !trimmedValue || trimmedValue === 'none' ? null : trimmedValue;
                const currentParentId = state.modal ? state.modal.parentId ?? null : null;
                if ((currentParentId ?? null) !== (nextParentId ?? null)) {
                    setState((prev) => {
                        if (!prev.modal) {
                            return {};
                        }
                        return {
                            modal: {
                                ...prev.modal,
                                parentId: nextParentId,
                            },
                        };
                    });
                }
            });
        }

        const saveButton = root.querySelector('[data-dm-modal-save]');
        if (saveButton) {
            saveButton.addEventListener('click', handleModalPrimaryAction);
        }
    }

    function handleMediaTriggerClick(event) {
        event.preventDefault();
        if (typeof window === 'undefined' || !window.wp || typeof window.wp.media !== 'function') {
            console.warn('[Developer Map] WordPress media frame nie je dostupný.');
            return;
        }
        if (!state.modal) {
            return;
        }

        if (!mediaFrame) {
            mediaFrame = window.wp.media({
                frame: 'select',
                title: 'Vyberte obrázok',
                multiple: false,
                library: {
                    type: 'image',
                },
                button: {
                    text: 'Použiť obrázok',
                },
            });
        }

        mediaFrame.off('select');
        mediaFrame.on('select', () => {
            const selection = mediaFrame.state().get('selection');
            const attachment = selection && typeof selection.first === 'function' ? selection.first() : null;
            if (!attachment || typeof attachment.toJSON !== 'function') {
                return;
            }
            const details = attachment.toJSON();
            const url =
                details.url ||
                details?.sizes?.full?.url ||
                details?.sizes?.large?.url ||
                details?.sizes?.medium_large?.url ||
                '';
            const nextSelection = {
                id: details.id,
                url,
                alt: details.alt || details.title || '',
            };

            // Capture current form values before re-rendering
            const currentFormData = {};
            if (state.modal) {
                if (state.modal.type === 'add-location' || state.modal.type === 'edit-location') {
                    const locationFields = collectLocationFields();
                    if (locationFields) {
                        currentFormData.name = locationFields.name;
                        currentFormData.type = locationFields.type;
                        currentFormData.status = locationFields.status;
                        currentFormData.statusId = locationFields.statusId;
                        currentFormData.parentId = locationFields.parentId;
                        currentFormData.url = locationFields.url;
                        currentFormData.detailUrl = locationFields.detailUrl;
                        currentFormData.area = locationFields.area;
                        currentFormData.suffix = locationFields.suffix;
                        currentFormData.prefix = locationFields.prefix;
                        currentFormData.designation = locationFields.designation;
                        currentFormData.price = locationFields.price;
                        currentFormData.rent = locationFields.rent;
                    }
                } else {
                    const mapFields = collectModalFields();
                    if (mapFields) {
                        currentFormData.name = mapFields.name;
                        currentFormData.type = mapFields.type;
                        currentFormData.parentId = mapFields.parentId;
                    }
                }
            }

            setState((prev) => {
                if (!prev.modal) {
                    return {};
                }
                return {
                    modal: {
                        ...prev.modal,
                        imageSelection: nextSelection,
                        imagePreview: nextSelection.url,
                        formData: currentFormData,
                    },
                };
            });
        });

        mediaFrame.open();
    }

    function bindTypeModalEvents() {
        const colorInput = root.querySelector('[data-dm-type-color]');
        const hexInput = root.querySelector('[data-dm-type-hex]');
        if (colorInput && hexInput) {
            colorInput.addEventListener('input', (event) => {
                if (hexInput) {
                    hexInput.value = String(event.target.value ?? '').toUpperCase();
                    updateFieldFilledState(hexInput);
                }
                updateFieldFilledState(colorInput);
            });

            hexInput.addEventListener('input', (event) => {
                const raw = String(event.target.value ?? '').trim();
                const normalised = raw.startsWith('#') ? raw : `#${raw}`;
                if (/^#[0-9A-Fa-f]{6}$/.test(normalised)) {
                    const upper = normalised.toUpperCase();
                    colorInput.value = upper;
                    updateFieldFilledState(colorInput);
                }
                updateFieldFilledState(hexInput);
            });
        }

        const saveButton = root.querySelector('[data-dm-modal-save]');
        if (saveButton) {
            saveButton.addEventListener('click', handleModalPrimaryAction);
        }
    }

    function bindStatusModalEvents() {
        const form = root.querySelector('[data-dm-status-form]');
        if (!form) {
            return;
        }

        const colorInput = form.querySelector('[data-dm-status-color]');
        const hexInput = form.querySelector('[data-dm-status-hex]');

        if (colorInput && hexInput) {
            colorInput.addEventListener('input', (event) => {
                const value = String(event.target.value ?? '').toUpperCase();
                hexInput.value = value;
                updateFieldFilledState(colorInput);
                updateFieldFilledState(hexInput);
            });

            hexInput.addEventListener('input', (event) => {
                const raw = String(event.target.value ?? '').trim();
                const normalised = raw.startsWith('#') ? raw : `#${raw}`;
                if (/^#[0-9A-Fa-f]{6}$/.test(normalised)) {
                    const finalValue = normalised.toUpperCase();
                    hexInput.value = finalValue;
                    colorInput.value = finalValue;
                    updateFieldFilledState(colorInput);
                }
                updateFieldFilledState(hexInput);
            });
        }

        const saveButton = form.querySelector('[data-dm-modal-save]');
        if (saveButton) {
            saveButton.addEventListener('click', handleModalPrimaryAction);
        } else {
            const genericSave = root.querySelector('[data-dm-modal-save]');
            genericSave?.addEventListener('click', handleModalPrimaryAction);
        }
    }

    function handleModalPrimaryAction() {
        if (!state.modal) {
            return;
        }
        if (state.modal.type === 'edit-map') {
            handleSaveEditMap();
        } else if (state.modal.type === 'edit-location') {
            handleSaveEditLocation();
        } else if (state.modal.type === 'add-map' || state.modal.type === 'add-location') {
            handleSaveAddMap();
        } else if (state.modal.type === 'add-type' || state.modal.type === 'edit-type') {
            handleSaveTypeModal();
        } else if (state.modal.type === 'add-status' || state.modal.type === 'edit-status') {
            handleSaveStatusModal();
        }
    }

    function handleSaveEditMap() {
        const modalState = state.modal;
        if (!modalState || !modalState.payload) {
            return;
        }

        const result = findMapItem(modalState.payload);
        if (!result) {
            console.warn('[Developer Map] Nepodarilo sa nájsť mapu pre úpravu.', modalState.payload);
            setState({ modal: null });
            return;
        }

        const fields = collectModalFields();
        if (!fields) {
            setState({ modal: null });
            return;
        }

        if (!fields.name) {
            fields.elements.nameInput?.focus();
            return;
        }
        if (!fields.type) {
            fields.elements.typeSelect?.focus();
            return;
        }

        const nextName = fields.name;
        const nextType = fields.type;
        const targetParentId = fields.parentId ? String(fields.parentId) : null;
        const imageSelection = modalState.imageSelection ?? null;
        const imageData = imageSelection?.url ?? modalState.imagePreview ?? null;

        if (result.type === 'project') {
            const previousImageId = result.item.image_id ?? null;
            result.item.name = nextName;
            result.item.type = nextType;
            result.item.badge = ensureBadge(nextName, result.item.badge);
            if (imageData) {
                result.item.image = imageData;
                result.item.imageUrl = imageData;
                if (imageSelection?.id) {
                    result.item.image_id = imageSelection.id;
                }
                if (imageSelection?.alt) {
                    result.item.imageAlt = imageSelection.alt;
                }
            }
            if (
                imageSelection?.id &&
                String(imageSelection.id) !== String(previousImageId ?? '')
            ) {
                persistEntityImage('project', result.item.id, imageSelection);
            }

            let sanitisedParentId = null;
            if (targetParentId) {
                const trimmedParentId = String(targetParentId).trim();
                if (trimmedParentId && trimmedParentId !== String(result.item.id)) {
                    const parentCandidate = data.projects.find((project) => String(project.id) === trimmedParentId);
                    if (parentCandidate) {
                        sanitisedParentId = String(parentCandidate.id);
                    } else {
                        console.warn('[Developer Map] Nenašla sa nadradená mapa pre úpravu:', targetParentId);
                    }
                }
            }
            result.item.parentId = sanitisedParentId;
            saveProjects(data.projects);
            setState({ modal: null });
            return;
        }

        const currentParentId = result.parent ? String(result.parent.id) : null;
        const previousImageId = result.item.image_id ?? null;
        result.item.name = nextName;
        result.item.type = nextType;
        if (!result.item.label || result.item.label === result.item.name) {
            result.item.label = nextName;
        }
        if (imageData) {
            result.item.image = imageData;
            result.item.imageUrl = imageData;
            if (imageSelection?.id) {
                result.item.image_id = imageSelection.id;
            }
            if (imageSelection?.alt) {
                result.item.imageAlt = imageSelection.alt;
            }
        }
        if (
            imageSelection?.id &&
            String(imageSelection.id) !== String(previousImageId ?? '')
        ) {
            persistEntityImage('floor', result.item.id, imageSelection);
        }

        let newActiveProjectId = currentParentId ?? state.activeProjectId;

        if ((targetParentId ?? null) !== (currentParentId ?? null)) {
            if (result.parent && Array.isArray(result.parent.floors)) {
                result.parent.floors = result.parent.floors.filter((floor) => floor.id !== result.item.id);
            }

            if (targetParentId) {
                const newParent = data.projects.find((project) => String(project.id) === targetParentId);
                if (newParent) {
                    if (!Array.isArray(newParent.floors)) {
                        newParent.floors = [];
                    }
                    const existsInTarget = newParent.floors.some((floor) => floor.id === result.item.id);
                    if (!existsInTarget) {
                        newParent.floors.push(result.item);
                    }
                    newActiveProjectId = String(newParent.id);
                } else {
                    console.warn('[Developer Map] Nenašla sa nová nadradená mapa s ID:', targetParentId);
                    if (result.parent && Array.isArray(result.parent.floors)) {
                        const existsInOriginal = result.parent.floors.some((floor) => floor.id === result.item.id);
                        if (!existsInOriginal) {
                            result.parent.floors.push(result.item);
                        }
                    }
                }
            } else {
                const newProjectId = generateId('project');
                const projectImage = imageData || result.item.image || '';
                const badge = ensureBadge(nextName);
                const publicKey = generateProjectPublicKey(nextName, data.projects);
                const newProject = {
                    id: newProjectId,
                    name: nextName,
                    type: nextType,
                    badge,
                    publicKey,
                    image: projectImage,
                    imageUrl: projectImage,
                    image_id: imageSelection?.id ?? null,
                    imageAlt: imageSelection?.alt || nextName,
                    floors: [result.item],
                };
                data.projects.push(newProject);
                if (imageSelection?.id) {
                    persistEntityImage('project', newProjectId, imageSelection);
                }
                newActiveProjectId = newProjectId;
            }
        }

        saveProjects(data.projects);
        setState({ modal: null, activeProjectId: newActiveProjectId });
    }

    function handleSaveEditLocation() {
        const modalState = state.modal;
        if (!modalState || !modalState.payload) {
            return;
        }

        const result = findMapItem(modalState.payload);
        if (!result || result.type !== 'floor') {
            console.warn('[Developer Map] Nepodarilo sa nájsť lokalitu pre úpravu.', modalState.payload);
            setState({ modal: null });
            return;
        }

        const fields = collectLocationFields();
        if (!fields) {
            setState({ modal: null });
            return;
        }

        if (!fields.name) {
            fields.elements.nameInput?.focus();
            return;
        }
        if (!fields.type) {
            fields.elements.typeSelect?.focus();
            return;
        }
        if (!fields.status) {
            fields.elements.statusSelect?.focus();
            return;
        }

        const currentParentId = result.parent ? String(result.parent.id) : null;
        const imageSelection = modalState.imageSelection ?? null;
        const imageData = imageSelection?.url ?? modalState.imagePreview ?? null;
        const previousImageId = result.item.image_id ?? null;

        // Update location fields
        result.item.name = fields.name;
        result.item.type = fields.type;
        result.item.status = fields.status;
        result.item.statusLabel = fields.status;
        const fallbackStatusMatch = data.statuses.find((status) => String(status.label ?? '').trim() === String(fields.status ?? '').trim());
        result.item.statusId = sanitiseStatusId(fields.statusId || fallbackStatusMatch?.id);
        result.item.label = fields.designation || fields.name;
        result.item.url = fields.url;
        result.item.detailUrl = fields.detailUrl;
        result.item.area = fields.area;
        result.item.suffix = fields.suffix;
        result.item.prefix = fields.prefix;
        result.item.designation = fields.designation;
        result.item.rent = fields.rent;
        result.item.price = fields.price;

        // Update image if provided
        if (imageData) {
            result.item.image = imageData;
            result.item.imageUrl = imageData;
            if (imageSelection?.id) {
                result.item.image_id = imageSelection.id;
            }
            if (imageSelection?.alt) {
                result.item.imageAlt = imageSelection.alt;
            }
        }
        if (
            imageSelection?.id &&
            String(imageSelection.id) !== String(previousImageId ?? '')
        ) {
            persistEntityImage('floor', result.item.id, imageSelection);
        }

        let newActiveProjectId = currentParentId ?? state.activeProjectId;
        const targetParentId = fields.parentId;

        // Handle parent change
        if ((targetParentId ?? null) !== (currentParentId ?? null)) {
            if (result.parent && Array.isArray(result.parent.floors)) {
                result.parent.floors = result.parent.floors.filter((floor) => floor.id !== result.item.id);
            }

            if (targetParentId) {
                const newParent = data.projects.find((project) => String(project.id) === targetParentId);
                if (newParent) {
                    if (!Array.isArray(newParent.floors)) {
                        newParent.floors = [];
                    }
                    const existsInTarget = newParent.floors.some((floor) => floor.id === result.item.id);
                    if (!existsInTarget) {
                        newParent.floors.push(result.item);
                    }
                    newActiveProjectId = String(newParent.id);
                } else {
                    console.warn('[Developer Map] Nenašla sa nová nadradená mapa s ID:', targetParentId);
                    if (result.parent && Array.isArray(result.parent.floors)) {
                        const existsInOriginal = result.parent.floors.some((floor) => floor.id === result.item.id);
                        if (!existsInOriginal) {
                            result.parent.floors.push(result.item);
                        }
                    }
                }
            }
        }

        saveProjects(data.projects);
        setState({ modal: null, activeProjectId: newActiveProjectId });
    }

    function handleSaveAddMap() {
        const modalState = state.modal;
        if (!modalState) {
            return;
        }
        const imageSelection = modalState.imageSelection ?? null;

        // Handle add-location with location-specific fields
        if (modalState.type === 'add-location') {
            const fields = collectLocationFields();
            if (!fields) {
                setState({ modal: null });
                return;
            }

            if (!fields.name) {
                fields.elements.nameInput?.focus();
                return;
            }
            if (!fields.type) {
                fields.elements.typeSelect?.focus();
                return;
            }
            if (!fields.status) {
                fields.elements.statusSelect?.focus();
                return;
            }

            const parentId = fields.parentId;
            if (!parentId) {
                console.warn('[Developer Map] Lokalita musí mať nadradenú mapu.');
                return;
            }

            const parentProject = data.projects.find((project) => String(project.id) === String(parentId));
            if (!parentProject) {
                console.warn('[Developer Map] Nenašla sa nadradená mapa pre pridanie lokality:', parentId);
                return;
            }

            if (!Array.isArray(parentProject.floors)) {
                parentProject.floors = [];
            }

            const imageData = imageSelection?.url ?? modalState.imagePreview ?? null;
            const newFloorId = generateId('floor');
            const newFloor = {
                id: newFloorId,
                name: fields.name,
                type: fields.type,
                status: fields.status,
                statusLabel: fields.status,
                label: fields.designation || fields.name,
                url: fields.url,
                detailUrl: fields.detailUrl,
                area: fields.area,
                suffix: fields.suffix,
                prefix: fields.prefix,
                designation: fields.designation,
                rent: fields.rent,
                price: fields.price,
                image: imageData || '',
                imageUrl: imageData || '',
                image_id: imageSelection?.id ?? null,
                imageAlt: imageSelection?.alt || fields.name,
                statusId: sanitiseStatusId(fields.statusId || data.statuses.find((s) => String(s.label ?? '').trim() === String(fields.status ?? '').trim())?.id),
                regions: [],
            };

            parentProject.floors.push(newFloor);

            if (imageSelection?.id) {
                persistEntityImage('floor', newFloorId, imageSelection);
            }

            saveProjects(data.projects);
            setState({ modal: null, activeProjectId: String(parentProject.id) });
            return;
        }

        // Handle add-map with project fields
        const fields = collectModalFields();
        if (!fields) {
            setState({ modal: null });
            return;
        }

        if (!fields.name) {
            fields.elements.nameInput?.focus();
            return;
        }
        if (!fields.type) {
            fields.elements.typeSelect?.focus();
            return;
        }

        const { name, type, parentId } = fields;
        const imageData = imageSelection?.url ?? modalState.imagePreview ?? null;
        let newActiveProjectId = state.activeProjectId;

        if (!parentId) {
            const newProjectId = generateId('project');
            const badge = ensureBadge(name);
            const projectImage = imageData || '';
            const publicKey = generateProjectPublicKey(name, data.projects);
            data.projects.push({
                id: newProjectId,
                name,
                type,
                badge,
                publicKey,
                parentId: null,
                image: projectImage,
                imageUrl: projectImage,
                image_id: imageSelection?.id ?? null,
                imageAlt: imageSelection?.alt || name,
                floors: [],
            });
            if (imageSelection?.id) {
                persistEntityImage('project', newProjectId, imageSelection);
            }
            newActiveProjectId = newProjectId;
        } else {
            const parentProject = data.projects.find((project) => String(project.id) === String(parentId));
            if (!parentProject) {
                console.warn('[Developer Map] Nenašla sa nadradená mapa pre pridanie mapy:', parentId);
                return;
            }
            const newProjectId = generateId('project');
            const badge = ensureBadge(name);
            const projectImage = imageData || '';
            const publicKey = generateProjectPublicKey(name, data.projects);
            const resolvedParentId = String(parentProject.id);
            const newProject = {
                id: newProjectId,
                name,
                type,
                badge,
                publicKey,
                parentId: resolvedParentId,
                image: projectImage,
                imageUrl: projectImage,
                image_id: imageSelection?.id ?? null,
                imageAlt: imageSelection?.alt || name,
                floors: [],
            };
            data.projects.push(newProject);
            if (imageSelection?.id) {
                persistEntityImage('project', newProjectId, imageSelection);
            }
            newActiveProjectId = newProjectId;
        }

        saveProjects(data.projects);
        setState({ modal: null, activeProjectId: newActiveProjectId });
    }

    function handleSaveTypeModal() {
        const modalState = state.modal;
        if (!modalState) {
            return;
        }

        const form = root.querySelector('[data-dm-type-form]');
        const formTypeId = form?.getAttribute('data-dm-type-id') ?? '';
        const nameInput = root.querySelector('[data-dm-type-name]');
        const colorInput = root.querySelector('[data-dm-type-color]');
        const hexInput = root.querySelector('[data-dm-type-hex]');

        const nameValue = nameInput ? nameInput.value.trim() : '';
        if (!nameValue) {
            nameInput?.focus();
            return;
        }

        const hexRaw = hexInput ? hexInput.value.trim() : colorInput?.value ?? '';
        const normalisedHex = (() => {
            if (!hexRaw) return '';
            const prefixed = hexRaw.startsWith('#') ? hexRaw : `#${hexRaw}`;
            if (/^#[0-9A-Fa-f]{6}$/.test(prefixed)) {
                return prefixed.toUpperCase();
            }
            return '';
        })();

        if (!normalisedHex) {
            if (hexInput) {
                hexInput.focus();
                hexInput.select?.();
            }
            return;
        }

        if (colorInput) {
            colorInput.value = normalisedHex;
            updateFieldFilledState(colorInput);
        }
        if (hexInput) {
            hexInput.value = normalisedHex;
            updateFieldFilledState(hexInput);
        }

        const targetTypeId = modalState.payload || formTypeId || '';
        const isEditingExisting = (modalState.type === 'edit-type' || Boolean(formTypeId)) && Boolean(targetTypeId);

        if (isEditingExisting) {
            const typeIndex = data.types.findIndex((item) => String(item.id) === String(targetTypeId));
            if (typeIndex === -1) {
                console.warn('[Developer Map] Type not found for editing:', targetTypeId);
                setState({ modal: null });
                return;
            }

            const currentItem = data.types[typeIndex];
            const previousLabel = currentItem.label;
            const updatedItem = {
                ...currentItem,
                id: currentItem.id,
                label: nameValue,
                color: normalisedHex,
            };
            data.types.splice(typeIndex, 1, updatedItem);

            if (previousLabel && previousLabel !== nameValue) {
                data.projects.forEach((project) => {
                    if (project.type === previousLabel) {
                        project.type = nameValue;
                    }
                    if (Array.isArray(project.floors)) {
                        project.floors.forEach((floor) => {
                            if (floor.type === previousLabel) {
                                floor.type = nameValue;
                            }
                        });
                    }
                });
            }

            saveTypes(data.types);
            saveProjects(data.projects);
            setState({ modal: null });
            return;
        }

        const newTypeId = generateId('type');
        data.types.push({
            id: newTypeId,
            label: nameValue,
            color: normalisedHex,
        });

        saveTypes(data.types);
        setState({ modal: null });
    }

    function handleSaveStatusModal() {
        const modalState = state.modal;
        if (!modalState) {
            return;
        }

        const fields = collectModalFields();
        if (!fields || !fields.elements) {
            setState({ modal: null });
            return;
        }

        const nameInput = fields.elements.nameInput;
        const colorInput = fields.elements.colorInput;
        const hexInput = fields.elements.hexInput;
        const formStatusId = fields.elements.statusIdInput?.value;

        const nameValue = (nameInput?.value || '').trim();
        if (!nameValue) {
            nameInput?.focus();
            return;
        }

        let colorValue = (colorInput?.value || '#7C3AED').trim();
        if (hexInput) {
            const hexValue = (hexInput.value || '').trim();
            if (hexValue && /^#?[0-9A-Fa-f]{6}$/.test(hexValue)) {
                colorValue = hexValue.startsWith('#') ? hexValue : `#${hexValue}`;
            }
        }

        const normalisedHex = /^#[0-9A-Fa-f]{6}$/.test(colorValue) ? colorValue : '#7C3AED';
        if (colorValue !== normalisedHex) {
            if (hexInput) {
                hexInput.focus();
                hexInput.select?.();
            }
            return;
        }

        if (colorInput) {
            colorInput.value = normalisedHex;
            updateFieldFilledState(colorInput);
        }
        if (hexInput) {
            hexInput.value = normalisedHex;
            updateFieldFilledState(hexInput);
        }

        const targetStatusId = modalState.payload || formStatusId || '';
        const isEditingExisting = (modalState.type === 'edit-status' || Boolean(formStatusId)) && Boolean(targetStatusId);

        if (isEditingExisting) {
            const statusIndex = data.statuses.findIndex((item) => String(item.id) === String(targetStatusId));
            if (statusIndex === -1) {
                console.warn('[Developer Map] Status not found for editing:', targetStatusId);
                setState({ modal: null });
                return;
            }

            const currentItem = data.statuses[statusIndex];
            const updatedItem = {
                ...currentItem,
                id: currentItem.id,
                label: nameValue,
                color: normalisedHex,
            };
            data.statuses.splice(statusIndex, 1, updatedItem);

            saveStatuses(data.statuses);
            saveProjects(data.projects);
            setState({ modal: null });
            return;
        }

        const newStatusId = generateId('status');
        data.statuses.push({
            id: newStatusId,
            label: nameValue,
            color: normalisedHex,
        });

        saveStatuses(data.statuses);
        setState({ modal: null });
    }

    function handleConfirmDelete(event) {
        if (event) {
            event.preventDefault();
        }
        const button = event?.currentTarget ?? null;
        const kindAttr = button?.getAttribute('data-dm-delete-kind') ?? '';
        const targetAttr = button?.getAttribute('data-dm-delete-target') ?? '';
        const kind = kindAttr || (state.modal?.type === 'delete-type' ? 'type' : state.modal?.type === 'delete-status' ? 'status' : state.modal?.type === 'delete-map' ? 'map' : '');
        const targetId = targetAttr || state.modal?.payload || '';

        if (kind === 'map') {
            handleDeleteMap(targetId);
        } else if (kind === 'type') {
            handleDeleteType(targetId);
        } else if (kind === 'status') {
            handleDeleteStatus(targetId);
        } else {
            console.warn('[Developer Map] Unknown delete kind:', kind);
        }
    }

    function handleDeleteMap(targetId = null) {
        const modalState = state.modal;
        const effectiveId = targetId || modalState?.payload || null;
        if (!effectiveId) {
            setState({ modal: null });
            return;
        }

        const result = findMapItem(effectiveId);
        if (!result) {
            console.warn('[Developer Map] Nepodarilo sa nájsť položku pre vymazanie:', effectiveId);
            setState({ modal: null });
            return;
        }

        if (result.type === 'project') {
            // Vymazanie celého projektu
            const projectIndex = data.projects.findIndex((p) => p.id === result.item.id);
            if (projectIndex !== -1) {
                const removedId = String(result.item.id);
                const projectToDelete = data.projects[projectIndex];

                // Najprv vymaž všetky obrázky pre tento projekt a jeho lokality
                if (storageCache.images && typeof storageCache.images === 'object') {
                    // Vymaž obrázok projektu
                    const projectImageKey = `project__${removedId}`;
                    if (storageCache.images[projectImageKey]) {
                        delete storageCache.images[projectImageKey];
                    }

                    // Vymaž obrázky všetkých lokalít
                    if (Array.isArray(projectToDelete.floors)) {
                        projectToDelete.floors.forEach((floor) => {
                            const floorImageKey = `floor__${floor.id}`;
                            if (storageCache.images[floorImageKey]) {
                                delete storageCache.images[floorImageKey];
                            }
                        });
                    }

                    // Ulož aktualizované obrázky
                    persistValue('dm-images', storageCache.images);
                }

                // Rekurzívne vymaž všetky podradené projekty (mapy) a ich lokality
                const deleteProjectRecursively = (projectId) => {
                    // Nájdi všetky podradené projekty
                    const childProjects = data.projects.filter((p) =>
                        String(p?.parentId ?? '') === String(projectId)
                    );

                    // Rekurzívne vymaž každý podradený projekt
                    childProjects.forEach((childProject) => {
                        // Vymaž obrázky podradených projektov
                        if (storageCache.images && typeof storageCache.images === 'object') {
                            const childProjectImageKey = `project__${childProject.id}`;
                            if (storageCache.images[childProjectImageKey]) {
                                delete storageCache.images[childProjectImageKey];
                            }

                            // Vymaž obrázky lokalít podradených projektov
                            if (Array.isArray(childProject.floors)) {
                                childProject.floors.forEach((floor) => {
                                    const floorImageKey = `floor__${floor.id}`;
                                    if (storageCache.images[floorImageKey]) {
                                        delete storageCache.images[floorImageKey];
                                    }
                                });
                            }
                        }

                        // Najprv vymaž všetky podradené projekty tohto projektu
                        deleteProjectRecursively(childProject.id);

                        // Potom vymaž tento projekt
                        const childIndex = data.projects.findIndex((p) => p.id === childProject.id);
                        if (childIndex !== -1) {
                            data.projects.splice(childIndex, 1);
                        }
                    });
                };

                // Vymaž všetky podradené projekty
                deleteProjectRecursively(removedId);

                // Vymaž samotný projekt z poľa (znovu nájdi index, pretože sa mohol zmeniť)
                const finalIndex = data.projects.findIndex((p) => p.id === result.item.id);
                if (finalIndex !== -1) {
                    data.projects.splice(finalIndex, 1);
                }

                // Ak bol vymazaný aktívny projekt, nastav nový aktívny projekt
                let newActiveProjectId = state.activeProjectId;
                if (state.activeProjectId === result.item.id) {
                    newActiveProjectId = data.projects[0]?.id ?? null;
                }

                // Ulož projekty do databázy
                saveProjects(data.projects);
                setState({ modal: null, activeProjectId: newActiveProjectId, view: APP_VIEWS.MAPS, mapSection: MAP_SECTIONS.LIST });
            }
        } else if (result.type === 'floor' && result.parent) {
            // Vymazanie lokality z projektu
            if (Array.isArray(result.parent.floors)) {
                const floorToDelete = result.item;

                // Vymaž obrázok lokality
                if (storageCache.images && typeof storageCache.images === 'object') {
                    const floorImageKey = `floor__${floorToDelete.id}`;
                    if (storageCache.images[floorImageKey]) {
                        delete storageCache.images[floorImageKey];
                        persistValue('dm-images', storageCache.images);
                    }
                }

                // Vymaž lokalitu z projektu
                result.parent.floors = result.parent.floors.filter((floor) => floor.id !== result.item.id);

                // Ulož projekty do databázy
                saveProjects(data.projects);
                setState({ modal: null });
            }
        }
    }

    function handleDeleteType(targetId = null) {
        const modalState = state.modal;
        let effectiveId = targetId || modalState?.payload || null;
        if (!effectiveId && modalState?.itemName) {
            const labelMatch = data.types.find((type) => String(type.label).trim() === String(modalState.itemName).trim());
            if (labelMatch) {
                effectiveId = String(labelMatch.id);
            }
        }
        if (!effectiveId) {
            console.warn('[Developer Map] No type ID to delete');
            setState({ modal: null });
            return;
        }

        const typeIndex = data.types.findIndex((type) => String(type.id) === String(effectiveId));
        if (typeIndex === -1) {
            console.warn('[Developer Map] Type not found for deletion:', effectiveId);
            setState({ modal: null });
            return;
        }

        const [removedType] = data.types.splice(typeIndex, 1);
        saveTypes(data.types);

        if (removedType?.label) {
            const removedLabel = removedType.label;
            data.projects.forEach((project) => {
                if (project.type === removedLabel) {
                    project.type = '';
                }
                if (Array.isArray(project.floors)) {
                    project.floors.forEach((floor) => {
                        if (floor.type === removedLabel) {
                            floor.type = '';
                        }
                    });
                }
            });
            saveProjects(data.projects);
        }

        setState({ modal: null });
    }

    function handleDeleteStatus(targetId = null) {
        const modalState = state.modal;
        let effectiveId = targetId || modalState?.payload || null;
        if (!effectiveId && modalState?.itemName) {
            const labelMatch = data.statuses.find((status) => String(status.label).trim() === String(modalState.itemName).trim());
            if (labelMatch) {
                effectiveId = String(labelMatch.id);
            }
        }
        if (!effectiveId) {
            console.warn('[Developer Map] No status ID to delete');
            setState({ modal: null });
            return;
        }

        const statusIndex = data.statuses.findIndex((status) => String(status.id) === String(effectiveId));
        if (statusIndex === -1) {
            console.warn('[Developer Map] Status not found for deletion:', effectiveId);
            setState({ modal: null });
            return;
        }

        const [removedStatus] = data.statuses.splice(statusIndex, 1);
        saveStatuses(data.statuses);

        if (removedStatus?.id) {
            const removedId = removedStatus.id;
            data.projects.forEach((project) => {
                if (Array.isArray(project.floors)) {
                    project.floors.forEach((floor) => {
                        if (floor.statusId === removedId) {
                            floor.statusId = '';
                        }
                    });
                }
            });
            saveProjects(data.projects);
        }

        setState({ modal: null });
    }

    function updateFieldFilledState(element) {
        if (!element) {
            return;
        }
        const field = element.closest('.dm-field');
        if (!field) {
            return;
        }

        let hasValue = false;
        if (element.matches('select')) {
            hasValue = element.value !== '';
        } else if (element.type === 'checkbox' || element.type === 'radio') {
            hasValue = element.checked;
        } else if (element.type === 'number' || element.type === 'range') {
            hasValue = element.value !== '';
        } else if (element.type === 'color') {
            hasValue = Boolean(element.value);
        } else {
            hasValue = element.value.trim() !== '';
        }

        field.classList.toggle('dm-field--filled', hasValue);
    }

    function initFloatingFieldState(context = root) {
        const inputs = context.querySelectorAll('.dm-field__input');
        inputs.forEach((input) => {
            if (input.type === 'file') {
                return;
            }
            if (input.dataset.dmFloatingBound === '1') {
                updateFieldFilledState(input);
                return;
            }
            const handler = () => updateFieldFilledState(input);
            input.addEventListener('input', handler);
            input.addEventListener('change', handler);
            input.addEventListener('blur', handler);
            input.dataset.dmFloatingBound = '1';
            updateFieldFilledState(input);
        });
    }

    function enhanceSelects() {
        customSelectControllers = customSelectControllers.filter((controller) => {
            return controller.select.isConnected && controller.wrapper.isConnected;
        });

        const selects = root.querySelectorAll('[data-dm-select]');
        if (!selects.length) {
            return;
        }

        selects.forEach((select) => {
            if (customSelectControllers.some((controller) => controller.select === select)) {
                return;
            }

            const field = select.closest('.dm-field');
            if (!field) {
                return;
            }

            const controller = buildCustomSelect(select, field);
            if (controller) {
                customSelectControllers.push(controller);
            }
        });

        if (!customSelectDocEventsBound && customSelectControllers.length) {
            document.addEventListener('click', handleSelectDocumentClick);
            document.addEventListener('keydown', handleSelectDocumentKeydown, true);
            customSelectDocEventsBound = true;
        } else if (customSelectDocEventsBound && !customSelectControllers.length) {
            document.removeEventListener('click', handleSelectDocumentClick);
            document.removeEventListener('keydown', handleSelectDocumentKeydown, true);
            customSelectDocEventsBound = false;
        }
    }

    function buildCustomSelect(select, field) {
        if (select.dataset.dmEnhanced === '1' || !select.options.length) {
            return null;
        }

        const label = field.querySelector('.dm-field__label');
        const labelText = label ? label.textContent.trim() : '';

        if (label && !label.id) {
            label.id = `dm-field-label-${Math.random().toString(36).slice(2, 9)}`;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'dm-select';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'dm-select__trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        if (label && label.id) {
            trigger.setAttribute('aria-labelledby', label.id);
        } else if (labelText) {
            trigger.setAttribute('aria-label', labelText);
        }

        const valueEl = document.createElement('span');
        valueEl.className = 'dm-select__value';

        const iconEl = document.createElement('span');
        iconEl.className = 'dm-select__icon';
        iconEl.innerHTML = '<svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true"><path d="M2 2L8 8L14 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

        trigger.append(valueEl, iconEl);
        wrapper.appendChild(trigger);

        const dropdown = document.createElement('div');
        dropdown.className = 'dm-select__dropdown';

        const list = document.createElement('ul');
        list.className = 'dm-select__list';
        list.setAttribute('role', 'listbox');

        const dropdownId = select.id ? `${select.id}-dropdown` : `dm-select-${Math.random().toString(36).slice(2, 9)}`;
        list.id = dropdownId;
        trigger.setAttribute('aria-controls', dropdownId);

        dropdown.appendChild(list);
        wrapper.appendChild(dropdown);

        select.insertAdjacentElement('afterend', wrapper);
        select.setAttribute('data-dm-enhanced', '1');
        select.classList.add('dm-select__native');
        select.setAttribute('aria-hidden', 'true');
        select.tabIndex = -1;
        field.classList.add('dm-field--select');

        const optionItems = [];
        valueEl.innerHTML = '&nbsp;';

        Array.from(select.options).forEach((option) => {
            if (option.hidden) {
                return;
            }

            const optionEl = document.createElement('li');
            optionEl.className = 'dm-select__option';
            optionEl.setAttribute('role', 'option');
            optionEl.dataset.value = option.value;
            optionEl.textContent = option.textContent;

            if (option.disabled) {
                optionEl.classList.add('is-disabled');
                optionEl.setAttribute('aria-disabled', 'true');
            }

            list.appendChild(optionEl);
            optionItems.push({ option, el: optionEl });
        });

        const controller = {
            select,
            field,
            wrapper,
            trigger,
            dropdown,
            list,
            valueEl,
            placeholderMarkup: '&nbsp;',
            options: optionItems,
        };

        updateSelectDisplay(controller);

        trigger.addEventListener('click', () => toggleSelect(controller));
        trigger.addEventListener('keydown', (event) => handleTriggerKeydown(event, controller));
        trigger.addEventListener('blur', () => {
            window.setTimeout(() => {
                if (!wrapper.contains(document.activeElement)) {
                    closeSelect(controller);
                }
            }, 0);
        });

        list.addEventListener('mousedown', (event) => {
            const optionEl = event.target.closest('.dm-select__option');
            if (optionEl && !optionEl.classList.contains('is-disabled')) {
                event.preventDefault();
            }
        });

        list.addEventListener('click', (event) => {
            const optionEl = event.target.closest('.dm-select__option');
            if (!optionEl || optionEl.classList.contains('is-disabled')) {
                return;
            }
            setSelectValue(controller, optionEl.dataset.value, { focusTrigger: true });
        });

        select.addEventListener('change', () => updateSelectDisplay(controller));

        return controller;
    }

    function toggleSelect(controller) {
        if (controller.wrapper.classList.contains('dm-select--open')) {
            closeSelect(controller);
        } else {
            openSelect(controller);
        }
    }

    function openSelect(controller) {
        closeAllSelects(controller);
        controller.wrapper.classList.add('dm-select--open');
        controller.field.classList.add('dm-field--select-open');
        controller.trigger.setAttribute('aria-expanded', 'true');
        controller.trigger.focus({ preventScroll: true });
    }

    function closeSelect(controller) {
        if (!controller.wrapper.classList.contains('dm-select--open')) {
            return;
        }
        controller.wrapper.classList.remove('dm-select--open');
        controller.field.classList.remove('dm-field--select-open');
        controller.trigger.setAttribute('aria-expanded', 'false');
    }

    function closeAllSelects(except) {
        customSelectControllers.forEach((controller) => {
            if (controller !== except) {
                closeSelect(controller);
            }
        });
    }

    function setSelectValue(controller, value, options = {}) {
        const { closeDropdown = true, focusTrigger = false } = options;
        const optionItem = controller.options.find((item) => item.option.value === value && !item.option.hidden);
        if (!optionItem || optionItem.option.disabled) {
            return;
        }

        if (controller.select.value !== value) {
            controller.select.value = value;
            controller.select.dispatchEvent(new Event('input', { bubbles: true }));
            controller.select.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            updateSelectDisplay(controller);
        }

        if (closeDropdown) {
            closeSelect(controller);
        }
        if (focusTrigger) {
            controller.trigger.focus({ preventScroll: true });
        }
    }

    function updateSelectDisplay(controller) {
        const { select, valueEl, placeholderMarkup, wrapper, options, field } = controller;
        const currentValue = select.value;
        const activeOption = options.find((item) => item.option.value === currentValue && !item.option.hidden && !item.option.disabled);

        if (activeOption) {
            valueEl.textContent = activeOption.option.textContent;
        } else {
            valueEl.innerHTML = placeholderMarkup;
        }

        const hasValue = Boolean(activeOption);
        wrapper.classList.toggle('dm-select--has-value', hasValue);
        wrapper.classList.toggle('dm-select--placeholder', !hasValue);
        field.classList.toggle('dm-field--select-has-value', hasValue);
        updateFieldFilledState(select);

        options.forEach((item) => {
            const isActive = item.option.value === currentValue && !item.option.hidden && !item.option.disabled;
            item.el.classList.toggle('is-active', isActive);
            item.el.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function handleTriggerKeydown(event, controller) {
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                event.preventDefault();
                if (!controller.wrapper.classList.contains('dm-select--open')) {
                    openSelect(controller);
                }
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                moveSelectValue(controller, direction);
                break;
            }
            case 'Enter':
            case ' ': {
                event.preventDefault();
                toggleSelect(controller);
                break;
            }
            case 'Escape': {
                if (controller.wrapper.classList.contains('dm-select--open')) {
                    event.preventDefault();
                    closeSelect(controller);
                }
                break;
            }
            default:
                break;
        }
    }

    function moveSelectValue(controller, direction) {
        const enabledOptions = controller.options.filter((item) => !item.option.disabled && !item.option.hidden);
        if (!enabledOptions.length) {
            return;
        }

        const currentValue = controller.select.value;
        let index = enabledOptions.findIndex((item) => item.option.value === currentValue);
        if (index === -1) {
            index = direction > 0 ? -1 : 0;
        }
        index = (index + direction + enabledOptions.length) % enabledOptions.length;
        const nextValue = enabledOptions[index].option.value;

        setSelectValue(controller, nextValue, { closeDropdown: false, focusTrigger: false });
        updateSelectDisplay(controller);
    }

    function handleSelectDocumentClick(event) {
        customSelectControllers.forEach((controller) => {
            if (!controller.wrapper.contains(event.target)) {
                closeSelect(controller);
            }
        });
    }

    function handleSelectDocumentKeydown(event) {
        if (event.key !== 'Escape') {
            return;
        }

        let closedAny = false;
        customSelectControllers.forEach((controller) => {
            if (controller.wrapper.classList.contains('dm-select--open')) {
                closeSelect(controller);
                closedAny = true;
            }
        });

        if (closedAny) {
            event.stopPropagation();
        }
    }

    function enhanceDrawModal() {
        if (!state.modal || state.modal.type !== 'draw-coordinates') {
            return;
        }
        const drawRoot = root.querySelector('[data-dm-draw-root]');
        if (!drawRoot) {
            return;
        }

        // Bind tab switching in inspector panel
        bindEditorTabs();

        // Initialize WordPress admin layout manager
        initWPAdminLayout();

        // Initialize floating labels for editor fields
        const editorContext = root.querySelector('.dm-editor');
        if (editorContext) {
            initFloatingFieldState(editorContext);
        }

        initDrawSurface(drawRoot);
    }

    function initWPAdminLayout() {
        // Destroy existing manager if any
        if (wpAdminLayoutManager) {
            wpAdminLayoutManager.destroy();
            wpAdminLayoutManager = null;
        }

        // Initialize new manager pre editor aj modály
        try {
            wpAdminLayoutManager = new WPAdminLayoutManager(['.dm-editor-overlay', '.dm-modal-overlay']);
            wpAdminLayoutManager.init();
        } catch (error) {
            console.error('[DM] Error initializing WP Admin Layout Manager:', error);
            wpAdminLayoutManager = null;
        }
    }

    function ensureWPAdminLayout() {
        // Ak manager ešte neexistuje, inicializuj ho
        if (!wpAdminLayoutManager) {
            initWPAdminLayout();
        } else {
            // Ak už existuje, len refresh targets (nové modály)
            wpAdminLayoutManager.forceUpdate();
        }

        // Extra forceUpdate po malom delay pre istotu (nové modály môžu potrebovať čas na render)
        setTimeout(() => {
            if (wpAdminLayoutManager) {
                wpAdminLayoutManager.forceUpdate();
            }
        }, 50);
    }

    function refreshWPAdminLayout() {
        // Force update pre dynamicky pridané/odstránené modály
        if (wpAdminLayoutManager) {
            wpAdminLayoutManager.forceUpdate();
        }
    }

    function bindEditorTabs() {
        const tabs = root.querySelectorAll('.dm-editor__tab[data-dm-tab]');
        const panels = root.querySelectorAll('.dm-editor__tab-panel[data-dm-tab-panel]');

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const targetPanel = tab.getAttribute('data-dm-tab');

                // Update tabs
                tabs.forEach((t) => {
                    t.classList.remove('dm-editor__tab--active');
                    t.setAttribute('aria-selected', 'false');
                });
                tab.classList.add('dm-editor__tab--active');
                tab.setAttribute('aria-selected', 'true');

                // Update panels
                panels.forEach((p) => {
                    const panelId = p.getAttribute('data-dm-tab-panel');
                    if (panelId === targetPanel) {
                        p.classList.add('dm-editor__tab-panel--active');
                        p.removeAttribute('hidden');
                    } else {
                        p.classList.remove('dm-editor__tab-panel--active');
                        p.setAttribute('hidden', '');
                    }
                });
            });
        });

        // Bind localities popup button
        const openLocalitiesButton = root.querySelector('[data-dm-open-localities-popup]');
        if (openLocalitiesButton) {
            openLocalitiesButton.addEventListener('click', () => {
                if (root.querySelector('.dm-localities-popup-overlay')) {
                    return;
                }

                const stash = root.querySelector('[data-dm-localities-stash]');
                const stashTable = stash?.querySelector('[data-dm-localities-stash-table]');
                const localitiesBody = stashTable?.querySelector('[data-dm-region-children]');
                if (!stash || !stashTable || !localitiesBody) {
                    return;
                }

                const popupContainer = document.createElement('div');
                popupContainer.innerHTML = renderLocalitiesPopup();
                const overlayEl = popupContainer.firstElementChild;
                if (!overlayEl) {
                    return;
                }

                const popupBodySlot = overlayEl.querySelector('[data-dm-localities-popup-body]');
                if (popupBodySlot) {
                    popupBodySlot.replaceWith(localitiesBody);
                }

                root.appendChild(overlayEl);

                const summaryEl = root.querySelector('[data-dm-localities-summary] strong');
                const refreshSummary = () => {
                    if (!summaryEl) {
                        return;
                    }
                    const checkedCount = localitiesBody.querySelectorAll('input[data-dm-region-child]:checked').length;
                    summaryEl.textContent = String(checkedCount);
                };

                const closePopup = () => {
                    document.removeEventListener('keydown', onKeydown);
                    const activeOverlay = root.querySelector('[data-dm-localities-popup-overlay]');
                    if (!activeOverlay) {
                        return;
                    }
                    const bodyInOverlay = activeOverlay.querySelector('[data-dm-region-children]');
                    if (bodyInOverlay && stashTable) {
                        stashTable.appendChild(bodyInOverlay);
                    }
                    activeOverlay.remove();
                    refreshSummary();
                    if (openLocalitiesButton && document.body && document.body.contains(openLocalitiesButton)) {
                        openLocalitiesButton.focus();
                    }
                };

                function onKeydown(event) {
                    if (event.key === 'Escape' || event.key === 'Esc') {
                        closePopup();
                    }
                }

                document.addEventListener('keydown', onKeydown);

                const closeButton = overlayEl.querySelector('[data-dm-close-localities-popup]');
                if (closeButton) {
                    closeButton.addEventListener('click', closePopup);
                }

                overlayEl.addEventListener('click', (event) => {
                    if (event.target === overlayEl) {
                        closePopup();
                    }
                });

                refreshSummary();
            });
        }
    }

    function initDrawSurface(drawRoot) {
        if (!drawRoot || drawRoot.dataset.dmDrawReady === '1') {
            return;
        }

        drawRoot.dataset.dmDrawReady = '1';

        const overlay = drawRoot.querySelector('[data-role="overlay"]');
        const fill = drawRoot.querySelector('[data-role="fill"]');
        const outline = drawRoot.querySelector('[data-role="outline"]');
        const baseline = drawRoot.querySelector('[data-role="baseline"]');
        const handlesLayer = drawRoot.querySelector('[data-role="handles"]');
        const cursor = drawRoot.querySelector('.dm-draw__cursor');
        const stage = drawRoot.querySelector('.dm-draw__stage');
        const canvas = drawRoot.querySelector('.dm-draw__canvas');
        const resetButton = root.querySelector('[data-dm-reset-draw]');
        const revertButton = root.querySelector('[data-dm-revert-draw]');
        const saveButton = root.querySelector('[data-dm-save-draw]');
        const regionList = drawRoot.querySelector('[data-dm-region-list]');
        const addRegionButton = drawRoot.querySelector('[data-dm-add-region]');
        const removeRegionButton = drawRoot.querySelector('[data-dm-remove-region]');
        const regionNameInput = drawRoot.querySelector('[data-dm-region-name]');
        const regionUrlInput = drawRoot.querySelector('[data-dm-region-url]');
        const regionDetailUrlInput = drawRoot.querySelector('[data-dm-region-detail-url]');
        const regionChildrenFieldset = drawRoot.querySelector('[data-dm-region-children]');
        const localitiesSummaryCount = drawRoot.querySelector('[data-dm-localities-summary] strong');
        const tableEnabledToggle = drawRoot.querySelector('[data-dm-table-enabled]');
        const tableScopeWrapper = drawRoot.querySelector('[data-dm-table-scope-wrapper]');
        const tableScopeField = drawRoot.querySelector('[data-dm-table-scope]');
        const includeParentWrapper = drawRoot.querySelector('[data-dm-table-parent-wrapper]');
        const includeParentToggle = drawRoot.querySelector('[data-dm-table-include-parent]');

        const updateLocalitiesSummary = () => {
            if (!localitiesSummaryCount || !regionChildrenFieldset) {
                return;
            }
            const checkedCount = regionChildrenFieldset.querySelectorAll('input[data-dm-region-child]:checked').length;
            localitiesSummaryCount.textContent = String(checkedCount);
        };
        const fullscreenToggle = drawRoot.querySelector('[data-dm-fullscreen-toggle]');
        const ownerTypeAttr = drawRoot.dataset.dmOwner ?? 'project';
        const ownerIdAttr = drawRoot.dataset.dmOwnerId ?? '';
        const projectIdAttr = drawRoot.dataset.dmProjectId ?? '';
        const initialRegionId = drawRoot.dataset.dmActiveRegion ?? '';

        if (!overlay || !fill || !outline || !baseline || !handlesLayer || !stage || !canvas) {
            return;
        }

        const imageEl = drawRoot.querySelector('.dm-draw__image');

        const parseViewboxDimension = (value) => {
            const number = Number(value);
            return Number.isFinite(number) && number > 0 ? number : null;
        };

        let viewBoxWidth = parseViewboxDimension(drawRoot.dataset.dmViewboxWidth) ?? DRAW_VIEWBOX.width;
        let viewBoxHeight = parseViewboxDimension(drawRoot.dataset.dmViewboxHeight) ?? DRAW_VIEWBOX.height;

        const updateOverlayViewBox = () => {
            overlay.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
            overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            overlay.style.transformOrigin = 'top left';
        };

        const syncRootDatasetViewbox = () => {
            drawRoot.dataset.dmViewboxWidth = String(viewBoxWidth);
            drawRoot.dataset.dmViewboxHeight = String(viewBoxHeight);
        };

        updateOverlayViewBox();
        syncRootDatasetViewbox();

        let points = [];

        const statusOptionsSource = Array.isArray(data.statuses) ? data.statuses : [];
        const statusLookupById = new Map();
        statusOptionsSource.forEach((status) => {
            const id = sanitiseStatusId(status.id ?? status.key ?? '');
            if (id && !statusLookupById.has(id)) {
                statusLookupById.set(id, status.label ?? id);
            }
        });

        const ownerResult = ownerIdAttr ? findMapItem(ownerIdAttr) : null;
        let targetEntity = null;
        let parentProject = null;

        if (ownerResult) {
            targetEntity = ownerResult.item;
            parentProject = ownerResult.type === 'floor' ? ownerResult.parent : ownerResult.item;
        } else {
            parentProject =
                data.projects.find((project) => String(project.id) === String(projectIdAttr)) ??
                data.projects[0] ?? null;
            if (ownerTypeAttr === 'floor') {
                targetEntity =
                    parentProject?.floors?.find((floor) => String(floor.id) === String(ownerIdAttr)) ?? null;
            } else {
                targetEntity = parentProject;
            }
        }

        if (!targetEntity) {
            console.warn(
                '[Developer Map] Map owner not found while initialising draw modal',
                ownerIdAttr || ownerTypeAttr,
            );
            return;
        }

        const isProjectOwner = ownerTypeAttr === 'project';
        const ensureLocationTableSettings = (entity) => {
            if (!entity || typeof entity !== 'object') {
                return null;
            }
            if (!entity.frontend || typeof entity.frontend !== 'object') {
                entity.frontend = {};
            }
            if (!entity.frontend.locationTable || typeof entity.frontend.locationTable !== 'object') {
                entity.frontend.locationTable = {
                    enabled: false,
                    scope: 'current',
                    includeParent: false,
                };
            }
            const settings = entity.frontend.locationTable;
            settings.enabled = Boolean(settings.enabled);
            settings.includeParent = Boolean(settings.includeParent);
            if (settings.scope !== 'hierarchy') {
                settings.scope = 'current';
            }
            return settings;
        };

        const tableSettings = isProjectOwner ? ensureLocationTableSettings(targetEntity) : null;

        const syncTableControls = () => {
            if (!tableSettings) {
                return;
            }
            const enabled = Boolean(tableSettings.enabled);
            if (tableScopeWrapper) {
                tableScopeWrapper.hidden = !enabled;
            }
            if (tableScopeField) {
                tableScopeField.disabled = !enabled;
                tableScopeField.value = tableSettings.scope === 'hierarchy' ? 'hierarchy' : 'current';
            }
            if (includeParentWrapper) {
                includeParentWrapper.hidden = !enabled;
            }
            if (includeParentToggle) {
                includeParentToggle.disabled = !enabled;
                includeParentToggle.checked = Boolean(tableSettings.includeParent);
            }
            if (tableEnabledToggle) {
                tableEnabledToggle.checked = enabled;
            }
        };

        if (tableSettings) {
            syncTableControls();
            if (tableEnabledToggle) {
                tableEnabledToggle.addEventListener('change', () => {
                    tableSettings.enabled = tableEnabledToggle.checked;
                    syncTableControls();
                });
            }
            if (tableScopeField) {
                tableScopeField.addEventListener('change', () => {
                    tableSettings.scope = tableScopeField.value === 'hierarchy' ? 'hierarchy' : 'current';
                });
            }
            if (includeParentToggle) {
                includeParentToggle.addEventListener('change', () => {
                    tableSettings.includeParent = includeParentToggle.checked;
                });
            }
        }

        function setViewBoxSize(width, height, options = {}) {
            const { preservePoints = true } = options;
            const parsedWidth = parseViewboxDimension(width);
            const parsedHeight = parseViewboxDimension(height);
            if (!parsedWidth || !parsedHeight) {
                return false;
            }
            if (parsedWidth === viewBoxWidth && parsedHeight === viewBoxHeight) {
                return false;
            }
            const previousWidth = viewBoxWidth;
            const previousHeight = viewBoxHeight;
            viewBoxWidth = parsedWidth;
            viewBoxHeight = parsedHeight;
            updateOverlayViewBox();
            syncRootDatasetViewbox();
            if (Array.isArray(points)) {
                if (points.length && preservePoints) {
                    points = points.map((point) => ({
                        x: Math.round((point.x / previousWidth) * viewBoxWidth),
                        y: Math.round((point.y / previousHeight) * viewBoxHeight),
                    }));
                    commitActiveRegionPoints();
                } else if (!preservePoints) {
                    const currentRegion = getActiveRegion();
                    points = ensurePointsFromRegion(currentRegion);
                    polygonClosed = currentRegion ? getRegionClosed(currentRegion) && points.length >= 3 : false;
                }
            }
            buildHandles();
            redraw();
            return true;
        }

        function getStatusLabel(statusId) {
            const key = sanitiseStatusId(statusId);
            if (!key) {
                return '';
            }
            return statusLookupById.get(key) ?? '';
        }

        function deepCloneArray(arr) {
            if (!Array.isArray(arr)) return [];
            return arr.map(item => {
                if (Array.isArray(item)) return deepCloneArray(item);
                if (item && typeof item === 'object') return { ...item };
                return item;
            });
        }

        function sanitiseRegionUrl(value) {
            if (typeof value !== 'string') {
                if (value === null || typeof value === 'undefined') {
                    return '';
                }
                value = String(value);
            }
            return value.trim();
        }

        function normaliseNumericField(value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, precision = null } = {}) {
            if (value === null || typeof value === 'undefined') {
                return null;
            }
            let numeric = value;
            if (typeof numeric === 'string') {
                const trimmed = numeric.trim();
                if (!trimmed) {
                    return null;
                }
                numeric = Number(trimmed.replace(',', '.'));
            } else if (typeof numeric !== 'number') {
                numeric = Number(numeric);
            }
            if (!Number.isFinite(numeric)) {
                return null;
            }
            if (Number.isFinite(min)) {
                numeric = Math.max(min, numeric);
            }
            if (Number.isFinite(max)) {
                numeric = Math.min(max, numeric);
            }
            if (Number.isFinite(precision) && precision >= 0) {
                const factor = 10 ** precision;
                numeric = Math.round(numeric * factor) / factor;
            }
            return numeric;
        }

        function cloneRegionSnapshot(region) {
            if (!region || typeof region !== 'object') {
                return null;
            }
            const clone = { ...region };
            clone.geometry = {
                type: region.geometry?.type ?? 'polygon',
                points: deepCloneArray(Array.isArray(region.geometry?.points) ? region.geometry.points : []),
            };
            clone.meta = region.meta && typeof region.meta === 'object' ? { ...region.meta } : {};
            clone.children = Array.isArray(region.children) ? [...region.children] : [];
            if (Array.isArray(region.tags)) {
                clone.tags = [...region.tags];
            } else if (Object.prototype.hasOwnProperty.call(clone, 'tags')) {
                delete clone.tags;
            }
            if (typeof clone.type === 'undefined' && typeof region.type !== 'undefined') {
                clone.type = region.type;
            }
            return clone;
        }

        const regionBootstrap =
            typeof window !== 'undefined' && window.dmRegionBootstrap ? window.dmRegionBootstrap : null;
        const knownRegionIds = new Set();
        const sessionRegionIds = new Set();
        let regionIdCounter = (() => {
            const next = Number(regionBootstrap?.next);
            return Number.isFinite(next) && next > 0 ? Math.floor(next) : 1;
        })();

        function adjustRegionCounter(id) {
            const match = /^region-(\d+)$/.exec(id);
            if (!match) {
                return;
            }
            const numeric = parseInt(match[1], 10);
            if (Number.isFinite(numeric) && numeric >= regionIdCounter) {
                regionIdCounter = numeric + 1;
            }
        }

        function primeKnownRegionIds(ids) {
            (ids || []).forEach((rawId) => {
                const id = typeof rawId === 'string' ? rawId.trim() : String(rawId ?? '').trim();
                if (!id) {
                    return;
                }
                knownRegionIds.add(id);
                adjustRegionCounter(id);
            });
        }

        if (Array.isArray(regionBootstrap?.ids)) {
            primeKnownRegionIds(regionBootstrap.ids);
        }

        const allProjects = Array.isArray(data.projects) ? data.projects : [];
        allProjects.forEach((project) => {
            if (!project || typeof project !== 'object') {
                return;
            }
            primeKnownRegionIds((project.regions || []).map((region) => region?.id ?? ''));
            (project.floors || []).forEach((floor) => {
                if (!floor || typeof floor !== 'object') {
                    return;
                }
                primeKnownRegionIds((floor.regions || []).map((region) => region?.id ?? ''));
            });
        });

        function createRegionId() {
            let index = Math.max(1, regionIdCounter);
            let candidate = `region-${index}`;
            while (knownRegionIds.has(candidate) || sessionRegionIds.has(candidate)) {
                index += 1;
                candidate = `region-${index}`;
            }
            regionIdCounter = index + 1;
            knownRegionIds.add(candidate);
            sessionRegionIds.add(candidate);
            return candidate;
        }

        function ensureRegionIdentifier(candidate, { reuseExisting = false } = {}) {
            const trimmed = typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '').trim();
            if (trimmed) {
                const isKnown = knownRegionIds.has(trimmed);
                const isSession = sessionRegionIds.has(trimmed);
                if (reuseExisting || (!isKnown && !isSession)) {
                    knownRegionIds.add(trimmed);
                    sessionRegionIds.add(trimmed);
                    adjustRegionCounter(trimmed);
                    return trimmed;
                }
            }
            return createRegionId();
        }

        function createRegion(source = null, index = 0) {
            const fallbackLabel = `Zóna ${index + 1}`;

            if (!source || typeof source !== 'object') {
                return {
                    id: createRegionId(),
                    label: fallbackLabel,
                    status: '',
                    statusId: '',
                    statusLabel: '',
                    geometry: {
                        type: 'polygon',
                        points: [],
                    },
                    meta: {
                        closed: false,
                    },
                    children: [],
                };
            }

            const id = ensureRegionIdentifier(source.id ?? source.lotId ?? '', { reuseExisting: true });
            const label =
                typeof source.label === 'string' && source.label.trim()
                    ? source.label.trim()
                    : typeof source.name === 'string' && source.name.trim()
                        ? source.name.trim()
                        : fallbackLabel;
            const statusId = sanitiseStatusId(source.statusId ?? source.status ?? '');
            const geometryPoints = normaliseRegionGeometryPoints(
                (source.geometry && source.geometry.points) || source.geometry || [],
            );
            const children = Array.isArray(source.children)
                ? source.children
                    .map((childId) => {
                        const str = String(childId ?? '').trim();
                        return str ? str : null;
                    })
                    .filter(Boolean)
                : [];
            const meta = source.meta && typeof source.meta === 'object' ? { ...source.meta } : {};
            if (meta && Object.prototype.hasOwnProperty.call(meta, 'hatchClass')) {
                delete meta.hatchClass;
            }
            const closed = typeof meta.closed === 'boolean' ? Boolean(meta.closed) : geometryPoints.length >= 3;
            meta.closed = closed;
            const detailUrl = (() => {
                const metaUrl = typeof meta.detailUrl === 'string' ? meta.detailUrl.trim() : '';
                if (metaUrl) {
                    return metaUrl;
                }
                const raw = typeof source.detailUrl === 'string' ? source.detailUrl.trim() : '';
                return raw;
            })();
            if (detailUrl) {
                meta.detailUrl = detailUrl;
            } else if (Object.prototype.hasOwnProperty.call(meta, 'detailUrl')) {
                delete meta.detailUrl;
            }

            const resolvedUrl = (() => {
                const metaUrl = sanitiseRegionUrl(meta.url);
                if (metaUrl) {
                    return metaUrl;
                }
                return sanitiseRegionUrl(source.url ?? '');
            })();
            if (resolvedUrl) {
                meta.url = resolvedUrl;
            } else if (Object.prototype.hasOwnProperty.call(meta, 'url')) {
                delete meta.url;
            }

            const resolvedStrokeWidth = normaliseNumericField(meta.strokeWidth ?? source.strokeWidth, {
                min: 1,
                max: 10,
                precision: 2,
            });
            if (resolvedStrokeWidth !== null) {
                meta.strokeWidth = resolvedStrokeWidth;
            } else if (Object.prototype.hasOwnProperty.call(meta, 'strokeWidth')) {
                delete meta.strokeWidth;
            }

            const resolvedStrokeOpacity = normaliseNumericField(meta.strokeOpacity ?? source.strokeOpacity, {
                min: 0,
                max: 100,
                precision: 2,
            });
            if (resolvedStrokeOpacity !== null) {
                meta.strokeOpacity = resolvedStrokeOpacity;
            } else if (Object.prototype.hasOwnProperty.call(meta, 'strokeOpacity')) {
                delete meta.strokeOpacity;
            }

            const resolvedFillOpacity = normaliseNumericField(meta.fillOpacity ?? source.fillOpacity, {
                min: 0,
                max: 100,
                precision: 2,
            });
            if (resolvedFillOpacity !== null) {
                meta.fillOpacity = resolvedFillOpacity;
            } else if (Object.prototype.hasOwnProperty.call(meta, 'fillOpacity')) {
                delete meta.fillOpacity;
            }

            const regionClone = {
                id,
                label,
                status: statusId,
                statusId,
                statusLabel: source.statusLabel ?? getStatusLabel(statusId),
                geometry: {
                    type: 'polygon',
                    points: deepCloneArray(geometryPoints),
                },
                meta: { ...meta },
                children: [...children],
            };

            if (detailUrl) {
                regionClone.detailUrl = detailUrl;
            }
            if (resolvedUrl) {
                regionClone.url = resolvedUrl;
            }
            if (resolvedStrokeWidth !== null) {
                regionClone.strokeWidth = resolvedStrokeWidth;
            }
            if (resolvedStrokeOpacity !== null) {
                regionClone.strokeOpacity = resolvedStrokeOpacity;
            }
            if (resolvedFillOpacity !== null) {
                regionClone.fillOpacity = resolvedFillOpacity;
            }

            if (Array.isArray(source.tags)) {
                regionClone.tags = [...source.tags];
            }

            return regionClone;
        }

        const regionState = {
            regions: Array.isArray(targetEntity?.regions)
                ? targetEntity.regions.map((region, index) => createRegion(region, index))
                : [],
            activeId: null,
        };

        if (!regionState.regions.length) {
            regionState.regions.push(createRegion(null, 0));
        }

        let savedSnapshot = null;

        regionState.activeId = (() => {
            if (
                initialRegionId &&
                regionState.regions.some((region) => String(region.id) === String(initialRegionId))
            ) {
                return String(initialRegionId);
            }
            return String(regionState.regions[0].id);
        })();

        drawRoot.dataset.dmActiveRegion = regionState.activeId;
        if (state.modal && state.modal.type === 'draw-coordinates') {
            state.modal.regionId = regionState.activeId;
        }

        function getRegionClosed(region) {
            if (!region || typeof region !== 'object') {
                return false;
            }
            if (region.meta && typeof region.meta === 'object' && typeof region.meta.closed === 'boolean') {
                return Boolean(region.meta.closed);
            }
            const points = Array.isArray(region.geometry?.points) ? region.geometry.points : [];
            return points.length >= 3;
        }

        function setRegionClosed(region, closed) {
            if (!region || typeof region !== 'object') {
                return;
            }
            if (!region.meta || typeof region.meta !== 'object') {
                region.meta = {};
            }
            region.meta.closed = Boolean(closed);
        }

        let handleGroups = [];
        let handleElements = [];
        let activeHandle = null;
        let activeIndex = -1;
        let preventClick = false;
        let cursorAnchorIndex = 0;
        let polygonClosed = false;
        let pointerSession = null;
        let redrawPending = false;
        let fullscreenScrollTop = 0;
        let isFullscreen = false;

        const handleResize = () => {
            positionCursor();
        };
        window.addEventListener('resize', handleResize);

        const preventWheelZoom = (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
            }
        };

        const mutationObserver = new MutationObserver(() => {
            if (!root.contains(drawRoot)) {
                teardown();
            }
        });
        mutationObserver.observe(root, { childList: true, subtree: true });

        function teardown() {
            // Exit fullscreen if active
            if (isFullscreen) {
                exitFullscreen();
            }

            window.removeEventListener('resize', handleResize);
            mutationObserver.disconnect();
            stage.removeEventListener('wheel', preventWheelZoom);
            overlay.removeEventListener('wheel', preventWheelZoom);
        }

        function clonePoints(source) {
            return source.map((point) => ({ x: point.x, y: point.y }));
        }

        function ensurePointsFromRegion(region) {
            if (!region || !region.geometry || !Array.isArray(region.geometry.points)) {
                return [];
            }
            const converted = region.geometry.points
                .map((point) => {
                    const x = Number(point?.[0]);
                    const y = Number(point?.[1]);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) {
                        return null;
                    }
                    return {
                        x: Math.round(x * viewBoxWidth),
                        y: Math.round(y * viewBoxHeight),
                    };
                })
                .filter(Boolean);
            return clonePoints(converted);
        }

        function getActiveRegion() {
            return (
                regionState.regions.find(
                    (region) => String(region.id) === String(regionState.activeId),
                ) ?? null
            );
        }

        function captureSnapshot() {
            return {
                regions: regionState.regions.map((region) => cloneRegionSnapshot(region)).filter(Boolean),
                activeId: regionState.activeId ? String(regionState.activeId) : null,
                viewBoxWidth,
                viewBoxHeight,
            };
        }

        const initialRegion = getActiveRegion();
        points = ensurePointsFromRegion(initialRegion);
        polygonClosed = initialRegion ? getRegionClosed(initialRegion) && points.length >= 3 : false;

        stage.addEventListener('wheel', preventWheelZoom, { passive: false });
        overlay.addEventListener('wheel', preventWheelZoom, { passive: false });

        if (imageEl) {
            const syncFromImage = () => {
                if (imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0) {
                    setViewBoxSize(imageEl.naturalWidth, imageEl.naturalHeight, { preservePoints: true });
                    if (savedSnapshot) {
                        savedSnapshot.viewBoxWidth = viewBoxWidth;
                        savedSnapshot.viewBoxHeight = viewBoxHeight;
                    } else {
                        savedSnapshot = captureSnapshot();
                    }
                }
            };
            if (imageEl.complete) {
                syncFromImage();
            } else {
                imageEl.addEventListener('load', syncFromImage, { once: true });
            }
        }

        function commitActiveRegionPoints() {
            const region = getActiveRegion();
            if (!region) {
                return;
            }
            const normalised = points.map((point) => [
                Number((point.x / viewBoxWidth).toFixed(4)),
                Number((point.y / viewBoxHeight).toFixed(4)),
            ]);
            region.geometry = {
                type: 'polygon',
                points: normalised,
            };
        }

        function setActiveRegion(regionId, options = {}) {
            const { commit = true } = options;
            const nextRegion = regionState.regions.find(
                (region) => String(region.id) === String(regionId),
            );
            if (!nextRegion) {
                return;
            }
            if (commit) {
                commitActiveRegionPoints();
            }
            regionState.activeId = String(nextRegion.id);
            drawRoot.dataset.dmActiveRegion = regionState.activeId;
            if (state.modal && state.modal.type === 'draw-coordinates') {
                state.modal.regionId = regionState.activeId;
            }
            points = ensurePointsFromRegion(nextRegion);
            polygonClosed = getRegionClosed(nextRegion) && points.length >= 3;
            cursorAnchorIndex = 0;
            buildHandles();
            scheduleRedraw();
            syncRegionForm();
            refreshRegionList();
        }

        function refreshRegionList() {
            if (!regionList) {
                return;
            }
            regionList.innerHTML = '';
            if (!regionState.regions.length) {
                const emptyItem = document.createElement('li');
                emptyItem.className = 'dm-editor__zone-item dm-editor__zone-item--empty';
                const emptySpan = document.createElement('span');
                emptySpan.className = 'dm-editor__empty-text';
                emptySpan.textContent = 'Zatiaľ žiadne zóny';
                emptyItem.append(emptySpan);
                regionList.append(emptyItem);
                return;
            }
            regionState.regions.forEach((region, index) => {
                const id = String(region.id);
                const item = document.createElement('li');
                item.className = 'dm-editor__zone-item';
                item.dataset.dmRegionItem = id;
                if (id === String(regionState.activeId)) {
                    item.classList.add('is-active', 'dm-editor__zone-item--active');
                }
                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'dm-editor__zone-button';
                trigger.dataset.dmRegionTrigger = id;
                const nameEl = document.createElement('span');
                nameEl.className = 'dm-editor__zone-name';
                nameEl.textContent = region.label ?? region.name ?? `Zóna ${index + 1}`;
                trigger.append(nameEl);

                // Always count from the region.children array (updated by checkbox listeners)
                // Filter out empty/invalid values and count both maps and locations
                const validChildren = Array.isArray(region.children)
                    ? region.children.filter((child) => {
                        const val = String(child ?? '').trim();
                        if (!val || val === 'undefined' || val === 'null') {
                            return false;
                        }
                        // Count both maps (format: map:{id}) and locations (format: location:{id})
                        return val.startsWith('location:') || val.startsWith('map:');
                    })
                    : [];
                const childCount = validChildren.length;

                const metaEl = document.createElement('span');
                metaEl.className = 'dm-editor__zone-meta';
                metaEl.textContent = childCount > 0 ? `Prepojených: ${childCount}` : 'Bez prepojení';
                trigger.append(metaEl);
                item.append(trigger);
                regionList.append(item);
            });
        }

        function syncRegionForm() {
            const region = getActiveRegion();
            if (regionNameInput) {
                regionNameInput.value = region?.label ?? region?.name ?? '';
                updateFieldFilledState(regionNameInput);
            }
            if (regionDetailUrlInput) {
                const detailUrl = region?.detailUrl ?? region?.meta?.detailUrl ?? '';
                regionDetailUrlInput.value = detailUrl;
                updateFieldFilledState(regionDetailUrlInput);
            }
            if (regionUrlInput) {
                const regionUrl = sanitiseRegionUrl(region?.url ?? region?.meta?.url ?? '');
                regionUrlInput.value = regionUrl;
                updateFieldFilledState(regionUrlInput);
            }
            if (regionChildrenFieldset) {
                const selected = new Set(
                    Array.isArray(region?.children) ? region.children.map((child) => String(child)) : [],
                );
                regionChildrenFieldset
                    .querySelectorAll('input[data-dm-region-child]')
                    .forEach((input) => {
                        const isChecked = selected.has(input.value);
                        input.checked = isChecked;
                        const labelEl = input.parentElement?.querySelector('.dm-localities-checkbox__label');
                        if (labelEl) {
                            labelEl.textContent = isChecked ? 'Prepojené' : 'Neaktívne';
                        }
                    });
            }
            if (removeRegionButton) {
                if (regionState.regions.length > 1) {
                    removeRegionButton.disabled = false;
                    removeRegionButton.setAttribute('aria-disabled', 'false');
                } else {
                    removeRegionButton.disabled = true;
                    removeRegionButton.setAttribute('aria-disabled', 'true');
                }
            }
            updateLocalitiesSummary();
        }

        // Region list click handler is now set up globally on root element
        // to prevent duplicate handlers when modal is reopened
        // Listen for custom event from global handler
        drawRoot.addEventListener('dm:setActiveRegion', (event) => {
            const regionId = event.detail?.regionId;
            if (regionId) {
                setActiveRegion(regionId);
            }
        });

        if (addRegionButton) {
            addRegionButton.addEventListener('click', () => {
                commitActiveRegionPoints();
                // Create new region with unique ID
                const newRegion = createRegion(null, regionState.regions.length);
                regionState.regions.push(newRegion);
                // Immediately set as active region
                setActiveRegion(newRegion.id, { commit: false });
            });
        }

        if (removeRegionButton) {
            removeRegionButton.addEventListener('click', () => {
                if (regionState.regions.length <= 1) {
                    return;
                }
                const indexToRemove = regionState.regions.findIndex(
                    (region) => String(region.id) === String(regionState.activeId),
                );
                if (indexToRemove === -1) {
                    return;
                }
                commitActiveRegionPoints();
                regionState.regions.splice(indexToRemove, 1);
                const nextRegion =
                    regionState.regions[Math.max(0, indexToRemove - 1)] ?? regionState.regions[0];
                setActiveRegion(nextRegion.id, { commit: false });
            });
        }

        if (regionNameInput) {
            regionNameInput.addEventListener('input', (event) => {
                const region = getActiveRegion();
                if (!region) return;
                region.label = String(event.target.value ?? '').trim();
                refreshRegionList();
            });
        }

        if (regionDetailUrlInput) {
            regionDetailUrlInput.addEventListener('input', (event) => {
                const region = getActiveRegion();
                if (!region) {
                    return;
                }
                const rawValue = String(event.target.value ?? '');
                if (!region.meta || typeof region.meta !== 'object') {
                    region.meta = {};
                }
                const trimmed = rawValue.trim();
                if (trimmed) {
                    region.meta.detailUrl = trimmed;
                    region.detailUrl = trimmed;
                } else {
                    delete region.meta.detailUrl;
                    region.detailUrl = '';
                }
                updateFieldFilledState(regionDetailUrlInput);
            });
        }

        if (regionUrlInput) {
            regionUrlInput.addEventListener('input', (event) => {
                const region = getActiveRegion();
                if (!region) {
                    return;
                }
                const sanitised = sanitiseRegionUrl(event.target.value);
                if (!region.meta || typeof region.meta !== 'object') {
                    region.meta = {};
                }
                if (sanitised) {
                    region.meta.url = sanitised;
                    region.url = sanitised;
                } else {
                    delete region.meta.url;
                    delete region.url;
                }
                if (event.target.value !== sanitised) {
                    event.target.value = sanitised;
                }
                updateFieldFilledState(regionUrlInput);
            });
        }

        if (regionChildrenFieldset) {
            regionChildrenFieldset.addEventListener('change', (event) => {
                const input = event.target.closest('input[data-dm-region-child]');
                if (!input) {
                    return;
                }
                const region = getActiveRegion();
                if (!region) {
                    return;
                }
                const value = String(input.value ?? '').trim();
                if (!value) {
                    return;
                }

                const current = new Set(
                    Array.isArray(region.children) ? region.children.map((child) => String(child)) : [],
                );

                const updateLabel = (targetInput, checked) => {
                    const labelEl = targetInput?.parentElement?.querySelector('.dm-localities-checkbox__label');
                    if (labelEl) {
                        labelEl.textContent = checked ? 'Prepojené' : 'Neaktívne';
                    }
                };

                const childType = input.dataset.dmChildType ?? 'location';

                // Pridaj alebo odober primárnu hodnotu ako prvé
                if (input.checked) {
                    current.add(value);
                } else {
                    current.delete(value);
                }

                // Potom aplikuj na potomkov ak je to mapa
                if (childType === 'map') {
                    const descendantKeys = String(input.dataset.dmMapDescendants ?? '')
                        .split(/\s+/)
                        .map((item) => item.trim())
                        .filter(Boolean);
                    if (descendantKeys.length) {
                        const descendantSet = new Set(descendantKeys);
                        regionChildrenFieldset
                            .querySelectorAll('input[data-dm-region-child]')
                            .forEach((descendantInput) => {
                                const descendantValue = String(descendantInput.value ?? '').trim();
                                if (!descendantValue || !descendantSet.has(descendantValue) || descendantInput === input) {
                                    return;
                                }
                                descendantInput.checked = input.checked;
                                updateLabel(descendantInput, input.checked);
                                if (input.checked) {
                                    current.add(descendantValue);
                                } else {
                                    current.delete(descendantValue);
                                }
                            });
                    }
                }

                region.children = Array.from(current);
                updateLabel(input, input.checked);
                refreshRegionList();
                updateLocalitiesSummary();
            });

            regionChildrenFieldset.addEventListener('click', (event) => {
                const toggleButton = event.target.closest('[data-dm-map-toggle]');
                if (!toggleButton) {
                    return;
                }
                event.preventDefault();
                const row = toggleButton.closest('tr[data-dm-row-id]');
                if (!row) {
                    return;
                }
                const parentRowId = row.dataset.dmRowId ?? '';
                const descendantRowIds = String(row.dataset.dmDescendantRows ?? '')
                    .split(/\s+/)
                    .map((item) => item.trim())
                    .filter(Boolean);
                if (!descendantRowIds.length) {
                    return;
                }
                const expanded = toggleButton.getAttribute('aria-expanded') !== 'false';
                const nextExpanded = !expanded;
                toggleButton.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
                row.classList.toggle('dm-localities-table__row--collapsed', !nextExpanded);

                descendantRowIds.forEach((rowId) => {
                    const descendantRow = regionChildrenFieldset.querySelector(`tr[data-dm-row-id="${rowId}"]`);
                    if (!descendantRow) {
                        return;
                    }
                    const hiddenAttr = descendantRow.dataset.dmHiddenParents ?? '';
                    const hiddenParents = new Set(
                        hiddenAttr
                            .split(/\s+/)
                            .map((item) => item.trim())
                            .filter(Boolean),
                    );
                    if (nextExpanded) {
                        hiddenParents.delete(parentRowId);
                        if (hiddenParents.size) {
                            descendantRow.dataset.dmHiddenParents = Array.from(hiddenParents).join(' ');
                        } else {
                            descendantRow.removeAttribute('data-dm-hidden-parents');
                            descendantRow.classList.remove('dm-localities-table__row--hidden');
                        }
                    } else {
                        hiddenParents.add(parentRowId);
                        descendantRow.dataset.dmHiddenParents = Array.from(hiddenParents).join(' ');
                        descendantRow.classList.add('dm-localities-table__row--hidden');
                    }
                });
            });
        }

        function clampPoint(point) {
            return {
                x: Math.max(0, Math.min(viewBoxWidth, Math.round(point.x))),
                y: Math.max(0, Math.min(viewBoxHeight, Math.round(point.y))),
            };
        }

        function toViewBoxCoordinates(event) {
            if (!overlay) {
                return { x: 0, y: 0 };
            }
            const screenPoint = overlay.createSVGPoint();
            screenPoint.x = event.clientX;
            screenPoint.y = event.clientY;
            const ctm = overlay.getScreenCTM();
            if (!ctm) {
                return { x: 0, y: 0 };
            }
            const svgPoint = screenPoint.matrixTransform(ctm.inverse());
            return { x: svgPoint.x, y: svgPoint.y };
        }

        function pointsToString(list) {
            return list.map((point) => `${point.x},${point.y}`).join(' ');
        }

        function pointsToClosedString(list) {
            if (!list.length) {
                return '';
            }
            const extended = list.concat(list[0]);
            return extended.map((point) => `${point.x},${point.y}`).join(' ');
        }

        function updateShapes() {
            const pointString = pointsToString(points);
            const closedString = pointsToClosedString(points);
            const hasPolygon = points.length >= 3;

            // Update fill with hatching pattern if polygon is closed
            const region = getActiveRegion();
            const isClosed = polygonClosed && hasPolygon;

            if (isClosed) {
                const hatchId = overlay.getAttribute('data-dm-hatch-id');
                const fillValue = hatchId ? `url(#${hatchId})` : 'rgba(72, 198, 116, 0.18)';
                fill.setAttribute('points', pointString);
                fill.setAttribute('fill', fillValue);
                fill.setAttribute('stroke', 'none');
                // Remove CSS fill: none by using inline style (has higher priority)
                fill.style.fill = fillValue;
                fill.style.stroke = 'none';
                fill.classList.add('is-active');
            } else {
                fill.setAttribute('points', '');
                fill.setAttribute('fill', 'none');
                fill.style.fill = 'none';
                fill.classList.remove('is-active', 'is-dragging');
            }

            outline.setAttribute('points', hasPolygon ? closedString : pointString);
            baseline.setAttribute('points', points.length >= 2 ? pointString : '');

            // Update handle positions
            points.forEach((point, index) => {
                const handleGroup = handlesLayer.querySelector(`[data-handle-group="${index}"]`);
                if (handleGroup) {
                    const hitCircle = handleGroup.querySelector('.dm-draw__handle-hit');
                    const nodeCircle = handleGroup.querySelector('.dm-draw__handle-node');
                    if (hitCircle) {
                        hitCircle.setAttribute('cx', String(point.x));
                        hitCircle.setAttribute('cy', String(point.y));
                    }
                    if (nodeCircle) {
                        nodeCircle.setAttribute('cx', String(point.x));
                        nodeCircle.setAttribute('cy', String(point.y));
                    }
                }
            });
        }

        function updateOutput() {
            const region = getActiveRegion();
            const normalised = points.map((point) => [
                Number((point.x / viewBoxWidth).toFixed(4)),
                Number((point.y / viewBoxHeight).toFixed(4)),
            ]);
            if (region) {
                region.geometry = {
                    type: 'polygon',
                    points: normalised,
                };
            }
            // Output debug info to console if needed
            // console.log('Region points updated:', normalised);
        }

        function positionCursor() {
            if (!cursor) {
                return;
            }
            if (!points.length) {
                cursor.style.transform = 'translate(-9999px, -9999px)';
                return;
            }
            if (cursorAnchorIndex >= points.length) {
                cursorAnchorIndex = points.length - 1;
            }
            const anchor = points[cursorAnchorIndex];
            const ctm = overlay?.getScreenCTM();
            if (!ctm) {
                return;
            }
            const svgPoint = overlay.createSVGPoint();
            svgPoint.x = anchor.x;
            svgPoint.y = anchor.y;
            const screenPoint = svgPoint.matrixTransform(ctm);
            const isFullscreen = stage.classList.contains('dm-draw__stage--fullscreen');
            if (isFullscreen) {
                cursor.style.left = `${Math.round(screenPoint.x)}px`;
                cursor.style.top = `${Math.round(screenPoint.y)}px`;
            } else {
                const stageRect = stage.getBoundingClientRect();
                cursor.style.left = `${Math.round(screenPoint.x - stageRect.left)}px`;
                cursor.style.top = `${Math.round(screenPoint.y - stageRect.top)}px`;
            }
        }

        function redraw() {
            updateShapes();
            updateOutput();
            positionCursor();
        }

        function scheduleRedraw() {
            if (redrawPending) {
                return;
            }
            redrawPending = true;
            requestAnimationFrame(() => {
                redrawPending = false;
                redraw();
            });
        }

        function buildHandles() {
            handlesLayer.innerHTML = points
                .map(
                    (point, index) => `
                        <g data-handle-group="${index}">
                            <circle class="dm-draw__handle-hit" data-index="${index}" cx="${point.x}" cy="${point.y}" r="12"></circle>
                            <circle class="dm-draw__handle-node" cx="${point.x}" cy="${point.y}" r="5"></circle>
                        </g>
                    `,
                )
                .join('');
            handleElements = Array.from(handlesLayer.querySelectorAll('.dm-draw__handle-hit'));
            if (cursorAnchorIndex >= points.length) {
                cursorAnchorIndex = Math.max(0, points.length - 1);
            }
            handleElements.forEach((handle) => {
                handle.setAttribute('tabindex', '0');
                handle.setAttribute('role', 'button');
                handle.setAttribute('aria-label', `Vrchol ${Number(handle.getAttribute('data-index')) + 1}`);
                handle.addEventListener(
                    'pointerdown',
                    (event) => {
                        event.stopPropagation();
                        // Left button = drag, Right button = delete
                        if (event.button === 0) {
                            startDrag(event);
                        } else if (event.button === 2) {
                            event.preventDefault();
                            handleVertexDelete(event);
                        }
                    },
                    { passive: false },
                );
                handle.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                });
                handle.addEventListener('keydown', handleHandleKeydown);
                handle.addEventListener('focus', () => {
                    const focusIndex = Number(handle.getAttribute('data-index'));
                    if (Number.isFinite(focusIndex)) {
                        cursorAnchorIndex = focusIndex;
                        positionCursor();
                    }
                });
            });
        }

        function handleVertexDelete(event) {
            const target = event.currentTarget;
            const index = Number(target.getAttribute('data-index'));
            if (!Number.isFinite(index)) return;

            // Delete vertex
            points.splice(index, 1);
            if (cursorAnchorIndex >= points.length) {
                cursorAnchorIndex = Math.max(0, points.length - 1);
            }

            // Update polygonClosed state
            const region = getActiveRegion();
            polygonClosed = points.length >= 3 && region && getRegionClosed(region);

            // Update closed state in region meta
            if (region) {
                setRegionClosed(region, polygonClosed);
            }

            buildHandles();
            redraw();
        }

        function handleHandleKeydown(event) {
            const target = event.currentTarget;
            const index = Number(target.getAttribute('data-index'));
            if (!Number.isFinite(index)) return;
            const step = event.shiftKey ? 10 : 4;
            let changed = false;
            switch (event.key) {
                case 'ArrowUp':
                    points[index].y = Math.max(0, points[index].y - step);
                    changed = true;
                    break;
                case 'ArrowDown':
                    points[index].y = Math.min(viewBoxHeight, points[index].y + step);
                    changed = true;
                    break;
                case 'ArrowLeft':
                    points[index].x = Math.max(0, points[index].x - step);
                    changed = true;
                    break;
                case 'ArrowRight':
                    points[index].x = Math.min(viewBoxWidth, points[index].x + step);
                    changed = true;
                    break;
                case 'Delete':
                case 'Backspace':
                    points.splice(index, 1);
                    if (cursorAnchorIndex >= points.length) {
                        cursorAnchorIndex = Math.max(0, points.length - 1);
                    }

                    // Update polygonClosed state
                    const region = getActiveRegion();
                    polygonClosed = points.length >= 3 && region && getRegionClosed(region);

                    // Update closed state in region meta
                    if (region) {
                        setRegionClosed(region, polygonClosed);
                    }

                    buildHandles();
                    redraw();
                    break;
                default:
                    break;
            }
            if (changed) {
                scheduleRedraw();
            }
        }

        function startDrag(event) {
            const target = event.currentTarget;
            activeIndex = Number(target.getAttribute('data-index'));
            if (!Number.isFinite(activeIndex)) {
                return;
            }
            activeHandle = target;
            cursorAnchorIndex = activeIndex;
            preventClick = false;

            // Highlight both hit area and visual node
            activeHandle.classList.add('is-active');
            const handleGroup = activeHandle.parentElement;
            const nodeCircle = handleGroup?.querySelector('.dm-draw__handle-node');
            if (nodeCircle) {
                nodeCircle.classList.add('is-active');
            }

            activeHandle.setPointerCapture(event.pointerId);
            event.preventDefault();
            window.addEventListener('pointermove', handleDrag);
            window.addEventListener('pointerup', endDrag, { once: true });
        }

        function handleDrag(event) {
            if (activeIndex < 0) {
                return;
            }
            preventClick = true;
            const { x, y } = toViewBoxCoordinates(event);
            points[activeIndex] = clampPoint({ x, y });
            scheduleRedraw();
        }

        function endDrag(event) {
            if (activeIndex < 0) {
                return;
            }
            const { x, y } = toViewBoxCoordinates(event);
            points[activeIndex] = clampPoint({ x, y });

            if (activeHandle) {
                activeHandle.releasePointerCapture(event.pointerId);
                activeHandle.classList.remove('is-active');

                // Remove highlight from visual node
                const handleGroup = activeHandle.parentElement;
                const nodeCircle = handleGroup?.querySelector('.dm-draw__handle-node');
                if (nodeCircle) {
                    nodeCircle.classList.remove('is-active');
                }
            }

            activeHandle = null;
            activeIndex = -1;
            window.removeEventListener('pointermove', handleDrag);
            setTimeout(() => {
                preventClick = false;
            }, 100);
            redraw();
        }

        function handleOverlayPointerDown(event) {
            // Only handle left button clicks
            if (event.button !== 0) {
                return;
            }

            // Prevent adding point if clicking on handle or during drag
            if (event.target !== overlay || preventClick) {
                return;
            }

            const { x, y } = toViewBoxCoordinates(event);
            const point = clampPoint({ x, y });
            insertPoint(point);
        }

        function insertPoint(point) {
            points.push(point);
            cursorAnchorIndex = points.length - 1;

            // Update polygonClosed state when we have 3+ points
            const region = getActiveRegion();
            if (points.length >= 3) {
                // Auto-close polygon when 3rd point is added
                polygonClosed = true;
                if (region) {
                    setRegionClosed(region, true);
                }
            } else {
                polygonClosed = false;
                if (region) {
                    setRegionClosed(region, false);
                }
            }

            buildHandles();
            redraw();
        }

        if (resetButton) {
            resetButton.textContent = 'Reset';
            resetButton.addEventListener('click', () => {
                points = [];
                cursorAnchorIndex = 0;
                buildHandles();
                redraw();
            });
        }

        if (revertButton) {
            revertButton.addEventListener('click', () => {
                if (!savedSnapshot) {
                    return;
                }

                const snapshotRegions = Array.isArray(savedSnapshot.regions)
                    ? savedSnapshot.regions.map((region) => cloneRegionSnapshot(region)).filter(Boolean)
                    : [];

                regionState.regions = snapshotRegions.length
                    ? snapshotRegions
                    : [createRegion(null, 0)];

                const preferredId = savedSnapshot.activeId;
                const hasPreferred = preferredId
                    ? regionState.regions.some((region) => String(region.id) === String(preferredId))
                    : false;

                const fallbackRegionId = regionState.regions.length ? regionState.regions[0].id : null;
                regionState.activeId = hasPreferred
                    ? String(preferredId)
                    : fallbackRegionId
                        ? String(fallbackRegionId)
                        : null;

                if (regionState.activeId) {
                    drawRoot.dataset.dmActiveRegion = regionState.activeId;
                    if (state.modal && state.modal.type === 'draw-coordinates') {
                        state.modal.regionId = regionState.activeId;
                    }
                } else {
                    delete drawRoot.dataset.dmActiveRegion;
                    if (state.modal && state.modal.type === 'draw-coordinates') {
                        delete state.modal.regionId;
                    }
                }

                const snapshotWidth = Number(savedSnapshot.viewBoxWidth);
                const snapshotHeight = Number(savedSnapshot.viewBoxHeight);
                if (Number.isFinite(snapshotWidth) && Number.isFinite(snapshotHeight)) {
                    viewBoxWidth = snapshotWidth;
                    viewBoxHeight = snapshotHeight;
                    updateOverlayViewBox();
                    syncRootDatasetViewbox();
                }

                const activeRegion = getActiveRegion();
                points = ensurePointsFromRegion(activeRegion);
                polygonClosed = activeRegion ? getRegionClosed(activeRegion) && points.length >= 3 : false;
                cursorAnchorIndex = 0;
                preventClick = false;
                activeHandle = null;
                activeIndex = -1;

                refreshRegionList();
                syncRegionForm();
                buildHandles();
                redraw();
                positionCursor();

                savedSnapshot = captureSnapshot();
            });
        }

        // Zoom functionality (reserved for future implementation)
        // if (zoomOutButton) {
        //     zoomOutButton.addEventListener('click', () => {
        //         adjustStageZoom(-ZOOM_STEP);
        //     });
        // }
        //
        // if (zoomInButton) {
        //     zoomInButton.addEventListener('click', () => {
        //         adjustStageZoom(ZOOM_STEP);
        //     });
        // }

        if (saveButton) {
            saveButton.addEventListener('click', () => {
                commitActiveRegionPoints();
                if (targetEntity) {
                    const previousRegionsMap = new Map(
                        (Array.isArray(targetEntity.regions) ? targetEntity.regions : []).map((region) => [
                            String(region?.id ?? ''),
                            region,
                        ]),
                    );
                    const nextRegions = regionState.regions
                        .map((region, index) => {
                            const statusId = sanitiseStatusId(region.statusId ?? region.status ?? '');
                            const statusLabel = getStatusLabel(statusId) || region.statusLabel || '';
                            let geometryPoints = Array.isArray(region.geometry?.points)
                                ? region.geometry.points
                                    .map((point) => {
                                        const x = Number(point?.[0]);
                                        const y = Number(point?.[1]);
                                        if (!Number.isFinite(x) || !Number.isFinite(y)) {
                                            return null;
                                        }
                                        return [Number(x.toFixed(4)), Number(y.toFixed(4))];
                                    })
                                    .filter(Boolean)
                                : [];
                            if (geometryPoints.length < 3) {
                                const previousRegion = previousRegionsMap.get(String(region.id ?? ''));
                                if (previousRegion && Array.isArray(previousRegion.geometry?.points)) {
                                    geometryPoints = previousRegion.geometry.points
                                        .map((point) => {
                                            const x = Number(point?.[0]);
                                            const y = Number(point?.[1]);
                                            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                                                return null;
                                            }
                                            return [Number(x.toFixed(4)), Number(y.toFixed(4))];
                                        })
                                        .filter(Boolean);
                                }
                            }
                            const meta = region.meta && typeof region.meta === 'object' ? { ...region.meta } : {};
                            if (meta && Object.prototype.hasOwnProperty.call(meta, 'hatchClass')) {
                                delete meta.hatchClass;
                            }
                            const detailUrl = (() => {
                                const metaUrl = typeof meta.detailUrl === 'string' ? meta.detailUrl.trim() : '';
                                if (metaUrl) {
                                    return metaUrl;
                                }
                                const raw = typeof region.detailUrl === 'string' ? region.detailUrl.trim() : '';
                                return raw;
                            })();
                            if (detailUrl) {
                                meta.detailUrl = detailUrl;
                            } else if (Object.prototype.hasOwnProperty.call(meta, 'detailUrl')) {
                                delete meta.detailUrl;
                            }
                            const regionUrl = sanitiseRegionUrl(meta.url ?? region.url ?? '');
                            if (regionUrl) {
                                meta.url = regionUrl;
                            } else if (Object.prototype.hasOwnProperty.call(meta, 'url')) {
                                delete meta.url;
                            }
                            const strokeWidth = normaliseNumericField(meta.strokeWidth ?? region.strokeWidth, {
                                min: 1,
                                max: 10,
                                precision: 2,
                            });
                            if (strokeWidth !== null) {
                                meta.strokeWidth = strokeWidth;
                            } else if (Object.prototype.hasOwnProperty.call(meta, 'strokeWidth')) {
                                delete meta.strokeWidth;
                            }
                            const strokeOpacity = normaliseNumericField(meta.strokeOpacity ?? region.strokeOpacity, {
                                min: 0,
                                max: 100,
                                precision: 2,
                            });
                            if (strokeOpacity !== null) {
                                meta.strokeOpacity = strokeOpacity;
                            } else if (Object.prototype.hasOwnProperty.call(meta, 'strokeOpacity')) {
                                delete meta.strokeOpacity;
                            }
                            const fillOpacity = normaliseNumericField(meta.fillOpacity ?? region.fillOpacity, {
                                min: 0,
                                max: 100,
                                precision: 2,
                            });
                            if (fillOpacity !== null) {
                                meta.fillOpacity = fillOpacity;
                            } else if (Object.prototype.hasOwnProperty.call(meta, 'fillOpacity')) {
                                delete meta.fillOpacity;
                            }
                            const children = Array.isArray(region.children)
                                ? region.children
                                    .map((child) => {
                                        const value = String(child ?? '').trim();
                                        return value || null;
                                    })
                                    .filter(Boolean)
                                : [];
                            const payload = {
                                id: String(region.id ?? generateId('region')),
                                label: region.label ?? region.name ?? `Zóna ${index + 1}`,
                                type: region.type ?? '',
                                status: statusId,
                                statusId,
                                statusLabel,
                                geometry: {
                                    type: 'polygon',
                                    points: geometryPoints,
                                },
                                children,
                            };
                            if (detailUrl) {
                                payload.detailUrl = detailUrl;
                            }
                            if (regionUrl) {
                                payload.url = regionUrl;
                            }
                            if (strokeWidth !== null) {
                                payload.strokeWidth = strokeWidth;
                            }
                            if (strokeOpacity !== null) {
                                payload.strokeOpacity = strokeOpacity;
                            }
                            if (fillOpacity !== null) {
                                payload.fillOpacity = fillOpacity;
                            }
                            if (Array.isArray(region.tags)) {
                                payload.tags = [...region.tags];
                            }
                            if (Object.keys(meta).length) {
                                payload.meta = meta;
                            }
                            return payload;
                        })
                        .filter(Boolean);

                    targetEntity.regions = nextRegions;

                    if (Number.isFinite(viewBoxWidth) && Number.isFinite(viewBoxHeight)) {
                        const rendererConfig =
                            targetEntity.renderer && typeof targetEntity.renderer === 'object'
                                ? { ...targetEntity.renderer }
                                : {};
                        rendererConfig.size = {
                            width: Math.round(viewBoxWidth),
                            height: Math.round(viewBoxHeight),
                        };
                        // Zoom level will be handled separately if zoom functionality is added
                        // rendererConfig.zoom = 1.0;
                        targetEntity.renderer = rendererConfig;
                    }
                }
                saveProjects(data.projects);
                savedSnapshot = captureSnapshot();
                setState({ modal: null });
            });
        }

        // Fullscreen portal and backdrop
        let fullscreenPortal = null;
        let fullscreenBackdrop = null;
        let originalParent = null;

        function enterFullscreen() {
            if (isFullscreen) return;

            fullscreenScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            isFullscreen = true;

            // Create backdrop
            fullscreenBackdrop = document.createElement('div');
            fullscreenBackdrop.className = 'dm-draw-fullscreen-backdrop';
            fullscreenBackdrop.addEventListener('click', exitFullscreen);
            document.body.appendChild(fullscreenBackdrop);

            // Store original parent
            originalParent = stage.parentElement;

            // Move stage to body (portal pattern - no cloning)
            document.body.classList.add('dm-draw-fullscreen-active');
            stage.classList.add('dm-draw__stage--fullscreen');
            document.body.appendChild(stage);

            fullscreenToggle.setAttribute('aria-pressed', 'true');
            fullscreenToggle.setAttribute('aria-label', 'Ukončiť režim celej obrazovky');

            // Reposition cursor after layout change
            requestAnimationFrame(() => {
                positionCursor();
            });
        }

        function exitFullscreen() {
            if (!isFullscreen) return;

            isFullscreen = false;

            // Remove backdrop
            if (fullscreenBackdrop) {
                fullscreenBackdrop.removeEventListener('click', exitFullscreen);
                fullscreenBackdrop.remove();
                fullscreenBackdrop = null;
            }

            // Move stage back to original parent
            document.body.classList.remove('dm-draw-fullscreen-active');
            stage.classList.remove('dm-draw__stage--fullscreen');

            if (originalParent) {
                originalParent.appendChild(stage);
            }

            fullscreenToggle.setAttribute('aria-pressed', 'false');
            fullscreenToggle.setAttribute('aria-label', 'Zobraziť na celú obrazovku');

            window.scrollTo(0, fullscreenScrollTop);

            // Reposition cursor after layout change
            requestAnimationFrame(() => {
                positionCursor();
            });
        }

        // Fullscreen toggle
        if (fullscreenToggle) {
            fullscreenToggle.addEventListener('click', () => {
                if (isFullscreen) {
                    exitFullscreen();
                } else {
                    enterFullscreen();
                }
            });
        }

        // Polygon drag functionality
        let polygonDragSession = null;

        function startPolygonDrag(event) {
            if (!polygonClosed || points.length < 3) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const startCoords = toViewBoxCoordinates(event);
            polygonDragSession = {
                startX: startCoords.x,
                startY: startCoords.y,
                originalPoints: points.map(p => ({ x: p.x, y: p.y })),
                pointerId: event.pointerId,
            };

            fill.classList.add('is-dragging');
            fill.setPointerCapture(event.pointerId);

            preventClick = true;

            window.addEventListener('pointermove', handlePolygonDrag);
            window.addEventListener('pointerup', endPolygonDrag, { once: true });
        }

        function handlePolygonDrag(event) {
            if (!polygonDragSession) {
                return;
            }

            const currentCoords = toViewBoxCoordinates(event);
            const deltaX = currentCoords.x - polygonDragSession.startX;
            const deltaY = currentCoords.y - polygonDragSession.startY;

            // Move all points, clamping to bounds
            points = polygonDragSession.originalPoints.map(p =>
                clampPoint({ x: p.x + deltaX, y: p.y + deltaY })
            );

            scheduleRedraw();
        }

        function endPolygonDrag(event) {
            if (!polygonDragSession) {
                return;
            }

            fill.classList.remove('is-dragging');

            if (fill.releasePointerCapture) {
                try {
                    fill.releasePointerCapture(polygonDragSession.pointerId);
                } catch (e) {
                    // Ignore if capture was already released
                }
            }

            window.removeEventListener('pointermove', handlePolygonDrag);
            polygonDragSession = null;

            setTimeout(() => {
                preventClick = false;
            }, 100);

            redraw();
        }

        // Attach polygon drag listeners
        fill.addEventListener('pointerdown', startPolygonDrag, { passive: false });

        refreshRegionList();
        syncRegionForm();

        // Prevent context menu on overlay
        overlay.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        overlay.addEventListener('pointerdown', handleOverlayPointerDown, { passive: false });

        buildHandles();
        redraw();
        positionCursor();

        if (!savedSnapshot) {
            savedSnapshot = captureSnapshot();
        }
    }

    // Global event delegation for draw modal region list
    // This prevents duplicate event handlers when modal is reopened
    root.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-dm-region-trigger]');
        if (!trigger) return;

        // Only handle if we're in a draw modal
        if (!state.modal || state.modal.type !== 'draw-coordinates') return;

        // Verify the click is within the region list
        const clickedList = event.target.closest('[data-dm-region-list]');
        if (!clickedList) return;

        const regionId = trigger.getAttribute('data-dm-region-trigger');

        // Find the current drawRoot to get activeRegionId
        const drawRoot = root.querySelector('[data-dm-draw-root]');
        if (!drawRoot) return;

        const currentActiveRegion = drawRoot.dataset.dmActiveRegion ?? '';
        if (!regionId || regionId === String(currentActiveRegion)) return;

        // Update UI immediately to show active state - use new editor classes
        const regionList = clickedList;
        const allItems = regionList.querySelectorAll('.dm-editor__zone-item, .dm-draw__region-item');
        allItems.forEach(item => {
            const itemId = item.dataset.dmRegionItem;
            if (String(itemId) === String(regionId)) {
                item.classList.add('is-active', 'dm-editor__zone-item--active');
            } else {
                item.classList.remove('is-active', 'dm-editor__zone-item--active');
            }
        });

        // Dispatch custom event to initDrawSurface to set active region
        // This maintains separation of concerns - UI state is updated here,
        // but the actual region switching logic is handled by initDrawSurface
        drawRoot.dispatchEvent(new CustomEvent('dm:setActiveRegion', {
            detail: { regionId }
        }));
    });

    // Tab switching for editor inspector panel
    root.addEventListener('click', (event) => {
        const tabButton = event.target.closest('[data-dm-tab]');
        if (!tabButton) return;

        // Only handle if we're in draw editor
        if (!state.modal || state.modal.type !== 'draw-coordinates') return;

        const targetTab = tabButton.getAttribute('data-dm-tab');
        if (!targetTab) return;

        // Find all tabs and panels in the inspector
        const inspectorPanel = tabButton.closest('.dm-editor__panel--right');
        if (!inspectorPanel) return;

        const allTabs = inspectorPanel.querySelectorAll('[data-dm-tab]');
        const allPanels = inspectorPanel.querySelectorAll('[data-dm-tab-panel]');

        // Update tab buttons
        allTabs.forEach(tab => {
            const tabName = tab.getAttribute('data-dm-tab');
            if (tabName === targetTab) {
                tab.classList.add('dm-editor__tab--active');
                tab.setAttribute('aria-selected', 'true');
            } else {
                tab.classList.remove('dm-editor__tab--active');
                tab.setAttribute('aria-selected', 'false');
            }
        });

        // Update tab panels
        allPanels.forEach(panel => {
            const panelName = panel.getAttribute('data-dm-tab-panel');
            if (panelName === targetTab) {
                panel.classList.add('dm-editor__tab-panel--active');
                panel.removeAttribute('hidden');
            } else {
                panel.classList.remove('dm-editor__tab-panel--active');
                panel.setAttribute('hidden', '');
            }
        });
    });

    const instance = {
        root,
        runtimeConfig,
        data,
        state,
        destroy() {
            root.innerHTML = '';
            delete root.dataset.dmHydrated;
            delete root.__dmInstance;
        },
    };

    root.__dmInstance = instance;
    render();
    return instance;
}

export default initDeveloperMap;
