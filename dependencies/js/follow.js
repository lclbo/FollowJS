"use strict";

/*
TODO:
- move calibration handling and control into spots
- make contextMenu a property of each spot, mainView gets a paintMenus() method to paint all _opened_ menus
- create FollowJSKeyboard
- move all readAxes and readButtons to Gamepad object
 */

const dmxLib = require('./dependencies/js/libDmxArtNet');
const FollowJSGamepad = require('./dependencies/js/FollowJSGamepad');
const FollowJSSpot = require('./dependencies/js/FollowJSSpot');
const FollowJSMainView = require('./dependencies/js/FollowJSMainView');

global.systemConf = loadConfigFromFile("systemConf");
global.fixtureLib = loadConfigFromFile("fixtureLib");
global.gamepadLib = loadConfigFromFile("gamepadLib");

if(systemConf === undefined || systemConf === null) throw new Error("System configuration could not be loaded!");
if(fixtureLib === undefined || fixtureLib === null) throw new Error("Fixture Library could not be loaded!");
if(gamepadLib === undefined || gamepadLib === null) throw new Error("Gamepad Library could not be loaded!");

global.mainView = new FollowJSMainView();

let dmxArtNet, artNetSenderA;

let gamepadIntervalHandle = null;
let globalTimestamp = new Date();

let calibrationActive = false;
let calibrationSpotNo = undefined;
let calibrationValues = new Array(9*9);
let calibrationStep = 1;

let x_img_max, y_img_max, r_img_min, r_img_max;

let keyboardControlSpotNo = 1;
let connectedGamepads = new Array(4);
// let spots = [];
global.spots = [];

function init() {
    dmxArtNet = new dmxLib.DmxArtNet({
        oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
        sName: "Follow.JS", // 17 char long node description, default to "dmxnet"
        lName: "Followspot Control JS", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
        hosts: ["127.0.0.1"] // Interfaces to listen to, all by default
    });

    //TODO: get ArtNet config + target IPs from spot configs, maybe even infer broadcast IP
    artNetSenderA = dmxArtNet.newSender({
        ip: '10.0.20.255',
        subnet: 15,
        universe: 15,
        net: 0,
    });

    createAllSpotsFromConfigFiles();
}

function createAllSpotsFromConfigFiles() {
    let numberOfSpotsCreated = 0;
    const fs = require("fs");
    try {
        let pathStr = "" + getConfigPath() + "/spots";
        let files = fs.readdirSync(pathStr);

        files.forEach((file)=> {
            if(file.endsWith(".json")) {
                let fileNameWithoutExtension = file.substring(0, file.lastIndexOf(".json"));
                createSpotFromConfigFile(fileNameWithoutExtension, artNetSenderA);
                numberOfSpotsCreated++;
            }
        });
    }
    catch(e) {
        console.log("load Config Error: "+e);
        return null;
    }

    return numberOfSpotsCreated;
}

function createSpotFromConfigFile(filename, artNetSender) {
    const fs = require("fs");
    try {
        let jsonStr = fs.readFileSync("" +getConfigPath() + "/spots/" + filename + ".json");
        let spotConfig = JSON.parse(jsonStr.toString());
        spotConfig.sourceFileName = filename;
        let nextFreeSpotNo = Object.keys(spots).length + 1;

        spots[nextFreeSpotNo] = new FollowJSSpot(nextFreeSpotNo, spotConfig, artNetSender);
    }
    catch(e) {
        console.log("createSpotFromConfigFile Error: "+e);
    }
}

function storeSpotToConfigFile(spotNo) {
    const fs = require("fs");
    try {
        let spot = spots[spotNo];
        spot.setCurrentStateAsHomeConfig();
        let filename = spot.config.sourceFileName;
        fs.writeFileSync(""+getConfigPath()+"/spots/"+filename+".json", JSON.stringify(spot.config, null, 2));
        // console.log("Config stored.");
    }
    catch(e) {
        console.log("store Config Error: "+e);
        return null;
    }
}

function loadConfigFromFile(filename) {
    const fs = require("fs");
    try {
        let configStr = fs.readFileSync(""+getConfigPath()+"/"+filename+".json");

        return JSON.parse(configStr.toString());
    }
    catch(e) {
        console.log("load Config Error: "+e);
    }
    return null;
}

function getConfigPath() {
    let execPath = process.execPath.toLowerCase();
    let pathStr = "";

    if(execPath.includes("electron")) {
        pathStr = "config";
    }
    else {
        pathStr = "" + process.resourcesPath + "/config";
    }

    return pathStr;
}

