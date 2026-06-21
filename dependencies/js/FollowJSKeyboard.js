"use strict";
/**
 * FollowJSKeyboard handles keyboard input for spot control
 */
class FollowJSKeyboard {
    constructor() {
        this.keyboardControlSpotNo = 1;
        this.enabled = false;
    }

    enable() {
        if (!this.enabled) {
            window.removeEventListener('keydown', this.keyboardInputCallback.bind(this));
            window.addEventListener('keydown', this.keyboardInputCallback.bind(this));
            this.enabled = true;
        }
    }

    disable() {
        if (this.enabled) {
            window.removeEventListener('keydown', this.keyboardInputCallback.bind(this));
            this.enabled = false;
        }
    }

    keyboardInputCallback(e) {
        // console.log("(which:" + (e.which) + ", key:" + (e.key) + ", code:" + (e.code) + ")");
        let singleDigit = new RegExp("^[0-9]$");
        let selectedSpotNo = Number.parseInt(e.key);
        if(singleDigit.test(e.key) && global.spotExists(selectedSpotNo)) {
            this.keyboardControlSpotNo = selectedSpotNo;
        }
        else if(global.spotExists(this.keyboardControlSpotNo)) {
            let spot = global.getSpot(this.keyboardControlSpotNo);
            switch(e.key) {
                case global.systemConf.keyboardControl.mapping.home:
                    spot.homeSpot();
                    break;
                case global.systemConf.keyboardControl.mapping.yInc:
                    spot.moveSpot(0, spot.config.increment.y * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.xDec:
                    spot.moveSpot(-1 * spot.config.increment.x * global.systemConf.keyboardControl.config.modifier, 0);
                    break;
                case global.systemConf.keyboardControl.mapping.yDec:
                    spot.moveSpot(0, -1 * spot.config.increment.y * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.xInc:
                    spot.moveSpot(spot.config.increment.x * global.systemConf.keyboardControl.config.modifier, 0);
                    break;
                case global.systemConf.keyboardControl.mapping.smaller:
                    spot.resizeSpot(-1 * spot.config.increment.r * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.bigger:
                    spot.resizeSpot(spot.config.increment.r * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.dimDown:
                    spot.dimSpot(-1 * spot.config.increment.dim * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.dimUp:
                    spot.dimSpot(spot.config.increment.dim * global.systemConf.keyboardControl.config.modifier);
                    break;
                case global.systemConf.keyboardControl.mapping.nextColor:
                    spot.rotateColorWheel(+1);
                    break;
                case global.systemConf.keyboardControl.mapping.prevColor:
                    spot.rotateColorWheel(-1);
                    break;
                case global.systemConf.keyboardControl.mapping.cto:
                    spot.snapToCTO();
                    break;
                case global.systemConf.keyboardControl.mapping.snap:
                    spot.snapSpot();
                    break;
                case global.systemConf.keyboardControl.mapping.storeCalibrationPoint:
                    if(global.calibrationActive)
                        global.getSpot(global.calibrationSpotNo).storeCalibrationPoint();
                    break;
                case global.systemConf.keyboardControl.mapping.skipCalibrationPoint:
                    if(global.calibrationActive)
                        global.getSpot(global.calibrationSpotNo).skipCalibrationPoint();
                    break;
            }
        }
    }
}

module.exports = FollowJSKeyboard;
