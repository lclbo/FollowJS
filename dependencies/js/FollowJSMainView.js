"use strict"
const regression = require('./FollowJSRegression');
/**
 *
 */
class FollowJSMainView {
    #x_img_max;
    #y_img_max;
    #r_img_min;
    #r_img_max;
    #dragState;

    constructor() {
        this.#dragState = null;
        this.updateWindowSize = this.updateWindowSize.bind(this);
        this.onSpotMarkerPointerDown = this.onSpotMarkerPointerDown.bind(this);
        this.onSpotMarkerPointerMove = this.onSpotMarkerPointerMove.bind(this);
        this.onSpotMarkerPointerUp = this.onSpotMarkerPointerUp.bind(this);
        this.updateWindowSize();
    }

    updateWindowSize() {
        this.#x_img_max = document.getElementById("mainDrawArea").clientWidth;
        this.#y_img_max = document.getElementById("mainDrawArea").clientHeight;
        // element.offset<Height|Width> includes borders, element.client<Height|Width> does not

        this.#r_img_min = 10 * (document.getElementById("mainDrawArea").clientWidth / 800);
        this.#r_img_max = 30 * (document.getElementById("mainDrawArea").clientWidth / 800);
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

            document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
                '<div class="spotContextMenu" id="spotContextMenu['+spotNo+']"></div>'
            );