function startImportCalibration(spotNo) {
    document.getElementById("inputOverlaySpotNo").innerText = ""+spotNo;
    // document.getElementById("inputOverlaySubmitButton").onclick = (e) => {importCalibration(spotNo);};
    document.getElementById("inputOverlayText").dataset.targetSpotNo = spotNo;
    document.getElementById("inputOverlaySubmitButton").addEventListener("click", importCalibrationFromText);
    document.getElementById("inputOverlayText").value = "";
    document.getElementById("inputOverlay").classList.remove("hidden");
}

function endImportCalibration() {
    document.getElementById("inputOverlay").classList.add("hidden");
    document.getElementById("inputOverlaySpotNo").innerText = "?";
    document.getElementById("inputOverlayText").dataset.targetSpotNo = undefined;
    // document.getElementById("inputOverlaySubmitButton").onclick = null;
    document.getElementById("inputOverlaySubmitButton").removeEventListener("click", importCalibrationFromText);
}

function importCalibrationFromText() {
    let targetSpotNoStr = "" + document.getElementById("inputOverlayText").dataset.targetSpotNo;
    let calibStr = "" + document.getElementById("inputOverlayText").value;

    let targetSpotNo = Number.parseInt(targetSpotNoStr);
    if(targetSpotNo) {
        importCalibration(targetSpotNo, calibStr);
    }
}

function importCalibration(spotNo, calibString) {
    let calibArrayA = [];
    let calibArrayB = [];

    let calibStrLines = calibString.split(/\r?\n/);

    calibStrLines.forEach((line,lineNo) => {
        let lineMatches = [...line.matchAll(/([+-]*\d.?\d+e[+-]\d{2})/g)];
        if(lineMatches.length === 2) {
            calibArrayA.push(Number.parseFloat(""+lineMatches[0]));
            calibArrayB.push(Number.parseFloat(""+lineMatches[1]));
        }
    });
    if(calibArrayA.length === 6 && calibArrayB.length === 6) {
        spots[spotNo].config.translation.regression.a = calibArrayA;
        spots[spotNo].config.translation.regression.b = calibArrayB;
        // storeSpotToConfigFile(spotNo);
        mainView.drawSpots(); //update spot position
        endImportCalibration();
    }
    else {
        console.log("Import error.");
        document.getElementById("inputOverlayText").classList.add("backgroundFlashRed");
        document.getElementById("inputOverlayText").onanimationend = ()=>{document.getElementById("inputOverlayText").classList.remove("backgroundFlashRed");};
    }
}

function initCalibration(spotNo) {
    if(calibrationActive)
        endCalibration();

    document.getElementById('downloadButtonLanding').innerHTML = '';
    document.getElementById('cancelCalibrationButton').classList.remove("hidden");
    mainView.hideAllContextMenus();
    console.log("init calibration");
    calibrationActive = true;
    calibrationStep = 1;
    calibrationSpotNo = spotNo;
    hideAllSpotMarkerExceptFor(spotNo);
    hideAllSpotStatusExceptFor(spotNo);
    // blinkSpotMarker(spotNo, 2);
    setSpotStatusOpacity(spotNo, 0.3);
    // blinkSpotStatus(spotNo, 2);
    mainView.showGridOverlay();
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
    mainView.highlightImageCoord(false);
    showAllSpotMarker();
    showAllSpotStatus();
    setSpotStatusOpacity(calibrationSpotNo, 1);
    document.getElementById('cancelCalibrationButton').classList.add("hidden");
    mainView.hideGridOverlay();
    calibrationActive = false;
}

function exportCalibration() {
    let plainText = "";
    calibrationValues.forEach(function(elem, eIdx) {
        if(elem[0] === null || elem[1] === null)
            plainText = plainText + "-1 -1\n";
        else
            plainText = plainText + ""+elem[0]+" "+elem[1]+"\n";
    });

    let plainBlob = new Blob([plainText], {type: 'application/octet-stream;charset=utf-8'});
    let plainLink = window.URL.createObjectURL(plainBlob);
    let a = document.createElement("a");
    a.download = 'calibration-'+globalTimestamp.getFullYear()+'-'+(globalTimestamp.getMonth()+1)+'-'+globalTimestamp.getDate()+'-spot'+calibrationSpotNo+'.txt';
    a.href = plainLink;
    a.innerHTML = "<button class='button-green'>Download Calibration</button>";
    document.getElementById('downloadButtonLanding').appendChild(a);
    document.getElementById('cancelCalibrationButton').classList.add("hidden");
}

function showCalibrationPoint() {
    mainView.highlightImageCoord(true,(((calibrationStep-1) % 9) + 1) * 0.1,(Math.floor((calibrationStep-1) / 9) + 1) * 0.1);
}

