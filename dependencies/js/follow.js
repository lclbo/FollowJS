const dmxlib = require('./dependencies/js/libDmxnet');
const dmxnet = new dmxlib.dmxnet({
    // log: { level: 'info' }, // Winston logger options
    oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
    sName: "Follow.JS", // 17 char long node description, default to "dmxnet"
    lName: "Followspot Control JS", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
    hosts: ["127.0.0.1"] // Interfaces to listen to, all by default
});

const fixtureLib = require('./dependencies/js/fixtureLib');
const gamepadLib =require('./dependencies/js/gamepadLib');
const FollowJSGamepad = require('./dependencies/js/FollowJSGamepad.js');
const FollowJSSpot = require('./dependencies/js/FollowJSSpot');

let artnetSenderA = dmxnet.newSender({
    // ip: '127.0.0.1',
    ip: '192.168.2.255',
    subnet: 15,
    universe: 15,
    net: 0,
});

let gamepadIntervalHandle = null;

let globalTimestamp = new Date();

let imageRefreshInterval = 50;
let imageIntervalHandle = null;
const retryPrescale = 2000 / imageRefreshInterval;
const retriesThreshold = 50;

let drawIntervalHandle = null;

let calibrationActive = false;
let calibrateSpotRef = undefined;
let calibrationValues = new Array(9*9);
let calibrationStep = 1;


let x_img_max = 800;
let y_img_max = 450;
let r_img_min = 10;
let r_img_max = 30;

let connectedGamepads = new Array(4);
let spots = [];


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
        r: 0.1,
        frost: 0.0,
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
        r: 0.1,
        frost: 0.0,
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


let spot1 = new FollowJSSpot(1,fixtureLib.alphaBeam1500, spot1config, {keyboard: keyboardControlConfig1, gamepad: gamepadControlConfig1}, artnetSenderA);
let spot2 = new FollowJSSpot(2,fixtureLib.alphaBeam1500, spot2config, {keyboard: keyboardControlConfig2, gamepad: gamepadControlConfig2}, artnetSenderA);


spots[1] = spot1;
spots[2] = spot2;

function initCalibration(spotRef) {
    console.log("init calibration");
    calibrationActive = true;
    calibrationStep = 1;
    calibrateSpotRef = spotRef;
    showGridOverlay();
    showCalibrationPoint();
}
function storeCalibrationPoint() {
    calibrationValues[calibrationStep-1] = [calibrateSpotRef.state.x, calibrateSpotRef.state.y];
    calibrationStep++;
    showCalibrationPoint();
    if(calibrationStep > calibrationValues.length)
        finishCalibration();
}
function skipCalibrationPoint() {
    calibrationValues[calibrationStep-1] = [null, null];
    calibrationStep++;
    showCalibrationPoint();
    if(calibrationStep > calibrationValues.length)
        finishCalibration();
}
function finishCalibration() {
    highlightImageCoord(false);
    exportCalibration();
    hideGridOverlay();
    calibrationActive = false;
}
function exportCalibration() {
    console.log(calibrationValues);
    let plainText = "";
    calibrationValues.forEach(function(elem) {
        plainText = plainText + elem[0] + "," + elem[1] + ";";
    });

    let plainBlob = new Blob([plainText], {type: 'application/octet-stream;charset=utf-8'});
    let plainLink = window.URL.createObjectURL(plainBlob);
    let a = document.createElement("a");
    a.download = 'calibration.csv';
    a.href = plainLink;
    a.innerHTML = "<b>Download Calibration</b>";
    document.getElementById('downloadButtonLanding').appendChild(a);
}

function showCalibrationPoint() {
    // console.log("step "+calibrationStep);
    highlightImageCoord(true,(((calibrationStep-1) % 9) + 1) * 0.1,(Math.floor((calibrationStep-1) / 9) + 1) * 0.1);
}

function highlightImageCoord(enable,x=0.5,y=0.5) {
    if(enable !== true) {
        document.querySelector("#highlightMarker").classList.add("hidden");
    }
    else {
        let pos_x = (x * x_img_max) % x_img_max;
        let pos_y = ((1-y) * y_img_max) % y_img_max;
        // console.log("x:"+(pos_x).toString()+",y:"+(pos_y).toString());
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
            document.getElementById("dmx["+spotNo+"]["+chan+"]").innerHTML = spot.dmxBuffer[chan];
        }
    });
}

