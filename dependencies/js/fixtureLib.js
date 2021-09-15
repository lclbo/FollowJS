module.exports = {
    alphaBeam1500: {
        dmx: {
            range: {
                x: {
                    min: 0,
                    max: 256*256-1
                },
                y: {
                    min: 0,
                    max: 256*256-1
                },
                r: {
                    min: 0,
                    max: 127
                },
                dim: {
                    min: 0,
                    max: 256*256-1
                },
                shutter: {
                    min: 0,
                    max: 255
                }
            },
            mapping: {
                pan: 18,
                panFine: 19,
                tilt: 20,
                tiltFine: 21,
                radius: 8,
                dim: 6,
                dimFine: 7,
                shutter: 5,
                colorWheel: 4,
            },
            macros: {
                lampOn: {
                    name: "Lamp On Full Power",
                    short: "Lamp On",
                    channel: 24,
                    value: 255,
                    hold: 10
                },
                lampHalf: {
                    name: "Lamp to Half Power mode",
                    short: "Lamp Half",
                    channel: 24,
                    value: 101,
                    hold: 5
                },
                lampOff: {
                    name: "Lamp Off after 5s",
                    short: "Lamp Off",
                    channel: 24,
                    value: 100,
                    hold: 10
                },
                resetPT: {
                    name: "Reset Pan/Tilt only",
                    short: "Reset P/T",
                    channel: 23,
                    value: 127,
                    hold: 7
                }
            },
            colorWheel: [0,19,37,55,74,92,110,128,192,255],
            channels: {
                1: {name: 'Cyan', short: 'C', value: 0},
                2: {name: 'Magenta', short: 'M', value: 0},
                3: {name: 'Yellow', short: 'Y', value: 0},
                4: {name: 'Color', short: 'C1', value: 0},
                5: {name: 'Strobe', short: 'Strb', value: 255},
                6: {name: 'Dim', short: 'Dim', value: 255},
                7: {name: 'DimFine', short: 'Dim16', value: 255},
                8: {name: 'Iris', short: 'Iris', value: 127},
                9: {name: 'Gobo1', short: 'G1', value: 0},
                10: {name: 'Gobo2', short: 'G2', value: 0},
                11: {name: 'G2Rotate', short: 'G2rot', value: 0},
                12: {name: 'Prism', short: 'P1', value: 0},
                13: {name: 'P1Rotate', short: 'P1rot', value: 0},
                14: {name: 'L.Frost', short: 'LF', value: 0},
                15: {name: 'M.Frost', short: 'MF', value: 0},
                16: {name: 'H.Frost', short: 'HF', value: 0},
                17: {name: 'Focus', short: 'F', value: 127},
                18: {name: 'Pan', short: 'P', value: 0},
                19: {name: 'PanFine', short: 'P16', value: 0},
                20: {name: 'Tilt', short: 'T', value: 0},
                21: {name: 'TiltFine',short: 'T16', value: 0},
                22: {name: 'Function', short: 'Func', value: 0},
                23: {name: 'Reset', short: 'Res', value: 0},
                24: {name: 'Lamp', short: 'Lmp', value: 0},
                25: {name: 'P/T Time', short: 'PTtim', value: 0},
                26: {name: 'C1 Time', short: 'Ctim', value: 0},
                27: {name: 'Beam Time', short: 'Btim', value: 0},
                28: {name: 'Gobo Time', short: 'Gtim', value: 0}
            }
        }
    }
}