"use strict";

/**
 * @file Single followspot: DMX state, fixture mapping, calibration, context menu, batched Art-Net.
 * @class FollowJSSpot
 */

const regression = require('./FollowJSRegression');
const regressionPending = require('./FollowJSRegressionPending');

function clampDmxByte(value) {
    if(!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(255, Math.floor(value)));
}

class FollowJSSpot {
    /**
     * @param {number} spotNumber 1-based id (spot1.json → 1); slot `global.spots[spotNumber - 1]`.
     * @param {Object} configObject Parsed spot JSON (home, boundaries, translation, connection, …).
     * @param {Object} artnetSender Shared {@link module:libDmxArtNet} sender (512-ch universe buffer).
     */
    constructor(spotNumber, configObject, artnetSender) {
        this.spotNumber = spotNumber;
        this.contextMenuState = {
            visible: false,
            selectedIndex: 0,
            locked: false,
            /** @type {'marker'|'footer'} */
            placement: 'marker',
            /** @type {HTMLElement|null} Footer menu button when placement is `footer`. */
            footerAnchor: null
        };

        try{
            this.config = configObject;
            this.fixture = fixtureLib[this.config.fixtureTypeFromLib];
            this.control = {
                gamepad: {
                    config: gamepadLib[this.config.control.gamepad.typeFromLib].config,
                    mapping: gamepadLib[this.config.control.gamepad.typeFromLib].mapping[this.config.control.gamepad.mappingFromLib]
                },
                keyboard: this.config.control.keyboard
            };
            this.artnetSender = artnetSender;
        }
        catch(e) {
            console.log("Error creating spot: "+e);
        }

        this.state = new Object(this.config.home); // create Object from template
        this.dmxBuffer = [];
        /** When true, VM pan/tilt sync must not overwrite this spot (marker / direct control). */
        this.manuallyPositioned = false;
        this.cachedScreenPos = null;
        this.renderCache = {
            dmx: {},
            gauges: { dim: null, color: null, focus: null, frost: null, colorBg: null },
            marker: { top: null, left: null, r: null, opacity: null },
            contextMenu: { top: null, left: null, transform: null, selectedIndex: null }
        };
        this.dom = {
            marker: null,
            markerCircle: null,
            contextMenu: null,
            footerMenuButton: null,
            dmxCells: {},
            gauges: { dim: null, color: null, focus: null, frost: null }
        };

        for(const [chan,data] of Object.entries(this.fixture.dmx.channels)) {
            // console.log("set channel "+chan);
            this.dmxBuffer[chan] = data.value;
        }

        this.homeSpot();
    }

    /** @returns {number} Zero-based index (`spotNumber - 1`). */
    get spotIndex() {
        return this.spotNumber - 1;
    }

    /**
     * Map state → DMX buffer and queue Art-Net transmit.
     * @param {boolean} [doRetransmit=false] Second flush for glitch-sensitive channels (shutter snap).
     */
    convertAndSend(doRetransmit = false) {
        this.stateToDmxBuffer();
        this.sendDMX(doRetransmit);
    }

    /** Drop cached forward-regression screen position; marks UI dirty. */
    invalidateScreenCache() {
        this.cachedScreenPos = null;
        if(typeof global.markUiDirty === "function")
            global.markUiDirty();
    }

    /**
     * Cached forward map of current pan/tilt → screen (normalized).
     * @returns {import('./FollowJSRegression').Vec2}
     */
    getScreenPosition() {
        if(this.cachedScreenPos === null) {
            this.cachedScreenPos = regression.forwardRegression(
                this.config.translation.regression,
                this.state.x,
                this.state.y
            );
        }
        return this.cachedScreenPos;
    }

    sendDMX(doRetransmit = false) {
        if(typeof global.scheduleArtNetFlush === "function")
            global.scheduleArtNetFlush(doRetransmit);
        else if(typeof global.flushArtNetIfPending === "function")
            global.flushArtNetIfPending();
        if(typeof global.markUiDirty === "function")
            global.markUiDirty();
    }

