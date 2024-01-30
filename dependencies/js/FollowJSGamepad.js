"use strict";
/**
 * A FollowJSGamepad is a single gamepad object originating from the navigator.getGamepads() array.
 * It contains the current reference as well as the button state from the previous read for edge detection
 */
class FollowJSGamepad {
    constructor(gamepadObject, spot) {
        this.id = gamepadObject.id;
        this.currentState = gamepadObject;
        this.lastButtonState = gamepadObject.buttons;
        this.assignedSpot = spot;
        // this.lastUpdate = performance.now();
    }

    update(gamepadObject) {
        if(gamepadObject.id !== this.id)
            throw "FollowJSGamepad update: ID mismatch";
        this.lastButtonState = this.currentState.buttons;
        this.currentState = gamepadObject;
        // this.lastUpdate = performance.now();
    }

    rumble(type="welcome") {
        // chrome vibration proposal draft: https://docs.google.com/document/d/1jPKzVRNzzU4dUsvLpSXm1VXPQZ8FP-0lKMT-R_p-s6g/edit
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

    read() {
        this.readAxes();
        this.readButtons();
    }

    readAxes() {
        let movementModifier = this.assignedSpot.control.gamepad.config.modifier;

        if(this.currentState.buttons[this.assignedSpot.control.gamepad.mapping.analogButtons.faster].pressed === true) {
            movementModifier = movementModifier * (1 + this.currentState.buttons[this.assignedSpot.control.gamepad.mapping.analogButtons.faster].value);
        }

        let pad1axisX = this.currentState.axes[this.assignedSpot.control.gamepad.mapping.axes.x];
        let pad1axisY = this.currentState.axes[this.assignedSpot.control.gamepad.mapping.axes.y];

        let absX = Math.abs(pad1axisX);
        let absY = Math.abs(pad1axisY);
        let dirX = Math.sign(pad1axisX);
        let dirY = Math.sign(pad1axisY);

        let pad1moveX = ((absX > this.assignedSpot.control.gamepad.config.deadZones.movement) ? ((absX-this.assignedSpot.control.gamepad.config.deadZones.movement)/(1-this.assignedSpot.control.gamepad.config.deadZones.movement)*dirX) : 0);
        let pad1moveY = ((absY > this.assignedSpot.control.gamepad.config.deadZones.movement) ? ((absY-this.assignedSpot.control.gamepad.config.deadZones.movement)/(1-this.assignedSpot.control.gamepad.config.deadZones.movement)*dirY) : 0);

        if(pad1moveX !== 0 || pad1moveY !== 0) {
            let moveX = Math.sign(this.assignedSpot.control.gamepad.mapping.axesDirections.x) * pad1moveX * movementModifier * this.assignedSpot.config.increment.x;
            let moveY = Math.sign(this.assignedSpot.control.gamepad.mapping.axesDirections.y) * pad1moveY * movementModifier * this.assignedSpot.config.increment.y;
            this.assignedSpot.moveSpot(moveX,moveY);
        }

        // Iris
        let pad1axisR = this.currentState.axes[this.assignedSpot.control.gamepad.mapping.axes.r];
        let absR = Math.abs(pad1axisR);
        let dirR = Math.sign(pad1axisR);
        let pad1moveR = ((absR > this.assignedSpot.control.gamepad.config.deadZones.other) ? ((absR-this.assignedSpot.control.gamepad.config.deadZones.other)/(1-this.assignedSpot.control.gamepad.config.deadZones.other)*dirR) : 0);
        if(pad1moveR !== 0) {
            let moveR = Math.sign(this.assignedSpot.control.gamepad.mapping.axesDirections.r) * pad1moveR * this.assignedSpot.control.gamepad.config.modifier * this.assignedSpot.config.increment.r;

            this.assignedSpot.resizeSpot(moveR);
        }

        // Dimmer
        let pad1axisDim = this.currentState.axes[this.assignedSpot.control.gamepad.mapping.axes.dim];
        let absDim = Math.abs(pad1axisDim);
        let dirDim = Math.sign(pad1axisDim);
        let pad1moveDim = ((absDim > this.assignedSpot.control.gamepad.config.deadZones.other) ? ((absDim-this.assignedSpot.control.gamepad.config.deadZones.other)/(1-this.assignedSpot.control.gamepad.config.deadZones.other)*dirDim) : 0);
        if(pad1moveDim !== 0) {
            let moveDim = Math.sign(this.assignedSpot.control.gamepad.mapping.axesDirections.dim) * pad1moveDim * this.assignedSpot.control.gamepad.config.modifier * this.assignedSpot.config.increment.dim;

            this.assignedSpot.dimSpot(moveDim);
        }
    }

    readButtons() {
        this.currentState.buttons.forEach(function (buttonState, index) {
            if (this.currentState.buttons[index].pressed === true) {
                if (this.lastButtonState[index].pressed === false) { //rising edge
                    // console.log("(rising edge) press on button " + index);

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.snap)
                        this.assignedSpot.snapSpot();

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.home)
                        this.assignedSpot.homeSpot();

                    if (calibrationActive) {
                        if(calibrationSpotNo === this.assignedSpot.spotNumber) {
                            if(index === this.assignedSpot.control.gamepad.mapping.buttons.storeCalibrationPoint) {
                                storeCalibrationPoint();
                            }
                            if(index === this.assignedSpot.control.gamepad.mapping.buttons.skipCalibrationPoint) {
                                skipCalibrationPoint();
                            }
                        }
                    }

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.colorWheelNext)
                        this.assignedSpot.rotateColorWheel(+1);

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.colorWheelPrev)
                        this.assignedSpot.rotateColorWheel(-1);

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.snapCTO)
                        this.assignedSpot.snapToCTO();

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.contextMenuShow)
                        mainView.toggleContextMenu(this.assignedSpot.spotNumber);
                    //TODO: modify

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.contextMenuUp)
                        this.assignedSpot.scrollContextMenu(-1);

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.contextMenuDown)
                        this.assignedSpot.scrollContextMenu(1);

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.contextMenuSelect) {
                        if(!this.assignedSpot.contextMenuState.locked && this.assignedSpot.contextMenuState.visible)
                            executeMacro(this.assignedSpot.spotNumber, this.assignedSpot.contextMenuState.selectedIndex);
                        //TODO: modify
                    }

                    if(index === this.assignedSpot.control.gamepad.mapping.buttons.contextMenuCancel)
                        mainView.hideContextMenu(this.assignedSpot.spotNumber);
                }
                else { //continuous press
                    // console.log("still pressing button " + index);
                    switch (index) {
                        case this.assignedSpot.control.gamepad.mapping.buttons.focusUp:
                            this.assignedSpot.focusSpot(this.assignedSpot.config.increment.focus * this.assignedSpot.control.gamepad.config.modifier)
                            break;
                        case this.assignedSpot.control.gamepad.mapping.buttons.focusDown:
                            this.assignedSpot.focusSpot(-1 * this.assignedSpot.config.increment.focus * this.assignedSpot.control.gamepad.config.modifier)
                            break;
                        case this.assignedSpot.control.gamepad.mapping.buttons.frostUp:
                            this.assignedSpot.frostSpot(this.assignedSpot.config.increment.frost * this.assignedSpot.control.gamepad.config.modifier)
                            break;
                        case this.assignedSpot.control.gamepad.mapping.buttons.frostDown:
                            this.assignedSpot.frostSpot(-1 * this.assignedSpot.config.increment.frost * this.assignedSpot.control.gamepad.config.modifier)
                            break;
                    }
                }
            }
        });
    }
}
module.exports = FollowJSGamepad;