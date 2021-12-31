/**
 * A FollowJSGamepad is a single gamepad object originating from the navigator.getGamepads() array.
 *
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
}
module.exports = FollowJSGamepad;