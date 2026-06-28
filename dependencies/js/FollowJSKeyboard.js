"use strict";

/**
 * @file Keyboard routing: VM mode always controls the virtual marker.
 * Direct mode: digit keys select spot target (session-only). Calibration overrides temporarily.
 * @class FollowJSKeyboard
 */

class FollowJSKeyboard {
    constructor() {
        /** @type {null|number} Session-only spot selection in direct mode; null = none. */
        this.keyboardAssignment = null;
        this.enabled = false;
    }

    isDirectMode() {
        return typeof global.getControlMode === "function" && global.getControlMode() === "direct";
    }

    /**
     * @param {null|number} assignment
     */
    setKeyboardAssignment(assignment) {
        this.keyboardAssignment = assignment;
        if(typeof global.printConnectedGamepadCount === "function")
            global.printConnectedGamepadCount();
    }

    /** Clear session keyboard spot selection (e.g. when leaving direct mode). */
    clearKeyboardAssignment() {
        this.keyboardAssignment = null;
    }

    /** @returns {string} Footer label fragment: `VM`, `SpN`, or `off`. */
    getAssignmentLabel() {
        if(global.calibrationActive && global.calibrationSpotNo !== undefined)
            return "Sp" + global.calibrationSpotNo;
        if(this.isDirectMode()) {
            if(typeof this.keyboardAssignment === "number")
                return "Sp" + this.keyboardAssignment;
            return "off";
        }
        return "VM";
    }

    /**
     * @returns {import('./FollowJSVirtualMarker')|import('./FollowJSSpot')|null}
     */
    getControlTarget() {
        if(global.calibrationActive && global.calibrationSpotNo !== undefined && global.spotExists(global.calibrationSpotNo))
            return global.getSpot(global.calibrationSpotNo);
        if(this.isDirectMode()) {
            if(typeof this.keyboardAssignment === "number" && global.spotExists(this.keyboardAssignment))
                return global.getSpot(this.keyboardAssignment);
            return null;
        }
        if(global.virtualMarker !== undefined && global.virtualMarker.isEnabled())
            return global.virtualMarker;
        return null;
    }

    /** Attach `keydown` listener on window. */
    enable() {
        if (!this.enabled) {
            window.removeEventListener('keydown', this.keyboardInputCallback.bind(this));
            window.addEventListener('keydown', this.keyboardInputCallback.bind(this));
            this.enabled = true;
        }
    }

    /** Detach `keydown` listener. */
    disable() {
        if (this.enabled) {
            window.removeEventListener('keydown', this.keyboardInputCallback.bind(this));
            this.enabled = false;
        }
    }

    /** @param {KeyboardEvent} e */
    keyboardInputCallback(e) {
        if(this.isDirectMode()) {
            let singleDigit = new RegExp("^[0-9]$");
            if(singleDigit.test(e.key)) {
                if(e.key === "0") {
                    this.setKeyboardAssignment(null);
                    return;
                }
                let selectedSpotNo = Number.parseInt(e.key, 10);
                if(global.spotExists(selectedSpotNo))
                    this.setKeyboardAssignment(selectedSpotNo);
                return;
            }
        }

        let controlTarget = this.getControlTarget();
        if(controlTarget !== null) {
            let movementKey = this.isMovementKey(e.key);
            switch(e.key) {
                case global.systemConf.keyboardControl.mapping.home:
                    controlTarget.homeSpot();
                    break;
                case global.systemConf.keyboardControl.mapping.yInc:
                    controlTarget.moveSpot(0, controlTarget.config.increment.y * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.xDec:
                    controlTarget.moveSpot(-1 * controlTarget.config.increment.x * global.systemConf.keyboardControl.config.modifier, 0);
                    break;
                case global.systemConf.keyboardControl.mapping.yDec:
                    controlTarget.moveSpot(0, -1 * controlTarget.config.increment.y * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.xInc:
                    controlTarget.moveSpot(controlTarget.config.increment.x * global.systemConf.keyboardControl.config.modifier, 0);
                    break;
                case global.systemConf.keyboardControl.mapping.smaller:
                    controlTarget.resizeSpot(-1 * controlTarget.config.increment.r * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.bigger:
                    controlTarget.resizeSpot(controlTarget.config.increment.r * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.dimDown:
                    controlTarget.dimSpot(-1 * controlTarget.config.increment.dim * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.dimUp:
                    controlTarget.dimSpot(controlTarget.config.increment.dim * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.nextColor:
                    controlTarget.rotateColorWheel(+1);
                    break;
                case global.systemConf.keyboardControl.mapping.prevColor:
                    controlTarget.rotateColorWheel(-1);
                    break;
                case global.systemConf.keyboardControl.mapping.cto:
                    controlTarget.snapToCTO();
                    break;
                case global.systemConf.keyboardControl.mapping.snap:
                    controlTarget.snapSpot();
                    break;
                case global.systemConf.keyboardControl.mapping.storeCalibrationPoint:
                    if(global.calibrationActive && controlTarget !== null)
                        controlTarget.storeCalibrationPoint();
                    break;
                case global.systemConf.keyboardControl.mapping.skipCalibrationPoint:
                    if(global.calibrationActive && controlTarget !== null)
                        controlTarget.skipCalibrationPoint();
                    break;
            }
            if(movementKey && typeof global.hideControllerConnectOverlay === "function")
                global.hideControllerConnectOverlay();
        }
    }

    /** @param {string} key */
    isMovementKey(key) {
        let mapping = global.systemConf.keyboardControl.mapping;
        return key === mapping.home
            || key === mapping.yInc || key === mapping.yDec
            || key === mapping.xInc || key === mapping.xDec
            || key === mapping.smaller || key === mapping.bigger;
    }
}

module.exports = FollowJSKeyboard;
