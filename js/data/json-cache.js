const jsonCache = new Map();

function hasFallback(options) {
    return Object.prototype.hasOwnProperty.call(options, 'fallback');
}

export function fetchJsonCached(url, options = {}) {
    if (jsonCache.has(url)) {
        return jsonCache.get(url);
    }

    const request = fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Unable to fetch ${url}: ${response.status}`);
            }
            return response.json();
        })
        .then(data => options.transform ? options.transform(data) : data)
        .catch(error => {
            if (!options.cacheErrors) {
                jsonCache.delete(url);
            }

            if (hasFallback(options)) {
                return typeof options.fallback === 'function'
                    ? options.fallback(error)
                    : options.fallback;
            }

            throw error;
        });

    jsonCache.set(url, request);
    return request;
}

export function scheduleJsonWarmup(entries, timeout = 1500) {
    const warm = () => {
        entries.forEach(entry => {
            fetchJsonCached(entry.url, entry.options).catch(() => {});
        });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warm, { timeout });
        return;
    }

    setTimeout(warm, 0);
}