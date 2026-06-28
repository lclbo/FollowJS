"use strict";

/**
 * @file Renderer bootstrap and main loop (loaded from main.html).
 * Owns global spot array, Art-Net batch flush, rAF loop, gamepad assignment, config I/O.
 */

const dmxLib = require('./dependencies/js/libDmxArtNet');
const FollowJSGamepad = require('./dependencies/js/FollowJSGamepad');
const FollowJSSpot = require('./dependencies/js/FollowJSSpot');
const FollowJSMainView = require('./dependencies/js/FollowJSMainView');
const FollowJSKeyboard = require('./dependencies/js/FollowJSKeyboard');
const FollowJSVirtualMarker = require('./dependencies/js/FollowJSVirtualMarker');
const spotIndex = require('./dependencies/js/FollowJSSpotIndex');
const regressionView = require('./dependencies/js/FollowJSRegressionView');
const regressionPending = require('./dependencies/js/FollowJSRegressionPending');
const helpOverlay = require('./dependencies/js/FollowJSHelp');
// debug only — Art-Net universe matrix overlay (see FollowJSArtNetDebug.js, main.html)
// const artNetDebug = require('./dependencies/js/FollowJSArtNetDebug');

global.systemConf = loadConfigFromFile("systemConf");
global.fixtureLib = loadConfigFromFile("fixtureLib");
global.gamepadLib = loadConfigFromFile("gamepadLib");

if(systemConf === undefined || systemConf === null) throw new Error("System configuration could not be loaded!");
if(fixtureLib === undefined || fixtureLib === null) throw new Error("Fixture Library could not be loaded!");
if(gamepadLib === undefined || gamepadLib === null) throw new Error("Gamepad Library could not be loaded!");

global.mainView = new FollowJSMainView();
global.keyboard = new FollowJSKeyboard();
global.virtualMarker = new FollowJSVirtualMarker();
if(systemConf.virtualMarker !== undefined)
    global.virtualMarker.loadFromConfig(systemConf.virtualMarker);

let dmxArtNet, artNetSenderA;
let rawArtNetTransmit = null;
let artNetUniverseReady = false;
let artNetLastTransmittedFrame = null;
let artNetCommitSnapshot = null;

function markUiDirty() {
    uiDirty = true;
}

/** Coalesce DMX buffer writes; actual UDP send happens in {@link flushArtNetIfPending}. */
function scheduleArtNetFlush(retransmit = false) {
    artNetFlushPending = true;
    if(retransmit === true)
        artNetRetransmitPending = true;
    else
        artNetRetransmitPending = false;
}

function clampDmxByte(value) {
    if(!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(255, Math.floor(value)));
}

function applySpotDmxBufferToFrame(frame, address, dmxBuffer, fixtureChannels) {
    let base = address - 1;
    for(const chanKey of Object.keys(fixtureChannels)) {
        let channelOffset = Number(chanKey);
        if(!Number.isFinite(channelOffset))
            continue;
        let index = base + channelOffset - 1;
        if(index < 0 || index >= frame.length)
            continue;
        let value = dmxBuffer[channelOffset];
        if(value === undefined || value === null)
            continue;
        frame[index] = clampDmxByte(value);
    }
}

function artNetFramesEqual(left, right) {
    if(left === null || right === null || left.length !== right.length)
        return false;
    for(let i = 0; i < left.length; i++) {
        if(left[i] !== right[i])
            return false;
    }
    return true;
}

/** Map every spot's state into the shared 512-channel Art-Net sender buffer. */
function syncAllSpotsToArtNetSender() {
    if(artNetSenderA === undefined || artNetSenderA === null)
        return;
    let frame = new Array(512).fill(0);
    spotIndex.forEachSpot(function(spot) {
        spot.stateToDmxBuffer();
        applySpotDmxBufferToFrame(frame, spot.config.connection.address, spot.dmxBuffer, spot.fixture.dmx.channels);
    });
    artNetCommitSnapshot = Uint8Array.from(frame);
    for(let i = 0; i < frame.length; i++)
        artNetSenderA.values[i] = frame[i];
    artNetUniverseReady = true;
}

