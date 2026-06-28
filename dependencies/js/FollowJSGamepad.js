"use strict";

/**
 * @file Gamepad wrapper around `navigator.getGamepads()` entry: edge-triggered buttons, axis deadzones.
 * Control target is spot or VM; context menu actions skipped when target is VM.
 * @class FollowJSGamepad
 */

class FollowJSGamepad {
    /**
     * @param {Gamepad} gamepadObject Live gamepad from browser API.
     * @param {import('./FollowJSSpot')|import('./FollowJSVirtualMarker')|null} controlTarget Spot, VM, or null when unassigned.
     */
    constructor(gamepadObject, controlTarget) {
        this.id = gamepadObject.id;
        this.currentState = gamepadObject;
        this.lastButtonState = gamepadObject.buttons.map((button) => button.pressed);
        this.controlTarget = controlTarget;
        this.watchedButtonIndices = null;
        this.rebuildWatchedButtonIndices();
    }

    /** @param {import('./FollowJSSpot')|import('./FollowJSVirtualMarker')|null} controlTarget Spot, VM, or null when unassigned. */
    setControlTarget(controlTarget) {
        this.controlTarget = controlTarget;
        this.rebuildWatchedButtonIndices();
    }

    /** Cache button indices referenced by current target's gamepad mapping (for edge detection). */
    rebuildWatchedButtonIndices() {
        if(this.controlTarget === undefined || this.controlTarget === null || this.controlTarget.control === undefined) {
            this.watchedButtonIndices = null;
            return;
        }

        let mapping = this.controlTarget.control.gamepad.mapping;
        let indices = new Set();
        Object.values(mapping.buttons).forEach((index) => indices.add(index));
        if(mapping.analogButtons !== undefined)
            Object.values(mapping.analogButtons).forEach((index) => indices.add(index));
        this.watchedButtonIndices = indices;
    }

    /** @returns {boolean} */
    controlsVirtualMarker() {
        return this.controlTarget !== undefined && this.controlTarget !== null && this.controlTarget.isVirtualMarker === true;
    }

    /** @returns {import('./FollowJSSpot')|null} Null when VM (no per-spot context menu). */
    getContextTarget() {
        if(this.controlTarget === undefined || this.controlTarget === null || this.controlsVirtualMarker())
            return null;
        return this.controlTarget;
    }

    /** @param {Gamepad} gamepadObject Must match `this.id`. */
    update(gamepadObject) {
        if(gamepadObject.id !== this.id)
            throw "FollowJSGamepad update: ID mismatch";
        this.lastButtonState = this.currentState.buttons.map((button) => button.pressed);
        this.currentState = gamepadObject;
    }

    /** @param {string} [type="welcome"] Haptic preset. */
    rumble(type="welcome") {
        if(this.currentState.vibrationActuator) {
            switch (type) {
                case "welcome":
                default:
                    this.currentState.vibrationActuator.playEffect("dual-rumble", {
                        duration: 200,
                        strongMagnitude: 0.4,
                        weakMagnitude: 0.1
                    });
                    break;
            }
        }
    }

    /** Poll axes and buttons once per main-loop frame. */
    read() {
        if(this.controlTarget === undefined || this.controlTarget === null)
            return;
        this.readAxes();
        this.readButtons();
    }