    /**
     * Write pan/tilt to state and DMX buffer without flushing (for batched drags).
     * @param {number} x Normalized pan.
     * @param {number} y Normalized tilt.
     */
    applyStatePosition(x, y) {
        this.state.x = Math.min(Math.max(x, this.config.boundaries.x.min), this.config.boundaries.x.max);
        this.state.y = Math.min(Math.max(y, this.config.boundaries.y.min), this.config.boundaries.y.max);
        this.manuallyPositioned = false;
        this.invalidateScreenCache();
        this.stateToDmxBuffer();
    }

    sendDMXImmediate(doRetransmit = false) {
        this.stateToDmxBuffer();
        if(typeof global.scheduleArtNetFlush === "function" && typeof global.flushArtNetIfPending === "function") {
            global.scheduleArtNetFlush(doRetransmit);
            global.flushArtNetIfPending();
        }
        if(typeof global.markUiDirty === "function")
            global.markUiDirty();
    }

    stateToDmxBuffer() {
        let pan  = (this.state.x * (this.fixture.dmx.range.x.max - this.fixture.dmx.range.x.min) + this.fixture.dmx.range.x.min);
        let tilt = (this.state.y * (this.fixture.dmx.range.y.max - this.fixture.dmx.range.y.min) + this.fixture.dmx.range.y.min);

        this.dmxBuffer[this.fixture.dmx.mapping.pan] = clampDmxByte(pan / 256);
        this.dmxBuffer[this.fixture.dmx.mapping.panFine] = clampDmxByte(pan % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.tilt] = clampDmxByte(tilt / 256);
        this.dmxBuffer[this.fixture.dmx.mapping.tiltFine] = clampDmxByte(tilt % 256);

        let iris = (Math.min(this.state.r, 1) * (this.fixture.dmx.range.r.max - this.fixture.dmx.range.r.min) + this.fixture.dmx.range.r.min);
        let frost = (Math.min(this.state.frost, 1) * (this.fixture.dmx.range.frost.max - this.fixture.dmx.range.frost.min) + this.fixture.dmx.range.frost.min);
        let focus = (Math.min(this.state.focus, 1) * (this.fixture.dmx.range.focus.max - this.fixture.dmx.range.focus.min) + this.fixture.dmx.range.focus.min);
        let dim = (Math.min(this.state.dim, 1) * (this.fixture.dmx.range.dim.max - this.fixture.dmx.range.dim.min) + this.fixture.dmx.range.dim.min);
        let shut = (this.state.shutterOpen === true) ? this.fixture.dmx.presets.shutter.open : this.fixture.dmx.presets.shutter.close;
        let colorW = this.fixture.dmx.colorWheelArray[(this.state.colorWheelIndex % (this.fixture.dmx.colorWheelArray).length)].value;

        this.dmxBuffer[this.fixture.dmx.mapping.radius] = clampDmxByte(iris);
        this.dmxBuffer[this.fixture.dmx.mapping.frost] = clampDmxByte(frost);
        this.dmxBuffer[this.fixture.dmx.mapping.focus] = clampDmxByte(focus);
        this.dmxBuffer[this.fixture.dmx.mapping.dim] = clampDmxByte(dim / 256);
        this.dmxBuffer[this.fixture.dmx.mapping.dimFine] = clampDmxByte(dim % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.shutter] = clampDmxByte(shut);
        this.dmxBuffer[this.fixture.dmx.mapping.colorWheel] = clampDmxByte(colorW);
    }


    homeSpot() {
        this.state = {...this.config.home}; //create shallow copy of home state
        this.manuallyPositioned = false;
        //TODO: check that home is within config.boundaries
        this.invalidateScreenCache();
        this.convertAndSend(true);
    }

    setCurrentStateAsHomeConfig() {
        this.config.home = {...this.state};
    }

    moveSpot(dX, dY) {
        if(dX === 0 && dY === 0)
            return;
        if (dX !== 0)
            this.state.x = Math.min(Math.max(this.state.x + dX, this.config.boundaries.x.min), this.config.boundaries.x.max);
        if (dY !== 0)
            this.state.y = Math.min(Math.max(this.state.y + dY, this.config.boundaries.y.min), this.config.boundaries.y.max);
        this.manuallyPositioned = true;
        this.invalidateScreenCache();
        this.convertAndSend();
    }

