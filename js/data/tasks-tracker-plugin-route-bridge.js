'use strict';

/**
 * plugin-route-bridge.js
 *
 * Format bridge between the tasks-tracker-plugin CustomRoute JSON and the
 * LeaguesMap planner (v3) JSON.
 *
 * Plugin format:
 *   { name, taskType?, author?, description?,
 *     sections: [{ name, description?,
 *       items:   [{ taskId, note? } | { customItem: { id, type } }]
 *       taskIds: [number, ...]   // legacy alternative to items
 *     }] }
 *
 * LeaguesMap v3 format:
 *   { version: 3, taskType, source: "GrootsLeagueMap",
 *     sections: [{ id, name, collapsed, showPins,
 *       items: [{ id, taskId, taskName, pinCoords, comments }
 *               | { id, virtual, customName, customDesc, pinCoords, comments }] }] }
 *
 * Coordinate translation:
 *   Plugin stores integer tile coordinates { x, y, plane } (WorldPoint).
 *   LeaguesMap stores Leaflet { lat, lng } where lat=Y, lng=X, as a precise
 *   floating-point position within the tile set by the user.
 *
 *   Plugin → Map:  pinCoords = { lat: y + 0.5, lng: x + 0.5 }  (tile centre)
 *   Map → Plugin:  location  = { x: floor(lng), y: floor(lat), plane: 0 }
 *
 *   On re-import from plugin, precise user-placed pins are replaced with tile
 *   centres — this is inherent to the plugin's integer tile coordinate format.
 */

function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const _CUSTOM_LABELS = {
    bank:           'Bank',
    home_teleport:  'Home Teleport',
    fairy_ring:     'Fairy Ring',
};

// ─── Format detection ─────────────────────────────────────────────────────────

/**
 * Returns true if `parsed` looks like a plugin CustomRoute JSON rather than a
 * LeaguesMap route file.
 * @param {*} parsed
 * @returns {boolean}
 */
export function isPluginRouteFormat(parsed) {
    return parsed != null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof parsed.name === 'string' &&
        Array.isArray(parsed.sections) &&
        parsed.source !== 'GrootsLeagueMap' &&
        parsed.version == null;
}

// ─── Plugin → LeaguesMap ─────────────────────────────────────────────────────

/**
 * Converts a plugin CustomRoute JSON to a LeaguesMap v3 planner object ready
 * for `applyPlanData`.
 *
 * taskName is intentionally left null — normalizePlannerItem resolves it
 * at render time via allTasksById.
 *
 * The returned object has an extra `_pluginRouteName` field (stripped before
 * any save) used to name the imported plan.
 *
 * @param {object} data - Parsed plugin CustomRoute JSON.
 * @returns {object} LeaguesMap v3 route object.
 */
export function convertPluginRouteToMapData(data) {
    const sections = (data.sections || []).map((section, sIdx) => {
        const name = section.name || `Section ${sIdx + 1}`;

        // Support both current "items" format and legacy "taskIds" array
        const rawItems =
            Array.isArray(section.items) && section.items.length > 0
                ? section.items
                : Array.isArray(section.taskIds)
                    ? section.taskIds.map(id => ({ taskId: id }))
                    : [];

        const items = rawItems.flatMap(item => {
            if (item.taskId != null) {
                const loc = item.location;
                return [{
                    id: _genId(),
                    taskId: item.taskId,
                    taskName: null,
                    pinCoords: loc != null ? { lat: loc.y + 0.5, lng: loc.x + 0.5 } : null,
                    comments: item.note ? item.note.split('\n\n') : [],
                }];
            }
            if (item.customItem) {
                const loc = item.location;
                return [{
                    id: _genId(),
                    virtual: true,
                    customName: _CUSTOM_LABELS[item.customItem.type] || item.customItem.type || 'Custom Stop',
                    customDesc: '',
                    pinCoords: loc != null ? { lat: loc.y + 0.5, lng: loc.x + 0.5 } : null,
                    comments: item.note ? item.note.split('\n\n') : [],
                }];
            }
            return [];
        });

        return { id: _genId(), name, collapsed: false, showPins: true, items };
    });

    return {
        version: 3,
        taskType: data.taskType || 'LEAGUE_5',
        source: 'GrootsLeagueMap',
        sections,
        _pluginRouteName: data.name || null,
    };
}

// ─── LeaguesMap → Plugin ─────────────────────────────────────────────────────

/**
 * Builds a plugin CustomRoute JSON from an already-prepared sections array
 * (as returned by `buildExportSections()` in the planner) and the route name.
 *
 * Keeping this pure (no planner-state access) makes it independently testable.
 *
 * @param {Array}  exportSections - Output of `buildExportSections()`.
 * @param {string} routeName      - Name for the plugin route.
 * @returns {object} Plugin CustomRoute JSON.
 */
export function buildPluginRouteExport(exportSections, routeName) {
    const pluginSections = exportSections.map(section => {
        const items = (section.items || []).flatMap(item => {
            if (item.virtual) {
                const ci = { customItem: { id: _genId().slice(0, 8), type: item.customName || 'custom' } };
                if (Array.isArray(item.comments) && item.comments.length) {
                    ci.note = item.comments.join('\n\n');
                }
                if (item.pinCoords != null) {
                    ci.location = { x: Math.floor(item.pinCoords.lng), y: Math.floor(item.pinCoords.lat), plane: 0 };
                }
                return [ci];
            }
            if (item.taskId == null) return [];
            const pi = { taskId: item.taskId };
            if (Array.isArray(item.comments) && item.comments.length) {
                pi.note = item.comments.join('\n\n');
            }
            if (item.pinCoords != null) {
                pi.location = { x: Math.floor(item.pinCoords.lng), y: Math.floor(item.pinCoords.lat), plane: 0 };
            }
            return [pi];
        });
        return { name: section.name || 'Section', items };
    });

    return {
        name: routeName || 'My Route',
        taskType: 'LEAGUE_5',
        sections: pluginSections,
    };
}
