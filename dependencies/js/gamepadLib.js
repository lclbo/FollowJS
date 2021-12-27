module.exports = {
    xboxOneControllerDefault: {
        config: {
            modifier: 1/5000,
            deadZones: {
                movement: 0.15,
                other: 0.5
            }
        },
        mapping: {
            default: {
                axes: {
                    x: 0,
                    y: 1,
                    r: 3,
                    frost: 2,
                    dim: 2
                },
                buttons: {
                    frostUp: 5,
                    frostDown: 4,
                    snap: 11,
                    home: 16,
                    storeCalibrationPoint: 0,
                    skipCalibrationPoint: 1,
                    colorWheelNext: 15,
                    colorWheelPrev: 14,
                    focusUp: 12,
                    focusDown: 13,
                    snapCTO: 3,
                    contextMenuShow: 9,
                    contextMenuUp: 12,
                    contextMenuDown: 13,
                    contextMenuSelect: 0
                },
                analogButtons: {
                    faster: 7,
                    slower: 6
                },
                axesDirections: {
                    x: 1,
                    y: -1,
                    r: -1,
                    frost: 1,
                    dim: 1
                }
            },
            legacy: {
                axes: {
                    x: 2,
                    y: 3,
                    r: 1,
                    frost: 0,
                    dim: 0
                },
                buttons: {
                    frostUp: 5,
                    frostDown: 4,
                    snap: 10,
                    home: 16,
                    storeCalibrationPoint: 0,
                    skipCalibrationPoint: 1,
                    colorWheelNext: 15,
                    colorWheelPrev: 14,
                    focusUp: 12,
                    focusDown: 13,
                    snapCTO: 3,
                    contextMenuShow: 9,
                    contextMenuUp: 12,
                    contextMenuDown: 13,
                    contextMenuSelect: 0
                },
                analogButtons: {
                    faster: 7,
                    slower: 6
                },
                axesDirections: {
                    x: 1,
                    y: -1,
                    r: -1,
                    frost: 1,
                    dim: 1
                }
            }
        }
    }
}