function prepareDMXTable() {
    let titleDone = false;
    spots.forEach(function(spot, spotNo) {
        if(!titleDone) {
            document.getElementById("dmxTableHeader").insertAdjacentHTML("beforeend", "<tr></tr>");
            for(const chan of Object.values(spot.fixture.dmx.channels)) {
                document.getElementById("dmxTableHeader").firstElementChild.insertAdjacentHTML("beforeend", "<td>"+chan.short+"</td>");
            }
            titleDone = true;
        }

        document.getElementById("dmxTableBody").insertAdjacentHTML("afterbegin", "<tr></tr>");
        for(const chanNo of Object.keys(spot.fixture.dmx.channels)) {
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
        document.getElementById("gauge["+spotNumber+"][dim]").style.width = ""+(spotRef.state.dim * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][color]").style.width = ""+((spotRef.state.colorWheelIndex / (spotRef.fixture.dmx.colorWheelArray.length - 1)) * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][color]").style.backgroundColor = ""+spotRef.fixture.dmx.colorWheelArray[spotRef.state.colorWheelIndex].visual;
        document.getElementById("gauge["+spotNumber+"][focus]").style.width = ""+(spotRef.state.focus * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][frost]").style.width = ""+(spotRef.state.frost * 100).toString() + "%";
    });
}

