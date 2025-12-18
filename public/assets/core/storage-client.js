/**
 * REST storage client for Developer Map.
 */

class StorageClientError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.name = 'StorageClientError';
        this.status = status;
        this.payload = payload;
    }
}

const DEFAULT_RETRY_LIMIT = 5;
const QUEUE_DELAY = 5000;

/**
 * Create a storage client instance.
 * @param {{ restBase?: string; restNonce?: string }} runtimeConfig
 */
export function createStorageClient(runtimeConfig = {}) {
    const restBase = normaliseBase(runtimeConfig.restBase);
    const restNonce = runtimeConfig.restNonce || '';

    if (!restBase) {
        throw new Error('Developer Map: REST base URL missing in runtime configuration.');
    }

    const queue = [];
    let queueTimer = null;
    const listeners = new Set();

    /**
     * Notify listeners about queue changes.
     */
    function emitQueueUpdate() {
        const size = queue.length;
        listeners.forEach((listener) => {
            try {
                listener(size);
            } catch (err) {
                console.warn('[Developer Map] storage queue listener failed', err);
            }
        });
    }

    function scheduleQueue(delay = QUEUE_DELAY) {
        if (queueTimer) {
            return;
        }
        queueTimer = setTimeout(() => {
            queueTimer = null;
            void flushQueue();
        }, delay);
    }

    async function flushQueue() {
        if (!queue.length) {
            return;
        }

        const item = queue.shift();
        emitQueueUpdate();
        if (!item) {
            return;
        }

        try {
            await request(item.endpoint, item.options, true);
        } catch (error) {
            item.attempts += 1;
            if (item.attempts < item.limit) {
                queue.push(item);
                emitQueueUpdate();
                scheduleQueue(Math.min(item.delay * 2, 30000));
            } else {
                console.error('[Developer Map] storage queue item dropped', error);
            }
            return;
        }

        if (queue.length) {
            scheduleQueue();
        }
    }

    function queueRequest(endpoint, options) {
        const item = {
            endpoint,
            options,
            attempts: 0,
            limit: DEFAULT_RETRY_LIMIT,
            delay: QUEUE_DELAY,
        };
        queue.push(item);
        emitQueueUpdate();
        scheduleQueue();
        return { queued: true };
    }

    function shouldQueue(error) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return true;
        }
        if (error instanceof TypeError) {
            return true;
        }
        if (error && typeof error === 'object' && error.status === 0) {
            return true;
        }
        return false;
    }

    async function request(endpoint, options = {}, retrying = false) {
        const { method = 'GET', body, query } = options;
        const url = buildUrl(restBase, endpoint, query);
        const fetchOptions = {
            method,
            headers: {
                'Accept': 'application/json',
            },
            credentials: 'same-origin',
        };

        if (restNonce) {
            fetchOptions.headers['X-WP-Nonce'] = restNonce;
        }

        if (body !== undefined && body !== null && method !== 'GET') {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, fetchOptions);
            const data = await parseResponse(response);
            if (!response.ok) {
                const message = data?.message || `Request to ${endpoint} failed`;
                throw new StorageClientError(message, response.status, data);
            }
            return data;
        } catch (error) {
            if (!retrying && shouldQueue(error)) {
                return queueRequest(endpoint, options);
            }
            throw error;
        }
    }

    function onQueueUpdate(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            if (queue.length) {
                queueTimer = null;
                void flushQueue();
            }
        });
    }

    return {
        getQueueSize: () => queue.length,
        onQueueUpdate,
        flushQueue,
        list() {
            return request('list');
        },
        get(key) {
            return request('get', { method: 'GET', query: { key } });
        },
        set(key, value) {
            return request('set', { method: 'POST', body: { key, value } });
        },
        remove(key) {
            return request('remove', { method: 'DELETE', body: { key } });
        },
        migrate(payload) {
            if (!payload || typeof payload !== 'object') {
                return Promise.resolve({ migrated: {}, skipped: {} });
            }
            return request('migrate', { method: 'POST', body: { payload } });
        },
        saveImage({ key, entityId, attachmentId }) {
            if (!key || !entityId || !attachmentId) {
                return Promise.reject(new Error('Missing image payload fields.'));
            }
            return request('image', {
                method: 'POST',
                body: {
                    key,
                    entity_id: entityId,
                    attachment_id: attachmentId,
                },
            });
        },
    };
}

function normaliseBase(value) {
    if (!value) return '';
    let base = String(value);
    if (!base.endsWith('/')) {
        base += '/';
    }
    return base;
}

function buildUrl(base, endpoint, query) {
    const cleaned = String(endpoint || '').replace(/^\//, '');
    const url = new URL(cleaned, base);
    if (query && typeof query === 'object') {
        Object.entries(query).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }
            url.searchParams.set(key, value);
        });
    }
    return url.toString();
}

async function parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    const text = await response.text();
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        return { raw: text };
    }
}

export { StorageClientError };
