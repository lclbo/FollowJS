"use strict";

/*
TODO: All completed!
- ✅ move calibration handling and control into spots
- ✅ make contextMenu a property of each spot, mainView gets a paintMenus() method to paint all _opened_ menus
- ✅ create FollowJSKeyboard
- ✅ move all readAxes and readButtons to Gamepad object
- ✅ get ArtNet config + target IPs from spot configs, maybe even infer broadcast IP
- ✅ single shared ArtNet sender for all spots on the same universe
- ✅ consistent spot indexing: spot1.json → spotNumber 1, spots[0]
 */

const dmxLib = require('./dependencies/js/libDmxArtNet');
const FollowJSGamepad = require('./dependencies/js/FollowJSGamepad');
const FollowJSSpot = require('./dependencies/js/FollowJSSpot');
const FollowJSMainView = require('./dependencies/js/FollowJSMainView');
const FollowJSKeyboard = require('./dependencies/js/FollowJSKeyboard');
const spotIndex = require('./dependencies/js/FollowJSSpotIndex');

global.systemConf = loadConfigFromFile("systemConf");
global.fixtureLib = loadConfigFromFile("fixtureLib");
global.gamepadLib = loadConfigFromFile("gamepadLib");

if(systemConf === undefined || systemConf === null) throw new Error("System configuration could not be loaded!");
if(fixtureLib === undefined || fixtureLib === null) throw new Error("Fixture Library could not be loaded!");
if(gamepadLib === undefined || gamepadLib === null) throw new Error("Gamepad Library could not be loaded!");

global.mainView = new FollowJSMainView();
global.keyboard = new FollowJSKeyboard();

let dmxArtNet, artNetSenderA;

let gamepadIntervalHandle = null;

global.calibrationActive = false;
global.calibrationSpotNo = undefined;
global.calibrationValues = new Array(9*9);
global.calibrationStep = 1;
global.globalTimestamp = new Date();

let x_img_max, y_img_max, r_img_min, r_img_max;

let connectedGamepads = new Array(4);
let gamepadConnectTime = {};
// let spots = [];
global.spots = [];

Object.assign(global, spotIndex);

function init() {
    dmxArtNet = new dmxLib.DmxArtNet({
        oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
        sName: "Follow.JS", // 17 char long node description, default to "dmxnet"
        lName: "Followspot Control JS", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
        hosts: ["127.0.0.1"] // Interfaces to listen to, all by default
    });

    artNetSenderA = createSharedArtNetSender();

    createAllSpotsFromConfigFiles();
}

function createAllSpotsFromConfigFiles() {
    let numberOfSpotsCreated = 0;
    const fs = require("fs");
    try {
        let pathStr = "" + getConfigPath() + "/spots";
        let files = fs.readdirSync(pathStr)
            .filter((file) => file.endsWith(".json"))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        files.forEach((file)=> {
            let fileNameWithoutExtension = file.substring(0, file.lastIndexOf(".json"));
            createSpotFromConfigFile(fileNameWithoutExtension);
            numberOfSpotsCreated++;
        });
    }
    catch(e) {
        console.log("load Config Error: "+e);
        return null;
    }

    return numberOfSpotsCreated;
}

function getSpotNumberFromFilename(filename) {
    let match = filename.match(/(\d+)$/);
    if(match)
        return Number.parseInt(match[1], 10);
    return undefined;
}

function getArtNetConnectionFromConfig() {
    const fs = require("fs");
    let connection = {
        ip: "10.0.20.255",
        net: 0,
        subnet: 0,
        universe: 0
    };

    try {
        let pathStr = "" + getConfigPath() + "/spots";
        let files = fs.readdirSync(pathStr).filter((file) => file.endsWith(".json"))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if(files.length > 0) {
            let spotConfig = JSON.parse(fs.readFileSync(pathStr + "/" + files[0]).toString());
            if(spotConfig.connection) {
                connection.net = spotConfig.connection.net ?? connection.net;
                connection.subnet = spotConfig.connection.subnet ?? connection.subnet;
                connection.universe = spotConfig.connection.universe ?? connection.universe;
                if(spotConfig.connection.ip)
                    connection.ip = spotConfig.connection.ip;
            }
        }
    }
    catch(e) {
        console.log("ArtNet connection config fallback: " + e);
    }

    return connection;
}

function createSharedArtNetSender() {
    let connection = getArtNetConnectionFromConfig();

    return dmxArtNet.newSender({
        ip: connection.ip,
        subnet: connection.subnet,
        universe: connection.universe,
        net: connection.net,
    });
}

