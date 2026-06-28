"use strict";

/**
 * @file Virtual marker: one screen target driving multiple spots via inverse regression.
 * Implements the same control surface as {@link FollowJSSpot} for gamepad/keyboard routing.
 * @class FollowJSVirtualMarker
 */

const regression = require('./FollowJSRegression');

class FollowJSVirtualMarker {
    constructor() {
        this.isVirtualMarker = true;
        this.assignedSpotNumbers = new Set();
        this.state = {
            screenX: 0.5,
            screenY: 0.5,
            r: 0,
            frost: 0,
            focus: 0,
            dim: 1,
            shutterOpen: false,
            colorWheelIndex: 0,
            CTOin: false
        };
        this.contextMenuState = {
            visible: false,
            selectedIndex: 0,
            locked: false
        };
        this.increment = {
            x: 2.79,
            y: 4.08,
            r: 10,
            frost: 10,
            focus: 10,
            dim: 25
        };
        this.renderCache = {
            top: null,
            left: null,
            r: null,
            opacity: null,
            strokeOpacity: null
        };
    }

    /** @returns {boolean} True when at least one spot is assigned to the virtual marker. */
    isEnabled() {
        return this.assignedSpotNumbers.size > 0;
    }

    isSpotAssigned(spotNumber) {
        return this.assignedSpotNumbers.has(spotNumber);
    }

    setSpotAssigned(spotNumber, assigned) {
        if(assigned === true) {
            this.assignedSpotNumbers.add(spotNumber);
            if(global.spotExists(spotNumber))
                global.getSpot(spotNumber).manuallyPositioned = false;
        }
        else {
            this.assignedSpotNumbers.delete(spotNumber);
            if(global.spotExists(spotNumber)) {
                let spot = global.getSpot(spotNumber);
                spot.state.dim = 0;
                spot.convertAndSend();
            }
        }

        if(this.isEnabled()) {
            this.syncSharedStateFromReferenceSpot();
            this.applyPositionToAssignedSpots();
            this.applySharedStateToAssignedSpots();
        }
        this.updateMarkerVisibility();
        return true;
    }

    getAssignedSpots() {
        let assignedSpots = [];
        global.forEachSpot(function(spot) {
            if(this.isSpotAssigned(spot.spotNumber))
                assignedSpots.push(spot);
        }.bind(this));
        return assignedSpots;
    }

    getReferenceSpot() {
        const assignedSpots = this.getAssignedSpots();
        if(assignedSpots.length > 0)
            return assignedSpots[0];
        const sortedIndices = global.getSortedSpotIndices();
        if(sortedIndices.length > 0)
            return global.spots[sortedIndices[0]];
        return undefined;
    }

    get control() {
        const referenceSpot = this.getReferenceSpot();
        if(referenceSpot === undefined)
            return { gamepad: { config: { modifier: 0.01, deadZones: { movement: 0.1, other: 0.1 } }, mapping: {} } };
        return referenceSpot.control;
    }

    get config() {
        const referenceSpot = this.getReferenceSpot();
        const defaultBoundaries = {
            x: { min: 0, max: 1 },
            y: { min: 0, max: 1 },
            r: { min: 0, max: 1 },
            frost: { min: 0, max: 1 },
            focus: { min: 0, max: 1 },
            dim: { min: 0, max: 1 }
        };
        return {
            increment: this.increment,
            boundaries: referenceSpot !== undefined ? referenceSpot.config.boundaries : defaultBoundaries
        };
    }

    get spotNumber() {
        return 0;
    }

    updateMarkerVisibility() {
        let marker = document.getElementById("virtualMarker");
        if(marker === null)
            return;
        marker.classList.toggle("hiddenVis", !this.isEnabled());
        this.markUiDirty();
    }

    syncSharedStateFromReferenceSpot() {
        const referenceSpot = this.getReferenceSpot();
        if(referenceSpot === undefined)
            return;

        this.state.r = referenceSpot.state.r;
        this.state.frost = referenceSpot.state.frost;
        this.state.focus = referenceSpot.state.focus;
        this.state.dim = referenceSpot.state.dim;
        this.state.shutterOpen = referenceSpot.state.shutterOpen;
        this.state.colorWheelIndex = referenceSpot.state.colorWheelIndex;
        this.state.CTOin = referenceSpot.state.CTOin;
    }

    applySharedStateToAssignedSpots(doRetransmit = false) {
        this.getAssignedSpots().forEach(function(spot) {
            spot.state.r = this.state.r;
            spot.state.frost = this.state.frost;
            spot.state.focus = this.state.focus;
            spot.state.dim = this.state.dim;
            spot.state.shutterOpen = this.state.shutterOpen;
            spot.state.colorWheelIndex = this.state.colorWheelIndex;
            spot.state.CTOin = this.state.CTOin;
            spot.stateToDmxBuffer();
        }.bind(this));
        if(typeof global.scheduleArtNetFlush === "function")
            global.scheduleArtNetFlush(doRetransmit);
        if(typeof global.markUiDirty === "function")
            global.markUiDirty();
    }

    clearManualPositionFlags() {
        this.getAssignedSpots().forEach(function(spot) {
            spot.manuallyPositioned = false;
        });
    }

