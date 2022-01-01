const dmxLib = require('./dependencies/js/libDmxArtNet');
// import dmxLib from './dependencies/js/libDmxArtNet';
const dmxArtNet = new dmxLib.DmxArtNet({
    oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
    sName: "Follow.JS", // 17 char long node description, default to "dmxnet"
    lName: "Followspot Control JS", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
    hosts: ["127.0.0.1"] // Interfaces to listen to, all by default
});

const fixtureLib = require('./dependencies/js/fixtureLib');
const gamepadLib = require('./dependencies/js/gamepadLib');
const FollowJSGamepad = require('./dependencies/js/FollowJSGamepad.js');
const FollowJSSpot = require('./dependencies/js/FollowJSSpot');

// import fixtureLib from './dependencies/js/fixtureLib';
// import gamepadLib from './dependencies/js/gamepadLib';
// import FollowJSGamepad from './dependencies/js/FollowJSGamepad.js';
// import FollowJSSpot from './dependencies/js/FollowJSSpot';

let artNetSenderA = dmxArtNet.newSender({
    // ip: '127.0.0.1',
    // ip: '192.168.2.255',
    ip: '10.0.20.255',
    subnet: 15,
    universe: 15,
    net: 0,
});

let gamepadIntervalHandle = null;

let globalTimestamp = new Date();

let spotMarkerColors = ["green", "blue", "purple", "yellow"];

let imageRefreshInterval = 50;
let imageIntervalHandle = null;
const retryPrescale = 2000 / imageRefreshInterval;
const retriesThreshold = 50;

let drawIntervalHandle = null;

let calibrationActive = false;
let calibrationSpotNo = undefined;
let calibrationValues = new Array(9*9);
let calibrationStep = 1;

let x_img_max = 800;
let y_img_max = 450;
let r_img_min = 8;
let r_img_max = 25;

let connectedGamepads = new Array(4);
let spots = [];

// SPOT 1
let keyboardControlConfig1 = {
    config: {
        modifier: 0.001
    },
    mapping: {
        yInc: "w",
        yDec: "s",
        xInc: "d",
        xDec: "a",
        snap: "x",
        dimUp: "c",
        dimDown: "y",
        bigger: "e",
        smaller: "q"
    }
}
let gamepadControlConfig1 = {
    config: gamepadLib.xboxOneControllerDefault.config,
    mapping: gamepadLib.xboxOneControllerDefault.mapping.legacy
}
let spot1config = {
    home: {
        x: 0.15874274489947998,
        y: 0.7949789885578629,
        r: 0.0,
        frost: 1.0,
        focus: 0.0,
        dim: 1.0,
        shutterOpen: false,
        colorWheelIndex: 0,
        CTOin: false
    },
    increment: {
        x: 0.4,
        y: 0.6,
        r: 10,
        frost: 10,
        focus: 10,
        dim: 25
    },
    boundaries: {
        x: {min: 0.0, max: 1.0},
        y: {min: 0.0, max: 1.0},
        r: {min: 0.0, max: 1.0},
        frost: {min: 0.0, max: 1.0},
        focus: {min: 0.0, max: 1.0},
        dim: {min: 0.0, max: 1.0}
    },
    translation: {
        origin: {
            x: 0.158,
            y: 0.815
        },
        regression: {
            x: [-2,4,2],
            y: [-2,4,2],
            a: [5.286352926885731,1.981207700475367,-12.764361971304451,6.003048675340111,0.564190685307892,6.794904917219276],
            b: [-12.494361861164977,10.175014410577490,23.724021055412220,-3.896502665160901,-19.900537415046180,-10.311334885879367]
        }
    },
    connection: {
        net: 0,
        universe: 0,
        subnet: 0,
        address: 29
    }
}