/** UDP send only after a full universe merge; skips identical frames unless retransmit is requested. */
function transmitArtNetFrame() {
    if(artNetCommitSnapshot === null)
        return;
    rawArtNetTransmit(artNetCommitSnapshot);
}

/** UDP send only after a full universe merge; skips identical frames unless retransmit is requested. */
function commitArtNetOutput(retransmit = false) {
    syncAllSpotsToArtNetSender();
    if(!artNetUniverseReady || rawArtNetTransmit === null)
        return;

    let changed = !artNetFramesEqual(artNetCommitSnapshot, artNetLastTransmittedFrame);
    if(!changed && !retransmit)
        return;

    transmitArtNetFrame();
    artNetLastTransmittedFrame = Uint8Array.from(artNetCommitSnapshot);
    if(retransmit)
        transmitArtNetFrame();
    markUiDirty();
}

/** Send pending Art-Net frame(s); optional double-transmit for discrete channel changes. */
function flushArtNetIfPending() {
    if(!artNetFlushPending && !artNetRetransmitPending)
        return;
    let retransmit = artNetRetransmitPending;
    artNetFlushPending = false;
    artNetRetransmitPending = false;
    commitArtNetOutput(retransmit);
}

/** Transmit the current shared universe buffer twice (macros / discrete channel jumps). */
function transmitArtNetDouble() {
    commitArtNetOutput(true);
    artNetFlushPending = false;
    artNetRetransmitPending = false;
}

/** Queue macro / manual buffer change and double-transmit on next flush path. */
function sendSpotDmxBuffer(spot) {
    scheduleArtNetFlush(true);
    flushArtNetIfPending();
    markUiDirty();
}

global.markUiDirty = markUiDirty;
global.scheduleArtNetFlush = scheduleArtNetFlush;
global.flushArtNetIfPending = flushArtNetIfPending;
global.transmitArtNetDouble = transmitArtNetDouble;

global.calibrationActive = false;
global.calibrationSpotNo = undefined;
global.calibrationValues = new Array(9*9);
global.calibrationStep = 1;
global.regressionSelectionSession = null;
global.pendingRegressionApplied = null;
global.regressionSelectionUiState = null;
global.regressionSelectionFailed = false;
global.globalTimestamp = new Date();

let x_img_max, y_img_max, r_img_min, r_img_max;

let connectedGamepads = new Array(4);
/** Session-only: `"virtualMarker"` (default) or `"direct"`. */
const CONTROL_MODE_VIRTUAL_MARKER = "virtualMarker";
const CONTROL_MODE_DIRECT = "direct";
let controlMode = CONTROL_MODE_VIRTUAL_MARKER;
let uiDirty = true;
let artNetFlushPending = false;
let artNetRetransmitPending = false;
let artNetKeepaliveFrames = 0;
const ARTNET_KEEPALIVE_FRAMES = 60;
// let spots = [];
global.spots = [];

Object.assign(global, spotIndex);