function createSpotFromConfigFile(filename) {
    const fs = require("fs");
    try {
        let jsonStr = fs.readFileSync("" +getConfigPath() + "/spots/" + filename + ".json");
        let spotConfig = JSON.parse(jsonStr.toString());
        spotConfig.sourceFileName = filename;

        let spotNumber = getSpotNumberFromFilename(filename);
        if(spotNumber === undefined)
            spotNumber = getSortedSpotIndices().length + 1;

        let spotIndex = spotIndexFromNumber(spotNumber);
        if(spots[spotIndex] !== undefined) {
            console.log("createSpotFromConfigFile: spot " + spotNumber + " already exists, skipping " + filename);
            return;
        }

        // spot1.json → spotNumber 1, spots[0]
        spots[spotIndex] = new FollowJSSpot(spotNumber, spotConfig, artNetSenderA);
    }
    catch(e) {
        console.log("createSpotFromConfigFile Error: "+e);
    }
}

function storeSpotToConfigFile(spotNo, updateHome = true) {
    const fs = require("fs");
    try {
        let spot = getSpot(spotNo);
        if(spot === undefined)
            throw new Error("spot " + spotNo + " not found");

        if(updateHome)
            spot.setCurrentStateAsHomeConfig();

        let filename = spot.config.sourceFileName;
        if(filename === undefined || filename === null)
            throw new Error("spot " + spotNo + " has no sourceFileName");

        let configForDisk = {...spot.config};
        delete configForDisk.sourceFileName;

        fs.writeFileSync(""+getConfigPath()+"/spots/"+filename+".json", JSON.stringify(configForDisk, null, 2));
        conditionalLog("stored config for spot " + spotNo + " to " + filename + ".json");
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

function parseCalibrationCoefficient(line) {
    let lineMatches = [...line.matchAll(/([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g)];
    if(lineMatches.length < 2)
        return null;

    let valueA = Number.parseFloat(lineMatches[0][0]);
    let valueB = Number.parseFloat(lineMatches[1][0]);
    if(Number.isNaN(valueA) || Number.isNaN(valueB))
        return null;

    return [valueA, valueB];
}

function importCalibration(spotNo, calibString) {
    let calibArrayA = [];
    let calibArrayB = [];

    let calibStrLines = calibString.split(/\r?\n/);

    calibStrLines.forEach((line) => {
        let coefficients = parseCalibrationCoefficient(line);
        if(coefficients !== null) {
            calibArrayA.push(coefficients[0]);
            calibArrayB.push(coefficients[1]);
        }
    });
    if(calibArrayA.length === 6 && calibArrayB.length === 6) {
        let spot = getSpot(spotNo);
        spot.config.translation.regression.a = calibArrayA;
        spot.config.translation.regression.b = calibArrayB;
        storeSpotToConfigFile(spotNo, false);
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
    getSpot(spotNo).initCalibration();
}
function storeCalibrationPoint() {
    if(global.calibrationSpotNo === undefined)
        return;
    getSpot(global.calibrationSpotNo).storeCalibrationPoint();
}
function skipCalibrationPoint() {
    if(global.calibrationSpotNo === undefined)
        return;
    getSpot(global.calibrationSpotNo).skipCalibrationPoint();
}
function endCalibration() {
    if(global.calibrationSpotNo === undefined)
        return;
    getSpot(global.calibrationSpotNo).endCalibration();
}

global.storeCalibrationPoint = storeCalibrationPoint;
global.skipCalibrationPoint = skipCalibrationPoint;
global.endCalibration = endCalibration;
global.storeSpotToConfigFile = storeSpotToConfigFile;
global.initCalibration = initCalibration;
global.startImportCalibration = startImportCalibration;


function prepareDMXTable() {
    let titleDone = false;
    forEachSpot(function(spot) {
        let spotNo = spot.spotNumber;
        if(!titleDone) {
            document.getElementById("dmxTableHeader").insertAdjacentHTML("beforeend", "<tr></tr>");
            let headerRow = document.getElementById("dmxTableHeader").firstElementChild;
            headerRow.insertAdjacentHTML("beforeend", "<td>Sp</td><td>Rev</td><td class=\"dmxTableArtnetStart\">Net</td><td>Sub</td><td>Uni</td><td class=\"dmxTableArtnetEnd\">Adr</td>");
            for(const chan of Object.values(spot.fixture.dmx.channels)) {
                headerRow.insertAdjacentHTML("beforeend", "<td>"+chan.short+"</td>");
            }
            titleDone = true;
        }

        document.getElementById("dmxTableBody").insertAdjacentHTML("beforeend", "<tr></tr>");
        let bodyRow = document.getElementById("dmxTableBody").lastElementChild;
        let conn = spot.config.connection;
        bodyRow.insertAdjacentHTML("beforeend",
            "<td>"+spotNo+"</td>" +
            "<td><input type=\"checkbox\" id=\"reverseDrag["+spotNo+"]\"></td>" +
            "<td class=\"dmxTableArtnetStart\">"+(conn.net ?? 0)+"</td>" +
            "<td>"+(conn.subnet ?? 0)+"</td>" +
            "<td>"+(conn.universe ?? 0)+"</td>" +
            "<td class=\"dmxTableArtnetEnd\">"+conn.address+"</td>"
        );
        for(const chanNo of Object.keys(spot.fixture.dmx.channels)) {
            bodyRow.insertAdjacentHTML("beforeend", '<td id="dmx['+spotNo+']['+chanNo+']">x</td>');
        }

        document.getElementById("reverseDrag["+spotNo+"]").addEventListener("change", (event) => {
            mainView.setReverseDragEnabled(spotNo, event.target.checked);
        });
    });
}

function printDMX() {
    forEachSpot(function(spot) {
        let spotNo = spot.spotNumber;
        for(const chan of Object.keys(spot.dmxBuffer)) {
            document.getElementById("dmx["+spotNo+"]["+chan+"]").textContent = spot.dmxBuffer[chan];
        }
    });
}

function printAllSpotStatus() {
    forEachSpot(function(spotRef) {
        let spotNumber = spotRef.spotNumber;
        document.getElementById("gauge["+spotNumber+"][dim]").style.width = ""+(spotRef.state.dim * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][color]").style.width = ""+((spotRef.state.colorWheelIndex / (spotRef.fixture.dmx.colorWheelArray.length - 1)) * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][color]").style.backgroundColor = ""+spotRef.fixture.dmx.colorWheelArray[spotRef.state.colorWheelIndex].visual;
        document.getElementById("gauge["+spotNumber+"][focus]").style.width = ""+(spotRef.state.focus * 100).toString() + "%";
        document.getElementById("gauge["+spotNumber+"][frost]").style.width = ""+(spotRef.state.frost * 100).toString() + "%";
    });
}


function drawAnimationFrameCallback() {
    mainView.drawSpots();
    mainView.paintMenus();
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
    forEachSpot(function(spot) {
       stopBlinkSpotMarker(spot.spotNumber);
    });
}


function enableCaptureKeyboard() {
    global.keyboard.enable();
}
function disableCaptureKeyboard() {
    global.keyboard.disable();
}

function lockContextMenu(spotNo) {
    getSpot(spotNo).contextMenuState.locked = true;
}

function unlockContextMenu(spotNo) {
    getSpot(spotNo).contextMenuState.locked = false;
}

function executeMacro(spotNo, macroNo) {
    let spot = getSpot(spotNo);
    let macro = spot.fixture.dmx.macros[macroNo];

    // document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.remove("hiddenVis");
    console.log("execute Macro: " + macro.name);
    blinkSpotMarker(spotNo, 1);
    let oldValue = spot.dmxBuffer[macro.channel];
    spot.dmxBuffer[macro.channel] = macro.value;
    window.setTimeout(setChannelToValue, (Number.parseInt(macro.hold)*1000), spotNo, macro.channel, oldValue, macroNo);
    mainView.hideContextMenu(spotNo);
    lockContextMenu(spotNo);
    window.setTimeout(unlockContextMenu, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    window.setTimeout(stopBlinkSpotMarker, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    spot.sendDMX(true);
    window.setTimeout(()=>{spot.sendDMX(true);}, 500);
}

global.executeMacro = executeMacro;

function setChannelToValue(spotNo,chan,val,macroNo) {
    let spot = getSpot(spotNo);
    spot.dmxBuffer[chan] = val;
    document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.add("hiddenVis");
    spot.sendDMX(true);
}

function enableGamepadConnectionEventListeners() {
    window.addEventListener("gamepadconnected", gamepadConnectCallback);
    window.addEventListener("gamepaddisconnected", gamepadDisconnectCallback);
}
// function disableGamepadConnectionEventListeners() {
//     window.removeEventListener("gamepadconnected",gamepadConnectCallback);
//     window.removeEventListener("gamepaddisconnected",gamepadDisconnectCallback);
// }

function isSpotIndexAssigned(spotIndex) {
    return connectedGamepads.some((gamepad) => gamepad && gamepad.assignedSpot.spotIndex === spotIndex);
}

function findFirstUnassignedSpotByIndex() {
    for(const spotIndex of getSortedSpotIndices()) {
        if(!isSpotIndexAssigned(spotIndex))
            return spots[spotIndex];
    }
    return undefined;
}

function gamepadHasUserInput(gamepad) {
    if(gamepad.buttons.some((button) => button.pressed))
        return true;
    return gamepad.axes.some((axis) => Math.abs(axis) > 0.1);
}

function tryAssignUnboundGamepads() {
    let gamepads = navigator.getGamepads();
    let candidates = [];

    for(let padIndex = 0; padIndex < gamepads.length; padIndex++) {
        if(gamepads[padIndex] === null || gamepads[padIndex].connected !== true)
            continue;
        if(connectedGamepads[padIndex] !== undefined)
            continue;
        if(gamepadConnectTime[padIndex] === undefined)
            gamepadConnectTime[padIndex] = Date.now();
        if(!gamepadHasUserInput(gamepads[padIndex]))
            continue;

        candidates.push({
            padIndex: padIndex,
            gamepad: gamepads[padIndex],
            connectTime: gamepadConnectTime[padIndex] ?? Number.MAX_SAFE_INTEGER
        });
    }

    candidates.sort((a, b) => {
        if(a.connectTime !== b.connectTime)
            return a.connectTime - b.connectTime;
        return a.padIndex - b.padIndex;
    });

    for(const candidate of candidates) {
        let spot = findFirstUnassignedSpotByIndex();
        if(spot === undefined)
            break;

        connectedGamepads[candidate.padIndex] = new FollowJSGamepad(candidate.gamepad, spot);
        connectedGamepads[candidate.padIndex].rumble("welcome");
        conditionalLog("gamepad " + candidate.padIndex + " assigned to spot " + spot.spotNumber + " (index " + spot.spotIndex + ")");

        if(!(systemConf.keyboardControl.config.alwaysEnabled))
            disableCaptureKeyboard();

        if(hasConnectedGamepad())
            document.querySelector("#controllerConnectOverlay").classList.add("hidden");
    }

    if(candidates.length > 0)
        printConnectedGamepadCount();
}

function getConnectedGamepadCount() {
    return connectedGamepads.filter((gamepad) => gamepad !== undefined).length;
}

function printConnectedGamepadCount() {
    let assignments = getSortedSpotIndices()
        .filter((spotIndex) => isSpotIndexAssigned(spotIndex))
        .map((spotIndex) => "Sp" + spots[spotIndex].spotNumber)
        .join(",");
    let label = "GP: " + getConnectedGamepadCount();
    if(assignments.length > 0)
        label += " [" + assignments + "]";
    document.getElementById("gamepadDebugInfo").innerText = label;
}

function hasConnectedGamepad() {
    return connectedGamepads.some((gamepad) => gamepad !== undefined);
}

function gamepadConnectCallback(event) {
    if(!event.gamepad || event.gamepad.connected !== true)
        return;

    conditionalLog("gamepad " + event.gamepad.index + " (" + event.gamepad.id + ") connected");

    if(gamepadConnectTime[event.gamepad.index] === undefined)
        gamepadConnectTime[event.gamepad.index] = Date.now();

    enableGamepadCyclicReader();
}

function gamepadDisconnectCallback(event) {
    delete connectedGamepads[event.gamepad.index];
    delete gamepadConnectTime[event.gamepad.index];

    if(!hasConnectedGamepad())
        document.querySelector("#controllerConnectOverlay").classList.remove("hidden");

    printConnectedGamepadCount();
}

function enableGamepadCyclicReader() {
    if(gamepadIntervalHandle === null)
        gamepadIntervalHandle = window.setInterval(gamepadCyclicReader,10);
}

function gamepadCyclicReader() {
    tryAssignUnboundGamepads();

    let gamepads = navigator.getGamepads();
    if(gamepads.length > 0) {
        for(let padIndex=0;padIndex<gamepads.length;padIndex++) {
            if(gamepads[padIndex] === null)
                continue;   //no pad connected to this slot

            if(connectedGamepads[padIndex] === undefined)
                continue;   //no FollowJS spot bound to this gamepad slot

            if(gamepads[padIndex].connected !== true)
                console.log("active gamepad disconnected");

            connectedGamepads[padIndex].update(gamepads[padIndex]);
            connectedGamepads[padIndex].read();
        }
    }
    // window.requestAnimationFrame(gamepadCyclicReader);
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
    printConnectedGamepadCount();

    document.getElementById("cancelCalibrationButton").addEventListener("click", endCalibration);

    new ResizeObserver(() => mainView.updateWindowSize()).observe(document.getElementById("mainDrawArea"));
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