/**
 * Handle one-time migration from localStorage to REST storage.
 */

const DEFAULT_KEYS = [
    'dm-projects',
    'dm-types',
    'dm-statuses',
    'dm-colors',
    'dm-expanded-projects',
];

function cloneDeep(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        console.warn('[Developer Map] Failed to deep clone value during migration', error);
        return value;
    }
}

function sanitisePointValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Number(parsed.toFixed(4));
}

function normaliseGeometry(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const rawPoints = Array.isArray(input.points) ? input.points : Array.isArray(input) ? input : [];
    const points = rawPoints
        .map((point) => {
            if (Array.isArray(point) && point.length >= 2) {
                const x = sanitisePointValue(point[0]);
                const y = sanitisePointValue(point[1]);
                if (x === null || y === null) {
                    return null;
                }
                return [x, y];
            }
            if (point && typeof point === 'object') {
                const x = sanitisePointValue(point.x ?? point[0]);
                const y = sanitisePointValue(point.y ?? point[1]);
                if (x === null || y === null) {
                    return null;
                }
                return [x, y];
            }
            return null;
        })
        .filter(Boolean);

    return {
        type: 'polygon',
        points,
    };
}

function normaliseRegion(region, index, baseId) {
    const source = region && typeof region === 'object' ? cloneDeep(region) : {};
    const geometry = normaliseGeometry(source.geometry ?? source);
    if (!geometry) {
        return null;
    }

    const fallbackLabel = typeof source.label === 'string' && source.label.trim() ? source.label.trim() : null;
    const fallbackStatus =
        typeof source.status === 'string' && source.status.trim() ? source.status.trim() : '';
    const fallbackStatusId =
        typeof source.statusId === 'string' && source.statusId.trim()
            ? source.statusId.trim()
            : fallbackStatus;
    const meta = source.meta && typeof source.meta === 'object' ? { ...source.meta } : {};
    if (meta && Object.prototype.hasOwnProperty.call(meta, 'hatchClass')) {
        delete meta.hatchClass;
    }

    const children = Array.isArray(source.children)
        ? source.children
              .map((child) => {
                  const value = String(child ?? '').trim();
                  return value || null;
              })
              .filter(Boolean)
        : [];

    const resolvedId =
        typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `${baseId}-${index + 1}`;

    return {
        id: resolvedId,
        label: fallbackLabel ?? `Region ${index + 1}`,
        status: fallbackStatus ?? '',
        statusId: fallbackStatusId ?? '',
        geometry,
        meta: Object.keys(meta).length ? meta : undefined,
        children,
    };
}

function slugifyPublicKey(input, fallback = 'mapa') {
    if (typeof input !== 'string') {
        return fallback;
    }
    const normalised = input
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
    return normalised || fallback;
}

function migrateEntityRegions(entity, index, scope) {
    if (!entity || typeof entity !== 'object') {
        return entity;
    }

    const copy = { ...entity };
    const baseId =
        typeof copy.id === 'string' && copy.id.trim()
            ? `region-${copy.id.trim()}`
            : `region-${scope}-${index + 1}`;

    const migratedRegions = [];

    if (Array.isArray(copy.regions)) {
        copy.regions.forEach((region, regionIndex) => {
            const normalised = normaliseRegion(region, regionIndex, baseId);
            if (normalised) {
                migratedRegions.push(normalised);
            }
        });
    }

    if ((!Array.isArray(copy.regions) || copy.regions.length === 0) && copy.geometry) {
        const legacyGeometry = normaliseGeometry(copy.geometry);
        if (legacyGeometry) {
            migratedRegions.push({
                id: `${baseId}-1`,
                label:
                    (typeof copy.label === 'string' && copy.label.trim()) ||
                    (typeof copy.name === 'string' && copy.name.trim()) ||
                    'Region 1',
                status:
                    (typeof copy.status === 'string' && copy.status.trim()) ||
                    (typeof copy.statusLabel === 'string' && copy.statusLabel.trim()) ||
                    '',
                statusId:
                    (typeof copy.statusId === 'string' && copy.statusId.trim()) ||
                    (typeof copy.statusKey === 'string' && copy.statusKey.trim()) ||
                    '',
                geometry: legacyGeometry,
                children: [],
                meta:
                    copy.meta && typeof copy.meta === 'object' && Object.keys(copy.meta).length
                        ? (() => {
                              const metaCopy = { ...copy.meta };
                              if (Object.prototype.hasOwnProperty.call(metaCopy, 'hatchClass')) {
                                  delete metaCopy.hatchClass;
                              }
                              return Object.keys(metaCopy).length ? metaCopy : undefined;
                          })()
                        : undefined,
            });
        }
    }

    delete copy.geometry;
    copy.regions = migratedRegions;

    return copy;
}