/** Load configs, create shared Art-Net sender, instantiate spots from config/spots/*.json. */
function init() {
    dmxArtNet = new dmxLib.DmxArtNet({
        oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
        sName: "Follow.JS", // 17 char long node description, default to "dmxnet"
        lName: "Followspot Control JS", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
        hosts: ["127.0.0.1"] // Interfaces to listen to, all by default
    });

    artNetSenderA = createSharedArtNetSender();

    createAllSpotsFromConfigFiles();
    ensureVirtualMarkerDefaultAssignment();
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

/** All spots follow the virtual marker (fixture routing). */
function ensureVirtualMarkerDefaultAssignment() {
    let spotNumbers = getSortedSpotNumbers();
    virtualMarker.assignedSpotNumbers.clear();
    for(const spotNo of spotNumbers)
        virtualMarker.assignedSpotNumbers.add(spotNo);

    if(spotNumbers.length === 0)
        return;

    virtualMarker.syncSharedStateFromReferenceSpot();
    virtualMarker.applyPositionToAssignedSpots();
    virtualMarker.applySharedStateToAssignedSpots();
    virtualMarker.updateMarkerVisibility();
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

    let sender = dmxArtNet.newSender({
        ip: connection.ip,
        subnet: connection.subnet,
        universe: connection.universe,
        net: connection.net,
    });
    rawArtNetTransmit = sender.transmit.bind(sender);
    sender.transmit = function() {
        throw new Error("Art-Net transmit must go through commitArtNetOutput() in follow.js");
    };
    // debug only — refresh Art-Net debug overlay on each UDP packet
    // sender.onBeforeSend = function(frame, sequence) {
    //     artNetDebug.onArtNetTransmit(frame, sequence);
    // };
    return sender;
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

function storeSpotHomeToConfigFile(spotNo) {
    if(!window.confirm("Save the current position and settings as the new home for Spot " + spotNo + "?\n\nThis overwrites the home values in the spot config file on disk."))
        return;

    const fs = require("fs");
    try {
        let spot = getSpot(spotNo);
        if(spot === undefined)
            throw new Error("spot " + spotNo + " not found");

        spot.setCurrentStateAsHomeConfig();

        let filename = spot.config.sourceFileName;
        if(filename === undefined || filename === null)
            throw new Error("spot " + spotNo + " has no sourceFileName");

        let filePath = "" + getConfigPath() + "/spots/" + filename + ".json";
        let configOnDisk = JSON.parse(fs.readFileSync(filePath).toString());
        configOnDisk.home = {...spot.config.home};
        fs.writeFileSync(filePath, JSON.stringify(configOnDisk, null, 2));
        conditionalLog("stored home for spot " + spotNo + " to " + filename + ".json");
        mainView.hideContextMenu(spotNo);
    }
    catch(e) {
        console.log("store home Error: "+e);
        return null;
    }
}

/**
 * Persist spot JSON to config/spots/spotN.json.
 * @param {number} spotNo 1-based.
 * @param {boolean} [updateHome=true] Include current state as `home` block.
 */
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
global.storeSpotHomeToConfigFile = storeSpotHomeToConfigFile;
global.initCalibration = initCalibration;
global.regressionView = regressionView;
global.showRegressionOverlay = regressionView.showRegressionOverlay;
global.closeRegressionOverlay = regressionView.closeRegressionOverlay;
global.toggleHelpOverlay = helpOverlay.toggleHelpOverlay;
global.closeHelpOverlay = helpOverlay.closeHelpOverlay;
// debug only — Art-Net universe matrix overlay
// global.closeArtNetDebugOverlay = artNetDebug.closeArtNetDebugOverlay;
// global.openArtNetDebugOverlay = artNetDebug.openArtNetDebugOverlay;
global.testRegressionDegree = regressionPending.testRegressionDegree;
global.skipRegressionSelection = regressionPending.skipRegressionSelection;
global.reviewRegressionCandidates = regressionPending.reviewRegressionCandidates;
global.acceptPendingRegression = regressionPending.acceptPendingRegression;
global.declinePendingRegression = regressionPending.declinePendingRegression;


function prepareDMXTable() {
    ensureVirtualMarkerDefaultAssignment();
    let titleDone = false;
    forEachSpot(function(spot) {
        let spotNo = spot.spotNumber;
        if(!titleDone) {
            document.getElementById("dmxTableHeader").insertAdjacentHTML("beforeend", "<tr></tr>");
            let headerRow = document.getElementById("dmxTableHeader").firstElementChild;
            headerRow.insertAdjacentHTML("beforeend", "<td>Sp</td><td>Menu</td><td class=\"dmxTableArtnetStart\">Net</td><td>Sub</td><td>Uni</td><td class=\"dmxTableArtnetEnd\">Adr</td>");
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
            "<td><button type=\"button\" class=\"footerSpotMenuButton\" id=\"footerSpotMenu["+spotNo+"]\" aria-label=\"Spot "+spotNo+" menu (footer)\" title=\"Spot "+spotNo+" menu\">&#8942;</button></td>" +
            "<td class=\"dmxTableArtnetStart\">"+(conn.net ?? 0)+"</td>" +
            "<td>"+(conn.subnet ?? 0)+"</td>" +
            "<td>"+(conn.universe ?? 0)+"</td>" +
            "<td class=\"dmxTableArtnetEnd\">"+conn.address+"</td>"
        );
        for(const chanNo of Object.keys(spot.fixture.dmx.channels)) {
            bodyRow.insertAdjacentHTML("beforeend", '<td id="dmx['+spotNo+']['+chanNo+']">x</td>');
            spot.dom.dmxCells[chanNo] = document.getElementById("dmx["+spotNo+"]["+chanNo+"]");
        }

        spot.dom.footerMenuButton = document.getElementById("footerSpotMenu["+spotNo+"]");
        spot.dom.footerMenuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            mainView.toggleContextMenuFromFooter(spotNo, event.currentTarget);
        });
    });

    virtualMarker.updateMarkerVisibility();
    flushArtNetIfPending();
}