    readAxes() {
        let target = this.controlTarget;
        let movementModifier = target.control.gamepad.config.modifier;

        if(this.currentState.buttons[target.control.gamepad.mapping.analogButtons.faster].pressed === true) {
            movementModifier = movementModifier * (1 + this.currentState.buttons[target.control.gamepad.mapping.analogButtons.faster].value);
        }

        let pad1axisX = this.currentState.axes[target.control.gamepad.mapping.axes.x];
        let pad1axisY = this.currentState.axes[target.control.gamepad.mapping.axes.y];

        let absX = Math.abs(pad1axisX);
        let absY = Math.abs(pad1axisY);
        let dirX = Math.sign(pad1axisX);
        let dirY = Math.sign(pad1axisY);

        let pad1moveX = ((absX > target.control.gamepad.config.deadZones.movement) ? ((absX-target.control.gamepad.config.deadZones.movement)/(1-target.control.gamepad.config.deadZones.movement)*dirX) : 0);
        let pad1moveY = ((absY > target.control.gamepad.config.deadZones.movement) ? ((absY-target.control.gamepad.config.deadZones.movement)/(1-target.control.gamepad.config.deadZones.movement)*dirY) : 0);

        if(pad1moveX !== 0 || pad1moveY !== 0) {
            let moveX = Math.sign(target.control.gamepad.mapping.axesDirections.x) * pad1moveX * movementModifier * target.config.increment.x;
            let moveY = Math.sign(target.control.gamepad.mapping.axesDirections.y) * pad1moveY * movementModifier * target.config.increment.y;
            target.moveSpot(moveX,moveY);
        }

        let pad1axisR = this.currentState.axes[target.control.gamepad.mapping.axes.r];
        let absR = Math.abs(pad1axisR);
        let dirR = Math.sign(pad1axisR);
        let pad1moveR = ((absR > target.control.gamepad.config.deadZones.other) ? ((absR-target.control.gamepad.config.deadZones.other)/(1-target.control.gamepad.config.deadZones.other)*dirR) : 0);
        if(pad1moveR !== 0) {
            let moveR = Math.sign(target.control.gamepad.mapping.axesDirections.r) * pad1moveR * target.control.gamepad.config.modifier * target.config.increment.r;
            target.resizeSpot(moveR);
        }

        let pad1axisDim = this.currentState.axes[target.control.gamepad.mapping.axes.dim];
        let absDim = Math.abs(pad1axisDim);
        let dirDim = Math.sign(pad1axisDim);
        let pad1moveDim = ((absDim > target.control.gamepad.config.deadZones.other) ? ((absDim-target.control.gamepad.config.deadZones.other)/(1-target.control.gamepad.config.deadZones.other)*dirDim) : 0);
        if(pad1moveDim !== 0) {
            let moveDim = Math.sign(target.control.gamepad.mapping.axesDirections.dim) * pad1moveDim * target.control.gamepad.config.modifier * target.config.increment.dim;
            target.dimSpot(moveDim);
        }
    }

    readButtons() {
        if(this.watchedButtonIndices === null || this.watchedButtonIndices.size === 0)
            return;

        let target = this.controlTarget;
        let contextTarget = this.getContextTarget();
        let buttonMapping = target.control.gamepad.mapping.buttons;

        for(const index of this.watchedButtonIndices) {
            let buttonState = this.currentState.buttons[index];
            if(buttonState === undefined)
                continue;

            if (buttonState.pressed === true) {
                if (this.lastButtonState[index] === false) {
                    if(index === buttonMapping.snap)
                        target.snapSpot();

                    if(index === buttonMapping.home)
                        target.homeSpot();

                    if(global.calibrationActive && global.calibrationSpotNo === target.spotNumber) {
                        if(index === buttonMapping.storeCalibrationPoint)
                            global.storeCalibrationPoint();
                        if(index === buttonMapping.skipCalibrationPoint)
                            global.skipCalibrationPoint();
                    }

                    if(index === buttonMapping.colorWheelNext)
                        target.rotateColorWheel(+1);

                    if(index === buttonMapping.colorWheelPrev)
                        target.rotateColorWheel(-1);

                    if(index === buttonMapping.snapCTO)
                        target.snapToCTO();

                    if(contextTarget !== null && index === buttonMapping.contextMenuShow)
                        global.mainView.toggleContextMenu(contextTarget.spotNumber);

                    if(contextTarget !== null && index === buttonMapping.contextMenuUp)
                        contextTarget.scrollContextMenu(-1);

                    if(contextTarget !== null && index === buttonMapping.contextMenuDown)
                        contextTarget.scrollContextMenu(1);

                    if(contextTarget !== null && index === buttonMapping.contextMenuSelect) {
                        if(!contextTarget.contextMenuState.locked && contextTarget.contextMenuState.visible)
                            global.executeMacro(contextTarget.spotNumber, contextTarget.contextMenuState.selectedIndex);
                    }

                    if(contextTarget !== null && index === buttonMapping.contextMenuCancel)
                        global.mainView.hideContextMenu(contextTarget.spotNumber);
                }
                else {
                    switch (index) {
                        case buttonMapping.focusUp:
                            target.focusSpot(target.config.increment.focus * target.control.gamepad.config.modifier)
                            break;
                        case buttonMapping.focusDown:
                            target.focusSpot(-1 * target.config.increment.focus * target.control.gamepad.config.modifier)
                            break;
                        case buttonMapping.frostUp:
                            target.frostSpot(target.config.increment.frost * target.control.gamepad.config.modifier)
                            break;
                        case buttonMapping.frostDown:
                            target.frostSpot(-1 * target.config.increment.frost * target.control.gamepad.config.modifier)
                            break;
                    }
                }
            }
        }
    }
}
module.exports = FollowJSGamepad;
