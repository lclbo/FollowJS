"use strict"

/**
 * @file Camera overlay: markers, reverse drag, context menus, image source (static/MJPEG/key).
 * @class FollowJSMainView
 */

const regression = require('./FollowJSRegression');

/** Keep in sync with `--z-*` in follow.css. */
const VIRTUAL_MARKER_Z_INDEX = 1200;
const SPOT_MARKER_Z_BASE = 1100;

class FollowJSMainView {
    #x_img_max;
    #y_img_max;
    #r_img_min;
    #r_img_max;
    #dragState;
    #mainDrawArea;
    #virtualMarkerElement;
    #virtualMarkerVisual;

    constructor() {
        this.#dragState = null;
        this.#mainDrawArea = null;
        this.#virtualMarkerElement = null;
        this.#virtualMarkerVisual = null;
        this.updateWindowSize = this.updateWindowSize.bind(this);
        this.onSpotMarkerPointerDown = this.onSpotMarkerPointerDown.bind(this);
        this.onSpotMarkerPointerMove = this.onSpotMarkerPointerMove.bind(this);
        this.onSpotMarkerPointerUp = this.onSpotMarkerPointerUp.bind(this);
        this.onVirtualMarkerPointerDown = this.onVirtualMarkerPointerDown.bind(this);
        this.onVirtualMarkerPointerMove = this.onVirtualMarkerPointerMove.bind(this);
        this.onVirtualMarkerPointerUp = this.onVirtualMarkerPointerUp.bind(this);
        this.updateWindowSize();
    }