function printDMX() {
    forEachSpot(function(spot) {
        for(const chan of Object.keys(spot.dmxBuffer)) {
            let value = spot.dmxBuffer[chan];
            if(spot.renderCache.dmx[chan] !== value) {
                spot.dom.dmxCells[chan].textContent = value;
                spot.renderCache.dmx[chan] = value;
            }
        }
    });
}

function printAllSpotStatus() {
    forEachSpot(function(spotRef) {
        let cache = spotRef.renderCache.gauges;
        let dimWidth = ""+(spotRef.state.dim * 100).toString() + "%";
        if(cache.dim !== dimWidth) {
            spotRef.dom.gauges.dim.style.width = dimWidth;
            cache.dim = dimWidth;
        }

        let colorWidth = ""+((spotRef.state.colorWheelIndex / (spotRef.fixture.dmx.colorWheelArray.length - 1)) * 100).toString() + "%";
        let colorBg = ""+spotRef.fixture.dmx.colorWheelArray[spotRef.state.colorWheelIndex].visual;
        if(cache.color !== colorWidth) {
            spotRef.dom.gauges.color.style.width = colorWidth;
            cache.color = colorWidth;
        }
        if(cache.colorBg !== colorBg) {
            spotRef.dom.gauges.color.style.backgroundColor = colorBg;
            cache.colorBg = colorBg;
        }

        let focusWidth = ""+(spotRef.state.focus * 100).toString() + "%";
        if(cache.focus !== focusWidth) {
            spotRef.dom.gauges.focus.style.width = focusWidth;
            cache.focus = focusWidth;
        }

        let frostWidth = ""+(spotRef.state.frost * 100).toString() + "%";
        if(cache.frost !== frostWidth) {
            spotRef.dom.gauges.frost.style.width = frostWidth;
            cache.frost = frostWidth;
        }
    });
}


/** rAF tick: poll gamepad slots, flush Art-Net, redraw UI if dirty. */
function mainLoopCallback() {
    pollGamepadSlots();
    flushArtNetIfPending();
    artNetKeepaliveFrames++;
    if(artNetKeepaliveFrames >= ARTNET_KEEPALIVE_FRAMES) {
        artNetKeepaliveFrames = 0;
        if(!artNetFlushPending && !artNetRetransmitPending)
            commitArtNetOutput(false);
    }
    if(uiDirty) {
        mainView.drawSpots();
        mainView.paintMenus();
        printDMX();
        printAllSpotStatus();
        uiDirty = false;
    }
    window.requestAnimationFrame(mainLoopCallback);
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

    console.log("execute Macro: " + macro.name);
    blinkSpotMarker(spotNo, 1);
    let oldValue = spot.dmxBuffer[macro.channel];
    spot.dmxBuffer[macro.channel] = macro.value;
    spot.renderCache.dmx[macro.channel] = undefined;
    sendSpotDmxBuffer(spot);
    window.setTimeout(setChannelToValue, (Number.parseInt(macro.hold) * 1000), spotNo, macro.channel, oldValue, macroNo);
    mainView.hideContextMenu(spotNo);
    lockContextMenu(spotNo);
    window.setTimeout(unlockContextMenu, (Number.parseInt(macro.hold) * 1000) + 500, spotNo);
    window.setTimeout(stopBlinkSpotMarker, (Number.parseInt(macro.hold) * 1000) + 500, spotNo);
}