function printGauges() {
    spots.forEach(function(spotRef, spotNumber) {
        document.getElementById("gauge["+spotNumber+"][dim]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.dim] / 255 * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][color]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.colorWheel] / 110 * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][focus]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.focus] / 255 * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][frost]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.frost] / 255 * 100).toString() + "%";
    });
}

// function sendDMX() {
//     for(const chan of Object.keys(spot1.dmxBuffer)) {
//         let channelInt = (spot1.config.connection.address-1+Number.parseInt(chan)); // - 1; //ArtNet lib has 0-indexed channels
//         // console.log("chan " + channelInt + "@" + spot1.dmxBuffer[chan]);
//         artnetSenderA.prepChannel(channelInt, spot1.dmxBuffer[chan]);
//     }
//     artnetSenderA.transmit();
// }

function drawIntervalCallback() {
    drawSpots();
    printDMX();
    printGauges();
}

function drawSpots() {
    spots.forEach(function(spot, spotNumber) {
        let x = spot.state.x;
        let y = spot.state.y;
        let x2 = Math.pow(spot.state.x,2);
        let y2 = Math.pow(spot.state.y,2);

        let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
        let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

        let pos_r = spot.state.r;

        let opacity = (spot.state.shutterOpen === true) ? "0.4" : "0";

        let spotMarkerElement = document.getElementById("spotMarker["+spotNumber+"]");
        spotMarkerElement.style.top = ((1-pos_y) * y_img_max).toString()+"px";
        // spotMarkerElement.style.left = (pos_x * (document.getElementById("webcamDrawArea").offsetWidth)).toString()+"px";
        spotMarkerElement.style.left = (pos_x * x_img_max).toString()+"px";
        spotMarkerElement.firstElementChild.setAttribute("r", (pos_r*(r_img_max-r_img_min)+r_img_min).toString());
        spotMarkerElement.firstElementChild.setAttribute("fill-opacity", opacity);

        //document.querySelector("#coordLabel1").innerHTML = "("+spot.state.x.toPrecision(2)+"|"+spot.state.y.toPrecision(2)+")";
        //document.querySelector("#radiusLabel1").innerHTML = "r="+spot.state.r.toPrecision(3);
    });
}

function updateWindowSize() {
    x_img_max = document.getElementById("webcamDrawArea").offsetWidth;
    y_img_max = document.getElementById("webcamDrawArea").offsetHeight;

    r_img_min = 10 * (document.getElementById("webcamDrawArea").offsetWidth / 800);
    r_img_max = 50 * (document.getElementById("webcamDrawArea").offsetWidth / 800);
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

function drawContextMenus() {
    spots.forEach(function(spot, spotNo) {
        });
}

function toggleContextMenu(spotNo) {
    let spot = spots[spotNo];

    let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");

    if(spot.contextMenuState.visible !== false) {
        spot.contextMenuState.visible = false;
        spotContextMenuElement.innerHTML = "";
    }
    else {
        spot.contextMenuState.visible = true;
        spotContextMenuElement.innerHTML = "";
        let x = spot.state.x;
        let y = spot.state.y;
        let x2 = Math.pow(x,2);
        let y2 = Math.pow(y,2);

        let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
        let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

        spotContextMenuElement.innerHTML = "";

        let translate_y = ((1-pos_y) > 0.65) ? "-100%" : "0";
        let translate_x = (pos_x > 0.75) ? "-100%" : "0";
        spotContextMenuElement.style.transform = "translate("+translate_x+","+translate_y+")";

        spotContextMenuElement.style.top = ((1-pos_y) * y_img_max).toString()+"px";
        spotContextMenuElement.style.left = (pos_x * x_img_max).toString()+"px";

        for(const [key, macro] of Object.entries(spot.fixture.dmx.macros)) {
            document.getElementById("spotContextMenu["+spotNo+"]").insertAdjacentHTML("afterbegin", '<div class="col px-2 text-decoration-underline" id="macroButton['+spotNo+']['+key+']" onclick="executeMacro('+spotNo+',\''+key+'\')"><span class="spinner-grow spinner-grow-sm hiddenVis" role="status"></span>&nbsp;'+macro.short+'</div>');
        }
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div class="col px-2" id="calib['+spotNo+']">Calibrate</div>');
        // spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div class="col px-2" id="close['+spotNo+']">Close</div>');
        spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div class="col px-2 border-bottom fw-bold" id="calib['+spotNo+']">Spot #'+spotNo+'</div>');
    }
}

function hideContextMenu(spotNo) {
    let spotContextMenuElement = document.getElementById("spotContextMenu["+spotNo+"]");
    spotContextMenuElement.innerHTML = "";
}

function drawMacroButtons() {
    document.querySelector("#macroList").innerHTML = "";
    spots.forEach(function(spot, spotNo) {
        document.getElementById("macroList").insertAdjacentHTML("beforeend", "<div></div>");
        for(const [key, macro] of Object.entries(spot.fixture.dmx.macros)) {
            document.getElementById("macroList").lastElementChild.insertAdjacentHTML("beforeend", '<button type="button" id="macroButton['+spotNo+']['+key+']" onclick="executeMacro('+spotNo+',\''+key+'\')" class="btn btn-outline-success" title="'+macro.name+'"><span class="spinner-grow spinner-grow-sm hiddenVis" role="status"></span>&nbsp;'+macro.short+' '+spotNo+'</button>');
        }
    });
}

function executeMacro(spotNo, btnKey) {
    console.log("execute Macro: ");
    // try {
        let macro = spots[spotNo].fixture.dmx.macros[btnKey];
        // document.getElementById("macroButton["+btnKey+"]").classList.add("btn-success");
        // document.getElementById("macroButton["+btnKey+"]").classList.remove("btn-outline-success");
        document.getElementById("macroButton["+spotNo+"]["+btnKey+"]").firstElementChild.classList.remove("hiddenVis");
        document.getElementById("macroButton["+spotNo+"]["+btnKey+"]").disabled = true;
        console.log(macro.name);
        let oldValue = spots[spotNo].dmxBuffer[macro.channel];
        spots[spotNo].dmxBuffer[macro.channel] = macro.value;
        spots[spotNo].sendDMX();
        window.setTimeout(setChannelToValue, (Number.parseInt(macro.hold)*1000), spotNo, macro.channel, oldValue, btnKey);
    // }
    // catch {
    //     console.log("no Macro of such name!");
    // }
}

function setChannelToValue(spotNo,chan,val,btnKey) {
    spots[spotNo].dmxBuffer[chan] = val;
    // document.getElementById("macroButton["+btnKey+"]").classList.add("btn-outline-success");
    // document.getElementById("macroButton["+btnKey+"]").classList.remove("btn-success");
    document.getElementById("macroButton["+spotNo+"]["+btnKey+"]").firstElementChild.classList.add("hiddenVis");
    document.getElementById("macroButton["+spotNo+"]["+btnKey+"]").disabled = false;
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
 * @param rsc element handle, e.g. from getElementByXYZ().s
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

    if(rsc.data('isLoading') === 1) {
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
        //there is a spot available to be bound to this gamepad
        connectedGamepads[event.gamepad.index] = new FollowJSGamepad(event.gamepad, spots[event.gamepad.index+1]);
        // play welcome rumble using
        // chrome vibration proposal draft: https://docs.google.com/document/d/1jPKzVRNzzU4dUsvLpSXm1VXPQZ8FP-0lKMT-R_p-s6g/edit
        navigator.getGamepads()[event.gamepad.index].vibrationActuator.playEffect("dual-rumble",{
            duration: 200,
            strongMagnitude: 0.4,
            weakMagnitude: 0.1
        });
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
        gamepadIntervalHandle = window.setInterval(gamepadCyclicReader,10); //15
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

        //square function for transfer axis to movement
        let absX = Math.abs(pad1axisX);
        let absY = Math.abs(pad1axisY);
        let dirX = Math.sign(pad1axisX);
        let dirY = Math.sign(pad1axisY);

        let pad1moveX = ((absX > gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement) ? ((absX-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)/(1-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)*dirX) : 0);
        let pad1moveY = ((absY > gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement) ? ((absY-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)/(1-gamepadObject.assignedSpot.control.gamepad.config.deadZones.movement)*dirY) : 0);

        if(pad1moveX !== 0 || pad1moveY !== 0) {
            let moveX = Math.sign(gamepadObject.assignedSpot.control.gamepad.mapping.axesDirections.x) * pad1moveX * movementModifier * gamepadObject.assignedSpot.config.increment.x;
            let moveY = Math.sign(gamepadObject.assignedSpot.control.gamepad.mapping.axesDirections.y) * pad1moveY * movementModifier * gamepadObject.assignedSpot.config.increment.y;
            // console.log("moveSpot("+moveX+","+moveY+")");
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
    })
}

function gamepadReadButtons() {
    connectedGamepads.forEach(function(gamepadObject) {
        gamepadObject.currentState.buttons.forEach(function (buttonState, index) {
            if (gamepadObject.currentState.buttons[index].pressed === true) {
                if (gamepadObject.lastState.buttons[index].pressed === false) { //rising edge
                    console.log("(rising edge) press on button " + index);
                    switch (index) {
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.snap:
                            gamepadObject.assignedSpot.snapSpot();
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.home:
                            gamepadObject.assignedSpot.homeSpot();
                            // if(calibrationActive === false)
                            //     initCalibration(gamepadObject.assignedSpot);
                            // else
                            //     skipCalibrationPoint();
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.storeCalibrationPoint:
                            if(calibrationActive)
                                storeCalibrationPoint();
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.colorWheelNext:
                            gamepadObject.assignedSpot.rotateColorWheel(+1);
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.colorWheelPrev:
                            gamepadObject.assignedSpot.rotateColorWheel(-1);
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.snapCTO:
                            gamepadObject.assignedSpot.snapToCTO();
                            break;
                        case gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenu:
                            toggleContextMenu(gamepadObject.assignedSpot.spotNumber);
                            break;
                    }
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

    // drawMacroButtons();
    prepareDMXTable();

    // spots.forEach(function(spot, spotNo) {
    //     spot.homeSpot();
    // });
});