    setPosition(x, y) {
        this.state.x = Math.min(Math.max(x, this.config.boundaries.x.min), this.config.boundaries.x.max);
        this.state.y = Math.min(Math.max(y, this.config.boundaries.y.min), this.config.boundaries.y.max);
        this.manuallyPositioned = true;
        this.invalidateScreenCache();
        this.convertAndSend();
    }
    resizeSpot(dR) {
        if(dR !== 0)
            this.state.r = Math.min(Math.max(this.state.r+dR, this.config.boundaries.r.min),this.config.boundaries.r.max);
        this.convertAndSend();
    }
    frostSpot(dF) {
        if(dF !== 0)
            this.state.frost = Math.min(Math.max(this.state.frost+dF, this.config.boundaries.frost.min),this.config.boundaries.frost.max);
        this.convertAndSend();
    }
    focusSpot(dF) {
        if(dF !== 0)
            this.state.focus = Math.min(Math.max(this.state.focus+dF, this.config.boundaries.focus.min),this.config.boundaries.focus.max);
        this.convertAndSend();
    }
    dimSpot(dDim) {
        if(dDim !== 0)
            this.state.dim = Math.min(Math.max(this.state.dim+dDim, this.config.boundaries.dim.min),this.config.boundaries.dim.max);
        this.convertAndSend();
    }
    snapSpot() {
        this.state.shutterOpen = (this.state.shutterOpen === false);
        this.convertAndSend(true);
    }
    snapToCTO() {
        this.state.CTOin = (this.state.CTOin === false);

        if(this.state.CTOin === false)
            this.setColorWheel(this.fixture.dmx.presets.colorWheel.openIndex);
        else
            this.setColorWheel(this.fixture.dmx.presets.colorWheel.ctoIndex);

        this.convertAndSend(true);
    }

    setColorWheel(index) {
        let cwLen = this.fixture.dmx.colorWheelArray.length;
        this.state.colorWheelIndex = (index % cwLen);

        this.convertAndSend(true);
    }
    rotateColorWheel(distance) {
        if(this.state.CTOin === false) {
            let cwLen = this.fixture.dmx.colorWheelArray.length;
            this.state.colorWheelIndex = (((this.state.colorWheelIndex + distance) % cwLen) + cwLen) % cwLen;

            this.convertAndSend(true);
        }
    }

    scrollContextMenu(distance) {
        if(!this.contextMenuState.locked) {
            this.contextMenuState.selectedIndex = (((this.contextMenuState.selectedIndex + distance) % this.fixture.dmx.macros.length) + this.fixture.dmx.macros.length) % this.fixture.dmx.macros.length;
            if(typeof global.markUiDirty === "function")
                global.markUiDirty();
        }
    }

    // --- Calibration (9×9 grid, row-major in global.calibrationValues) ---

    /** Start grid calibration for this spot; sets global.calibrationActive. */
    initCalibration() {
        if(global.calibrationActive && global.calibrationSpotNo !== undefined)
            global.getSpot(global.calibrationSpotNo).endCalibration();

        regressionPending.discardPendingRegressionForSpot(this.spotNumber);
        document.getElementById('cancelCalibrationButton').classList.remove("hidden");
        global.mainView.hideAllContextMenus();
        console.log("init calibration for spot " + this.spotNumber);
        global.calibrationActive = true;
        global.calibrationStep = 1;
        global.calibrationSpotNo = this.spotNumber;
        global.calibrationValues = new Array(9*9);
        this.hideAllSpotMarkerExceptFor(this.spotNumber);
        this.hideAllSpotStatusExceptFor(this.spotNumber);
        this.setSpotStatusOpacity(this.spotNumber, 0.3);
        global.mainView.showGridOverlay();
        this.showCalibrationPoint();
        if(typeof global.applyAllGamepadTargets === "function")
            global.applyAllGamepadTargets();
        if(typeof global.printConnectedGamepadCount === "function")
            global.printConnectedGamepadCount();
    }

    /** Record current pan/tilt for active grid cell; advance or finish. */
    storeCalibrationPoint() {
        global.calibrationValues[global.calibrationStep-1] = [this.state.x, this.state.y];
        global.calibrationStep++;
        this.showCalibrationPoint();
        if(global.calibrationStep > global.calibrationValues.length) {
            this.finishCalibration();
            this.endCalibration();
        }
    }