global.executeMacro = executeMacro;
global.printConnectedGamepadCount = printConnectedGamepadCount;
global.getControlMode = getControlMode;
global.setControlMode = setControlMode;
global.applyAllGamepadTargets = applyAllGamepadTargets;

function setChannelToValue(spotNo, chan, val, macroNo) {
    let spot = getSpot(spotNo);
    spot.dmxBuffer[chan] = val;
    spot.renderCache.dmx[chan] = undefined;
    sendSpotDmxBuffer(spot);
    let macroButton = document.getElementById("macroButton["+spotNo+"]["+macroNo+"]");
    if(macroButton !== null && macroButton.firstElementChild !== null)
        macroButton.firstElementChild.classList.add("hiddenVis");
}

function enableGamepadConnectionEventListeners() {
    window.addEventListener("gamepadconnected", gamepadConnectCallback);
    window.addEventListener("gamepaddisconnected", gamepadDisconnectCallback);
}
// function disableGamepadConnectionEventListeners() {
//     window.removeEventListener("gamepadconnected",gamepadConnectCallback);
//     window.removeEventListener("gamepaddisconnected",gamepadDisconnectCallback);
// }

function shortenGamepadLabel(gamepadId) {
    if(gamepadId === undefined || gamepadId === null || gamepadId === "")
        return "—";
    let label = gamepadId;
    const parenIndex = label.indexOf("(");
    if(parenIndex > 0)
        label = label.substring(0, parenIndex).trim();
    if(label.length > 28)
        label = label.substring(0, 25) + "…";
    return label;
}

/** Human-readable controller family from browser Gamepad API id / mapping. */
function getGamepadTypeLabel(gamepad) {
    if(gamepad === undefined || gamepad === null)
        return "—";
    let id = (gamepad.id || "").toLowerCase();
    if(id.includes("xbox") || id.includes("xinput"))
        return "Xbox";
    if(id.includes("dualsense") || id.includes("ps5"))
        return "PlayStation 5";
    if(id.includes("dualshock") || id.includes("ps4") || id.includes("wireless controller"))
        return "PlayStation";
    if(id.includes("switch") || id.includes("pro controller"))
        return "Switch";
    if(id.includes("stadia"))
        return "Stadia";
    if(gamepad.mapping === "standard")
        return "Standard gamepad";
    if(gamepad.mapping)
        return gamepad.mapping;
    return "Unknown";
}

function refreshConnectedGamepadsTable() {
    let tbody = document.getElementById("gamepadListBody");
    if(tbody === null)
        return;

    let physicalPads = getConnectedPhysicalGamepads();
    tbody.replaceChildren();

    if(physicalPads.length === 0) {
        let row = document.createElement("tr");
        let cell = document.createElement("td");
        cell.colSpan = 3;
        cell.className = "gamepadListStatus";
        cell.textContent = "No controllers connected";
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
    }

    physicalPads.forEach(function(entry) {
        let row = document.createElement("tr");

        let padCell = document.createElement("td");
        padCell.textContent = entry.padIndex.toString();
        row.appendChild(padCell);

        let idCell = document.createElement("td");
        idCell.textContent = shortenGamepadLabel(entry.gamepad.id);
        idCell.title = entry.gamepad.id || "";
        row.appendChild(idCell);

        let typeCell = document.createElement("td");
        typeCell.textContent = getGamepadTypeLabel(entry.gamepad);
        row.appendChild(typeCell);

        tbody.appendChild(row);
    });
}

function getControlMode() {
    return controlMode;
}

function setControlMode(mode) {
    if(mode !== CONTROL_MODE_VIRTUAL_MARKER && mode !== CONTROL_MODE_DIRECT)
        return;
    if(controlMode === mode)
        return;
    controlMode = mode;
    applyControlMode();
    global.keyboard.clearKeyboardAssignment();
    applyAllGamepadTargets();
    refreshControlModeUI();
    printConnectedGamepadCount();
    markUiDirty();
}