    /**
     * Map VM screen position to pan/tilt on each assigned spot; queue DMX flush.
     */
    applyPositionToAssignedSpots() {
        this.getAssignedSpots().forEach(function(spot) {
            if(spot.manuallyPositioned === true)
                return;
            let spotCoords = regression.screenToFixture(
                spot.config.translation,
                this.state.screenX,
                this.state.screenY,
                spot.config.boundaries,
                spot.state.x,
                spot.state.y
            );
            spot.applyStatePosition(spotCoords[0], spotCoords[1]);
        }.bind(this));
        if(typeof global.scheduleArtNetFlush === "function")
            global.scheduleArtNetFlush(false);
    }

    markUiDirty() {
        if(typeof global.markUiDirty === "function")
            global.markUiDirty();
    }

  /**
   * @param {number} screenX
   * @param {number} screenY
   * @param {boolean} [resyncManualSpots=false] When true, spots dragged individually rejoin VM position (VM marker drag / home).
   */
    setScreenPosition(screenX, screenY, resyncManualSpots = false) {
        this.state.screenX = Math.min(Math.max(screenX, 0), 1);
        this.state.screenY = Math.min(Math.max(screenY, 0), 1);
        if(resyncManualSpots === true)
            this.clearManualPositionFlags();
        this.markUiDirty();
        this.applyPositionToAssignedSpots();
    }

    moveSpot(dX, dY) {
        if(dX !== 0 || dY !== 0)
            this.setScreenPosition(this.state.screenX + dX, this.state.screenY + dY);
    }

    homeSpot() {
        const referenceSpot = this.getReferenceSpot();
        if(referenceSpot === undefined)
            return;

        const homePos = regression.forwardRegression(
            referenceSpot.config.translation.regression,
            referenceSpot.config.home.x,
            referenceSpot.config.home.y
        );
        this.state.screenX = homePos[0];
        this.state.screenY = homePos[1];
        this.state.r = referenceSpot.config.home.r;
        this.state.frost = referenceSpot.config.home.frost;
        this.state.focus = referenceSpot.config.home.focus;
        this.state.dim = referenceSpot.config.home.dim;
        this.state.shutterOpen = referenceSpot.config.home.shutterOpen;
        this.state.colorWheelIndex = referenceSpot.config.home.colorWheelIndex;
        this.state.CTOin = referenceSpot.config.home.CTOin;
        this.clearManualPositionFlags();
        this.applyPositionToAssignedSpots();
        this.applySharedStateToAssignedSpots(true);
    }

    resizeSpot(dR) {
        if(dR === 0)
            return;
        this.state.r = Math.min(Math.max(this.state.r + dR, this.config.boundaries.r.min), this.config.boundaries.r.max);
        this.applySharedStateToAssignedSpots();
    }

    frostSpot(dF) {
        if(dF === 0)
            return;
        this.state.frost = Math.min(Math.max(this.state.frost + dF, this.config.boundaries.frost.min), this.config.boundaries.frost.max);
        this.applySharedStateToAssignedSpots();
    }

    focusSpot(dF) {
        if(dF === 0)
            return;
        this.state.focus = Math.min(Math.max(this.state.focus + dF, this.config.boundaries.focus.min), this.config.boundaries.focus.max);
        this.applySharedStateToAssignedSpots();
    }

    dimSpot(dDim) {
        if(dDim === 0)
            return;
        this.state.dim = Math.min(Math.max(this.state.dim + dDim, this.config.boundaries.dim.min), this.config.boundaries.dim.max);
        this.applySharedStateToAssignedSpots();
    }

    snapSpot() {
        this.state.shutterOpen = (this.state.shutterOpen === false);
        this.applySharedStateToAssignedSpots(true);
    }

    snapToCTO() {
        const referenceSpot = this.getReferenceSpot();
        if(referenceSpot === undefined)
            return;

        this.state.CTOin = (this.state.CTOin === false);
        if(this.state.CTOin === false)
            this.state.colorWheelIndex = referenceSpot.fixture.dmx.presets.colorWheel.openIndex;
        else
            this.state.colorWheelIndex = referenceSpot.fixture.dmx.presets.colorWheel.ctoIndex;
        this.applySharedStateToAssignedSpots(true);
    }

    rotateColorWheel(distance) {
        if(this.state.CTOin !== false)
            return;

        const referenceSpot = this.getReferenceSpot();
        if(referenceSpot === undefined)
            return;

        let colorWheelLength = referenceSpot.fixture.dmx.colorWheelArray.length;
        this.state.colorWheelIndex = (((this.state.colorWheelIndex + distance) % colorWheelLength) + colorWheelLength) % colorWheelLength;
        this.applySharedStateToAssignedSpots(true);
    }

    scrollContextMenu(distance) {
        const referenceSpot = this.getReferenceSpot();
        if(referenceSpot === undefined || this.contextMenuState.locked)
            return;

        let macroCount = referenceSpot.fixture.dmx.macros.length;
        this.contextMenuState.selectedIndex = (((this.contextMenuState.selectedIndex + distance) % macroCount) + macroCount) % macroCount;
    }

    loadFromConfig(config) {
        if(config === undefined)
            return;

        this.assignedSpotNumbers = new Set(Array.isArray(config.assignedSpots) ? config.assignedSpots : []);
        if(config.screenX !== undefined)
            this.state.screenX = config.screenX;
        if(config.screenY !== undefined)
            this.state.screenY = config.screenY;
        if(config.increment !== undefined)
            this.increment = {...this.increment, ...config.increment};
    }

    toConfig() {
        return {
            assignedSpots: [...this.assignedSpotNumbers],
            screenX: this.state.screenX,
            screenY: this.state.screenY,
            increment: {...this.increment}
        };
    }
}

module.exports = FollowJSVirtualMarker;