    /** Mark active grid cell skipped ([null,null]); advance or finish. */
    skipCalibrationPoint() {
        global.calibrationValues[global.calibrationStep-1] = [null, null];
        global.calibrationStep++;
        this.showCalibrationPoint();
        if(global.calibrationStep > global.calibrationValues.length) {
            this.finishCalibration();
            this.endCalibration();
        }
    }

    /** Tear down calib UI state without opening regression overlay. */
    endCalibration() {
        global.mainView.highlightImageCoord(false);
        this.showAllSpotMarker();
        this.showAllSpotStatus();
        this.setSpotStatusOpacity(this.spotNumber, 1);
        document.getElementById('cancelCalibrationButton').classList.add("hidden");
        global.mainView.hideGridOverlay();
        global.calibrationActive = false;
        global.calibrationSpotNo = undefined;
        if(typeof global.applyAllGamepadTargets === "function")
            global.applyAllGamepadTargets();
        if(typeof global.printConnectedGamepadCount === "function")
            global.printConnectedGamepadCount();
    }

    /** Grid complete: open regression degree selection overlay. */
    finishCalibration() {
        regressionPending.beginRegressionSelection(this.spotNumber, global.calibrationValues);
        document.getElementById('cancelCalibrationButton').classList.add("hidden");
    }

    showCalibrationPoint() {
        global.mainView.highlightImageCoord(true,(((global.calibrationStep-1) % 9) + 1) * 0.1,(Math.floor((global.calibrationStep-1) / 9) + 1) * 0.1);
    }

    // Helper methods for calibration
    hideAllSpotMarkerExceptFor(dontHideSpotNo) {
        global.forEachSpot(function(spot) {
            if(spot.spotNumber !== dontHideSpotNo) {
                let spotMarkerElement = document.getElementById("spotMarker["+spot.spotNumber+"]");
                spotMarkerElement.classList.add("hiddenVis");
            }
        });
        let virtualMarkerElement = document.getElementById("virtualMarker");
        if(virtualMarkerElement !== null)
            virtualMarkerElement.classList.add("hiddenVis");
    }

    showAllSpotMarker() {
        global.forEachSpot(function(spot) {
            let spotMarkerElement = document.getElementById("spotMarker["+spot.spotNumber+"]");
            spotMarkerElement.classList.remove("hiddenVis");
        });
        if(global.virtualMarker !== undefined)
            global.virtualMarker.updateMarkerVisibility();
    }

    hideAllSpotStatusExceptFor(dontHideSpotNo) {
        global.forEachSpot(function(spot) {
            if(spot.spotNumber !== dontHideSpotNo) {
                let spotStatusElement = document.getElementById("spotStatusOverlay["+spot.spotNumber+"]");
                spotStatusElement.classList.add("hiddenVis");
            }
        });
    }

    showAllSpotStatus() {
        global.forEachSpot(function(spot) {
            let spotStatusElement = document.getElementById("spotStatusOverlay["+spot.spotNumber+"]");
            spotStatusElement.classList.remove("hiddenVis");
        });
    }

    setSpotStatusOpacity(spotNo, opacity) {
        let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
        spotStatusElement.style.opacity = Math.min(1,Math.max(0,opacity)).toString();
    }

    // Context menu methods
    drawContextMenu() {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");

        this.fixture.dmx.macros.forEach(function(macro,key) {
            let selectClass = "";
            if(key === this.contextMenuState.selectedIndex)
                selectClass = "spotContextMenuHighlight";

            document.getElementById("spotContextMenu["+this.spotNumber+"]").insertAdjacentHTML("beforeend", '' +
                '<div class="'+selectClass+'" id="macroButton['+this.spotNumber+']['+key+']" onclick="executeMacro('+this.spotNumber+','+key+')">' +
                macro.short+'' +
                '</div>');
        }.bind(this));

        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="calib['+this.spotNumber+']" onclick="initCalibration('+this.spotNumber+')"><small>Start Calibration</small></div>');
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="viewRegression['+this.spotNumber+']" onclick="showRegressionOverlay('+this.spotNumber+')"><small>View Regression</small></div>');
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="store['+this.spotNumber+']" onclick="storeSpotHomeToConfigFile('+this.spotNumber+')"><small>Save Home</small></div>');
        spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div>Spot #'+this.spotNumber+'</div>');
    }