function setSpotStatusOpacity(spotNo, opacity) {
    let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
    spotStatusElement.style.opacity = Math.min(1,Math.max(0,opacity)).toString();
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

function drawAnimationFrameCallback() {
    mainView.drawSpots();
    printDMX();
    printAllSpotStatus();
    window.requestAnimationFrame(drawAnimationFrameCallback);
}

function blinkSpotMarker(spotNo, cycleDuration=1) {
    let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
    spotMarkerElement.firstElementChild.insertAdjacentHTML("afterbegin", '<animate attributeName="stroke-opacity" values="1;0.2;1" dur="'+(Math.max(0.1,cycleDuration))+'s" repeatCount="indefinite" />')
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

function enableCaptureKeyboard() {
    window.removeEventListener('keydown', keyboardInputCallback);
    window.addEventListener('keydown', keyboardInputCallback);
}
function disableCaptureKeyboard() {
    window.removeEventListener('keydown', keyboardInputCallback);
}
function keyboardInputCallback(e) {
    // console.log("(which:" + (e.which) + ", key:" + (e.key) + ", code:" + (e.code) + ")");
    let singleDigit = new RegExp("^[0-9]$");
    if(singleDigit.test(e.key) && Number.parseInt(e.key) in spots) {
        keyboardControlSpotNo = Number.parseInt(e.key);
    }
    else if(keyboardControlSpotNo in spots) {
        switch(e.key) {
            case systemConf.keyboardControl.mapping.home:
                spots[keyboardControlSpotNo].homeSpot();
                break;
            case systemConf.keyboardControl.mapping.yInc:
                spots[keyboardControlSpotNo].moveSpot(0,spots[keyboardControlSpotNo].config.increment.y * systemConf.keyboardControl.config.modifier);
                break;
            case systemConf.keyboardControl.mapping.xDec:
                spots[keyboardControlSpotNo].moveSpot(-1 * spots[keyboardControlSpotNo].config.increment.x * systemConf.keyboardControl.config.modifier,0);
                break;
            case systemConf.keyboardControl.mapping.yDec:
                spots[keyboardControlSpotNo].moveSpot(0,-1 * spots[keyboardControlSpotNo].config.increment.y * systemConf.keyboardControl.config.modifier);
                break;
            case systemConf.keyboardControl.mapping.xInc:
                spots[keyboardControlSpotNo].moveSpot(spots[keyboardControlSpotNo].config.increment.x * systemConf.keyboardControl.config.modifier,0);
                break;
            case systemConf.keyboardControl.mapping.smaller:
                spots[keyboardControlSpotNo].resizeSpot(-1 * spots[keyboardControlSpotNo].config.increment.r * systemConf.keyboardControl.config.modifier);
                break;
            case systemConf.keyboardControl.mapping.bigger:
                spots[keyboardControlSpotNo].resizeSpot(spots[keyboardControlSpotNo].config.increment.r * systemConf.keyboardControl.config.modifier);
                break;
            case systemConf.keyboardControl.mapping.dimDown:
                spots[keyboardControlSpotNo].dimSpot(-1 * spots[keyboardControlSpotNo].config.increment.dim * systemConf.keyboardControl.config.modifier);
                break;
            case systemConf.keyboardControl.mapping.dimUp:
                spots[keyboardControlSpotNo].dimSpot(spots[keyboardControlSpotNo].config.increment.dim * systemConf.keyboardControl.config.modifier);
                break;
            case systemConf.keyboardControl.mapping.nextColor:
                spots[keyboardControlSpotNo].rotateColorWheel(+1);
                break;
            case systemConf.keyboardControl.mapping.prevColor:
                spots[keyboardControlSpotNo].rotateColorWheel(-1);
                break;
            case systemConf.keyboardControl.mapping.cto:
                spots[keyboardControlSpotNo].snapToCTO();
                break;
            case systemConf.keyboardControl.mapping.snap:
                spots[keyboardControlSpotNo].snapSpot();
                break;
            case systemConf.keyboardControl.mapping.storeCalibrationPoint:
                if(calibrationActive)
                    storeCalibrationPoint();
                break;
            case systemConf.keyboardControl.mapping.skipCalibrationPoint:
                if(calibrationActive)
                    skipCalibrationPoint();
                break;
        }
    }
}

function lockContextMenu(spotNo) {
    spots[spotNo].contextMenuState.locked = true;
}

function unlockContextMenu(spotNo) {
    spots[spotNo].contextMenuState.locked = false;
}

function executeMacro(spotNo, macroNo) {
    let macro = spots[spotNo].fixture.dmx.macros[macroNo];

    // document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.remove("hiddenVis");
    console.log("execute Macro: " + macro.name);
    blinkSpotMarker(spotNo, 1);
    let oldValue = spots[spotNo].dmxBuffer[macro.channel];
    spots[spotNo].dmxBuffer[macro.channel] = macro.value;
    window.setTimeout(setChannelToValue, (Number.parseInt(macro.hold)*1000), spotNo, macro.channel, oldValue, macroNo);
    mainView.hideContextMenu(spotNo);
    lockContextMenu(spotNo);
    window.setTimeout(unlockContextMenu, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    window.setTimeout(stopBlinkSpotMarker, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    spots[spotNo].sendDMX(true);
    window.setTimeout(()=>{spots[spotNo].sendDMX(true);}, 500);
}

function setChannelToValue(spotNo,chan,val,macroNo) {
    spots[spotNo].dmxBuffer[chan] = val;
    document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.add("hiddenVis");
    spots[spotNo].sendDMX(true);
}

function enableGamepadConnectionEventListeners() {
    window.addEventListener("gamepadconnected", gamepadConnectCallback);
    window.addEventListener("gamepaddisconnected", gamepadDisconnectCallback);
}
// function disableGamepadConnectionEventListeners() {
//     window.removeEventListener("gamepadconnected",gamepadConnectCallback);
//     window.removeEventListener("gamepaddisconnected",gamepadDisconnectCallback);
// }

function gamepadConnectCallback(event) {
    conditionalLog("gamepad " + event.gamepad.index + " (" + event.gamepad.id + ") connected");

    if(spots[event.gamepad.index+1] !== undefined) {
        //there is a spot available to bind to this new gamepad
        connectedGamepads[event.gamepad.index] = new FollowJSGamepad(event.gamepad, spots[event.gamepad.index+1]);
        connectedGamepads[event.gamepad.index].rumble("welcome");
    }

    if(!(systemConf.keyboardControl.config.alwaysEnabled))
        disableCaptureKeyboard(); //if we have a controller, the debug keyboard control is no longer needed

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
    // window.requestAnimationFrame(gamepadCyclicReader);
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
                        mainView.toggleContextMenu(gamepadObject.assignedSpot.spotNumber);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuUp)
                        gamepadObject.assignedSpot.scrollContextMenu(-1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuDown)
                        gamepadObject.assignedSpot.scrollContextMenu(1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuSelect) {
                        if(!gamepadObject.assignedSpot.contextMenuState.locked && gamepadObject.assignedSpot.contextMenuState.visible)
                            executeMacro(gamepadObject.assignedSpot.spotNumber, gamepadObject.assignedSpot.contextMenuState.selectedIndex);
                    }

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuCancel)
                        mainView.hideContextMenu(gamepadObject.assignedSpot.spotNumber);
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

function populateVersionInfoStringInFooter() {
    let versionString = "";
    try {
        let searchString = global.location.search;
        let searchParams = new URLSearchParams(searchString);
        let app = searchParams.get("app");
        let ver = searchParams.get("ver");
        versionString = "v"+ver;
        // versionString = "" + app + ", v"+ver;
    }
    catch(e) {
        console.log("Version Info Error: "+e);
        versionString = "(Error decoding version information. Sorry.)";
    }
    document.getElementById("versionInfo").innerText = versionString;
}

function conditionalLog(msg) {
    console.log(msg);
}

document.addEventListener('DOMContentLoaded', function () {
    // ready function
    conditionalLog("execute ready function");

    init();

    populateVersionInfoStringInFooter();

    document.body.addEventListener('resize', mainView.updateWindowSize);
    mainView.updateWindowSize();
    mainView.initializeImage();

    if(systemConf.keyboardControl.config.alwaysEnabled || systemConf.keyboardControl.config.useAsFallback) {
        enableCaptureKeyboard();
    }

    enableGamepadConnectionEventListeners();

    // addSpotsToDOM();
    mainView.addSpotsToDOM();
    prepareDMXTable();
    window.requestAnimationFrame(drawAnimationFrameCallback);
});