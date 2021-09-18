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


let keyboardControlConfig = {
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
let gamepadControlConfig = {
    config: gamepadLib.xboxOneControllerDefault.config,
    mapping: gamepadLib.xboxOneControllerDefault.mapping.legacy
}

let spot1config = {
    home: {
        x: 0.158,
        y: 0.815,
        r: 0.1,
        frost: 0,
        focus: 0.5,
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

// let allBuffers = {
//     spot1DmxBufferInternal: new Array(32),
//     set buf(val) {
//         this.spot1DmxBufferInternal = val;
//         sendDMX();
//     }
// }


let spot1 = new FollowJSSpot(fixtureLib.alphaBeam1500, spot1config, {keyboard: keyboardControlConfig, gamepad: gamepadControlConfig}, artnetSenderA);


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
    if(enable === false) {
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

function printDMX() {
    for(const chan of Object.keys(spot1.dmxBuffer)) {
        document.getElementById("dmx[1]["+chan+"]").innerHTML = spot1.dmxBuffer[chan];
    }
}

function printGauges(spotRef, spotNumber) {
    document.getElementById("gauge["+spotNumber+"][dim]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.dim] / 255 * 100).toString() + "%";
    document.getElementById("gauge["+spotNumber+"][color]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.colorWheel] / 255 * 100).toString() + "%";
    document.getElementById("gauge["+spotNumber+"][focus]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.focus] / 255 * 100).toString() + "%";
    document.getElementById("gauge["+spotNumber+"][frost]").style.width = (spotRef.dmxBuffer[spotRef.fixture.dmx.mapping.frost] / 255 * 100).toString() + "%";
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
    drawSpot();
    // spot1.positionToDMX();
    // spot1.stateToDMX();
    printDMX();
    printGauges(spot1, 1);
    // sendDMX();
}

function drawSpot() {
    //x,y moved to have pos(0|0) at image center img(.5|.5)
    /*
    let x = (spot1.state.x + (0.5-spot1.config.translation.origin.x));
    let y = (1-(spot1.state.y + (0.5-spot1.config.translation.origin.y)));

    let convertedX = 0;
    for(let idx=0;idx<spot1.config.translation.regression.x.length;idx++) {
        convertedX += spot1.config.translation.regression.x[idx]*Math.pow(x,idx);
    }
    let convertedY = 0;
    for(let idx=0;idx<spot1.config.translation.regression.y.length;idx++) {
        convertedY += spot1.config.translation.regression.y[idx]*Math.pow(y,idx);
    }
    let pos_x = convertedX * x_img_max;
    let pos_y = convertedY * y_img_max;
    */

    let x = spot1.state.x;
    let y = spot1.state.y;
    let x2 = Math.pow(spot1.state.x,2);
    let y2 = Math.pow(spot1.state.y,2);

    let pos_x = spot1.config.translation.regression.a[0] + (spot1.config.translation.regression.a[1] * x) + (spot1.config.translation.regression.a[2] * y) + (spot1.config.translation.regression.a[3] * x * y) + (spot1.config.translation.regression.a[4] * x2) + (spot1.config.translation.regression.a[5] * y2);
    let pos_y = spot1.config.translation.regression.b[0] + (spot1.config.translation.regression.b[1] * x) + (spot1.config.translation.regression.b[2] * y) + (spot1.config.translation.regression.b[3] * x * y) + (spot1.config.translation.regression.b[4] * x2) + (spot1.config.translation.regression.b[5] * y2);

    let pos_r = spot1.state.r;

    let spotMarkerElement = document.querySelector("#spotMarker1");
    spotMarkerElement.style.top = ((1-pos_y) * y_img_max).toString();
    spotMarkerElement.style.left = (pos_x * x_img_max).toString();
    spotMarkerElement.firstElementChild.setAttribute("r", (pos_r*(r_img_max-r_img_min)+r_img_min).toString());

    //document.querySelector("#coordLabel1").innerHTML = "("+spot1.state.x.toPrecision(2)+"|"+spot1.state.y.toPrecision(2)+")";
    //document.querySelector("#radiusLabel1").innerHTML = "r="+spot1.state.r.toPrecision(3);
}

function enableCaptureKeyboard() {
    $(window).off("keypress").on('keypress', keyboardInputCallback);
}
// function disableCaptureKeyboard() {
//     $(window).off("keypress");
// }

function keyboardInputCallback(e) {
    // console.log("(which:" + (e.which) + ", key:" + (e.key) + ", code:" + (e.code) + ")");
    switch(e.key) {
        case spot1.control.keyboard.mapping.yInc:
            spot1.moveSpot(0,spot1.config.increment.y * spot1.control.keyboard.config.modifier);
            break;
        case spot1.control.keyboard.mapping.xDec:
            spot1.moveSpot(-1 * spot1.config.increment.x * spot1.control.keyboard.config.modifier,0);
            break;
        case spot1.control.keyboard.mapping.yDec:
            spot1.moveSpot(0,-1 * spot1.config.increment.y * spot1.control.keyboard.config.modifier);
            break;
        case spot1.control.keyboard.mapping.xInc:
            spot1.moveSpot(spot1.config.increment.x * spot1.control.keyboard.config.modifier,0);
            break;
        case spot1.control.keyboard.mapping.smaller:
            spot1.resizeSpot(-1 * spot1.config.increment.r * spot1.control.keyboard.config.modifier);
            break;
        case spot1.control.keyboard.mapping.bigger:
            spot1.resizeSpot(spot1.config.increment.r * spot1.control.keyboard.config.modifier);
            break;
        case spot1.control.keyboard.mapping.dimDown:
            spot1.dimSpot(-1 * spot1.config.increment.dim * spot1.control.keyboard.config.modifier);
            break;
        case spot1.control.keyboard.mapping.dimUp:
            spot1.dimSpot(spot1.config.increment.dim * spot1.control.keyboard.config.modifier);
            break;
        case spot1.control.keyboard.mapping.snap:
            spot1.snapSpot();
            break;
    }
}


function drawMacroButtons() {
    document.querySelector("#macroList").innerHTML = "";
    for(const [key, macro] of Object.entries(spot1.fixture.dmx.macros)) {
        document.querySelector("#macroList").insertAdjacentHTML("beforeend", '<button type="button" id="macroButton['+key+']" onclick="executeMacro(\''+key+'\')" class="btn btn-outline-success" title="'+macro.name+'"><span class="spinner-grow spinner-grow-sm hiddenVis" role="status"></span>&nbsp;'+macro.short+'</button>')
    }
}

function executeMacro(btnKey) {
    console.log("execute Macro: ");
    try {
        let macro = spot1.fixture.dmx.macros[btnKey];
        // document.getElementById("macroButton["+btnKey+"]").classList.add("btn-success");
        // document.getElementById("macroButton["+btnKey+"]").classList.remove("btn-outline-success");
        document.getElementById("macroButton["+btnKey+"]").firstElementChild.classList.remove("hiddenVis");
        document.getElementById("macroButton["+btnKey+"]").disabled = true;
        console.log(macro.name);
        let oldValue = spot1.dmxBuffer[macro.channel];
        spot1.dmxBuffer[macro.channel] = macro.value;
        window.setTimeout(setChannelToValue, (Number.parseInt(macro.hold)*1000), macro.channel, oldValue, btnKey);
    }
    catch {
        console.log("no Macro of such name!");
    }
}

function setChannelToValue(chan,val,btnKey) {
    spot1.dmxBuffer[chan] = val;
    // document.getElementById("macroButton["+btnKey+"]").classList.add("btn-outline-success");
    // document.getElementById("macroButton["+btnKey+"]").classList.remove("btn-success");
    document.getElementById("macroButton["+btnKey+"]").firstElementChild.classList.add("hiddenVis");
    document.getElementById("macroButton["+btnKey+"]").disabled = false;
}


function startRefresh(){
    imageIntervalHandle = window.setInterval(refreshResources, imageRefreshInterval);
    console.log("emit interval " + imageIntervalHandle);
}
function stopRefresh(){
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

    connectedGamepads[event.gamepad.index] = new FollowJSGamepad(event.gamepad);

    // play welcome rumble using
    // chrome vibration proposal draft: https://docs.google.com/document/d/1jPKzVRNzzU4dUsvLpSXm1VXPQZ8FP-0lKMT-R_p-s6g/edit
    navigator.getGamepads()[event.gamepad.index].vibrationActuator.playEffect("dual-rumble",{
        duration: 200,
        strongMagnitude: 0.4,
        weakMagnitude: 0.1
    });
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
        let pad1axisX = gamepadObject.currentState.axes[spot1.control.gamepad.mapping.axes.x];
        let pad1axisY = gamepadObject.currentState.axes[spot1.control.gamepad.mapping.axes.y];

        //square function for transfer axis to movement
        let absX = Math.abs(pad1axisX);
        let absY = Math.abs(pad1axisY);
        let dirX = Math.sign(pad1axisX);
        let dirY = Math.sign(pad1axisY);

        let pad1moveX = ((absX > spot1.control.gamepad.config.deadZones.movement) ? ((absX-spot1.control.gamepad.config.deadZones.movement)/(1-spot1.control.gamepad.config.deadZones.movement)*dirX) : 0);
        let pad1moveY = ((absY > spot1.control.gamepad.config.deadZones.movement) ? ((absY-spot1.control.gamepad.config.deadZones.movement)/(1-spot1.control.gamepad.config.deadZones.movement)*dirY) : 0);

        if(pad1moveX !== 0 || pad1moveY !== 0) {
            let moveX = Math.sign(spot1.control.gamepad.mapping.axesDirections.x) * pad1moveX * spot1.control.gamepad.config.modifier * spot1.config.increment.x;
            let moveY = Math.sign(spot1.control.gamepad.mapping.axesDirections.y) * pad1moveY * spot1.control.gamepad.config.modifier * spot1.config.increment.y;
            // console.log("moveSpot("+moveX+","+moveY+")");
            spot1.moveSpot(moveX,moveY);
        }


        // Iris
        let pad1axisR = gamepadObject.currentState.axes[spot1.control.gamepad.mapping.axes.r];
        let absR = Math.abs(pad1axisR);
        let dirR = Math.sign(pad1axisR);
        let pad1moveR = ((absR > spot1.control.gamepad.config.deadZones.other) ? ((absR-spot1.control.gamepad.config.deadZones.other)/(1-spot1.control.gamepad.config.deadZones.other)*dirR) : 0);
        if(pad1moveR !== 0) {
            let moveR = Math.sign(spot1.control.gamepad.mapping.axesDirections.r) * pad1moveR * spot1.control.gamepad.config.modifier * spot1.config.increment.r;

            spot1.resizeSpot(moveR);
        }


        // // Frost
        // let pad1axisFrost = gamepadObject.currentState.axes[spot1.control.gamepad.mapping.axes.frost];
        // let absFrost = Math.abs(pad1axisFrost);
        // let dirFrost = Math.sign(pad1axisFrost);
        // let pad1moveFrost = ((absFrost > spot1.control.gamepad.config.deadZones.other) ? ((absFrost-spot1.control.gamepad.config.deadZones.other)/(1-spot1.control.gamepad.config.deadZones.other)*dirFrost) : 0);
        // if(pad1moveFrost !== 0) {
        //     let moveFrost = Math.sign(spot1.control.gamepad.mapping.axesDirections.frost) * pad1moveFrost * spot1.control.gamepad.config.modifier * spot1.config.increment.frost;
        //
        //     spot1.frostSpot(moveFrost);
        // }


        // Dimmer
        let pad1axisDim = gamepadObject.currentState.axes[spot1.control.gamepad.mapping.axes.dim];
        let absDim = Math.abs(pad1axisDim);
        let dirDim = Math.sign(pad1axisDim);
        let pad1moveDim = ((absDim > spot1.control.gamepad.config.deadZones.other) ? ((absDim-spot1.control.gamepad.config.deadZones.other)/(1-spot1.control.gamepad.config.deadZones.other)*dirDim) : 0);
        if(pad1moveDim !== 0) {
            let moveDim = Math.sign(spot1.control.gamepad.mapping.axesDirections.dim) * pad1moveDim * spot1.control.gamepad.config.modifier * spot1.config.increment.dim;;

            spot1.dimSpot(moveDim);
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
                        case spot1.control.gamepad.mapping.buttons.snap:
                            spot1.snapSpot();
                            break;
                        case spot1.control.gamepad.mapping.buttons.calibrate:
                            console.log("calib");
                            if(calibrationActive === false)
                                initCalibration(spot1);
                            else
                                skipCalibrationPoint();
                            break;
                        case spot1.control.gamepad.mapping.buttons.storeCalibrationPoint:
                            if(calibrationActive)
                                storeCalibrationPoint();
                            break;
                        case spot1.control.gamepad.mapping.buttons.colorWheelNext:
                            spot1.rotateColorWheel(+1);
                            break;
                        case spot1.control.gamepad.mapping.buttons.colorWheelPrev:
                            spot1.rotateColorWheel(-1);
                            break;
                        case spot1.control.gamepad.mapping.buttons.snapCTO:
                            spot1.snapToCTO();
                            break;
                    }
                }
                else { //continuous press
                    // console.log("still pressing button " + index);
                    switch (index) {
                        case spot1.control.gamepad.mapping.buttons.focusUp:
                            spot1.focusSpot(spot1.config.increment.focus * spot1.control.gamepad.config.modifier)
                            break;
                        case spot1.control.gamepad.mapping.buttons.focusDown:
                            spot1.focusSpot(-1 * spot1.config.increment.focus * spot1.control.gamepad.config.modifier)
                            break;
                        case spot1.control.gamepad.mapping.buttons.frostUp:
                            spot1.frostSpot(spot1.config.increment.frost * spot1.control.gamepad.config.modifier)
                            break;
                        case spot1.control.gamepad.mapping.buttons.frostDown:
                            spot1.frostSpot(-1 * spot1.config.increment.frost * spot1.control.gamepad.config.modifier)
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
    initializeResources();
    startRefresh();
    if(drawIntervalHandle === null)
        drawIntervalHandle = window.setInterval(drawIntervalCallback,22); //15
    hideGridOverlay();
    enableCaptureKeyboard();
    enableGamepadConnectionEventListeners();
    drawMacroButtons();
    spot1.homeSpot();
    highlightImageCoord(false);
});