            document.getElementById("spotStatusOverlayArea").insertAdjacentHTML('beforeend',
                '<div id="spotStatusOverlay['+spotNo+']" class="spotStatusOverlayGroup" style="border-color: '+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+';">\n' +
                '   <div class="spotStatusGauge" id="gauge['+spotNo+'][dim]">\n' +
                '       <div class="spotStatusOverlayDim">Dimmer</div>\n' +
                '   </div>\n' +
                '   <div class="spotStatusGauge" id="gauge['+spotNo+'][color]\">\n' +
                '       <div class="spotStatusOverlayColor">Color</div>\n' +
                '   </div>\n' +
                '   <div class="spotStatusGauge" id="gauge['+spotNo+'][focus]\">\n' +
                '       <div class="spotStatusOverlayFocus">Focus</div>\n' +
                '   </div>\n' +
                '   <div class="spotStatusGauge" id="gauge['+spotNo+'][frost]\">\n' +
                '       <div class="spotStatusOverlayFrost">Frost</div>\n' +
                '   </div>\n' +
                '</div>'
            );
        }.bind(this));
    }

    setupSpotMarkerInteraction(spotNo) {
        let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
        spotMarkerElement.addEventListener("pointerdown", (event) => this.onSpotMarkerPointerDown(event, spotNo));
        spotMarkerElement.addEventListener("pointermove", this.onSpotMarkerPointerMove);
        spotMarkerElement.addEventListener("pointerup", (event) => this.onSpotMarkerPointerUp(event, spotNo));
        spotMarkerElement.addEventListener("pointercancel", (event) => this.onSpotMarkerPointerUp(event, spotNo));
    }

    onSpotMarkerPointerDown(event, spotNo) {
        if(!global.getSpot(spotNo).reverseDragEnabled)
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
        if(!global.getSpot(this.#dragState.spotNo).reverseDragEnabled)
            return;

        this.#dragState.didMove = true;
        this.applyReverseDragPosition(event);
    }

    onSpotMarkerPointerUp(event, spotNo) {
        if(this.#dragState !== null && this.#dragState.spotNo === spotNo && event.pointerId === this.#dragState.pointerId) {
            if(event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            this.#dragState = null;
            return;
        }

        if(!global.getSpot(spotNo).reverseDragEnabled)
            this.toggleContextMenu(spotNo);
    }

    applyReverseDragPosition(event) {
        let mainDrawArea = document.getElementById("mainDrawArea");
        let areaRect = mainDrawArea.getBoundingClientRect();
        let leftPx = event.clientX - areaRect.left;
        let topPx = event.clientY - areaRect.top;
        let regressionCoords = regression.screenPixelsToRegressionCoords(leftPx, topPx, this.#x_img_max, this.#y_img_max);
        let spot = global.getSpot(this.#dragState.spotNo);
        let spotCoords = regression.inverseRegression(
            spot.config.translation.regression,
            regressionCoords[0],
            regressionCoords[1],
            spot.state.x,
            spot.state.y,
            spot.config.boundaries
        );

        spot.setPosition(spotCoords[0], spotCoords[1]);
    }

    setReverseDragEnabled(spotNo, enabled) {
        let spot = global.getSpot(spotNo);
        spot.reverseDragEnabled = enabled === true;
        document.getElementById("spotMarker["+spotNo+"]").classList.toggle("reverseDragEnabled", spot.reverseDragEnabled);
    }

    drawSpots() {
        global.forEachSpot(function(spot) {
            let spotNo = spot.spotNumber;
            let pos = regression.forwardRegression(spot.config.translation.regression, spot.state.x, spot.state.y);
            let pos_x = pos[0];
            let pos_y = pos[1];

            let pos_r = spot.state.r;
            let radius = ((pos_r*(this.#r_img_max-this.#r_img_min)+this.#r_img_min).toString());

            let opacity = (spot.state.shutterOpen === true) ? "0.4" : "0";


            let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
            spotMarkerElement.style.top = ((1-pos_y) * this.#y_img_max).toString()+"px";
            spotMarkerElement.style.left = (pos_x * this.#x_img_max).toString()+"px";
            // spotMarkerElement.style.transform = "translate("+(pos_x*100)+"%,"+((1-pos_y)*100)+"%)";
            // spotMarkerElement.style.transform = "translate("+((pos_x * this.#x_img_max)-25).toString()+"px"+","+(((1-pos_y) * this.#y_img_max)-25).toString()+"px"+")"; // scale("+(pos_r).toString()+")";

            if(radius !== spotMarkerElement.firstElementChild.getAttribute("r"))
                spotMarkerElement.firstElementChild.setAttribute("r", radius);
            if(opacity !== spotMarkerElement.firstElementChild.getAttribute("fill-opacity"))
                spotMarkerElement.firstElementChild.setAttribute("fill-opacity", opacity);
        }.bind(this));
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
        global.getSpot(spotNo).toggleContextMenu();
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
        window.requestAnimationFrame(()=>{this.refreshStaticImageResource(rsc);});
        if(rsc.dataset.pc < rsc.dataset.prescale) {
            rsc.dataset.pc++;
            return;
        }
        // console.log("prescale elapsed");
        rsc.dataset.pc = 0;

        if(rsc.dataset.isLoading === "loading") {
            rsc.dataset.prescale++;
            // rsc.setAttribute('title', 'refresh every ' + rsc.dataset.prescale + ' loading cycles');
            // rsc.attr('title', '');
            rsc.dataset.refreshRetries++;
            if(rsc.dataset.refreshRetries > 50) { //if data did not load in time for 50 rounds, the source is probably bad
                //console.log('switch to slow retry');
                rsc.classList.add('slowLoading');
                rsc.dataset.prescale = (20 * rsc.dataset.defaultPrescale);
            }
            else {
                // console.log("still busy loading, skipping reloading");
                return;
            }
        }
        rsc.dataset.refreshRetries = 0;
        rsc.classList.remove('slowLoading');
        if(rsc.dataset.prescale >= (20 * rsc.dataset.defaultPrescale))
            rsc.dataset.prescale = rsc.dataset.defaultPrescale;

        // console.log("loading new image");

        let appendix = "" + rsc.dataset.separator + "_=" + (new Date().valueOf());
        rsc.setAttribute('src', "" + rsc.dataset.src + appendix);

        rsc.dataset.isLoading = "loading";
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
                                let imageBlobUrl = URL.createObjectURL(new Blob([imageBuffer], {type: 'image/jpeg'}));
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