// SPOT 2
let keyboardControlConfig2 = {
    config: {
        modifier: 0.001
    },
    mapping: {
        yInc: "o",
        yDec: "l",
        xInc: "ö",
        xDec: "k",
        snap: ".",
        dimUp: "-",
        dimDown: ",",
        bigger: "p",
        smaller: "i"
    }
}
let gamepadControlConfig2 = {
    config: gamepadLib.xboxOneControllerDefault.config,
    mapping: gamepadLib.xboxOneControllerDefault.mapping.legacy
}
let spot2config = {
    home: {
        x: 0.1744328870405229,
        y: 0.7922748391056202,
        r: 0.0,
        frost: 1.0,
        focus: 0.0,
        dim: 1.0,
        shutterOpen: false,
        colorWheelIndex: 0,
        CTOin: false
    },
    increment: {
        x: 0.4,
        y: 0.6,
        r: 10,
        frost: 10,
        focus: 10,
        dim: 25
    },
    boundaries: {
        x: {min: 0.0, max: 1.0},
        y: {min: 0.0, max: 1.0},
        r: {min: 0.05, max: 1.0},
        frost: {min: 0.0, max: 1.0},
        focus: {min: 0.0, max: 1.0},
        dim: {min: 0.0, max: 1.0}
    },
    translation: {
        origin: {
            x: 0.158,
            y: 0.815
        },
        regression: {
            x: [-2,4,2],
            y: [-2,4,2],
            a: [-4.512185309196076,0.617278171101228,10.264803193293040,7.664305702100285,0.611541786191553,-6.833271061887547],
            b: [-12.342455707812663,2.664199510752062,24.854793800608206,5.915651056182894,-21.524329487172768,-11.962219725826852]
        }
    },
    connection: {
        net: 0,
        universe: 0,
        subnet: 0,
        address: 1
    }
}

spots[1] = new FollowJSSpot(1,fixtureLib.alphaBeam1500, spot1config, {keyboard: keyboardControlConfig1, gamepad: gamepadControlConfig1}, artNetSenderA);
spots[2] = new FollowJSSpot(2,fixtureLib.alphaBeam1500, spot2config, {keyboard: keyboardControlConfig2, gamepad: gamepadControlConfig2}, artNetSenderA);


function initCalibration(spotNo) {
    if(calibrationActive)
        endCalibration();

    document.getElementById('downloadButtonLanding').innerHTML = '';
    document.getElementById('cancelCalibrationButton').classList.remove("hidden");
    hideAllContextMenus();
    console.log("init calibration");
    calibrationActive = true;
    calibrationStep = 1;
    calibrationSpotNo = spotNo;
    hideAllSpotMarkerExceptFor(spotNo);
    hideAllSpotStatusExceptFor(spotNo);
    blinkSpotMarker(spotNo, 2);
    setSpotStatusOpacity(spotNo, 0.25);
    // blinkSpotStatus(spotNo, 2);
    showGridOverlay();
    showCalibrationPoint();
}
function storeCalibrationPoint() {
    calibrationValues[calibrationStep-1] = [spots[calibrationSpotNo].state.x, spots[calibrationSpotNo].state.y];
    calibrationStep++;
    showCalibrationPoint();
    if(calibrationStep > calibrationValues.length) {
        exportCalibration();
        endCalibration();
    }
}
function skipCalibrationPoint() {
    calibrationValues[calibrationStep-1] = [null, null];
    calibrationStep++;
    showCalibrationPoint();
    if(calibrationStep > calibrationValues.length) {
        exportCalibration();
        endCalibration();
    }
}
function endCalibration() {
    stopBlinkAllSpotStatus();
    stopBlinkAllSpotMarker();
    highlightImageCoord(false);
    showAllSpotMarker();
    showAllSpotStatus();
    setSpotStatusOpacity(calibrationSpotNo, 1);
    document.getElementById('cancelCalibrationButton').classList.add("hidden");
    hideGridOverlay();
    calibrationActive = false;
}

function exportCalibration() {
    // console.log(calibrationValues);
    let plainText = "";
    calibrationValues.forEach(function(elem) {
        plainText = plainText + elem[0] + "," + elem[1] + ";";
    });

    let plainBlob = new Blob([plainText], {type: 'application/octet-stream;charset=utf-8'});
    let plainLink = window.URL.createObjectURL(plainBlob);
    let a = document.createElement("a");
    a.download = 'calibration-'+globalTimestamp.getFullYear()+'-'+(globalTimestamp.getMonth()+1)+'-'+globalTimestamp.getDate()+'-spot'+calibrationSpotNo+'.csv';
    a.href = plainLink;
    a.innerHTML = "<button class='btn btn-primary'>Download Calibration</button>";
    document.getElementById('downloadButtonLanding').appendChild(a);
    document.getElementById('cancelCalibrationButton').classList.add("hidden");
}

