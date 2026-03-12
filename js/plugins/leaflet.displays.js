import "../leaflet.js";
import "./leaflet.objects.js";

export default void function (factory) {
    var L;
    if (typeof define === "function" && define.amd) {
        define(["leaflet"], factory)
    } else if (typeof module !== "undefined") {
        L = require("leaflet");
        module.exports = factory(L)
    } else {
        if (typeof window.L === "undefined") {
            throw new Error("Leaflet must be loaded first")
        }
        factory(window.L)
    }
}
(function (L) {
    // ── Ground item spawns layer ──────────────────────────────
    L.ItemSpawns = L.LayerGroup.extend({
        initialize: function (options) {
            L.LayerGroup.prototype.initialize.call(this);
            L.setOptions(this, options);
        },

        onAdd: function (map) {
            this._map = map;
            if (this.options.name) {
                this.getData(this.options.name)
                    .then(locations => {
                        if (!this._map) return;
                        this.createMarkers(locations);
                        if (typeof this.options.onSpawnsLoaded === 'function') {
                            this.options.onSpawnsLoaded(locations);
                        }
                    }).catch(error => {
                        console.error('L.ItemSpawns error:', error);
                    });
            }
        },

        getData: async function (name) {
            let data = await fetch(`${this.options.folder}/item_spawns.json`)
                .then(res => res.json(), _ => { throw new Error(`Unable to fetch ${this.options.folder}/item_spawns.json`); });

            let hasRegionFilter = Array.isArray(this.options.regions);
            let regionFilter = hasRegionFilter && this.options.regions.length > 0
                ? new Set(this.options.regions.map(r => r.toLowerCase()))
                : null;

            let isStrict = this.options.strict === true;
            let searchLower = name.toLowerCase();

            return data.filter(item => {
                if (!item.page_name || !item.coordinates || item.coordinates.length === 0) return false;
                let nameLower = item.page_name.toLowerCase();
                let nameMatches = isStrict ? nameLower === searchLower : nameLower.includes(searchLower);
                if (!nameMatches) return false;
                if (hasRegionFilter && !regionFilter) return false;
                if (regionFilter) {
                    if (!item.leagueregion || item.leagueregion.length === 0) return false;
                    return item.leagueregion.some(region => regionFilter.has(region.toLowerCase()));
                }
                return true;
            });
        },

        createMarkers: function (data) {
            data.forEach(item => {
                if (item.coordinates && item.coordinates.length > 0) {
                    item.coordinates.forEach(coord => {
                        let marker = L.circleMarker([coord[1] + 0.5, coord[0] + 0.5], {
                            radius: 8,
                            fillColor: '#cc0000',
                            color: '#660000',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.85
                        });
                        let popupContent = `<div class="osrs-popup-inner">`;
                        popupContent += `<b><a href="https://oldschool.runescape.wiki/w/${item.page_name.replace(/ /g, '_')}" target="_blank">${item.page_name}</a></b> <span class="popup-ground-spawn">(Ground spawn)</span><br>`;
                        if (item.leagueregion && item.leagueregion.length > 0) {
                            popupContent += `<span class="popup-region">Regions: ${item.leagueregion.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</span><br>`;
                        }
                        popupContent += `<span class="popup-coords">x = ${coord[0]}, y = ${coord[1]}</span><br></div>`;
                        marker.bindPopup(popupContent, { autoPan: false, className: 'osrs-popup' });
                        this.addLayer(marker);
                    });
                }
            });
        },

        onRemove: function (map) {
            this.clearLayers();
            L.LayerGroup.prototype.onRemove.call(this, map);
        }
    });

    L.itemSpawns = function (options) {
        return new L.ItemSpawns(options);
    };

    // ── Display controls ──────────────────────────────────────
    L.Control.Display = L.Control.extend({
            onAdd: function (map) {
                this._map = map;
                this._container = L.DomUtil.create('div', "leaflet-control-layers leaflet-control-display");

                this.collapsed = this.createIcon(this.options.icon);
                L.DomEvent.on(this.collapsed, {
                    click: this.expand,

                }, this);
                this._container.appendChild(this.collapsed);
                this._container.title = this.options.title;
                L.DomEvent.disableClickPropagation(this._container);

                let closeIcon = L.DomUtil.create('a', "leaflet-control-display-icon-close");
                L.DomEvent.on(closeIcon, {
                    click: this.collapse,

                }, this);
                L.DomEvent.disableClickPropagation(closeIcon);

                let expandedContent = this.createInterface();
                let expandedContentContainer = L.DomUtil.create('div', 'leaflet-control-display-container-expanded');
                expandedContentContainer.appendChild(expandedContent)

                this.expanded = L.DomUtil.create('div', "leaflet-control-display");
                this.expanded.appendChild(closeIcon);
                this.expanded.appendChild(expandedContentContainer);

                // Auto-expand if option is set
                if (this.options.expand) {
                    this._container.innerHTML = '';
                    this._container.append(this.expanded);
                }

                return this._container;
            },

            // @method expand(): this
            // Expand the control container if collapsed.
            expand: function () {
                this._container.innerHTML = '';
                this._container.append(this.expanded);
                return this;
            },

            // @method collapse(): this
            // Collapse the control container.
            collapse: function () {
                this._container.innerHTML = '';
                this._container.append(this.collapsed);
                return this;
            },

            expanded: undefined,

            // @method createInterface
            // Reimplement .createInterface to set content for the expanded interface;
            // return a HTML Element
            createInterface: function () {
                return L.DomUtil.create('div');
            },

            collapsed: undefined,

            createIcon: function (icon) {
                let container = L.DomUtil.create('div', "leaflet-control-display-collapsed");
                let img = L.DomUtil.create('img', "leaflet-control-display-icon");
                img.src = icon;
                container.append(img);
                return container;
            },

            onRemove: function (map) {
                // Nothing to do here
            },

            setSearchParams: function (parameters) {
                let url = new URL(window.location.href);
                let params = url.searchParams;

                for (let[key, value]of Object.entries(parameters)) {
                    if (value || value === 0) {
                        params.set(key, value);
                    } else {
                        params.delete(key);
                    }
                }
                url.search = params;
                history.replaceState(0, "Location", url);
            },
        });

    L.control.display = function (options) {
        return new L.Control.Display(options);
    }

    L.Control.Display.Objects = L.Control.Display.extend({
            options: {
                expand: true,
                position: 'bottomleft',
                title: 'Display objects',
                icon: 'images/objects.png',
            },

            onAdd: function (map) {
                return L.Control.Display.prototype.onAdd.call(this, map);
            },
            createInterface: function () {
                let parsedUrl = new URL(window.location.href);
                let objectName = parsedUrl.searchParams.get('object') || '';

                let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');

                let objectForm = L.DomUtil.create('div', 'leaflet-control-display-form', container);

                let nameDescription = L.DomUtil.create('label', 'leaflet-control-display-label', objectForm);
                nameDescription.innerHTML = "Object Name";
                let nameInput = L.DomUtil.create('input', 'leaflet-control-display-input', objectForm);
                nameInput.setAttribute('name', 'name');
                nameInput.setAttribute('value', objectName);
                nameInput.setAttribute('autocomplete', 'off');
                nameInput.setAttribute('placeholder', 'Search for object...');

                // Search on input change
                nameInput.addEventListener('input', (e) => {
                    let name = e.target.value.trim();
                    if (name) {
                        this.invokeObjectmap(name);
                    } else {
                        // Clear pins when search box is empty
                        if (this._objectmap) {
                            this._objectmap.remove();
                            this._objectmap = undefined;
                        }
                    }
                });

                // Set up region change listener
                if (this.options.regionControl) {
                    this.options.regionControl.onRegionChange(() => {
                        let currentName = nameInput.value.trim();
                        if (currentName) {
                            this.invokeObjectmap(currentName);
                        }
                    });
                }

                //Instantiate lookup if urlparam data is present
                if (objectName) {
                    this.invokeObjectmap(objectName);
                }

                return container;
            },

            submitData: function (formData) {
                let name = formData.get("name").trim();

                if (name) {
                    this.invokeObjectmap(name);
                }
            },

            _objectmap: undefined,

            invokeObjectmap: function (name) {
                if (this._objectmap) {
                    this._objectmap.remove();
                }

                this.setSearchParams({
                    object: name
                });

                if (name) {
                    let regions = this.options.regionControl ? this.options.regionControl.getEnabledRegions() : [];
                    this._objectmap = L.scenery({
                        name: name,
                        folder: this.options.folder,
                        regions: regions
                    }).addTo(this._map);
                }
            },

        });

    L.control.display.objects = function (options) {
        return new L.Control.Display.Objects(options);
    }

    L.Control.Display.NPCs = L.Control.Display.extend({
            options: {
                expand: true,
                position: 'bottomleft',
                title: 'Display NPCs',
                icon: 'images/npcs.png',
            },
            onAdd: function (map) {
                return L.Control.Display.prototype.onAdd.call(this, map);
            },

            createInterface: function () {
                let parsedUrl = new URL(window.location.href);
                let npcName = parsedUrl.searchParams.get('npc') || '';

                let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');

                let npcForm = L.DomUtil.create('div', 'leaflet-control-display-form', container);

                let nameDescription = L.DomUtil.create('label', 'leaflet-control-display-label', npcForm);
                nameDescription.innerHTML = "NPC Name";
                let nameInput = L.DomUtil.create('input', 'leaflet-control-display-input', npcForm);
                nameInput.setAttribute('name', 'name');
                nameInput.setAttribute('value', npcName);
                nameInput.setAttribute('autocomplete', 'off');
                nameInput.setAttribute('placeholder', 'Search for NPC...');

                // Search on input change
                nameInput.addEventListener('input', (e) => {
                    let name = e.target.value.trim();
                    if (name) {
                        this.invokeNpcmap(name);
                    } else {
                        // Clear pins when search box is empty
                        if (this._npcmap) {
                            this._npcmap.remove();
                            this._npcmap = undefined;
                        }
                    }
                });

                // Set up region change listener
                if (this.options.regionControl) {
                    this.options.regionControl.onRegionChange(() => {
                        let currentName = nameInput.value.trim();
                        if (currentName) {
                            this.invokeNpcmap(currentName);
                        }
                    });
                }

                //Instantiate lookup if urlparam data is present
                if (npcName) {
                    this.invokeNpcmap(npcName);
                }

                return container;
            },

            submitData: function (formData) {
                let name = formData.get("name").trim();

                if (name) {
                    this.invokeNpcmap(name);
                }
            },

            _npcmap: undefined,

            invokeNpcmap: function (name) {
                if (this._npcmap) {
                    this._npcmap.remove();
                }

                this.setSearchParams({
                    npc: name
                });

                if (name) {
                    let regions = this.options.regionControl ? this.options.regionControl.getEnabledRegions() : [];
                    this._npcmap = L.npcs({
                        name: name,
                        folder: this.options.folder,
                        regions: regions
                    }).addTo(this._map);
                }
            },

        });

    L.control.display.npcs = function (options) {
        return new L.Control.Display.NPCs(options);
    }

    L.Control.Display.Items = L.Control.Display.extend({
            options: {
                position: 'bottomleft',
                title: 'Display objects',
                icon: 'images/items.png',
            },

            onAdd: function (map) {
                return L.Control.Display.prototype.onAdd.call(this, map);
            },
        });

    L.control.display.items = function (options) {
        return new L.Control.Display.Items(options);
    }
	

    L.Control.RegionFilter = L.Control.extend({
        options: {
            position: 'topleft',
        },

        onAdd: function (map) {
            this._map = map;
            let container = L.DomUtil.create('div', 'leaflet-control-region-filter leaflet-control');

            let regions = [
                { name: 'Asgarnia', icon: 'images/region_badges/Asgarnia_Area_Badge.png' },
                { name: 'Desert', icon: 'images/region_badges/Desert_Area_Badge.png' },
                { name: 'Fremennik', icon: 'images/region_badges/Fremennik_Area_Badge.png' },
                { name: 'Kandarin', icon: 'images/region_badges/Kandarin_Area_Badge.png' },
                { name: 'Karamja', icon: 'images/region_badges/Karamja_Area_Badge.png' },
                { name: 'Kourend', icon: 'images/region_badges/Kourend_Area_Badge.png' },
                { name: 'Misthalin', icon: 'images/region_badges/Misthalin_Area_Badge.png' },
                { name: 'Morytania', icon: 'images/region_badges/Morytania_Area_Badge.png' },
                { name: 'Tirannwn', icon: 'images/region_badges/Tirannwn_Area_Badge.png' },
                { name: 'Varlamore', icon: 'images/region_badges/Varlamore_Area_Badge.png' },
                { name: 'Wilderness', icon: 'images/region_badges/Wilderness_Area_Badge.png' },
            ];

            // Load enabled regions from localStorage or default to Varlamore only
            try {
                let savedRegions = localStorage.getItem('storeline_enabled_regions');
                if (savedRegions) {
                    this._enabledRegions = new Set(JSON.parse(savedRegions));
                } else {
                    this._enabledRegions = new Set(['Varlamore']);
                }
            } catch (e) {
                this._enabledRegions = new Set(['Varlamore']);
            }

            this._buttons = {};
            this._callbacks = [];

            let buttonContainer = L.DomUtil.create('div', 'leaflet-control-region-buttons', container);
            regions.forEach(region => {
                let button = L.DomUtil.create('button', 'leaflet-control-region-button', buttonContainer);
                button.setAttribute('type', 'button');
                button.setAttribute('title', region.name);
                button.setAttribute('data-region', region.name);

                // Apply saved state
                if (!this._enabledRegions.has(region.name)) {
                    button.classList.add('is-disabled');
                }

                if (region.icon) {
                    let icon = L.DomUtil.create('img', 'leaflet-control-region-icon', button);
                    icon.src = region.icon;
                    icon.alt = region.name;
                    icon.onerror = () => {
                        icon.remove();
                        button.textContent = region.name;
                        button.classList.add('leaflet-control-region-button-text');
                    };
                } else {
                    button.textContent = region.name;
                    button.classList.add('leaflet-control-region-button-text');
                }

                this._buttons[region.name] = button;

                button.addEventListener('click', () => {
                    if (this._enabledRegions.has(region.name)) {
                        this._enabledRegions.delete(region.name);
                        button.classList.add('is-disabled');
                    } else {
                        this._enabledRegions.add(region.name);
                        button.classList.remove('is-disabled');
                    }

                    // Save to localStorage
                    try { localStorage.setItem('storeline_enabled_regions', JSON.stringify(Array.from(this._enabledRegions))); } catch (e) { /* storage unavailable */ }

                    // Notify callbacks
                    this._callbacks.forEach(callback => callback(Array.from(this._enabledRegions)));
                });
            });

            L.DomEvent.disableClickPropagation(container);
            return container;
        },

        getEnabledRegions: function () {
            return Array.from(this._enabledRegions);
        },

        onRegionChange: function (callback) {
            this._callbacks.push(callback);
        }
    });

    L.control.regionFilter = function (options) {
        return new L.Control.RegionFilter(options);
    }

    L.Control.Display.Storeline = L.Control.Display.extend({
            options: {
                expand: true,
                position: 'bottomleft',
                title: 'Display stores',
                icon: 'images/General_store_icon.png',
            },

            onAdd: function (map) {
                return L.Control.Display.prototype.onAdd.call(this, map);
            },

            createInterface: function () {
                let parsedUrl = new URL(window.location.href);
                let storeName = parsedUrl.searchParams.get('store') || '';

                let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');

                // Store reference to region control
                this._regionControl = this.options.regionControl;
                this._itemListContainer = null;

                let storeForm = L.DomUtil.create('div', 'leaflet-control-display-form', container);

                let nameDescription = L.DomUtil.create('label', 'leaflet-control-display-label', storeForm);
                nameDescription.innerHTML = "Item Name";
                let nameInput = L.DomUtil.create('input', 'leaflet-control-display-input', storeForm);
                nameInput.setAttribute('name', 'name');
                nameInput.setAttribute('value', storeName);
                nameInput.setAttribute('autocomplete', 'off');
                nameInput.setAttribute('placeholder', 'Search for item...');

                // Search on input change
                nameInput.addEventListener('input', (e) => {
                    let name = e.target.value.trim();
                    if (name) {
                        this.invokeStoremap(name);
                    } else {
                        // Clear pins when search box is empty
                        if (this._storemap) {
                            this._storemap.remove();
                            this._storemap = undefined;
                        }
                        // Clear item list
                        if (this._itemListContainer) {
                            this._itemListContainer.innerHTML = '';
                        }
                    }
                });

                // Set up region change listener
                if (this._regionControl) {
                    this._regionControl.onRegionChange(() => {
                        let currentName = nameInput.value.trim();
                        if (currentName) {
                            this.invokeStoremap(currentName);
                        }
                    });
                }

                // Create item list container
                this._itemListContainer = L.DomUtil.create('div', 'leaflet-control-display-item-list', container);

                //Instantiate lookup if urlparam data is present
                if (storeName) {
                    this.invokeStoremap(storeName);
                }

                return container;
            },

            populateItemList: function (items, itemMap) {
                if (!this._itemListContainer) return;
                
                this._itemListContainer.innerHTML = '';
                
                if (items.length === 0) {
                    this._itemListContainer.innerHTML = '<div style="padding: 0.7em; text-align: center; color: #666;">No items found</div>';
                    return;
                }
                
                let listTitle = L.DomUtil.create('div', 'leaflet-control-display-item-list-title', this._itemListContainer);
                listTitle.innerHTML = `<b>Items (${items.length})</b>`;
                
                let listContent = L.DomUtil.create('div', 'leaflet-control-display-item-list-content', this._itemListContainer);
                
                items.forEach(itemName => {
                    let listItem = L.DomUtil.create('div', 'leaflet-control-display-item-list-item', listContent);
                    listItem.style.cssText = 'background-color: #1e1500; color: #e8d5a0;';
                    listItem.innerHTML = itemName;
                    listItem.setAttribute('data-item', itemName);
                    
                    listItem.addEventListener('click', () => {
                        // Remove previous selection
                        let prevSelected = listContent.querySelector('.is-selected');
                        if (prevSelected) {
                            prevSelected.classList.remove('is-selected');
                        }
                        
                        // Add selection
                        listItem.classList.add('is-selected');
                        
                        // Update storeline highlighting
                        if (this._storemap && this._storemap.setSelectedItem) {
                            this._storemap.setSelectedItem(itemName);
                        }
                        
                        // Center map on first location with this item
                        if (itemMap && itemMap.has(itemName)) {
                            let storeItems = itemMap.get(itemName);
                            if (storeItems.length > 0) {
                                let firstItem = storeItems[0];
                                if (firstItem.position) {
                                    this._map.setView([firstItem.position.y + 0.5, firstItem.position.x + 0.5], .5);
                                }
                            }
                        }
                    });
                });
            },

            submitData: function (formData) {
                let name = formData.get("name").trim();

                if (name) {
                    this.invokeStoremap(name);
                }
            },

            _storemap: undefined,

            invokeStoremap: function (name) {
                if (this._storemap) {
                    this._storemap.remove();
                }

                this.setSearchParams({
                    store: name
                });

                if (name && this._regionControl) {
                    this._storemap = L.storeline({
                        name: name,
                        folder: this.options.folder,
                        regions: this._regionControl.getEnabledRegions(),
                        onItemsLoaded: (items, itemMap) => {
                            this.populateItemList(items, itemMap);
                        }
                    }).addTo(this._map);
                }
            },
        });

    L.control.display.storeline = function (options) {
        return new L.Control.Display.Storeline(options);
    }

    // Unified Search Control combining Objects, NPCs, and Storeline
    L.Control.Display.UnifiedSearch = L.Control.Display.extend({
            options: {
                expand: true,
                position: 'bottomleft',
                title: 'Search',
                icon: 'images/objects.png',
            },

            onAdd: function (map) {
                return L.Control.Display.prototype.onAdd.call(this, map);
            },

            createInterface: function () {
                let parsedUrl = new URL(window.location.href);
                let searchTerm = parsedUrl.searchParams.get('search') || '';

                let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');

                let searchForm = L.DomUtil.create('div', 'leaflet-control-display-form', container);

                // Search input
                let nameDescription = L.DomUtil.create('label', 'leaflet-control-display-label', searchForm);
                nameDescription.innerHTML = "Search";
                let nameInput = L.DomUtil.create('input', 'leaflet-control-display-input', searchForm);
                nameInput.setAttribute('name', 'search');
                nameInput.setAttribute('value', searchTerm);
                nameInput.setAttribute('autocomplete', 'off');
                nameInput.setAttribute('placeholder', 'Search for items, NPCs, or objects...');

                // Checkboxes + mejrs link row
                let checkboxRow = L.DomUtil.create('div', 'leaflet-control-display-checkboxes', searchForm);
                checkboxRow.style.cssText = 'display: flex; gap: 10px; margin-top: 10px; align-items: flex-start; justify-content: space-between;';

                // Left column: checkboxes
                let checkboxContainer = L.DomUtil.create('div', '', checkboxRow);
                checkboxContainer.style.cssText = 'display: flex; gap: 15px; flex-wrap: wrap; align-items: center;';

                // Shops/Items checkbox
                let shopsCheckbox = this.createCheckbox('shops', 'Shops items', true);
                checkboxContainer.appendChild(shopsCheckbox.container);

                // NPCs checkbox
                let npcsCheckbox = this.createCheckbox('npcs', 'NPCs', true);
                checkboxContainer.appendChild(npcsCheckbox.container);

                // Objects checkbox
                let objectsCheckbox = this.createCheckbox('objects', 'Objects', true);
                checkboxContainer.appendChild(objectsCheckbox.container);

                // Strict filter checkbox
                let strictCheckbox = this.createCheckbox('strict', 'Strict search', false);
                checkboxContainer.appendChild(strictCheckbox.container);

                // Right column: external link buttons
                let mejrsCol = L.DomUtil.create('div', '', checkboxRow);
                mejrsCol.style.cssText = 'display: flex; align-items: center; flex-shrink: 0; gap: 5px;';

                const btnStyle = 'display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 11px; white-space: nowrap; cursor: pointer; text-decoration: none; border-radius: 3px;';

                let mejrsBtn = L.DomUtil.create('a', 'leaflet-control-display-mejrs-btn', mejrsCol);
                mejrsBtn.setAttribute('target', '_blank');
                mejrsBtn.setAttribute('rel', 'noopener');
                mejrsBtn.setAttribute('title', 'View on mejrs.github.io');
                mejrsBtn.innerHTML = 'View on mejrs ↗';
                mejrsBtn.style.cssText = btnStyle;

                let wikiBtn = L.DomUtil.create('a', 'leaflet-control-display-wiki-btn', mejrsCol);
                wikiBtn.setAttribute('target', '_blank');
                wikiBtn.setAttribute('rel', 'noopener');
                wikiBtn.setAttribute('title', 'View on OSRS Wiki');
                wikiBtn.style.cssText = btnStyle;
                wikiBtn.innerHTML = '<img src="https://oldschool.runescape.wiki/images/Favicon.ico" style="width:12px;height:12px;vertical-align:middle;"> Wiki ↗';

                const updateExternalLinks = () => {
                    let term = nameInput.value.trim();
                    let center = this._map.getCenter();
                    let x = Math.floor(center.lng);
                    let y = Math.floor(center.lat);
                    let z = this._map.getZoom();
                    let p = this._map._plane || 0;
                    mejrsBtn.href = `https://mejrs.github.io/osrs.html?object=${encodeURIComponent(term)}&m=-1&z=${z}&p=${p}&x=${x}&y=${y}`;
                    wikiBtn.href = `https://oldschool.runescape.wiki/w/${encodeURIComponent(term.replace(/ /g, '_'))}`;
                };

                updateExternalLinks();
                nameInput.addEventListener('input', updateExternalLinks);
                this._map.on('move zoom', updateExternalLinks);
                this._map.on('planechange', updateExternalLinks);

                // Store references
                this._checkboxes = {
                    shops: shopsCheckbox.input,
                    npcs: npcsCheckbox.input,
                    objects: objectsCheckbox.input,
                    strict: strictCheckbox.input
                };
                this._searchInput = nameInput;
                this._regionControl = this.options.regionControl;
                this._itemListContainer = null;

                // Search on input change
                nameInput.addEventListener('input', (e) => {
                    let term = e.target.value.trim();
                    if (term.length >= 3) {
                        this.performSearch(term);
                    } else {
                        this.clearSearch();
                    }
                });

                // Search on checkbox change
                [shopsCheckbox.input, npcsCheckbox.input, objectsCheckbox.input, strictCheckbox.input].forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        let term = nameInput.value.trim();
                        if (term.length >= 3) {
                            this.performSearch(term);
                        }
                    });
                });

                // Set up region change listener
                if (this._regionControl) {
                    this._regionControl.onRegionChange(() => {
                        let currentTerm = nameInput.value.trim();
                        if (currentTerm.length >= 3) {
                            this.performSearch(currentTerm);
                        }
                    });
                }

                // Create list containers for all three search types
                this._listContainer = L.DomUtil.create('div', 'leaflet-control-display-results', container);
                this._listContainer.style.cssText = 'display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;';
                
                this._itemListContainer = L.DomUtil.create('div', 'leaflet-control-display-item-list', this._listContainer);
                this._npcListContainer = L.DomUtil.create('div', 'leaflet-control-display-item-list', this._listContainer);
                this._objectListContainer = L.DomUtil.create('div', 'leaflet-control-display-item-list', this._listContainer);
                
                // Initialize lists with placeholder content
                this.initializeEmptyList(this._itemListContainer, 'Shops/Items', true);
                this.initializeEmptyList(this._npcListContainer, 'NPCs', true);
                this.initializeEmptyList(this._objectListContainer, 'Objects', true);

                // Instantiate search if urlparam data is present
                if (searchTerm) {
                    this.performSearch(searchTerm);
                }

                return container;
            },

            createCheckbox: function (id, label, checked) {
                let container = L.DomUtil.create('div', 'leaflet-control-display-checkbox-group');
                container.style.cssText = 'display: flex; align-items: center; gap: 5px;';

                let input = L.DomUtil.create('input', '', container);
                input.setAttribute('type', 'checkbox');
                input.setAttribute('id', 'search-' + id);
                input.checked = checked;

                let labelElement = L.DomUtil.create('label', '', container);
                labelElement.setAttribute('for', 'search-' + id);
                labelElement.innerHTML = label;
                labelElement.style.cursor = 'pointer';
                labelElement.style.userSelect = 'none';

                return { container: container, input: input };
            },

            _objectmaps: [],
            _npcmaps: [],
            _storemaps: [],
            _spawnmaps: [],

            // Programmatically trigger a search from external code (e.g. task panel).
            // Sets the search input value, optionally enables strict mode, then runs the search.
            triggerSearch: function (term, strict) {
                if (!this._searchInput) return;
                if (strict !== undefined && this._checkboxes) {
                    this._checkboxes.strict.checked = !!strict;
                }
                this._searchInput.value = term;
                // Fire an input event so internal listeners update state
                this._searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            },

            performSearch: function (term) {
                // Split on commas, but not commas inside parentheses
                const splitTerms = [];
                let depth = 0, current = '';
                for (const ch of term) {
                    if (ch === '(') { depth++; current += ch; }
                    else if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; }
                    else if (ch === ',' && depth === 0) { splitTerms.push(current); current = ''; }
                    else { current += ch; }
                }
                if (current) splitTerms.push(current);
                const terms = splitTerms.map(t => t.trim()).filter(t => t.length >= 3);
                if (terms.length === 0) return;
                const n = terms.length;
                let regions = this._regionControl ? this._regionControl.getEnabledRegions() : [];
                const strict = this._checkboxes.strict.checked;

                this.setSearchParams({ search: term });

                // Helper to remove all layers in an array
                const clearLayers = arr => { arr.forEach(l => l.remove()); arr.length = 0; };

                // Objects search
                clearLayers(this._objectmaps);
                if (this._checkboxes.objects.checked) {
                    let pending = n;
                    let allLocations = [];
                    terms.forEach(t => {
                        this._objectmaps.push(L.scenery({
                            name: t,
                            folder: this.options.folder,
                            regions: regions,
                            strict: strict,
                            onObjectsLoaded: (objects, data) => {
                                allLocations.push(...data);
                                if (--pending === 0) {
                                    const names = [...new Set(allLocations.map(o => o.page_name))].sort();
                                    this.populateObjectList(names, allLocations);
                                }
                            }
                        }).addTo(this._map));
                    });
                } else {
                    this.initializeEmptyList(this._objectListContainer, 'Objects', false);
                }

                // NPCs search
                clearLayers(this._npcmaps);
                if (this._checkboxes.npcs.checked) {
                    let pending = n;
                    let allLocations = [];
                    terms.forEach(t => {
                        this._npcmaps.push(L.npcs({
                            name: t,
                            folder: this.options.folder,
                            regions: regions,
                            strict: strict,
                            onNPCsLoaded: (npcs, data) => {
                                allLocations.push(...data);
                                if (--pending === 0) {
                                    const names = [...new Set(allLocations.map(o => o.page_name))].sort();
                                    this.populateNPCList(names, allLocations);
                                }
                            }
                        }).addTo(this._map));
                    });
                } else {
                    this.initializeEmptyList(this._npcListContainer, 'NPCs', false);
                }

                // Shops + ground spawns search
                clearLayers(this._storemaps);
                clearLayers(this._spawnmaps);
                if (this._checkboxes.shops.checked) {
                    // Set up two subsections inside the shared item list container
                    this._itemListContainer.innerHTML = '';
                    this._shopSubContainer = L.DomUtil.create('div', '', this._itemListContainer);
                    this._spawnSubContainer = L.DomUtil.create('div', '', this._itemListContainer);
                    this.initializeEmptyList(this._shopSubContainer, 'Shops', true);
                    this.initializeEmptyList(this._spawnSubContainer, 'Ground Items', true);

                    let shopPending = n;
                    let allShopItems = [];
                    let allShopMap = new Map();
                    terms.forEach(t => {
                        this._storemaps.push(L.storeline({
                            name: t,
                            folder: this.options.folder,
                            regions: regions,
                            strict: strict,
                            onItemsLoaded: (items, itemMap) => {
                                items.forEach(name => {
                                    if (!allShopMap.has(name)) { allShopItems.push(name); allShopMap.set(name, []); }
                                    itemMap.get(name).forEach(loc => allShopMap.get(name).push(loc));
                                });
                                if (--shopPending === 0) this.populateItemList(allShopItems, allShopMap);
                            }
                        }).addTo(this._map));
                    });

                    let spawnPending = n;
                    let allSpawnData = [];
                    terms.forEach(t => {
                        this._spawnmaps.push(L.itemSpawns({
                            name: t,
                            folder: this.options.folder,
                            regions: regions,
                            strict: strict,
                            onSpawnsLoaded: (data) => {
                                allSpawnData.push(...data);
                                if (--spawnPending === 0) this.populateSpawnList(allSpawnData);
                            }
                        }).addTo(this._map));
                    });
                } else {
                    this._shopSubContainer = undefined;
                    this._spawnSubContainer = undefined;
                    this.initializeEmptyList(this._itemListContainer, 'Shops/Items', false);
                }
            },

            clearSearch: function () {
                const clearLayers = arr => { arr.forEach(l => l.remove()); arr.length = 0; };
                clearLayers(this._objectmaps);
                clearLayers(this._npcmaps);
                clearLayers(this._storemaps);
                clearLayers(this._spawnmaps);
                this._shopSubContainer = undefined;
                this._spawnSubContainer = undefined;
                // Reset location indices
                this._itemLocationIndices = {};
                this._npcLocationIndices = {};
                this._objectLocationIndices = {};
                this._spawnLocationIndices = {};

                this.initializeEmptyList(this._itemListContainer, 'Shops/Items', true);
                this.initializeEmptyList(this._npcListContainer, 'NPCs', true);
                this.initializeEmptyList(this._objectListContainer, 'Objects', true);
            },

            initializeEmptyList: function (container, label, enabled) {
                if (!container) return;
                
                container.innerHTML = '';
                
                let listTitle = L.DomUtil.create('div', 'leaflet-control-display-item-list-title', container);
                listTitle.innerHTML = `<b>${label} (0)</b>`;
                
                let listContent = L.DomUtil.create('div', 'leaflet-control-display-item-list-content', container);
                listContent.style.cssText = 'max-height: 300px; overflow-y: auto; padding: 0.7em; text-align: center; background-color: #1e1500; color: #7a6a40;';
                
                if (enabled) {
                    listContent.innerHTML = 'Enter search term...';
                } else {
                    listContent.innerHTML = 'Disabled';
                }
            },

            populateItemList: function (items, itemMap) {
                let container = this._shopSubContainer || this._itemListContainer;
                if (!container) return;

                container.innerHTML = '';
                this._itemLocationIndices = {};

                let listTitle = L.DomUtil.create('div', 'leaflet-control-display-item-list-title', container);
                listTitle.innerHTML = `<b>Shops (${items.length})</b>`;

                let listContent = L.DomUtil.create('div', 'leaflet-control-display-item-list-content', container);
                listContent.style.cssText = 'max-height: 300px; overflow-y: auto; background-color: #1e1500;';

                if (items.length === 0) {
                    listContent.style.cssText += ' padding: 0.7em; text-align: center; color: #7a6a40;';
                    listContent.innerHTML = 'No results';
                    return;
                }

                items.forEach(itemName => {
                    let storeLocations = itemMap.has(itemName) ? itemMap.get(itemName) : [];
                    let locationCount = storeLocations.length;

                    let listItem = L.DomUtil.create('div', 'leaflet-control-display-item-list-item', listContent);
                    listItem.style.cssText = 'background-color: #1e1500; color: #e8d5a0;';
                    listItem.innerHTML = `${itemName} (${locationCount})`;
                    listItem.setAttribute('data-item', itemName);

                    this._itemLocationIndices[itemName] = 0;

                    listItem.addEventListener('click', () => {
                        let prevSelected = listContent.querySelector('.is-selected');
                        if (prevSelected && prevSelected !== listItem) prevSelected.classList.remove('is-selected');
                        listItem.classList.add('is-selected');

                        if (this._storemap && this._storemap.setSelectedItem) {
                            this._storemap.setSelectedItem(itemName);
                        }

                        if (storeLocations.length > 0) {
                            let currentIndex = this._itemLocationIndices[itemName];
                            let location = storeLocations[currentIndex];
                            if (location.position) {
                                this._map.setView([location.position.y + 0.5, location.position.x + 0.5], .5);
                            }
                            this._itemLocationIndices[itemName] = (currentIndex + 1) % storeLocations.length;
                        }
                    });
                });
            },

            populateSpawnList: function (data) {
                let container = this._spawnSubContainer;
                if (!container) return;

                container.innerHTML = '';
                this._spawnLocationIndices = {};

                // Group by page_name
                let spawnMap = new Map();
                data.forEach(item => {
                    if (!spawnMap.has(item.page_name)) spawnMap.set(item.page_name, []);
                    item.coordinates.forEach(coord => spawnMap.get(item.page_name).push({ x: coord[0], y: coord[1] }));
                });

                let totalSpots = data.reduce((sum, item) => sum + item.coordinates.length, 0);

                let listTitle = L.DomUtil.create('div', 'leaflet-control-display-item-list-title', container);
                listTitle.innerHTML = `<b>Ground Items (${totalSpots})</b>`;

                let listContent = L.DomUtil.create('div', 'leaflet-control-display-item-list-content', container);
                listContent.style.cssText = 'max-height: 300px; overflow-y: auto; background-color: #1e1500;';

                if (spawnMap.size === 0) {
                    listContent.style.cssText += ' padding: 0.7em; text-align: center; color: #7a6a40;';
                    listContent.innerHTML = 'No results';
                    return;
                }

                [...spawnMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, coords]) => {
                    let listItem = L.DomUtil.create('div', 'leaflet-control-display-item-list-item', listContent);
                    listItem.style.cssText = 'background-color: #1e1500; color: #e8d5a0;';
                    listItem.innerHTML = `${name} (${coords.length}) <span style="color:#cc0000; font-size:10px;">&#9679;</span>`;
                    listItem.setAttribute('data-item', name);

                    this._spawnLocationIndices[name] = 0;

                    listItem.addEventListener('click', () => {
                        let prevSelected = listContent.querySelector('.is-selected');
                        if (prevSelected && prevSelected !== listItem) prevSelected.classList.remove('is-selected');
                        listItem.classList.add('is-selected');

                        if (coords.length > 0) {
                            let idx = this._spawnLocationIndices[name];
                            let pos = coords[idx];
                            this._map.setView([pos.y + 0.5, pos.x + 0.5], 0.5);
                            this._spawnLocationIndices[name] = (idx + 1) % coords.length;
                        }
                    });
                });
            },

            populateNPCList: function (npcs, data) {
                if (!this._npcListContainer) return;
                
                this._npcListContainer.innerHTML = '';
                this._npcLocationIndices = {};
                
                // Count total entries (not unique names)
                let totalEntries = data.length;
                
                let listTitle = L.DomUtil.create('div', 'leaflet-control-display-item-list-title', this._npcListContainer);
                listTitle.innerHTML = `<b>NPCs (${totalEntries})</b>`;
                
                let listContent = L.DomUtil.create('div', 'leaflet-control-display-item-list-content', this._npcListContainer);
                listContent.style.cssText = 'max-height: 300px; overflow-y: auto; background-color: #1e1500;';
                
                if (totalEntries === 0) {
                    listContent.style.cssText += ' padding: 0.7em; text-align: center; color: #7a6a40;';
                    listContent.innerHTML = 'No results';
                    return;
                }
                
                // Show each entry separately
                data.forEach((npc, index) => {
                    let coordinates = npc.coordinates || [];
                    let locationCount = coordinates.length;
                    
                    let listItem = L.DomUtil.create('div', 'leaflet-control-display-item-list-item', listContent);
                    listItem.style.cssText = 'background-color: #1e1500; color: #e8d5a0;';
                    listItem.innerHTML = `${npc.page_name} (${locationCount})`;
                    
                    // Use unique key based on index
                    let itemKey = `npc_${index}`;
                    this._npcLocationIndices[itemKey] = 0;
                    
                    listItem.addEventListener('click', () => {
                        // Remove previous selection
                        let prevSelected = listContent.querySelector('.is-selected');
                        if (prevSelected && prevSelected !== listItem) {
                            prevSelected.classList.remove('is-selected');
                        }
                        
                        // Add selection
                        listItem.classList.add('is-selected');
                        
                        // Cycle through locations
                        if (coordinates.length > 0) {
                            let currentIndex = this._npcLocationIndices[itemKey];
                            let coord = coordinates[currentIndex];
                            this._map.setView([coord[1] + 0.5, coord[0] + 0.5], .5);
                            
                            // Increment and wrap around
                            this._npcLocationIndices[itemKey] = (currentIndex + 1) % coordinates.length;
                        }
                    });
                });
            },

            populateObjectList: function (objects, data) {
                if (!this._objectListContainer) return;
                
                this._objectListContainer.innerHTML = '';
                this._objectLocationIndices = {};
                
                // Count total entries (not unique names)
                let totalEntries = data.length;
                
                let listTitle = L.DomUtil.create('div', 'leaflet-control-display-item-list-title', this._objectListContainer);
                listTitle.innerHTML = `<b>Objects (${totalEntries})</b>`;
                
                let listContent = L.DomUtil.create('div', 'leaflet-control-display-item-list-content', this._objectListContainer);
                listContent.style.cssText = 'max-height: 300px; overflow-y: auto; background-color: #1e1500;';
                
                if (totalEntries === 0) {
                    listContent.style.cssText += ' padding: 0.7em; text-align: center; color: #7a6a40;';
                    listContent.innerHTML = 'No results';
                    return;
                }
                
                // Show each entry separately
                data.forEach((obj, index) => {
                    let coordinates = obj.coordinates || [];
                    let locationCount = coordinates.length;
                    
                    let listItem = L.DomUtil.create('div', 'leaflet-control-display-item-list-item', listContent);
                    listItem.style.cssText = 'background-color: #1e1500; color: #e8d5a0;';
                    listItem.innerHTML = `${obj.page_name} (${locationCount})`;
                    
                    // Use unique key based on index
                    let itemKey = `obj_${index}`;
                    this._objectLocationIndices[itemKey] = 0;
                    
                    listItem.addEventListener('click', () => {
                        // Remove previous selection
                        let prevSelected = listContent.querySelector('.is-selected');
                        if (prevSelected && prevSelected !== listItem) {
                            prevSelected.classList.remove('is-selected');
                        }
                        
                        // Add selection
                        listItem.classList.add('is-selected');
                        
                        // Cycle through locations
                        if (coordinates.length > 0) {
                            let currentIndex = this._objectLocationIndices[itemKey];
                            let coord = coordinates[currentIndex];
                            this._map.setView([coord[1] + 0.5, coord[0] + 0.5], .5);
                            
                            // Increment and wrap around
                            this._objectLocationIndices[itemKey] = (currentIndex + 1) % coordinates.length;
                        }
                    });
                });
            },
        });

    L.control.display.unifiedSearch = function (options) {
        return new L.Control.Display.UnifiedSearch(options);
    }

    // ── All Shops toggle button ───────────────────────────────────
    L.Control.AllShopsToggle = L.Control.extend({
        options: {
            position: 'bottomleft',
            folder: 'data_osrs',
            title: 'Toggle all shop locations',
        },

        onAdd: function (map) {
            this._map = map;
            this._active = false;
            this._layer = null;

            let container = L.DomUtil.create('div', 'leaflet-control-allshops leaflet-bar');
            let btn = L.DomUtil.create('a', 'leaflet-control-allshops-btn', container);
            btn.href = '#';
            btn.title = this.options.title;
            btn.setAttribute('role', 'button');
            btn.setAttribute('aria-label', this.options.title);

            let img = L.DomUtil.create('img', 'leaflet-control-allshops-icon', btn);
            img.src = 'images/General_store_icon.png';
            img.alt = 'Shops';
            img.style.cssText = 'width: 20px; height: 20px; display: block; image-rendering: pixelated;';
            img.onerror = () => { img.remove(); btn.textContent = '🏪'; };

            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.preventDefault(e);
                this.toggle();
            });
            L.DomEvent.disableClickPropagation(container);

            if (this.options.regionControl) {
                this.options.regionControl.onRegionChange(() => {
                    if (this._active) this._loadShops();
                });
            }

            this._btn = btn;
            return container;
        },

        toggle: function () {
            if (this._active) {
                this._active = false;
                this._btn.classList.remove('is-active');
                if (this._layer) { this._layer.remove(); this._layer = null; }
            } else {
                this._active = true;
                this._btn.classList.add('is-active');
                this._loadShops();
            }
        },

        _loadShops: function () {
            if (this._layer) { this._layer.remove(); this._layer = null; }
            const regions = this.options.regionControl ? this.options.regionControl.getEnabledRegions() : [];
            this._layer = L.allShops({
                folder: this.options.folder,
                regions: regions
            }).addTo(this._map);
        },

        onRemove: function (map) {
            if (this._layer) { this._layer.remove(); this._layer = null; }
        }
    });

    L.control.allShopsToggle = function (options) {
        return new L.Control.AllShopsToggle(options);
    };


 });