function applyControlMode() {
    if(controlMode === CONTROL_MODE_VIRTUAL_MARKER)
        ensureVirtualMarkerDefaultAssignment();
    else {
        virtualMarker.assignedSpotNumbers.clear();
        virtualMarker.updateMarkerVisibility();
    }
}

function getFirstConnectedPadIndex() {
    let physicalPads = getConnectedPhysicalGamepads();
    if(physicalPads.length === 0)
        return undefined;
    return physicalPads[0].padIndex;
}

/**
 * Resolve gamepad control target from mode, pad index, and calibration override.
 * @param {number} padIndex Browser gamepad index.
 * @returns {import('./FollowJSSpot')|import('./FollowJSVirtualMarker')|null}
 */
function resolveGamepadControlTarget(padIndex) {
    if(global.calibrationActive && global.calibrationSpotNo !== undefined && spotExists(global.calibrationSpotNo)) {
        let firstPadIndex = getFirstConnectedPadIndex();
        if(padIndex === firstPadIndex)
            return getSpot(global.calibrationSpotNo);
    }

    if(controlMode === CONTROL_MODE_VIRTUAL_MARKER) {
        let firstPadIndex = getFirstConnectedPadIndex();
        if(padIndex === firstPadIndex && virtualMarker.isEnabled())
            return virtualMarker;
        return null;
    }

    let spotNumbers = getSortedSpotNumbers();
    let spotNo = spotNumbers[padIndex];
    if(spotNo !== undefined && spotExists(spotNo))
        return getSpot(spotNo);
    return null;
}

function applyAllGamepadTargets() {
    for(let padIndex = 0; padIndex < connectedGamepads.length; padIndex++) {
        let wrapper = connectedGamepads[padIndex];
        if(wrapper === undefined)
            continue;
        wrapper.setControlTarget(resolveGamepadControlTarget(padIndex));
    }
}

function getConnectedPhysicalGamepads() {
    let gamepads = navigator.getGamepads();
    let entries = [];
    for(let padIndex = 0; padIndex < gamepads.length; padIndex++) {
        if(gamepads[padIndex] === null || gamepads[padIndex].connected !== true)
            continue;
        entries.push({ padIndex: padIndex, gamepad: gamepads[padIndex] });
    }
    return entries;
}

function refreshControlModeUI() {
    let vmButton = document.getElementById("controlModeVirtualMarker");
    let directButton = document.getElementById("controlModeDirect");
    if(vmButton === null || directButton === null)
        return;
    let isVm = controlMode === CONTROL_MODE_VIRTUAL_MARKER;
    vmButton.classList.toggle("is-active", isVm);
    vmButton.setAttribute("aria-pressed", isVm ? "true" : "false");
    directButton.classList.toggle("is-active", !isVm);
    directButton.setAttribute("aria-pressed", !isVm ? "true" : "false");
}

function initControlModeSwitch() {
    let vmButton = document.getElementById("controlModeVirtualMarker");
    let directButton = document.getElementById("controlModeDirect");
    if(vmButton === null || directButton === null)
        return;
    vmButton.addEventListener("click", () => setControlMode(CONTROL_MODE_VIRTUAL_MARKER));
    directButton.addEventListener("click", () => setControlMode(CONTROL_MODE_DIRECT));
    refreshControlModeUI();
}

function bindGamepadSlot(padIndex, gamepadObject) {
    let target = resolveGamepadControlTarget(padIndex);
    connectedGamepads[padIndex] = new FollowJSGamepad(gamepadObject, target);
    connectedGamepads[padIndex].rumble("welcome");
    applyAllGamepadTargets();
    conditionalLog("gamepad " + padIndex + " bound in " + controlMode + " mode");

    if(!(systemConf.keyboardControl.config.alwaysEnabled))
        disableCaptureKeyboard();
}

function unbindGamepadSlot(padIndex) {
    delete connectedGamepads[padIndex];
}

function getConnectedGamepadCount() {
    return connectedGamepads.filter((gamepad) => gamepad !== undefined).length;
}