function showCalibrationPoint() {
    highlightImageCoord(true,(((calibrationStep-1) % 9) + 1) * 0.1,(Math.floor((calibrationStep-1) / 9) + 1) * 0.1);
}

function highlightImageCoord(enable,x=0.5,y=0.5) {
    if(enable !== true) {
        document.querySelector("#highlightMarker").classList.add("hidden");
    }
    else {
        let pos_x = (x * x_img_max) % x_img_max;
        let pos_y = ((1-y) * y_img_max) % y_img_max;
        document.querySelector("#highlightMarker").style.top = (pos_y).toString();
        document.querySelector("#highlightMarker").style.left = (pos_x).toString();
        document.querySelector("#highlightMarker").classList.remove("hidden");
    }
}

function showGridOverlay() {
    document.querySelector("#tenthGridOverlay").classList.remove("hidden");
}
function hideGridOverlay() {
    document.querySelector("#tenthGridOverlay").classList.add("hidden");
}

function prepareDMXTable() {
    let titleDone = false;
    spots.forEach(function(spot, spotNo) {
        if(!titleDone) {
            document.getElementById("dmxTableHeader").insertAdjacentHTML("beforeend", "<tr></tr>");
            for(const [chanNo,chan] of Object.entries(spot.fixture.dmx.channels)) {
                document.getElementById("dmxTableHeader").firstElementChild.insertAdjacentHTML("beforeend", "<td>"+chan.short+"</td>");
            }
            titleDone = true;
        }

        document.getElementById("dmxTableBody").insertAdjacentHTML("afterbegin", "<tr></tr>");
        for(const [chanNo,chan] of Object.entries(spot.fixture.dmx.channels)) {
            document.getElementById("dmxTableBody").firstElementChild.insertAdjacentHTML("beforeend", '<td id="dmx['+spotNo+']['+chanNo+']">x</td>');
        }
    });
}

function printDMX() {
    spots.forEach(function(spot, spotNo) {
        for(const chan of Object.keys(spot.dmxBuffer)) {
            document.getElementById("dmx["+spotNo+"]["+chan+"]").textContent = spot.dmxBuffer[chan];
        }
    });
}

