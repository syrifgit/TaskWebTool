'use strict';

import "../leaflet.js";
import "../layers.js";

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

    L.Objects = L.DynamicIcons.extend({
        onAdd: function (map) {
            this._map = map;
            if (this.options.names || this.options.ids) {

                this.getData(this.options.names, this.options.ids)
                .then(locations => {
                    if (!this._map) return;
                    this._icon_data = this.parseData(locations);
                    this._icons = {};
                    this._resetView();
                    this._update();
                }).catch(console.error);
            } else {
                throw new Error("No objects specified");
            }
        },

        getData: async function (names, ids) {

            if (names && names.length !== 0) {
                let name_mapping_promise = fetch(`${this.options.folder}/object_name_collection.json`).then(res => res.json(), _ => {throw new Error(`Unable to fetch ${this.options.folder}/object_name_collection.json`)});
                let morph_mapping_promise = fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json(),  _ => {throw new Error(`Unable to fetch ${this.options.folder}/object_morph_collection.json`)});
                let[name_mapping, morph_mapping] = await Promise.all([name_mapping_promise, morph_mapping_promise]);

                let ids = names.flatMap(name => name_mapping[name] ?? []);

                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));

                let all_locations = await Promise.allSettled(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`)))
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else if (ids && ids.length !== 0) {
                let morph_mapping = await fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json());
                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));
                let all_locations = await Promise.allSettled(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`)))
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else {
                throw new Error("")
            }
        },

        parseData: function (data) {
            let icon_data = {};

            data.forEach(item => {
                let key = this._tileCoordsToKey({
                    plane: item.plane,
                    x: (item.i),
                    y:  - (item.j)
                });

                if (!(key in icon_data)) {
                    icon_data[key] = [];
                }
                icon_data[key].push(item);
            });

            let reallyLoadEverything = data.length < 10000 ? true : confirm(`Really load ${data.length} markers?`);
            if (reallyLoadEverything) {
                this._map.addMessage(`Found ${data.length} locations of this object.`);
                return icon_data;
            } else {
                return []
            }
        },

        createIcon: function (item) {
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([((item.j << 6) + item.y + 0.5), ((item.i << 6) + item.x + 0.5)], {
                icon: item.plane === this._map.getPlane() ? icon : greyscaleIcon,
            });

            this._map.on('planechange', function (e) {
                marker.setIcon(item.plane === e.newPlane ? icon : greyscaleIcon);
            });
            let textContainer = document.createElement('div');
            let imgContainer = document.createElement('div');
            imgContainer.setAttribute('class', 'object-image-container');
            let container = document.createElement('div');
            container.appendChild(imgContainer);
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false
            });

            let as_text = i => typeof i !== "string" ? JSON.stringify(i) : i;

            marker.once('popupopen', async() => {
                let data = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(res => res.json());
                let textfield = "";
                if (data.name !== undefined) {
                    // put name first
                    textfield += `name = ${data.name}<br>`;
                }
                textfield += `plane = ${item.plane}<br>`;
                textfield += `x = ${(item.i << 6) + item.x}<br>`;
                textfield += `y = ${(item.j << 6) + item.y}<br>`;
                textfield += `id = ${item.id}<br>`;
                textfield += `type = ${item.type}<br>`;
                textfield += `rotation = ${item.rotation}<br>`;

                for (const[key, value]of Object.entries(data)) {
                    if (key !== "name") {
                        textfield += `${key} = ${as_text(value)}<br>`;
                    }
                }

                textContainer.innerHTML = textfield;

            });

            return marker
        },
    });

    L.objects = function (options) {
        return new L.Objects(options);
    }

    L.Objects.OSRS = L.Objects.extend({
		createChiselIcon: function (item) {
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([item.location.y + 0.5, item.location.x + 0.5], {
                icon: item.location.plane === this._map.getPlane() ? icon : greyscaleIcon
            });
			marker.options.icon.options.className = "huechange";
			
			

            this._map.on('planechange', function (e) {
                marker.setIcon(item.location.plane === e.newPlane ? icon : greyscaleIcon);
            });
			let crowdsourcedescription = document.createElement('div');
			crowdsourcedescription.innerHTML = "This object's location was gathered with the Runescape Wiki crowdsource project. See <a href='https://oldschool.runescape.wiki/w/RuneScape:Crowdsourcing#Object_locations'>here</a> for more information.";
            let textContainer = document.createElement('div');
            let imgContainer = document.createElement('div');
            imgContainer.setAttribute('class', 'object-image-container');
            let container = document.createElement('div');
			container.appendChild(crowdsourcedescription);
            container.appendChild(imgContainer);
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false
            });

            let as_text = i => typeof i !== "string" ? JSON.stringify(i) : i;

            marker.once('popupopen', async() => {
                let location_config = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(res => res.json());

                let textfield = "";
                if (location_config.name !== undefined) {
                    // put name first
                    textfield += `name = ${location_config.name}<br>`;
                }
                textfield += `plane = ${item.location.plane}<br>`;
                textfield += `x = ${item.location.x}<br>`;
                textfield += `y = ${item.location.y}<br>`;
				textfield += `label = ${item.label}<br>`;

                for (const[key, value]of Object.entries(location_config)) {
                    if (key !== "name") {
                        textfield += `${key} = ${as_text(value)}<br>`;
                    }
                }

                textContainer.innerHTML = textfield;
                this.createModelTab(item, location_config).then(img => imgContainer.appendChild(img))

            });

            return marker
        },

        createIcon: function (item) {
            if ("location" in item) {
                return this.createChiselIcon(item)
            }
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([((item.j << 6) + item.y + 0.5), ((item.i << 6) + item.x + 0.5)], {
                icon: item.plane === this._map.getPlane() ? icon : greyscaleIcon,
            });

            this._map.on('planechange', function (e) {
                marker.setIcon(item.plane === e.newPlane ? icon : greyscaleIcon);
            });
            let textContainer = document.createElement('div');
            let imgContainer = document.createElement('div');
            imgContainer.setAttribute('class', 'object-image-container');
            let container = document.createElement('div');
            container.appendChild(imgContainer);
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false
            });

            let as_text = i => typeof i !== "string" ? JSON.stringify(i) : i;

            marker.once('popupopen', async() => {
                let location_config = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(res => res.json());

                let textfield = "";
                if (location_config.name !== undefined) {
                    // put name first
                    textfield += `name = ${location_config.name}<br>`;
                }
                textfield += `plane = ${item.plane}<br>`;
                textfield += `x = ${(item.i << 6) + item.x}<br>`;
                textfield += `y = ${(item.j << 6) + item.y}<br>`;
                textfield += `id = ${item.id}<br>`;
                textfield += `type = ${item.type}<br>`;
                textfield += `rotation = ${item.rotation}<br>`;

                for (const[key, value]of Object.entries(location_config)) {
                    if (key !== "name") {
                        textfield += `${key} = ${as_text(value)}<br>`;
                    }
                }

                textContainer.innerHTML = textfield;
                this.createModelTab(item, location_config).then(img => imgContainer.appendChild(img))

            });

            return marker
        },

        getData: async function (names, ids) {

            if (names && names.length !== 0) {
                let name_mapping_promise = fetch(`${this.options.folder}/object_name_collection.json`).then(res => res.json());
                let morph_mapping_promise = fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json());
                let[name_mapping, morph_mapping] = await Promise.all([name_mapping_promise, morph_mapping_promise]);

                let ids = names.flatMap(name => name_mapping[name] ?? []);

                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));

                let all_locations = await Promise.allSettled([...(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`))), ...(all_ids.map(id => fetch(`https://chisel.weirdgloop.org/scenery/server_mapdata?id=${id}`)))])
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else if (ids && ids.length !== 0) {
                let morph_mapping = await fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json());
                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));

                let all_locations = await Promise.allSettled([...(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`))), ...(all_ids.map(id => fetch(`https://chisel.weirdgloop.org/scenery/server_mapdata?id=${id}`)))])
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else {
                throw new Error("")
            }
        },

        parseData: function (data) {
            let icon_data = {};

            data.forEach(item => {
                let key = this._tileCoordsToKey({
                    plane: item.plane ?? item.location.plane,
                    x: (item.i ?? (item.location.x >> 6)),
                    y:  - (item.j ?? (item.location.y >> 6))
                });

                if (!(key in icon_data)) {
                    icon_data[key] = [];
                }
                icon_data[key].push(item);
            });

            let reallyLoadEverything = data.length < 10000 ? true : confirm(`Really load ${data.length} markers?`);
            if (reallyLoadEverything) {
                this._map.addMessage(`Found ${data.length} locations of this object.`);
                return icon_data;
            } else {
                return []
            }
        },

        createModelTab: async function (loc, location_config) {
            function getImage(id) {
                return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
                    if (id === -1) {
                        reject();
                    }
                    let img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => {
						console.warn(`Unable to load https://chisel.weirdgloop.org/static/img/osrs-object/${id}_orient${rotation}.png`);
						reject();
					};
                    let rotation = loc.rotation ?? 0;
                    img.src = `https://chisel.weirdgloop.org/static/img/osrs-object/${id}_orient${rotation}.png`;
                })
            }
            let ids = Array.from(new Set([location_config.id, ...(location_config.morphs ?? []), ...(location_config.morphs_2 ?? [])]));
            ids.sort();

            let imgs = await Promise.allSettled(ids.map(getImage));

            if (imgs.length === 1 && imgs[0].status === 'fulfilled') {
                let img = imgs[0].value
                    img.setAttribute('class', 'object-image');
                return img
            } else if (imgs.some(img => img.status === 'fulfilled')) {
                let tabs = document.createElement('div');
                tabs.setAttribute('class', 'tabs');

                let content = document.createElement('div');
                content.setAttribute('class', 'content');

                imgs.forEach((img_promise, i) => {
                    if (img_promise.status === 'fulfilled' && (img_promise.value.width > 1 || img_promise.value.height > 1)) {
                        if (!(content.innerHTML)) {
                            let img = img_promise.value;
                            img.setAttribute('class', 'object-image');
                            content.appendChild(img);
                        }

                        let button = document.createElement('div');
                        button.innerHTML = ids[i];
                        button.addEventListener('click', () => {
                            content.innerHTML = '';
                            let img = img_promise.value;
                            img.setAttribute('class', 'object-image');
                            content.appendChild(img);
                        });
                        button.setAttribute('class', 'tabbutton');
                        tabs.appendChild(button);
                    }
                });
                let combined = document.createElement('div');
                combined.appendChild(tabs);
                combined.appendChild(content);
                return combined

            } else {
                return document.createElement('div');
            }

        }

    });

    L.objects.osrs = function (options) {
        return new L.Objects.OSRS(options);
    }

    L.Storeline = L.DynamicIcons.extend({
        onAdd: function (map) {
            this._map = map;
            this._selectedItem = null;
            this._itemMarkers = {}; // Map of item name to array of markers
            this._searchQuery = this.options.name ? this.options.name.toLowerCase() : '';
            if (this.options.name) {
                // Fetch names mapping for item IDs and full storeline data
                Promise.all([
                    fetch(`${this.options.folder}/names.json`).then(res => res.json()),
                    fetch(`${this.options.folder}/storeline.json`).then(res => res.json())
                ])
                    .then(([names, allStoreData]) => {
                        this._names = names;
                        this._allStoreData = allStoreData; // Store all shop data
                        return this.getData(this.options.name);
                    })
                    .then(locations => {
                        if (!this._map) return;
                        this._icon_data = this.parseData(locations);
                        this._icons = {};
                        this._resetView();
                        this._update();
                        // Extract unique items and notify callback
                        this.extractUniqueItems();
                    }).catch(console.error);
            } else {
                throw new Error("No storeline name specified");
            }
        },

        extractUniqueItems: function () {
            let uniqueItems = new Map(); // item name -> array of store items
            let regionFilter = Array.isArray(this.options.regions) ? new Set(this.options.regions) : null;
            
            for (let key in this._icon_data) {
                this._icon_data[key].forEach(item => {
                    // Double-check region filter (should already be filtered, but be explicit)
                    if (regionFilter && !regionFilter.has(item.LeagueRegion)) {
                        return;
                    }
                    
                    if (!uniqueItems.has(item["Sold item"])) {
                        uniqueItems.set(item["Sold item"], []);
                    }
                    uniqueItems.get(item["Sold item"]).push(item);
                });
            }
            
            if (this.options.onItemsLoaded) {
                this.options.onItemsLoaded(Array.from(uniqueItems.keys()).sort(), uniqueItems);
            }
        },

        setSelectedItem: function (itemName) {
            this._selectedItem = itemName;
            // Update all markers
            for (let key in this._icons) {
                let marker = this._icons[key];
                this.updateMarkerStyle(marker);
            }
        },

        updateMarkerStyle: function (marker) {
            if (!marker._storelineItem) return;
            
            let items = this._icon_data[this._tileCoordsToKey({
                plane: marker._storelineItem.position.plane,
                x: (marker._storelineItem.position.x >> 6),
                y: -(marker._storelineItem.position.y >> 6)
            })] || [];
            
            let hasSelectedItem = this._selectedItem && items.some(item => item["Sold item"] === this._selectedItem);
            
            if (hasSelectedItem) {
                marker.setIcon(L.icon({
                    iconUrl: 'images/marker-icon.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    tooltipAnchor: [16, -28],
                    shadowSize: [41, 41],
                    className: 'storeline-marker-highlighted'
                }));
            } else {
                marker.setIcon(L.icon({
                    iconUrl: 'images/marker-icon.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    tooltipAnchor: [16, -28],
                    shadowSize: [41, 41]
                }));
            }
        },

        getData: async function (name) {
            let data = await fetch(`${this.options.folder}/storeline.json`).then(res => res.json(), _ => {throw new Error(`Unable to fetch ${this.options.folder}/storeline.json`)});

            let regionFilter = Array.isArray(this.options.regions) ? new Set(this.options.regions) : null;
            let isStrict = this.options.strict === true;
            let searchLower = name.toLowerCase();

            // Filter by display name (case-insensitive)
            let filtered = data.filter(item => {
                if (!item["Sold item"] || !item.position) {
                    return false;
                }

                let nameLower = item["Sold item"].toLowerCase();
                let nameMatches = isStrict 
                    ? nameLower === searchLower 
                    : nameLower.includes(searchLower);
                
                if (!nameMatches) {
                    return false;
                }

                if (regionFilter) {
                    if (!item.LeagueRegion) {
                        return false;
                    }
                    return regionFilter.has(item.LeagueRegion);
                }

                return true;
            });

            return filtered;
        },

        parseData: function (data) {
            let icon_data = {};

            data.forEach(item => {
                if (item.position) {
                    let key = this._tileCoordsToKey({
                        plane: item.position.plane,
                        x: (item.position.x >> 6),
                        y: -(item.position.y >> 6)
                    });

                    if (!(key in icon_data)) {
                        icon_data[key] = [];
                    }
                    icon_data[key].push(item);
                }
            });

            return icon_data;
        },

        createIcon: function (item) {
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([item.position.y + 0.5, item.position.x + 0.5], {
                icon: item.position.plane === this._map.getPlane() ? icon : greyscaleIcon,
            });

            // Store item reference for highlighting
            marker._storelineItem = item;

            this._map.on('planechange', function (e) {
                marker.setIcon(item.position.plane === e.newPlane ? icon : greyscaleIcon);
            });

            let textContainer = document.createElement('div');
            textContainer.style.minWidth = '200px';
            textContainer.style.width = 'fit-content';
            let container = document.createElement('div');
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false,
                maxWidth: 1000,
                minWidth: 200,
                className: 'osrs-popup storeline-popup-wide'
            });

            marker.on('popupopen', () => {
                // Look up ALL items from this shop, not just matching ones
                let shopName = item["Sold by"];
                let shopLocation = item.position;
                
                if (this._allStoreData && shopName) {
                    // Filter all store data for this specific shop and location
                    let allShopItems = this._allStoreData.filter(storeItem => 
                        storeItem["Sold by"] === shopName &&
                        storeItem.position &&
                        storeItem.position.x === shopLocation.x &&
                        storeItem.position.y === shopLocation.y &&
                        storeItem.position.plane === shopLocation.plane
                    );
                    this.populatePopup(textContainer, allShopItems);
                } else {
                    // Fallback to old method
                    let key = this._tileCoordsToKey({
                        plane: item.position.plane,
                        x: (item.position.x >> 6),
                        y: -(item.position.y >> 6)
                    });
                    let allItemsAtLocation = this._icon_data[key] || [item];
                    let itemsAtLocation = allItemsAtLocation.filter(storeItem => storeItem["Sold by"] === item["Sold by"]);
                    this.populatePopup(textContainer, itemsAtLocation);
                }
            });

            return marker;
        },

        populatePopup: function (textContainer, item) {
            // Clear previous content
            textContainer.innerHTML = '';
            
            // item can be a single item or an array of items at the same location
            let items = Array.isArray(item) ? item : [item];
            
            // Calculate number of columns and set container width accordingly
            let itemsPerColumn = 5;
            let numColumns = Math.ceil(items.length / itemsPerColumn);
            let minWidth = numColumns > 1 ? Math.min(numColumns * 250, 1000) : 200;
            textContainer.style.minWidth = `${minWidth}px`;
            
            let textfield = "";
            
            // Get location and store info from first item
            if (items[0]["Sold by"]) {
                let shopName = items[0]["Sold by"];
                let wikiUrl = `https://oldschool.runescape.wiki/w/${shopName.replace(/ /g, '_')}`;
                textfield += `<b><a href="${wikiUrl}" target="_blank">${shopName}</a></b><br>`;
            }
            if (items[0].Location) {
                textfield += `<span class="popup-region">Location: ${items[0].Location}</span><br>`;
            }
            if (items[0].LeagueRegion) {
                textfield += `<span class="popup-region">Region: ${items[0].LeagueRegion}</span><br>`;
            }
            textfield += `<span class="popup-coords">x = ${items[0].position.x}, y = ${items[0].position.y}, plane = ${items[0].position.plane}</span><br>`;
            textfield += `<br><b>Items (${items.length}):</b><br>`;

            // Use the already calculated values for the HTML
            let columnGap = 10;
            
            let itemsHtml = `<div style="${numColumns > 1 ? `column-count: ${numColumns}; column-gap: ${columnGap}px; min-width: ${minWidth}px;` : ''}">`;
            items.forEach(storeItem => {
                // Check if this item matches the search query
                let isMatch = storeItem["Sold item"] && 
                             this._searchQuery && 
                             storeItem["Sold item"].toLowerCase().includes(this._searchQuery);
                
                let itemStyle = isMatch ? 'background-color: rgba(255,215,0,0.15); border-left: 2px solid #ffd700; padding: 4px; border-radius: 3px;' : '';
                
                itemsHtml += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0; break-inside: avoid; ${itemStyle}">`;
                
                // Try to find item ID from names mapping
                let itemId = null;
                if (this._names) {
                    for (let id in this._names) {
                        if (this._names[id].toLowerCase() === storeItem["Sold item"].toLowerCase()) {
                            itemId = id;
                            break;
                        }
                    }
                }
                
                // Add item icon if we found the item ID
                if (itemId !== null) {
                    itemsHtml += `<img src="https://raw.githubusercontent.com/runelite/static.runelite.net/refs/heads/gh-pages/cache/item/icon/${itemId}.png" alt="${storeItem["Sold item"]}" style="width: 24px; height: 24px;" onerror="this.style.display='none'">`;
                }
                
                itemsHtml += `<div>`;
                itemsHtml += `<div><b>${storeItem["Sold item"]}</b></div>`;
                if (storeItem["Store sell price"] !== undefined) {
                    itemsHtml += `Sell: ${storeItem["Store sell price"]}, `;
                }
                if (storeItem["Store buy price"] !== undefined) {
                    itemsHtml += `Buy: ${storeItem["Store buy price"]}, `;
                }
                if (storeItem["Store stock"]) {
                    itemsHtml += `Stock: ${storeItem["Store stock"]}`;
                }
                itemsHtml += `</div></div>`;
            });
            itemsHtml += `</div>`;

            textfield += itemsHtml;
            textContainer.innerHTML = textfield;
        },
    });

    L.storeline = function (options) {
        return new L.Storeline(options);
    }

    L.NPCs = L.LayerGroup.extend({
        initialize: function (options) {
            L.LayerGroup.prototype.initialize.call(this);
            L.setOptions(this, options);
        },

        onAdd: function (map) {
            this._map = map;
            console.log('L.NPCs onAdd called with name:', this.options.name);
            if (this.options.name) {
                this.getData(this.options.name)
                    .then(locations => {
                        if (!this._map) return;
                        this.createMarkers(locations);
                        // Call callback with found NPCs if provided
                        if (this.options.onNPCsLoaded && typeof this.options.onNPCsLoaded === 'function') {
                            let npcNames = [...new Set(locations.map(npc => npc.page_name))].sort();
                            this.options.onNPCsLoaded(npcNames, locations);
                        }
                    }).catch(error => {
                        console.error('L.NPCs error:', error);
                        if (this._map) this._map.addMessage('Error loading NPC data');
                    });
            }
        },

        getData: async function (name) {
            let data = await fetch(`${this.options.folder}/monsters.json`)
                .then(res => res.json(), _ => {throw new Error(`Unable to fetch ${this.options.folder}/monsters.json`)});
            
            // Check if regions are provided
            let hasRegionFilter = Array.isArray(this.options.regions);
            let regionFilter = hasRegionFilter && this.options.regions.length > 0
                ? new Set(this.options.regions.map(r => r.toLowerCase())) 
                : null;
            
            let isStrict = this.options.strict === true;
            let searchLower = name.toLowerCase();
            
            // Filter by NPC name (case-insensitive) and regions
            let filtered = data.filter(npc => {
                if (!npc.page_name || !npc.coordinates || npc.coordinates.length === 0) {
                    return false;
                }

                let nameLower = npc.page_name.toLowerCase();
                let nameMatches = isStrict 
                    ? nameLower === searchLower 
                    : nameLower.includes(searchLower);
                
                if (!nameMatches) {
                    return false;
                }

                // If we have a region filter system but no regions are selected, show nothing
                if (hasRegionFilter && !regionFilter) {
                    return false;
                }

                // Filter by region if regions are specified
                if (regionFilter) {
                    // If we have a region filter, the NPC must have matching regions
                    if (!npc.leagueregion || npc.leagueregion.length === 0) {
                        return false;
                    }
                    return npc.leagueregion.some(region => regionFilter.has(region.toLowerCase()));
                }

                // No region filter system means include all NPCs
                return true;
            });

            return filtered;
        },

        createMarkers: function (data) {
            let totalLocations = 0;
            
            data.forEach(npc => {
                if (npc.coordinates && npc.coordinates.length > 0) {
                    npc.coordinates.forEach(coord => {
                        totalLocations++;
                        let marker = L.marker([coord[1] + 0.5, coord[0] + 0.5], {
                            icon: L.icon({
                                iconUrl: 'images/marker-icon.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                tooltipAnchor: [16, -28],
                                shadowSize: [41, 41]
                            })
                        });

                        let popupContent = `<div class="osrs-popup-inner">`;
                        popupContent += `<b><a href="https://oldschool.runescape.wiki/w/${npc.page_name.replace(/ /g, '_')}" target="_blank">${npc.page_name}</a></b><br>`;
                        if (npc.leagueregion && npc.leagueregion.length > 0) {
                            popupContent += `<span class="popup-region">Regions: ${npc.leagueregion.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</span><br>`;
                        }
                        popupContent += `<span class="popup-coords">x = ${coord[0]}, y = ${coord[1]}</span><br>`;
                        popupContent += `</div>`;

                        marker.bindPopup(popupContent, {
                            autoPan: false,
                            className: 'osrs-popup'
                        });

                        this.addLayer(marker);
                    });
                }
            });
        },

        onRemove: function (map) {
            // Clear all layers before removing
            this.clearLayers();
            L.LayerGroup.prototype.onRemove.call(this, map);
        }
    });

    L.npcs = function (options) {
        return new L.NPCs(options);
    }

    L.Scenery = L.LayerGroup.extend({
        initialize: function (options) {
            L.LayerGroup.prototype.initialize.call(this);
            L.setOptions(this, options);
        },

        onAdd: function (map) {
            this._map = map;
            if (this.options.name && this.options.name.trim()) {
                this.getData(this.options.name)
                    .then(locations => {
                        if (!this._map) return;
                        this.createMarkers(locations);
                        // Call callback with found objects if provided
                        if (this.options.onObjectsLoaded && typeof this.options.onObjectsLoaded === 'function') {
                            let objectNames = [...new Set(locations.map(obj => obj.page_name))].sort();
                            this.options.onObjectsLoaded(objectNames, locations);
                        }
                    }).catch(error => {
                        console.error('L.Scenery error:', error);
                        if (this._map) this._map.addMessage('Error loading scenery data');
                    });
            }
        },

        getData: async function (name) {
            let data = await fetch(`${this.options.folder}/scenery.json`)
                .then(res => res.json(), _ => {throw new Error(`Unable to fetch ${this.options.folder}/scenery.json`)});
            
            // Check if regions are provided
            let hasRegionFilter = Array.isArray(this.options.regions);
            let regionFilter = hasRegionFilter && this.options.regions.length > 0
                ? new Set(this.options.regions.map(r => r.toLowerCase())) 
                : null;
            
            let isStrict = this.options.strict === true;
            let searchLower = name.toLowerCase();
            
            // Filter by object name (case-insensitive) and regions
            let filtered = data.filter(obj => {
                if (!obj.page_name || !obj.coordinates || obj.coordinates.length === 0) {
                    return false;
                }

                let nameLower = obj.page_name.toLowerCase();
                let nameMatches = isStrict 
                    ? nameLower === searchLower 
                    : nameLower.includes(searchLower);
                
                if (!nameMatches) {
                    return false;
                }

                // If we have a region filter system but no regions are selected, show nothing
                if (hasRegionFilter && !regionFilter) {
                    return false;
                }

                // Filter by region if regions are specified
                if (regionFilter) {
                    // If we have a region filter, the object must have matching regions
                    if (!obj.leagueregion || obj.leagueregion.length === 0) {
                        return false;
                    }
                    return obj.leagueregion.some(region => regionFilter.has(region.toLowerCase()));
                }

                // No region filter system means include all objects
                return true;
            });

            return filtered;
        },

        createMarkers: function (data) {
            let totalLocations = 0;
            
            data.forEach(obj => {
                if (obj.coordinates && obj.coordinates.length > 0) {
                    obj.coordinates.forEach(coord => {
                        totalLocations++;
                        let marker = L.marker([coord[1] + 0.5, coord[0] + 0.5], {
                            icon: L.icon({
                                iconUrl: 'images/marker-icon.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                tooltipAnchor: [16, -28],
                                shadowSize: [41, 41]
                            })
                        });

                        let popupContent = `<div class="osrs-popup-inner">`;
                        popupContent += `<b><a href="https://oldschool.runescape.wiki/w/${obj.page_name.replace(/ /g, '_')}" target="_blank">${obj.page_name}</a></b><br>`;
                        if (obj.leagueregion && obj.leagueregion.length > 0) {
                            popupContent += `<span class="popup-region">Regions: ${obj.leagueregion.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</span><br>`;
                        }
                        popupContent += `<span class="popup-coords">x = ${coord[0]}, y = ${coord[1]}</span><br>`;
                        popupContent += `</div>`;

                        marker.bindPopup(popupContent, {
                            autoPan: false,
                            className: 'osrs-popup'
                        });

                        this.addLayer(marker);
                    });
                }
            });
        },

        onRemove: function (map) {
            // Clear all layers before removing
            this.clearLayers();
            L.LayerGroup.prototype.onRemove.call(this, map);
        }
    });

    L.scenery = function (options) {
        return new L.Scenery(options);
    }

    // ── Item Spawns layer ──────────────────────────────────────────────
    // Loads data_osrs/item_spawns.json and renders all spawns for the
    // currently enabled regions as gold circle markers.
    L.ItemSpawns = L.LayerGroup.extend({
        initialize: function (options) {
            L.LayerGroup.prototype.initialize.call(this);
            L.setOptions(this, options);
            this._allData = null; // cached full JSON
        },

        onAdd: function (map) {
            this._map = map;
            this._loadAndRender();
        },

        _loadAndRender: async function () {
            if (!this._allData) {
                try {
                    this._allData = await fetch(`${this.options.folder}/item_spawns.json`).then(res => res.json());
                } catch (e) {
                    console.error('L.ItemSpawns: failed to load item_spawns.json', e);
                    return;
                }
            }
            this._renderForRegions(this.options.regions || []);
        },

        _renderForRegions: function (regions) {
            this.clearLayers();
            if (!this._allData) return;

            const regionSet = new Set(regions.map(r => r.toLowerCase()));
            if (regionSet.size === 0) return;

            this._allData.forEach(item => {
                if (!item.leagueregion || !item.coordinates || item.coordinates.length === 0) return;
                if (!item.leagueregion.some(r => regionSet.has(r.toLowerCase()))) return;

                item.coordinates.forEach(coord => {
                    const marker = L.circleMarker([coord[1] + 0.5, coord[0] + 0.5], {
                        radius: 5,
                        fillColor: '#ffd700',
                        color: '#7a5c00',
                        weight: 1,
                        opacity: 0.9,
                        fillOpacity: 0.7
                    });

                    const regionLabel = item.leagueregion
                        .map(r => r.charAt(0).toUpperCase() + r.slice(1))
                        .join(', ');

                    marker.bindPopup(
                        `<div class="osrs-popup-inner">` +
                        `<b><a href="https://oldschool.runescape.wiki/w/${encodeURIComponent(item.page_name.replace(/ /g, '_'))}" target="_blank">${item.page_name}</a></b><br>` +
                        `<span class="popup-region">Region: ${regionLabel}</span><br>` +
                        `<span class="popup-coords">x = ${coord[0]}, y = ${coord[1]}</span>` +
                        `</div>`,
                        { autoPan: false, className: 'osrs-popup' }
                    );

                    this.addLayer(marker);
                });
            });
        },

        /** Call this when the active region set changes. */
        updateRegions: function (regions) {
            this.options.regions = regions;
            if (this._map) {
                this._renderForRegions(regions);
            }
        },

        onRemove: function (map) {
            this.clearLayers();
            L.LayerGroup.prototype.onRemove.call(this, map);
        }
    });

    L.itemSpawns = function (options) {
        return new L.ItemSpawns(options);
    }
});