    updateContextMenu() {
        let spotContextMenuElement = this.dom.contextMenu;
        if(spotContextMenuElement === null)
            spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");

        let cache = this.renderCache.contextMenu;
        let top, left, transform;

        if(this.contextMenuState.placement === 'footer' && this.contextMenuState.footerAnchor !== null) {
            spotContextMenuElement.classList.add("spotContextMenuFooterAnchored");
            let anchorRect = this.contextMenuState.footerAnchor.getBoundingClientRect();
            let menuHeight = spotContextMenuElement.offsetHeight || 200;
            let placeAbove = anchorRect.bottom + menuHeight > window.innerHeight - 8;
            top = (placeAbove ? anchorRect.top - menuHeight - 4 : anchorRect.bottom + 4) + "px";
            left = anchorRect.left + "px";
            transform = "none";
        }
        else {
            spotContextMenuElement.classList.remove("spotContextMenuFooterAnchored");
            let pos = this.getScreenPosition();
            let pos_x = pos[0];
            let pos_y = pos[1];
            let translate_y = ((1-pos_y) > 0.65) ? "-100%" : "0";
            let translate_x = (pos_x > 0.75) ? "-100%" : "0";
            transform = "translate("+translate_x+","+translate_y+")";
            top = ((1-pos_y) * global.mainView.y_img_max).toString()+"px";
            left = (pos_x * global.mainView.x_img_max).toString()+"px";
        }

        if(cache.top !== top)
            spotContextMenuElement.style.top = top;
        if(cache.left !== left)
            spotContextMenuElement.style.left = left;
        if(cache.transform !== transform)
            spotContextMenuElement.style.transform = transform;

        if(cache.selectedIndex !== this.contextMenuState.selectedIndex) {
            if(cache.selectedIndex !== null) {
                let previousButton = document.getElementById('macroButton['+this.spotNumber+']['+cache.selectedIndex+']');
                if(previousButton !== null)
                    previousButton.classList.remove("spotContextMenuHighlight");
            }
            let selectedButton = document.getElementById('macroButton['+this.spotNumber+']['+this.contextMenuState.selectedIndex+']');
            if(selectedButton !== null)
                selectedButton.classList.add("spotContextMenuHighlight");
        }

        cache.top = top;
        cache.left = left;
        cache.transform = transform;
        cache.selectedIndex = this.contextMenuState.selectedIndex;
    }

    hideContextMenu() {
        let spotContextMenuElement = this.dom.contextMenu;
        if(spotContextMenuElement === null)
            spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");
        this.contextMenuState.visible = false;
        this.contextMenuState.selectedIndex = null;
        this.contextMenuState.placement = 'marker';
        this.contextMenuState.footerAnchor = null;
        this.renderCache.contextMenu.selectedIndex = null;
        this.renderCache.contextMenu.top = null;
        this.renderCache.contextMenu.left = null;
        this.renderCache.contextMenu.transform = null;
        spotContextMenuElement.classList.remove("spotContextMenuFooterAnchored");
        spotContextMenuElement.classList.add("hidden");
        spotContextMenuElement.innerHTML = "";
    }

    /**
     * @param {'marker'|'footer'} [placement='marker']
     * @param {HTMLElement|null} [anchorElement=null] Footer ⋮ button when placement is `footer`.
     */
    showContextMenu(placement = 'marker', anchorElement = null) {
        if(this.contextMenuState.locked)
            return;

        let spotContextMenuElement = this.dom.contextMenu;
        if(spotContextMenuElement === null)
            spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");

        this.contextMenuState.visible = true;
        this.contextMenuState.placement = placement;
        this.contextMenuState.footerAnchor = placement === 'footer' ? anchorElement : null;
        this.contextMenuState.selectedIndex = 0;
        spotContextMenuElement.classList.remove("hidden");
        this.drawContextMenu();
        this.updateContextMenu();
        if(typeof global.markUiDirty === "function")
            global.markUiDirty();
    }

    /**
     * @param {'marker'|'footer'} [placement='marker']
     * @param {HTMLElement|null} [anchorElement=null]
     */
    toggleContextMenu(placement = 'marker', anchorElement = null) {
        if(this.contextMenuState.visible) {
            this.hideContextMenu();
            return;
        }
        this.showContextMenu(placement, anchorElement);
    }
}

module.exports = FollowJSSpot;