function printAllSpotStatus() {
    spots.forEach(function(spotRef, spotNumber) {
        document.getElementById("gauge["+spotNumber+"][dim]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.dim] / 255 * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][color]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.colorWheel] / 110 * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][focus]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.focus] / 255 * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][frost]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.frost] / 255 * 100).toString() + "%";
    });
}

function setSpotStatusOpacity(spotNo, opacity) {
    let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
    spotStatusElement.style.opacity = Math.min(1,Math.max(0,opacity)).toString();
}

function blinkSpotStatus(spotNo, cycleDuration=1) {
    let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
    spotStatusElement.style.animation = 'blinkOpacityAnimation '+(Math.max(0.1,parseInt(cycleDuration))).toString()+'s linear infinite';
}

function stopBlinkSpotStatus(spotNo) {
    let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
    spotStatusElement.style.animation = '';
}

function stopBlinkAllSpotStatus() {
    spots.forEach(function(spot, spotNo) {
        stopBlinkSpotStatus(spotNo);
    });
}

function showAllSpotStatus() {
    spots.forEach(function(spot, spotNo) {
        let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
        spotStatusElement.classList.remove("hiddenVis");
    });
}

function hideAllSpotStatusExceptFor(dontHideSpotNo) {
    spots.forEach(function(spot, spotNo) {
        if(spotNo !== dontHideSpotNo) {
            let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
            spotStatusElement.classList.add("hiddenVis");
        }
    });
}

function drawIntervalCallback() {
    drawSpots();
    printDMX();
    printAllSpotStatus();
}

function addSpotsToDOM() {
    spots.forEach(function(spot, spotNo) {
        document.getElementById("webcamDrawArea").insertAdjacentHTML('beforeend',
            '<svg class="spotMarker" id="spotMarker['+spotNo+']">\n' +
            '   <circle cx="50%" cy="50%" r="50" fill="'+spotMarkerColors[((spotNo-1) % (spotMarkerColors.length))]+'" stroke="'+spotMarkerColors[((spotNo-1) % (spotMarkerColors.length))]+'" stroke-width=".2rem" stroke-opacity="1" fill-opacity=".4" onclick="toggleContextMenu('+spotNo+');" />\n' +
            '</svg>'
        );

        document.getElementById("webcamDrawArea").insertAdjacentHTML('beforeend',
            '<div class="spotContextMenu row-cols-1 text-start" id="spotContextMenu['+spotNo+']"></div>'
        );

        document.getElementById("spotStatusOverlayArea").insertAdjacentHTML('beforeend',
            '<div id="spotStatusOverlay['+spotNo+']" class="spotStatusOverlayGroup col p-0 mx-2" style="border-color: '+spotMarkerColors[((spotNo-1) % (spotMarkerColors.length))]+';">\n' +
            '   <div class="spotStatusGauge" id="gauge['+spotNo+'][dim]">\n' +
            '       <div class="spotStatusOverlayDim">Dimmer</div>\n' +
            '   </div>\n' +
            '   <div class="spotStatusGauge" id="gauge['+spotNo+'][color]\">\n' +
            '       <div class="spotStatusOverlayColor">Color</div>\n' +
            '   </div>\n' +
            '   <div class="spotStatusGauge" id="gauge['+spotNo+'][focus]\">\n' +
            '       <div class="spotStatusOverlayFocus">Focus</div>\n' +
            '   </div>\n' +
            '   <div class="spotStatusGauge" id="gauge['+spotNo+'][frost]\">\n' +
            '       <div class="spotStatusOverlayFrost">Frost</div>\n' +
            '   </div>\n' +
            '</div>'
            );
    });
}

function blinkSpotMarker(spotNo, cycleDuration=1) {
    let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
    spotMarkerElement.firstElementChild.insertAdjacentHTML("afterbegin", '<animate attributeName="stroke-opacity" values="1;0.2;1" dur="'+(Math.max(0.1,parseInt(cycleDuration)))+'s" repeatCount="indefinite" />')
}

function stopBlinkSpotMarker(spotNo) {
    let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
    spotMarkerElement.firstElementChild.innerHTML = '';
}

function stopBlinkAllSpotMarker() {
    spots.forEach(function(spot, spotNo) {
       stopBlinkSpotMarker(spotNo);
    });
}

function showAllSpotMarker() {
    spots.forEach(function(spot, spotNo) {
        let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
        spotMarkerElement.classList.remove("hiddenVis");
    });
}

function hideAllSpotMarkerExceptFor(dontHideSpotNo) {
    spots.forEach(function(spot, spotNo) {
        if(spotNo !== dontHideSpotNo) {
            let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
            spotMarkerElement.classList.add("hiddenVis");
        }
    });
}

function drawSpots() {
    spots.forEach(function(spot, spotNo) {
        let x = spot.state.x;
        let y = spot.state.y;
        let x2 = Math.pow(spot.state.x,2);
        let y2 = Math.pow(spot.state.y,2);

        let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
        let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

        let pos_r = spot.state.r;

        let opacity = (spot.state.shutterOpen === true) ? "0.4" : "0";

        let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
        spotMarkerElement.style.top = ((1-pos_y) * y_img_max).toString()+"px";
        spotMarkerElement.style.left = (pos_x * x_img_max).toString()+"px";
        spotMarkerElement.firstElementChild.setAttribute("r", (pos_r*(r_img_max-r_img_min)+r_img_min).toString());
        spotMarkerElement.firstElementChild.setAttribute("fill-opacity", opacity);

        if(spot.contextMenuState.visible === true)
            updateContextMenu(spotNo);
    });
}

function updateWindowSize() {
    x_img_max = document.getElementById("webcamDrawArea").clientWidth;
    y_img_max = document.getElementById("webcamDrawArea").clientHeight;
    // element.offset<Height|Width> includes borders, element.client<Height|Width> does not

    r_img_min = 10 * (document.getElementById("webcamDrawArea").offsetWidth / 800);
    r_img_max = 30 * (document.getElementById("webcamDrawArea").offsetWidth / 800);
}

function enableCaptureKeyboard() {
    $(window).off("keypress").on('keypress', keyboardInputCallback);
}
// function disableCaptureKeyboard() {
//     $(window).off("keypress");
// }

function keyboardInputCallback(e) {
    // console.log("(which:" + (e.which) + ", key:" + (e.key) + ", code:" + (e.code) + ")");

    spots.forEach(function(spot, spotNumber) {
        switch(e.key) {
            case spot.control.keyboard.mapping.yInc:
                spot.moveSpot(0,spot.config.increment.y * spot.control.keyboard.config.modifier);
                break;
            case spot.control.keyboard.mapping.xDec:
                spot.moveSpot(-1 * spot.config.increment.x * spot.control.keyboard.config.modifier,0);
                break;
            case spot.control.keyboard.mapping.yDec:
                spot.moveSpot(0,-1 * spot.config.increment.y * spot.control.keyboard.config.modifier);
                break;
            case spot.control.keyboard.mapping.xInc:
                spot.moveSpot(spot.config.increment.x * spot.control.keyboard.config.modifier,0);
                break;
            case spot.control.keyboard.mapping.smaller:
                spot.resizeSpot(-1 * spot.config.increment.r * spot.control.keyboard.config.modifier);
                break;
            case spot.control.keyboard.mapping.bigger:
                spot.resizeSpot(spot.config.increment.r * spot.control.keyboard.config.modifier);
                break;
            case spot.control.keyboard.mapping.dimDown:
                spot.dimSpot(-1 * spot.config.increment.dim * spot.control.keyboard.config.modifier);
                break;
            case spot.control.keyboard.mapping.dimUp:
                spot.dimSpot(spot.config.increment.dim * spot.control.keyboard.config.modifier);
                break;
            case spot.control.keyboard.mapping.snap:
                spot.snapSpot();
                break;
        }
    });
}

function drawContextMenu(spotNo) {
    let spot = spots[spotNo];
    let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

    spot.fixture.dmx.macros.forEach(function(macro,key) {
        let selectClass = "";
        if(key === spot.contextMenuState.selectedIndex)
            selectClass = "spotContextMenuHighlight";

        document.getElementById("spotContextMenu["+spotNo+"]").insertAdjacentHTML("beforeend", '' +
            '<div class="col px-2 '+selectClass+'" id="macroButton['+spotNo+']['+key+']" onclick="executeMacro('+spotNo+','+key+')">' +
            // '<span class="spinner-grow spinner-grow-sm hiddenVis" role="status"></span>&nbsp;' +
            macro.short+'' +
            '</div>');
    });

    spotContextMenuElement.insertAdjacentHTML("beforeend", '<div class="col px-2" id="calib['+spotNo+']" onclick="initCalibration('+spotNo+')">Calibrate</div>');
    spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div class="col px-2 border-bottom fw-bold" id="calib['+spotNo+']">Spot #'+spotNo+'</div>');
}

function updateContextMenu(spotNo) {
    let spot = spots[spotNo];
    let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

    let x = spot.state.x;
    let y = spot.state.y;
    let x2 = Math.pow(x,2);
    let y2 = Math.pow(y,2);

    let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
    let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

    let translate_y = ((1-pos_y) > 0.65) ? "-100%" : "0";
    let translate_x = (pos_x > 0.75) ? "-100%" : "0";
    spotContextMenuElement.style.transform = "translate("+translate_x+","+translate_y+")";

    spotContextMenuElement.style.top = ((1-pos_y) * y_img_max).toString()+"px";
    spotContextMenuElement.style.left = (pos_x * x_img_max).toString()+"px";

    spotContextMenuElement.childNodes.forEach(function (childElement) {
        childElement.classList.remove("spotContextMenuHighlight");
    });
    document.getElementById('macroButton['+spotNo+']['+spot.contextMenuState.selectedIndex+']').classList.add("spotContextMenuHighlight");

}

function toggleContextMenu(spotNo) {
    let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

    if(spots[spotNo].contextMenuState.visible !== false) {
        spots[spotNo].contextMenuState.visible = false;
        spotContextMenuElement.innerHTML = "";
    }
    else {
        spots[spotNo].contextMenuState.visible = true;
        spots[spotNo].contextMenuState.selectedIndex = 0;
        drawContextMenu(spotNo);
        updateContextMenu(spotNo);
    }
}

function hideAllContextMenus() {
    spots.forEach(function(spot,spotNo) {
        hideContextMenu(spotNo);
    });
}

function hideContextMenu(spotNo) {
    let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");
    spots[spotNo].contextMenuState.visible = false;
    spotContextMenuElement.innerHTML = "";
}

function executeMacro(spotNo, macroNo) {
    let macro = spots[spotNo].fixture.dmx.macros[macroNo];

    // document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.remove("hiddenVis");
    console.log("execute Macro: " + macro.name);
    blinkSpotMarker(spotNo, 1);
    let oldValue = spots[spotNo].dmxBuffer[macro.channel];
    spots[spotNo].dmxBuffer[macro.channel] = macro.value;
    window.setTimeout(setChannelToValue, (Number.parseInt(macro.hold)*1000), spotNo, macro.channel, oldValue, macroNo);
    // window.setTimeout(hideContextMenu, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    hideContextMenu(spotNo);
    window.setTimeout(stopBlinkSpotMarker, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    spots[spotNo].sendDMX();
}

function setChannelToValue(spotNo,chan,val,macroNo) {
    spots[spotNo].dmxBuffer[chan] = val;
    document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.add("hiddenVis");
    spots[spotNo].sendDMX();
}


function startRefresh() {
    imageIntervalHandle = window.setInterval(refreshResources, imageRefreshInterval);
    // console.log("emit interval " + imageIntervalHandle);
}
function stopRefresh() {
    if (imageIntervalHandle === null) {
        console.log("no interval handle!");
        return;
    }
    window.clearInterval(imageIntervalHandle);
}

function initializeResources() {
    $('.refresh').each(function() {
        initializeResource($(this));
    });
}
/**
 * Initializes the data-fields needed for refresh handling
 * @param rsc element handle, e.g. from getElementByXYZ()
 */
function initializeResource(rsc) {
    rsc.data('isLoading', 0);
    rsc.data('refreshRetries', 0);
    rsc.data('pc', 0);
    rsc.data('pc', rsc.data('defaultprescale') - 1);
    rsc.data('prescale', rsc.data('defaultprescale'));
    rsc.data('separator', ((rsc.data('path').includes('?')) ? '&' : '?'));

    rsc.attr('onload', "$(this).data('isLoading', 0);");
}

function refreshResources() {
    globalTimestamp = new Date();
    $('.refresh').each(function() {
        refreshResource($(this));
    });
}
/**
 * Refreshes the linked resource (mainly image).
 * For refresh, the src is set to the previous url but with a new ?_=<timestamp> parameter to avoid caching
 * @param rsc element handle, e.g. from getElementByXYZ().
 * The resource needs a src-attribute.
 */
function refreshResource(rsc) {
    if(rsc.data('pc') < rsc.data('prescale')) {
        rsc.data('pc', rsc.data('pc')+1);
        return;
    }
    rsc.data('pc', 0);

    if(rsc.data('isLoading') === 1) { // did not finish loading in time, so slow down interval
        rsc.data('prescale', rsc.data('prescale') + 1);
        // rsc.attr('title', 'refresh every ' + rsc.data('prescale') + ' loading cycles');
        rsc.data('refreshRetries', rsc.data('refreshRetries') + 1);
        if(rsc.data('refreshRetries') > retriesThreshold) {
            //console.log('switch to slow retry');
            rsc.addClass('slowLoading');
            rsc.data('prescale', retryPrescale);
            //TODO: set slow down divider (/10 e.g.), not static prescale
        }
        return;
    }
    rsc.removeClass('slowLoading');
    if(rsc.data('prescale') >= retryPrescale)
        rsc.data('prescale', rsc.data('defaultprescale'));

    let appendix = rsc.data('separator') + "_=" + globalTimestamp.valueOf();
    rsc.attr('src', rsc.data('path') + appendix);

    rsc.data('isLoading', 1);
}

function enableGamepadConnectionEventListeners() {
    window.addEventListener("gamepadconnected", gamepadConnectCallback);
    window.addEventListener("gamepaddisconnected", gamepadDisconnectCallback);
}

function disableGamepadConnectionEventListeners() {
    window.removeEventListener("gamepadconnected",gamepadConnectCallback);
    window.removeEventListener("gamepaddisconnected",gamepadDisconnectCallback);
}

function gamepadConnectCallback(event) {
    conditionalLog("gamepad " + event.gamepad.index + " (" + event.gamepad.id + ") connected");

    if(spots[event.gamepad.index+1] !== undefined) {
        //there is a followspot available to be bound to this gamepad
        connectedGamepads[event.gamepad.index] = new FollowJSGamepad(event.gamepad, spots[event.gamepad.index+1]);
        connectedGamepads[event.gamepad.index].rumble("welcome");
    }

    enableGamepadCyclicReader();

    if(connectedGamepads.length > 0)
        document.querySelector("#controllerConnectOverlay").classList.add("hidden");
}

function gamepadDisconnectCallback(event) {
    delete connectedGamepads[event.gamepad.index];

    if(connectedGamepads.length === 0)
        document.querySelector("#controllerConnectOverlay").classList.remove("hidden");
}

function enableGamepadCyclicReader() {
    if(gamepadIntervalHandle === null)
        gamepadIntervalHandle = window.setInterval(gamepadCyclicReader,10);
}

function gamepadCyclicReader() {
    let gamepads = navigator.getGamepads();
    if(gamepads.length > 0) {
        for(let padIndex=0;padIndex<gamepads.length;padIndex++) {
            if(gamepads[padIndex] === null)
                continue;   //no pad connected to this slot

            if(gamepads[padIndex].connected !== true)
                console.log("active gamepad disconnected");

            connectedGamepads[padIndex].update(gamepads[padIndex]);
        }
    }
    gamepadReadAxes();
    gamepadReadButtons();
}

function gamepadReadAxes() {
    connectedGamepads.forEach(function(gamepadObject) {
        let movementModifier = gamepadObject.assignedSpot.control.gamepad.config.modifier;

        if(gamepadObject.currentState.buttons[gamepadObject.assignedSpot.control.gamepad.mapping.analogButtons.faster].pressed === true) {
            movementModifier = movementModifier * (1 + gamepadObject.currentState.buttons[gamepadObject.assignedSpot.control.gamepad.mapping.analogButtons.faster].value);
        }

        let pad1axisX = gamepadObject.currentState.axes[gamepadObject.assignedSpot.control.gamepad.mapping.axes.x];
        let pad1axisY = gamepadObject.currentState.axes[gamepadObject.assignedSpot.control.gamepad.mapping.axes.y];

        let absX = Math.abs(pad1axisX);
        let absY = Math.abs(pad1axisY);
        let dirX = Math.sign(pad1axisX);
        let dirY = Math.sign(pad1axisY);

        let pad1moveX = ((absX > gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement) ? ((absX-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)/(1-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)*dirX) : 0);
        let pad1moveY = ((absY > gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement) ? ((absY-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)/(1-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)*dirY) : 0);

        if(pad1moveX !== 0 || pad1moveY !== 0) {
            let moveX = Math.sign(gamepadObject.assignedSpot.control.gamepad.mapping.axesDirections.x) * pad1moveX * movementModifier * gamepadObject.assignedSpot.config.increment.x;
            let moveY = Math.sign(gamepadObject.assignedSpot.control.gamepad.mapping.axesDirections.y) * pad1moveY * movementModifier * gamepadObject.assignedSpot.config.increment.y;
            gamepadObject.assignedSpot.moveSpot(moveX,moveY);
        }

        // Iris
        let pad1axisR = gamepadObject.currentState.axes[gamepadObject.assignedSpot.control.gamepad.mapping.axes.r];
        let absR = Math.abs(pad1axisR);
        let dirR = Math.sign(pad1axisR);
        let pad1moveR = ((absR > gamepadObject.assignedSpot.control.gamepad.config.deadZones.other) ? ((absR-gamepadObject.assignedSpot.control.gamepad.config.deadZones.other)/(1-gamepadObject.assignedSpot.control.gamepad.config.deadZones.other)*dirR) : 0);
        if(pad1moveR !== 0) {
            let moveR = Math.sign(gamepadObject.assignedSpot.control.gamepad.mapping.axesDirections.r) * pad1moveR * gamepadObject.assignedSpot.control.gamepad.config.modifier * gamepadObject.assignedSpot.config.increment.r;

            gamepadObject.assignedSpot.resizeSpot(moveR);
        }

        // Dimmer
        let pad1axisDim = gamepadObject.currentState.axes[gamepadObject.assignedSpot.control.gamepad.mapping.axes.dim];
        let absDim = Math.abs(pad1axisDim);
        let dirDim = Math.sign(pad1axisDim);
        let pad1moveDim = ((absDim > gamepadObject.assignedSpot.control.gamepad.config.deadZones.other) ? ((absDim-gamepadObject.assignedSpot.control.gamepad.config.deadZones.other)/(1-gamepadObject.assignedSpot.control.gamepad.config.deadZones.other)*dirDim) : 0);
        if(pad1moveDim !== 0) {
            let moveDim = Math.sign(gamepadObject.assignedSpot.control.gamepad.mapping.axesDirections.dim) * pad1moveDim * gamepadObject.assignedSpot.control.gamepad.config.modifier * gamepadObject.assignedSpot.config.increment.dim;

            gamepadObject.assignedSpot.dimSpot(moveDim);
        }
    });
}

function gamepadReadButtons() {
    connectedGamepads.forEach(function(gamepadObject) {
        gamepadObject.currentState.buttons.forEach(function (buttonState, index) {
            if (gamepadObject.currentState.buttons[index].pressed === true) {
                if (gamepadObject.lastButtonState[index].pressed === false) { //rising edge
                    // console.log("(rising edge) press on button " + index);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.snap)
                        gamepadObject.assignedSpot.snapSpot();

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.home)
                        gamepadObject.assignedSpot.homeSpot();

                    if (calibrationActive) {
                        if(calibrationSpotNo === gamepadObject.assignedSpot.spotNumber) {
                            if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.storeCalibrationPoint) {
                                storeCalibrationPoint();
                            }
                            if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.skipCalibrationPoint) {
                                skipCalibrationPoint();
                            }
                        }
                    }

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.colorWheelNext)
                        gamepadObject.assignedSpot.rotateColorWheel(+1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.colorWheelPrev)
                        gamepadObject.assignedSpot.rotateColorWheel(-1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.snapCTO)
                        gamepadObject.assignedSpot.snapToCTO();

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuShow)
                        toggleContextMenu(gamepadObject.assignedSpot.spotNumber);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuUp)
                        gamepadObject.assignedSpot.scrollContextMenu(-1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuDown)
                        gamepadObject.assignedSpot.scrollContextMenu(1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuSelect)
                        executeMacro(gamepadObject.assignedSpot.spotNumber, gamepadObject.assignedSpot.contextMenuState.selectedIndex);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuCancel)
                        hideContextMenu(gamepadObject.assignedSpot.spotNumber);
                }
                else { //continuous press
                    // console.log("still pressing button " + index);
                    switch (index) {
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.focusUp:
                            gamepadObject.assignedSpot.focusSpot(gamepadObject.assignedSpot.config.increment.focus * gamepadObject.assignedSpot.control.gamepad.config.modifier)
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.focusDown:
                            gamepadObject.assignedSpot.focusSpot(-1 * gamepadObject.assignedSpot.config.increment.focus * gamepadObject.assignedSpot.control.gamepad.config.modifier)
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.frostUp:
                            gamepadObject.assignedSpot.frostSpot(gamepadObject.assignedSpot.config.increment.frost * gamepadObject.assignedSpot.control.gamepad.config.modifier)
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.frostDown:
                            gamepadObject.assignedSpot.frostSpot(-1 * gamepadObject.assignedSpot.config.increment.frost * gamepadObject.assignedSpot.control.gamepad.config.modifier)
                            break;
                    }
                }
            }
        });
    });
}

function conditionalLog(msg) {
    console.log(msg);
}

$(function() {
    // ready function
    conditionalLog("execute ready function");
    updateWindowSize();
    initializeResources();
    startRefresh();
    if(drawIntervalHandle === null)
        drawIntervalHandle = window.setInterval(drawIntervalCallback,25); //15
    // enableCaptureKeyboard();
    enableGamepadConnectionEventListeners();
    addSpotsToDOM();
    prepareDMXTable();
});