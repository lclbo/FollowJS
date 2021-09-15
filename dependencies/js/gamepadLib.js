module.exports = {
    xboxOneControllerDefault: {
        config: {
            modifier: 1/5000,
            deadZone: 0.15, //0.14
        },
        mapping: {
            default: {
                axes: {
                    x: 0,
                    y: 1,
                    r: 3
                },
                buttons: {
                    dimUp: 5,
                    dimDown: 4,
                    snap: 3,
                    calibrate: 16,
                    storeCalibrationPoint: 0,
                    colorWheelNext: 15,
                    colorWheelPrev: 14
                },
                axesDirections: {
                    x: 1,
                    y: -1,
                    r: -1
                }
            },
            legacy: {
                axes: {
                    x: 2,
                    y: 3,
                    r: 1
                },
                buttons: {
                    dimUp: 5,
                    dimDown: 4,
                    snap: 3,
                    calibrate: 16,
                    storeCalibrationPoint: 0,
                    colorWheelNext: 15,
                    colorWheelPrev: 14
                },
                axesDirections: {
                    x: 1,
                    y: -1,
                    r: -1
                }
            }
        }
    }
}