    updateWindowSize() {
        if(this.#mainDrawArea === null)
            this.#mainDrawArea = document.getElementById("mainDrawArea");
        this.#x_img_max = this.#mainDrawArea.clientWidth;
        this.#y_img_max = this.#mainDrawArea.clientHeight;

        this.#r_img_min = 10 * (this.#mainDrawArea.clientWidth / 800);
        this.#r_img_max = 30 * (this.#mainDrawArea.clientWidth / 800);
    }

    // Expose private properties for spot access
    get x_img_max() { return this.#x_img_max; }
    get y_img_max() { return this.#y_img_max; }
    get r_img_min() { return this.#r_img_min; }
    get r_img_max() { return this.#r_img_max; }

    addSpotsToDOM() {
        global.forEachSpot(function(spot) {
            let spotNo = spot.spotNumber;
            document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
                '<svg class="spotMarker" id="spotMarker['+spotNo+']" width="50" height="50">\n' +
                '   <circle cx="50%" cy="50%" r="50" fill="'+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+'" stroke="'+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+'" stroke-width=".2rem" stroke-opacity="1" fill-opacity=".4" />\n' +
                '</svg>'
            );
            this.setupSpotMarkerInteraction(spotNo);

            spot.dom.marker = document.getElementById("spotMarker["+spotNo+"]");
            spot.dom.marker.style.zIndex = String(SPOT_MARKER_Z_BASE - (spotNo - 1));
            spot.dom.markerCircle = spot.dom.marker.firstElementChild;

            document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
                '<div class="spotContextMenu hidden" id="spotContextMenu['+spotNo+']"></div>'
            );
            spot.dom.contextMenu = document.getElementById("spotContextMenu["+spotNo+"]");

            document.getElementById("spotStatusOverlayArea").insertAdjacentHTML('beforeend',
                '<div id="spotStatusOverlay['+spotNo+']" class="spotStatusOverlayGroup" style="border-color: '+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+';">\n' +
                '   <div class="spotStatusGaugeRow">\n' +
                '       <span class="spotStatusGaugeLabel">Dim</span>\n' +
                '       <div class="spotStatusGaugeTrack"><div class="spotStatusGaugeFill spotStatusOverlayDim" id="gauge['+spotNo+'][dim]"></div></div>\n' +
                '   </div>\n' +
                '   <div class="spotStatusGaugeRow">\n' +
                '       <span class="spotStatusGaugeLabel">Col</span>\n' +
                '       <div class="spotStatusGaugeTrack"><div class="spotStatusGaugeFill spotStatusOverlayColor" id="gauge['+spotNo+'][color]"></div></div>\n' +
                '   </div>\n' +
                '   <div class="spotStatusGaugeRow">\n' +
                '       <span class="spotStatusGaugeLabel">Foc</span>\n' +
                '       <div class="spotStatusGaugeTrack"><div class="spotStatusGaugeFill spotStatusOverlayFocus" id="gauge['+spotNo+'][focus]"></div></div>\n' +
                '   </div>\n' +
                '   <div class="spotStatusGaugeRow">\n' +
                '       <span class="spotStatusGaugeLabel">Frost</span>\n' +
                '       <div class="spotStatusGaugeTrack"><div class="spotStatusGaugeFill spotStatusOverlayFrost" id="gauge['+spotNo+'][frost]"></div></div>\n' +
                '   </div>\n' +
                '</div>'
            );
            spot.dom.gauges.dim = document.getElementById("gauge["+spotNo+"][dim]");
            spot.dom.gauges.color = document.getElementById("gauge["+spotNo+"][color]");
            spot.dom.gauges.focus = document.getElementById("gauge["+spotNo+"][focus]");
            spot.dom.gauges.frost = document.getElementById("gauge["+spotNo+"][frost]");
        }.bind(this));

        this.addVirtualMarkerToDOM();
    }

    addVirtualMarkerToDOM() {
        document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
            '<svg class="spotMarker virtualMarker hiddenVis" id="virtualMarker" width="50" height="50">\n' +
            '   <circle class="virtualMarkerHit" cx="50%" cy="50%" r="25" fill="transparent" stroke="none" />\n' +
            '   <circle class="virtualMarkerVisual" cx="50%" cy="50%" r="15" fill="white" stroke="white" stroke-width=".2rem" stroke-opacity="1" fill-opacity=".5" pointer-events="none" />\n' +
            '</svg>'
        );
        this.#virtualMarkerElement = document.getElementById("virtualMarker");
        this.#virtualMarkerElement.style.zIndex = String(VIRTUAL_MARKER_Z_INDEX);
        this.#virtualMarkerVisual = this.#virtualMarkerElement.querySelector(".virtualMarkerVisual");
        this.setupVirtualMarkerInteraction();
        if(global.virtualMarker !== undefined)
            global.virtualMarker.updateMarkerVisibility();
    }

    setupVirtualMarkerInteraction() {
        this.#virtualMarkerElement.addEventListener("pointerdown", this.onVirtualMarkerPointerDown);
    }

    onVirtualMarkerPointerDown(event) {
        if(global.virtualMarker === undefined || !global.virtualMarker.isEnabled())
            return;
        if(this.#dragState !== null)
            return;

        event.preventDefault();
        this.#dragState = {
            virtualMarker: true,
            pointerId: event.pointerId,
            didMove: false
        };
        window.addEventListener("pointermove", this.onVirtualMarkerPointerMove);
        window.addEventListener("pointerup", this.onVirtualMarkerPointerUp);
        window.addEventListener("pointercancel", this.onVirtualMarkerPointerUp);
    }

    onVirtualMarkerPointerMove(event) {
        if(this.#dragState === null || this.#dragState.virtualMarker !== true || event.pointerId !== this.#dragState.pointerId)
            return;
        if(global.virtualMarker === undefined || !global.virtualMarker.isEnabled())
            return;

        this.applyVirtualMarkerDragPosition(event);
        this.#dragState.didMove = true;
    }

    onVirtualMarkerPointerUp(event) {
        if(this.#dragState === null || this.#dragState.virtualMarker !== true || event.pointerId !== this.#dragState.pointerId)
            return;

        let didMove = this.#dragState.didMove === true;
        window.removeEventListener("pointermove", this.onVirtualMarkerPointerMove);
        window.removeEventListener("pointerup", this.onVirtualMarkerPointerUp);
        window.removeEventListener("pointercancel", this.onVirtualMarkerPointerUp);
        this.#dragState = null;
        if(didMove && typeof global.flushArtNetIfPending === "function")
            global.flushArtNetIfPending();
    }

    applyVirtualMarkerDragPosition(event) {
        if(this.#mainDrawArea === null)
            this.#mainDrawArea = document.getElementById("mainDrawArea");
        let areaRect = this.#mainDrawArea.getBoundingClientRect();
        let leftPx = event.clientX - areaRect.left;
        let topPx = event.clientY - areaRect.top;
        let regressionCoords = regression.screenPixelsToRegressionCoords(leftPx, topPx, this.#x_img_max, this.#y_img_max);
        global.virtualMarker.setScreenPosition(regressionCoords[0], regressionCoords[1], true);
    }

    setupSpotMarkerInteraction(spotNo) {
        let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
        spotMarkerElement.addEventListener("pointerdown", (event) => this.onSpotMarkerPointerDown(event, spotNo));
        spotMarkerElement.addEventListener("pointermove", this.onSpotMarkerPointerMove);
        spotMarkerElement.addEventListener("pointerup", (event) => this.onSpotMarkerPointerUp(event, spotNo));
        spotMarkerElement.addEventListener("pointercancel", (event) => this.onSpotMarkerPointerUp(event, spotNo));
    }

    onSpotMarkerPointerDown(event, spotNo) {
        if(this.#dragState !== null)
            return;

        event.preventDefault();
        this.#dragState = {
            spotNo: spotNo,
            pointerId: event.pointerId,
            didMove: false
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    onSpotMarkerPointerMove(event) {
        if(this.#dragState === null || event.pointerId !== this.#dragState.pointerId)
            return;

        this.#dragState.didMove = true;
        this.applyReverseDragPosition(event);
    }

    onSpotMarkerPointerUp(event, spotNo) {
        if(this.#dragState !== null && this.#dragState.spotNo === spotNo && event.pointerId === this.#dragState.pointerId) {
            let didMove = this.#dragState.didMove;
            if(event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            this.#dragState = null;
            if(!didMove)
                this.toggleContextMenu(spotNo);
            else if(typeof global.flushArtNetIfPending === "function")
                global.flushArtNetIfPending();
            return;
        }
    }

    /**
     * Reverse drag: map pointer to screen coords, inverse-regression to pan/tilt.
     */
    applyReverseDragPosition(event) {
        if(this.#mainDrawArea === null)
            this.#mainDrawArea = document.getElementById("mainDrawArea");
        let areaRect = this.#mainDrawArea.getBoundingClientRect();
        let leftPx = event.clientX - areaRect.left;
        let topPx = event.clientY - areaRect.top;
        let regressionCoords = regression.screenPixelsToRegressionCoords(leftPx, topPx, this.#x_img_max, this.#y_img_max);
        let spot = global.getSpot(this.#dragState.spotNo);
        let spotCoords = regression.screenToFixture(
            spot.config.translation,
            regressionCoords[0],
            regressionCoords[1],
            spot.config.boundaries,
            spot.state.x,
            spot.state.y
        );

        spot.setPosition(spotCoords[0], spotCoords[1]);
    }

    /**
     * Redraw markers/gauges/DMX when `global.markUiDirty` was set. No-op if nothing changed.
     */
    drawSpots() {
        global.forEachSpot(function(spot) {
            let pos = spot.getScreenPosition();
            let pos_x = pos[0];
            let pos_y = pos[1];

            let radius = ((spot.state.r*(this.#r_img_max-this.#r_img_min)+this.#r_img_min).toString());
            let opacity = (spot.state.shutterOpen === true) ? "0.4" : "0";
            let top = ((1-pos_y) * this.#y_img_max).toString()+"px";
            let left = (pos_x * this.#x_img_max).toString()+"px";

            let spotMarkerElement = spot.dom.marker;
            let spotMarkerCircle = spot.dom.markerCircle;
            let cache = spot.renderCache.marker;

            if(cache.top !== top)
                spotMarkerElement.style.top = top;
            if(cache.left !== left)
                spotMarkerElement.style.left = left;
            if(cache.r !== radius)
                spotMarkerCircle.setAttribute("r", radius);
            if(cache.opacity !== opacity)
                spotMarkerCircle.setAttribute("fill-opacity", opacity);

            cache.top = top;
            cache.left = left;
            cache.r = radius;
            cache.opacity = opacity;
        }.bind(this));

        this.drawVirtualMarker();
    }

    drawVirtualMarker() {
        if(global.virtualMarker === undefined || !global.virtualMarker.isEnabled())
            return;

        let vm = global.virtualMarker;
        let radius = ((vm.state.r*(this.#r_img_max-this.#r_img_min)+this.#r_img_min).toString());
        let opacity = (vm.state.shutterOpen === true) ? "0.5" : "0";
        let strokeOpacity = opacity === "0" ? "0.85" : "1";
        let top = ((1-vm.state.screenY) * this.#y_img_max).toString()+"px";
        let left = (vm.state.screenX * this.#x_img_max).toString()+"px";
        let cache = vm.renderCache;

        if(this.#virtualMarkerElement === null) {
            this.#virtualMarkerElement = document.getElementById("virtualMarker");
            this.#virtualMarkerVisual = this.#virtualMarkerElement.querySelector(".virtualMarkerVisual");
        }

        if(cache.top !== top)
            this.#virtualMarkerElement.style.top = top;
        if(cache.left !== left)
            this.#virtualMarkerElement.style.left = left;
        if(cache.r !== radius)
            this.#virtualMarkerVisual.setAttribute("r", radius);
        if(cache.opacity !== opacity)
            this.#virtualMarkerVisual.setAttribute("fill-opacity", opacity);
        if(cache.strokeOpacity !== strokeOpacity)
            this.#virtualMarkerVisual.setAttribute("stroke-opacity", strokeOpacity);

        cache.top = top;
        cache.left = left;
        cache.r = radius;
        cache.opacity = opacity;
        cache.strokeOpacity = strokeOpacity;
    }

    paintMenus() {
        global.forEachSpot(function(spot) {
            if(spot.contextMenuState.visible === true) {
                spot.updateContextMenu();
            }
        });
    }


    hideContextMenu(spotNo) {
        global.getSpot(spotNo).hideContextMenu();
    }

    hideAllContextMenus() {
        global.forEachSpot(function(spot) {
            spot.hideContextMenu();
        });
    }

    toggleContextMenu(spotNo) {
        let spot = global.getSpot(spotNo);
        if(spot.contextMenuState.visible) {
            spot.hideContextMenu();
            return;
        }
        this.hideAllContextMenus();
        spot.showContextMenu('marker');
    }

    toggleContextMenuFromFooter(spotNo, anchorElement) {
        let spot = global.getSpot(spotNo);
        if(spot.contextMenuState.visible && spot.contextMenuState.placement === 'footer') {
            spot.hideContextMenu();
            return;
        }
        this.hideAllContextMenus();
        spot.showContextMenu('footer', anchorElement);
    }

    highlightImageCoord(enable,x=0.5,y=0.5) {
        if(enable !== true) {
            document.querySelector("#highlightMarker").classList.add("hidden");
        }
        else {
            let pos_x = (x * this.#x_img_max) % this.#x_img_max;
            let pos_y = ((1-y) * this.#y_img_max) % this.#y_img_max;
            document.querySelector("#highlightMarker").style.top = (pos_y).toString();
            document.querySelector("#highlightMarker").style.left = (pos_x).toString();
            document.querySelector("#highlightMarker").classList.remove("hidden");
        }
    }

    showGridOverlay() {
        document.querySelector("#tenthGridOverlay").classList.remove("hidden");
    }
    hideGridOverlay() {
        document.querySelector("#tenthGridOverlay").classList.add("hidden");
    }

    initializeImage() {
        let mainDrawArea = document.getElementById("mainDrawArea");
        let mainImage = document.getElementById("mainWebcamImage");

        switch(systemConf.image.imageType.toLowerCase()) {
            case "key":
                mainImage.style.display = "none";
                mainDrawArea.style.backgroundColor = systemConf.image.keyColor;
                break;
            case "mjpeg":
                mainImage.setAttribute("data-src", systemConf.image.imageSource);
                window.requestAnimationFrame(() => {this.refreshMjpegImageResource(mainImage)});
                break;
            case "jpeg":
                mainImage.setAttribute("data-src", systemConf.image.imageSource);
                mainImage.setAttribute("data-default-prescale", systemConf.image.imageRateDivider);
                this.initializeStaticImageResource(mainImage);
                window.requestAnimationFrame(() => {this.refreshStaticImageResource(mainImage)});
                break;
            default:
                throw Error("unknown systemConf.image.type");
        }
    }

    /**
     * Initializes the data-fields needed for refresh handling
     * @param rsc element handle, e.g. from getElementByXYZ()
     */
    initializeStaticImageResource(rsc) {
        if(!('src' in rsc.dataset) || !('defaultPrescale' in rsc.dataset)) {
            console.log("cound not initialize, missing src or default-prescale!");
        }
        else {
            rsc.setAttribute('data-is-loading', "empty");
            rsc.setAttribute('data-refresh-retries', 0);
            rsc.setAttribute('data-pc', (rsc.dataset.defaultPrescale - 1));
            rsc.setAttribute('data-prescale', rsc.dataset.defaultPrescale);

            if(!('separator' in rsc.dataset))
                rsc.setAttribute('data-separator', ((rsc.dataset.src.includes('?')) ? '&' : '?'));

            rsc.onload = (event) => {event.target.dataset.isLoading = 'doneLoading';};
        }
    }

    /**
     * Refreshes the linked resource (mainly image).
     * For refresh, the src is set to the previous url but with a new ?_=<timestamp> parameter to avoid caching
     * @param rsc element handle, e.g. from getElementById().
     * The resource needs a src-attribute.
     */
    refreshStaticImageResource(rsc) {
        if(rsc.dataset.refreshTimerId !== undefined)
            return;

        const tick = () => {
            if(rsc.dataset.pc < rsc.dataset.prescale) {
                rsc.dataset.pc++;
                return;
            }
            rsc.dataset.pc = 0;

            if(rsc.dataset.isLoading === "loading") {
                rsc.dataset.prescale++;
                rsc.dataset.refreshRetries++;
                if(rsc.dataset.refreshRetries > 50) {
                    rsc.classList.add('slowLoading');
                    rsc.dataset.prescale = (20 * rsc.dataset.defaultPrescale);
                }
                else {
                    return;
                }
            }
            rsc.dataset.refreshRetries = 0;
            rsc.classList.remove('slowLoading');
            if(rsc.dataset.prescale >= (20 * rsc.dataset.defaultPrescale))
                rsc.dataset.prescale = rsc.dataset.defaultPrescale;

            let appendix = "" + rsc.dataset.separator + "_=" + (new Date().valueOf());
            rsc.setAttribute('src', "" + rsc.dataset.src + appendix);
            rsc.dataset.isLoading = "loading";
        };

        rsc.dataset.refreshTimerId = window.setInterval(tick, 1000 / 60);
    }

    //based on https://github.com/aruntj/mjpeg-readable-stream
    refreshMjpegImageResource(rsc) {
        fetch(rsc.dataset.src)
            .then((resp) => {
                if (!resp.ok) {
                    throw Error("fetch response !ok");
                }
                if(!resp.body) {
                    throw Error("response body not supported");
                }

                const reader = resp.body.getReader();
                let headerString = '';
                let contentLength = -1;
                let bodyBytes = 0;
                let imageBuffer = null;

                const getLength = (headerString) => {
                    let contentLength = -1;
                    headerString.split('\n').forEach((headerLine) => {
                        if(headerLine.toLowerCase().includes("content-length")) {
                            contentLength = headerLine.substring(headerLine.lastIndexOf(":")+1).trim();
                        }
                    });
                    return contentLength;
                };

                const readMjpeg = () => {
                    reader.read().then(({done, value}) => {
                        if (done) {
                            window.requestAnimationFrame(this.refreshMjpegImageResource);
                            return;
                        }
                        for (let byte = 0; byte < value.length; byte++) {
                            if ((value[byte] === 0xFF) && (byte+1 < value.length) && (value[byte + 1] === 0xD8)) {
                                contentLength = getLength(headerString);
                                imageBuffer = new Uint8Array(new ArrayBuffer(contentLength));
                            }
                            if (contentLength <= 0) {
                                headerString += String.fromCharCode(value[byte]);
                            } else if (bodyBytes < contentLength) {
                                imageBuffer[bodyBytes] = value[byte];
                                bodyBytes++;
                            } else {
                                if(rsc.dataset.previousBlobUrl !== undefined)
                                    URL.revokeObjectURL(rsc.dataset.previousBlobUrl);
                                let imageBlobUrl = URL.createObjectURL(new Blob([imageBuffer], {type: 'image/jpeg'}));
                                rsc.dataset.previousBlobUrl = imageBlobUrl;
                                rsc.src = imageBlobUrl;

                                contentLength = 0;
                                bodyBytes = 0;
                                headerString = '';
                            }
                        }
                        window.requestAnimationFrame(readMjpeg);
                    }).catch(error => {
                        console.log(error);
                    })
                }
                window.requestAnimationFrame(readMjpeg);
            })
            .catch(() => {
                window.requestAnimationFrame(this.refreshMjpegImageResource);
                throw Error("Fetch error!");
            });

    }
}

module.exports = FollowJSMainView;