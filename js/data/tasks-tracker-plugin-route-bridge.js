'use strict';

/**
 * plugin-route-bridge.js
 *
 * Format bridge between the tasks-tracker-plugin CustomRoute JSON and the
 * LeaguesMap planner (v3) JSON.
 * 
 */

function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}


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

        const rawItems = Array.isArray(section.items) ? section.items : [];

        const items = rawItems.flatMap(item => {
            if (item.taskId != null) {
                return [{
                    taskId: item.taskId,
                    // taskName: null,
                    // pinCoords are intentionally omitted because planner-state pins should take precedence over plugin-imported pins (which are often less accurate)
                    // they should patch in after mergeExistingPins runs, which is after planner-state pins are loaded
                    comments: item.note ? item.note.split('\n\n') : [],
                }];
            }
            if (item.customItem) {
                const ci  = item.customItem;
                const note = item.note != null ? item.note : null;
                const customName = ci.name || 'Custom Stop';
                return [{
                    id: ci.id,
                    virtual: true,
                    customName,
                    customDesc: ci.label || '',
                    // pinCoords are intentionally omitted because planner-state pins should take precedence over plugin-imported pins (which are often less accurate)
                    // they should patch in after mergeExistingPins runs, which is after planner-state pins are loaded
                    comments: note ? note.split('\n\n') : [],
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
                const customItem = { id: _genId().slice(0, 8) };
                if (item.id) customItem.id = item.id;
                if (item.customDesc) customItem.label = item.customDesc;
                if (item.customName) customItem.name  = item.customName;
                const ci = { customItem };
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
        return { id: section.id || genId(), name: section.name || 'Section', items };
    });

    return {
        name: routeName || 'My Route',
        taskType: 'LEAGUE_5',
        sections: pluginSections,
    };
}

/**
 * Merge existing pinCoords for task items where imported pinCoords is null.
 * Used to preserve user-placed pins when importing plugin routes.
 * @param {object} converted - LeaguesMap route object (from plugin)
 * @param {Array} existingSections - Current LeaguesMap sections (plannerGroups)
 * @returns {object} Mutated converted object
 */
export function mergeExistingPins(converted, existingSections) {
    const existing = new Map();
    for (const group of existingSections || []) {
        for (const item of group.items || []) {
            if (item.taskId != null && item.pinCoords != null) {
                existing.set(item.taskId, item.pinCoords);
            }
        }
    }
    for (const section of converted.sections) {
        for (const item of section.items) {
            if (item.taskId != null && item.pinCoords == null && existing.has(item.taskId)) {
                item.pinCoords = existing.get(item.taskId);
            }
        }
    }
    return converted;
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}