"use strict"
/**
 *
 */
class FollowJSMainView {
    #x_img_max;
    #y_img_max;
    #r_img_min;
    #r_img_max;

    constructor() {
        this.updateWindowSize();
    }

    updateWindowSize() {
        this.#x_img_max = document.getElementById("mainDrawArea").clientWidth;
        this.#y_img_max = document.getElementById("mainDrawArea").clientHeight;
        // element.offset<Height|Width> includes borders, element.client<Height|Width> does not

        this.#r_img_min = 10 * (document.getElementById("mainDrawArea").clientWidth / 800);
        this.#r_img_max = 30 * (document.getElementById("mainDrawArea").clientWidth / 800);
    }

    addSpotsToDOM() {
        spots.forEach(function(spot, spotNo) {
            document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
                '<svg class="spotMarker" id="spotMarker['+spotNo+']" width="50" height="50">\n' +
                '   <circle cx="50%" cy="50%" r="50" fill="'+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+'" stroke="'+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+'" stroke-width=".2rem" stroke-opacity="1" fill-opacity=".4" onclick="mainView.toggleContextMenu('+spotNo+');" />\n' +
                '</svg>'
            );

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

    drawSpots() {
        spots.forEach(function(spot, spotNo) {
            let x = spot.state.x;
            let y = spot.state.y;
            let x2 = Math.pow(spot.state.x,2);
            let y2 = Math.pow(spot.state.y,2);

            let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
            let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

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

            if(spot.contextMenuState.visible === true)
                this.updateContextMenu(spotNo);
        }.bind(this));
    }

    updateContextMenu(spotNo) {
        let spot = spots[spotNo];
        let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

        let x = spot.state.x;
        let y = spot.state.y;
        let x2 = Math.pow(x,2);
        let y2 = Math.pow(y,2);

        let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
        let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

        let translate_y = ((1-pos_y) > 0.65) ? "-100%" : "0";
        let translate_x = (pos_x > 0.75) ? "-100%" : "0";
        spotContextMenuElement.style.transform = "translate("+translate_x+","+translate_y+")";

        spotContextMenuElement.style.top = ((1-pos_y) * this.#y_img_max).toString()+"px";
        spotContextMenuElement.style.left = (pos_x * this.#x_img_max).toString()+"px";

        spotContextMenuElement.childNodes.forEach(function (childElement) {
            childElement.classList.remove("spotContextMenuHighlight");
        });
        document.getElementById('macroButton['+spotNo+']['+spot.contextMenuState.selectedIndex+']').classList.add("spotContextMenuHighlight");
    }

    drawContextMenu(spotNo) {
        let spot = spots[spotNo];
        let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

        spot.fixture.dmx.macros.forEach(function(macro,key) {
            let selectClass = "";
            if(key === spot.contextMenuState.selectedIndex)
                selectClass = "spotContextMenuHighlight";

            document.getElementById("spotContextMenu["+spotNo+"]").insertAdjacentHTML("beforeend", '' +
                '<div class="'+selectClass+'" id="macroButton['+spotNo+']['+key+']" onclick="executeMacro('+spotNo+','+key+')">' +
                // '<span class="spinner-grow spinner-grow-sm hiddenVis" role="status"></span>&nbsp;' +
                macro.short+'' +
                '</div>');
        });

        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="calib['+spotNo+']" onclick="initCalibration('+spotNo+')"><small>Calibrate</small></div>');
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="importCalib['+spotNo+']" onclick="startImportCalibration('+spotNo+')"><small>Import Calibration</small></div>');
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="store['+spotNo+']" onclick="storeSpotToConfigFile('+spotNo+')"><small>Store Config</small></div>');
        spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div>Spot #'+spotNo+'</div>');
    }

    hideContextMenu(spotNo) {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");
        spots[spotNo].contextMenuState.visible = false;
        spotContextMenuElement.innerHTML = "";
    }

    hideAllContextMenus() {
        spots.forEach(function(spot,spotNo) {
            this.hideContextMenu(spotNo);
        }.bind(this));
    }

    toggleContextMenu(spotNo) {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

        if(spots[spotNo].contextMenuState.visible !== false) {
            spots[spotNo].contextMenuState.visible = false;
            spotContextMenuElement.innerHTML = "";
        }
        else {
            if(!spots[spotNo].contextMenuState.locked) {
                spots[spotNo].contextMenuState.visible = true;
                spots[spotNo].contextMenuState.selectedIndex = 0;
                this.drawContextMenu(spotNo);
                this.updateContextMenu(spotNo);
            }
        }
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