function migrateProject(project, projectIndex) {
    if (!project || typeof project !== 'object') {
        return project;
    }

    const cloned = cloneDeep(project);
    const migrated = migrateEntityRegions(cloned, projectIndex, 'project');

    if (!migrated.publicKey || typeof migrated.publicKey !== 'string') {
        migrated.publicKey = slugifyPublicKey(migrated.name ?? migrated.title ?? `mapa-${projectIndex + 1}`);
    } else {
        migrated.publicKey = slugifyPublicKey(migrated.publicKey);
    }

    if (Array.isArray(migrated.floors)) {
        migrated.floors = migrated.floors.map((floor, floorIndex) =>
            migrateEntityRegions(floor, floorIndex, migrated.id ? `floor-${migrated.id}` : 'floor')
        );
    }

    return migrated;
}

function migrateProjectsCollection(projects) {
    if (Array.isArray(projects)) {
        const migrated = projects.map((project, index) => migrateProject(project, index));
        const used = new Set();
        migrated.forEach((project, index) => {
            if (!project || typeof project !== 'object') {
                return;
            }
            let key = typeof project.publicKey === 'string' ? project.publicKey.trim() : '';
            if (!key) {
                key = slugifyPublicKey(project.name ?? project.title ?? `mapa-${index + 1}`);
            } else {
                key = slugifyPublicKey(key);
            }
            const base = key || `mapa-${index + 1}`;
            let candidate = base;
            let suffix = 1;
            while (used.has(candidate)) {
                candidate = `${base}-${suffix}`;
                suffix += 1;
            }
            project.publicKey = candidate;
            used.add(candidate);
        });
        return migrated;
    }

    return projects;
}

/**
 * Run migration using provided storage client.
 * @param {ReturnType<import('./storage-client.js').createStorageClient>} storageClient
 * @param {{ keys?: string[]; markerKey?: string }} [options]
 */
export async function migrateLocalStorage(storageClient, options = {}) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { migrated: false, reason: 'no-storage' };
    }
    if (!storageClient || typeof storageClient.migrate !== 'function') {
        return { migrated: false, reason: 'no-client' };
    }

    const { keys = DEFAULT_KEYS, markerKey = 'dm-storage-migrated' } = options;
    const marker = window.localStorage.getItem(markerKey);
    if (marker === '1') {
        return { migrated: false, reason: 'already-migrated' };
    }

    const payload = {};

    keys.forEach((key) => {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                return;
            }
            try {
                payload[key] = JSON.parse(raw);
            } catch (parseError) {
                payload[key] = raw;
            }
        } catch (error) {
            console.warn('[Developer Map] migration read failed for key', key, error);
        }
    });

    if (!Object.keys(payload).length) {
        window.localStorage.setItem(markerKey, '1');
        return { migrated: false, reason: 'no-data' };
    }

    try {
        const payloadForMigration = prepareMigrationPayload(payload);
        const response = await storageClient.migrate(payloadForMigration);
        if (response && response.queued) {
            // keep marker unset so we retry once offline queue clears
            return { migrated: false, queued: true };
        }

        keys.forEach((key) => {
            try {
                window.localStorage.removeItem(key);
            } catch (error) {
                console.warn('[Developer Map] migration cleanup failed for key', key, error);
            }
        });
        window.localStorage.setItem(markerKey, '1');
        return { migrated: true, response };
    } catch (error) {
        console.error('[Developer Map] storage migration failed', error);
        return { migrated: false, error };
    }
}

function prepareMigrationPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }
    const prepared = { ...payload };
    if (Array.isArray(prepared['dm-projects'])) {
        prepared['dm-projects'] = migrateProjectsCollection(prepared['dm-projects']);
    } else if (
        prepared['dm-projects'] &&
        typeof prepared['dm-projects'] === 'object' &&
        Array.isArray(prepared['dm-projects'].projects)
    ) {
        prepared['dm-projects'] = {
            ...prepared['dm-projects'],
            projects: migrateProjectsCollection(prepared['dm-projects'].projects),
        };
    }
    return prepared;
}