function printConnectedGamepadCount() {
    let assignmentParts = [];

    getConnectedPhysicalGamepads().forEach(function(entry) {
        let padIndex = entry.padIndex;
        if(connectedGamepads[padIndex] === undefined)
            return;
        let target = resolveGamepadControlTarget(padIndex);
        if(target === undefined || target === null) {
            assignmentParts.push(padIndex + ":off");
            return;
        }
        let label = target.isVirtualMarker === true ? "VM" : "Sp" + target.spotNumber;
        if(global.calibrationActive && global.calibrationSpotNo === target.spotNumber)
            label += "·cal";
        assignmentParts.push(padIndex + ":" + label);
    });

    let modeLabel = controlMode === CONTROL_MODE_VIRTUAL_MARKER ? "VM" : "direct";
    let label = "GP: " + getConnectedGamepadCount();
    if(assignmentParts.length > 0)
        label += " [" + assignmentParts.join(", ") + "]";
    label += " · mode: " + modeLabel;
    label += " · KB: " + global.keyboard.getAssignmentLabel();

    document.getElementById("gamepadDebugInfo").innerText = label;
}

function hasConnectedGamepad() {
    return connectedGamepads.some((gamepad) => gamepad !== undefined);
}

function pollGamepadSlots() {
    let hadChange = false;
    let gamepads = navigator.getGamepads();

    for(let padIndex = 0; padIndex < gamepads.length; padIndex++) {
        let gp = gamepads[padIndex];
        if(gp !== null && gp.connected === true) {
            if(connectedGamepads[padIndex] === undefined) {
                bindGamepadSlot(padIndex, gp);
                hadChange = true;
            }
            else {
                connectedGamepads[padIndex].update(gp);
                connectedGamepads[padIndex].read();
            }
        }
        else if(connectedGamepads[padIndex] !== undefined) {
            unbindGamepadSlot(padIndex);
            hadChange = true;
        }
    }

    if(hadChange) {
        applyAllGamepadTargets();
        printConnectedGamepadCount();
        refreshConnectedGamepadsTable();
        if(hasConnectedGamepad())
            hideControllerConnectOverlay();
        else
            showControllerConnectOverlay();
    }
}

function hideControllerConnectOverlay() {
    let overlay = document.querySelector("#controllerConnectOverlay");
    if(overlay !== null)
        overlay.classList.add("hidden");
}

function showControllerConnectOverlay() {
    let overlay = document.querySelector("#controllerConnectOverlay");
    if(overlay !== null)
        overlay.classList.remove("hidden");
}

global.hideControllerConnectOverlay = hideControllerConnectOverlay;

function gamepadConnectCallback(event) {
    if(!event.gamepad || event.gamepad.connected !== true)
        return;

    conditionalLog("gamepad " + event.gamepad.index + " (" + event.gamepad.id + ") connected");
    pollGamepadSlots();
}

function gamepadDisconnectCallback(event) {
    conditionalLog("gamepad " + event.gamepad.index + " disconnected");
    unbindGamepadSlot(event.gamepad.index);

    if(!hasConnectedGamepad())
        showControllerConnectOverlay();

    printConnectedGamepadCount();
    refreshConnectedGamepadsTable();
    applyAllGamepadTargets();
}

function enableGamepadCyclicReader() {
    // Main loop handles gamepad reads via requestAnimationFrame.
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

    new ResizeObserver(() => {
        mainView.updateWindowSize();
        markUiDirty();
    }).observe(document.getElementById("mainDrawArea"));
    mainView.updateWindowSize();
    mainView.initializeImage();

    if(systemConf.keyboardControl.config.alwaysEnabled || systemConf.keyboardControl.config.useAsFallback) {
        enableCaptureKeyboard();
    }

    enableGamepadConnectionEventListeners();
    helpOverlay.initHelpOverlay();
    // debug only — Art-Net universe matrix overlay
    // artNetDebug.initArtNetDebugOverlay();

    // addSpotsToDOM();
    mainView.addSpotsToDOM();
    prepareDMXTable();
    initControlModeSwitch();
    refreshConnectedGamepadsTable();
    markUiDirty();
    window.requestAnimationFrame(mainLoopCallback);
});