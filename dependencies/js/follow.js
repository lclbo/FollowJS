const dmxLib = require('./dependencies/js/libDmxArtNet');

const dmxArtNet = new dmxLib.DmxArtNet({
    oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
    sName: "Follow.JS", // 17 char long node description, default to "dmxnet"
    lName: "Followspot Control JS", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
    hosts: ["127.0.0.1"] // Interfaces to listen to, all by default
});

global.systemConf = loadConfigFromFile("systemConf");
global.fixtureLib = loadConfigFromFile("fixtureLib");
global.gamepadLib = loadConfigFromFile("gamepadLib");

const FollowJSGamepad = require('./dependencies/js/FollowJSGamepad.js');
const FollowJSSpot = require('./dependencies/js/FollowJSSpot');
const fs = require("fs");

if(global.systemConf === undefined || global.systemConf === null) throw new Error("System configuration could not be loaded!");
if(global.fixtureLib === undefined || global.fixtureLib === null) throw new Error("Fixture Library could not be loaded!");
if(global.gamepadLib === undefined || global.gamepadLib === null) throw new Error("Gamepad Library could not be loaded!");

let artNetSenderA = dmxArtNet.newSender({
    ip: '10.0.20.255',
    subnet: 15,
    universe: 15,
    net: 0,
});

let gamepadIntervalHandle = null;
let globalTimestamp = new Date();

let calibrationActive = false;
let calibrationSpotNo = undefined;
let calibrationValues = new Array(9*9);
let calibrationStep = 1;

let x_img_max, y_img_max, r_img_min, r_img_max;

let connectedGamepads = new Array(4);
let spots = [];

createAllSpotsFromConfigFiles();



function createAllSpotsFromConfigFiles() {
    let numberOfSpotsCreated = 0;
    const fs = require("fs");
    try {
        let execPath = process.execPath.toLowerCase();
        let pathStr = "";
        if(execPath.includes("electron")) {
            pathStr = "config/spots";
        }
        else {
            pathStr = "" + process.resourcesPath + "/config/spots";
        }

       fs.readdir(pathStr, (err,files) => {
           if(!err) {
               files.forEach((file)=> {
                   if(file.endsWith(".json")) {
                       let shortFilename = file.substring(0, file.lastIndexOf(".json"));
                       // console.log(shortFilename);
                       createSpotFromConfigFile(shortFilename, artNetSenderA);
                       numberOfSpotsCreated++;
                   }
               });
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
        let execPath = process.execPath.toLowerCase();
        let pathStr = "";
        if(execPath.includes("electron")) {
            pathStr = "config/spots/"+filename+".json";
        }
        else {
            pathStr = "" + process.resourcesPath + "/config/spots/" + filename + ".json";
        }

        let jsonStr = fs.readFileSync(pathStr);
        let spotConfig = JSON.parse(jsonStr.toString());
        let nextFreeSpotNo = Object.keys(spots).length + 1;

        spots[nextFreeSpotNo] = new FollowJSSpot(nextFreeSpotNo, spotConfig, artNetSender);
    }
    catch(e) {
        console.log("createSpotFromConfigFile Error: "+e);
    }
}

function loadConfigFromFile(filename) {
    const fs = require("fs");
    try {
        let execPath = process.execPath.toLowerCase();
        let pathStr = "";
        if(execPath.includes("electron")) {
            pathStr = "config";
        }
        else {
            pathStr = "" + process.resourcesPath + "/config";
        }

        let configStr = fs.readFileSync(""+pathStr+"/"+filename+".json");

        return JSON.parse(configStr.toString());
    }
    catch(e) {
        console.log("load Config Error: "+e);
        return null;
    }
}

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
    // blinkSpotMarker(spotNo, 2);
    setSpotStatusOpacity(spotNo, 0.3);
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
    highlightImageCoord(false);
    showAllSpotMarker();
    showAllSpotStatus();
    setSpotStatusOpacity(calibrationSpotNo, 1);
    document.getElementById('cancelCalibrationButton').classList.add("hidden");
    hideGridOverlay();
    calibrationActive = false;
}

function exportCalibration() {
    let plainText = "";
    calibrationValues.forEach(function(elem, eIdx) {
        plainText = plainText + "["+elem[0]+" "+elem[1]+"];";
        if((eIdx+1) % 8 === 0)
            plainText = plainText + "\n";
    });

    let plainBlob = new Blob([plainText], {type: 'application/octet-stream;charset=utf-8'});
    let plainLink = window.URL.createObjectURL(plainBlob);
    let a = document.createElement("a");
    a.download = 'calibration-'+globalTimestamp.getFullYear()+'-'+(globalTimestamp.getMonth()+1)+'-'+globalTimestamp.getDate()+'-spot'+calibrationSpotNo+'.csv';
    a.href = plainLink;
    a.innerHTML = "<button class='button-green'>Download Calibration</button>";
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

async function prepareDMXTable() {
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

    return Promise.resolve();
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
    drawSpots();
    printDMX();
    printAllSpotStatus();
    window.requestAnimationFrame(drawAnimationFrameCallback);
}

async function addSpotsToDOM() {
    spots.forEach(function(spot, spotNo) {
        document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
            '<svg class="spotMarker" id="spotMarker['+spotNo+']" width="50" height="50">\n' +
            '   <circle cx="50%" cy="50%" r="50" fill="'+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+'" stroke="'+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+'" stroke-width=".2rem" stroke-opacity="1" fill-opacity=".4" onclick="toggleContextMenu('+spotNo+');" />\n' +
            '</svg>'
        );

        document.getElementById("mainDrawArea").insertAdjacentHTML('beforeend',
            '<div class="spotContextMenu" id="spotContextMenu['+spotNo+']"></div>'
        );

        document.getElementById("spotStatusOverlayArea").insertAdjacentHTML('beforeend',
            '<div id="spotStatusOverlay['+spotNo+']" class="spotStatusOverlayGroup" style="border-color: '+global.systemConf.spotMarkerColors[((spotNo-1) % (global.systemConf.spotMarkerColors.length))]+';">\n' +
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

    return Promise.resolve();
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

function drawSpots() {
    spots.forEach(function(spot, spotNo) {
        let x = spot.state.x;
        let y = spot.state.y;
        let x2 = Math.pow(spot.state.x,2);
        let y2 = Math.pow(spot.state.y,2);

        let pos_x = spot.config.translation.regression.a[0] + (spot.config.translation.regression.a[1] * x) + (spot.config.translation.regression.a[2] * y) + (spot.config.translation.regression.a[3] * x * y) + (spot.config.translation.regression.a[4] * x2) + (spot.config.translation.regression.a[5] * y2);
        let pos_y = spot.config.translation.regression.b[0] + (spot.config.translation.regression.b[1] * x) + (spot.config.translation.regression.b[2] * y) + (spot.config.translation.regression.b[3] * x * y) + (spot.config.translation.regression.b[4] * x2) + (spot.config.translation.regression.b[5] * y2);

        let pos_r = spot.state.r;
        let radius = ((pos_r*(r_img_max-r_img_min)+r_img_min).toString());

        let opacity = (spot.state.shutterOpen === true) ? "0.4" : "0";


        let spotMarkerElement = document.getElementById("spotMarker["+spotNo+"]");
        spotMarkerElement.style.top = ((1-pos_y) * y_img_max).toString()+"px";
        spotMarkerElement.style.left = (pos_x * x_img_max).toString()+"px";
        // spotMarkerElement.style.transform = "translate("+(pos_x*100)+"%,"+((1-pos_y)*100)+"%)";
        // spotMarkerElement.style.transform = "translate("+((pos_x * x_img_max)-25).toString()+"px"+","+(((1-pos_y) * y_img_max)-25).toString()+"px"+")"; // scale("+(pos_r).toString()+")";

        if(radius !== spotMarkerElement.firstElementChild.getAttribute("r"))
            spotMarkerElement.firstElementChild.setAttribute("r", radius);
        if(opacity !== spotMarkerElement.firstElementChild.getAttribute("fill-opacity"))
            spotMarkerElement.firstElementChild.setAttribute("fill-opacity", opacity);

        if(spot.contextMenuState.visible === true)
            updateContextMenu(spotNo);
    });
}

function updateWindowSize() {
    x_img_max = document.getElementById("mainDrawArea").clientWidth;
    y_img_max = document.getElementById("mainDrawArea").clientHeight;
    // element.offset<Height|Width> includes borders, element.client<Height|Width> does not

    r_img_min = 10 * (document.getElementById("mainDrawArea").clientWidth / 800);
    r_img_max = 30 * (document.getElementById("mainDrawArea").clientWidth / 800);
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
    spots.forEach(function(spot) {
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
            '<div class="'+selectClass+'" id="macroButton['+spotNo+']['+key+']" onclick="executeMacro('+spotNo+','+key+')">' +
            // '<span class="spinner-grow spinner-grow-sm hiddenVis" role="status"></span>&nbsp;' +
            macro.short+'' +
            '</div>');
    });

    spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="calib['+spotNo+']" onclick="initCalibration('+spotNo+')">Calibrate</div>');
    spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div>Spot #'+spotNo+'</div>');
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
        if(!spots[spotNo].contextMenuState.locked) {
            spots[spotNo].contextMenuState.visible = true;
            spots[spotNo].contextMenuState.selectedIndex = 0;
            drawContextMenu(spotNo);
            updateContextMenu(spotNo);
        }
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
    // window.setTimeout(hideContextMenu, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    hideContextMenu(spotNo);
    lockContextMenu(spotNo);
    window.setTimeout(unlockContextMenu, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    window.setTimeout(stopBlinkSpotMarker, (Number.parseInt(macro.hold)*1000) + 500, spotNo);
    spots[spotNo].sendDMX();
    window.setTimeout(()=>{spots[spotNo].sendDMX();}, 500);
}

function setChannelToValue(spotNo,chan,val,macroNo) {
    spots[spotNo].dmxBuffer[chan] = val;
    document.getElementById("macroButton["+spotNo+"]["+macroNo+"]").firstElementChild.classList.add("hiddenVis");
    spots[spotNo].sendDMX();
}

function initializeImage() {
    let mainDrawArea = document.getElementById("mainDrawArea");
    let mainImage = document.getElementById("mainWebcamImage");

    switch(systemConf.image.imageType.toLowerCase()) {
        case "key":
            mainImage.style.display = "none";
            mainDrawArea.style.backgroundColor = systemConf.image.keyColor;
            break;
        case "mjpeg":
            mainImage.setAttribute("data-src", systemConf.image.imageSource);
            window.requestAnimationFrame(() => {refreshMjpegImageResource(mainImage)});
            break;
        case "jpeg":
            mainImage.setAttribute("data-src", systemConf.image.imageSource);
            mainImage.setAttribute("data-default-prescale", systemConf.image.imageRateDivider);
            initializeStaticImageResource(mainImage);
            window.requestAnimationFrame(() => {refreshStaticImageResource(mainImage)});
            break;
        default:
            throw Error("unknown systemConf.image.type");
    }
}


/**
 * Initializes the data-fields needed for refresh handling
 * @param rsc element handle, e.g. from getElementByXYZ()
 */
function initializeStaticImageResource(rsc) {
    if(!('src' in rsc.dataset) || !('defaultPrescale' in rsc.dataset)) {
        console.log("cound not initialize, missing src or default-prescale!");
    }
    else {
        rsc.setAttribute('data-is-loading', "empty");
        rsc.setAttribute('data-refresh-retries', 0);
        rsc.setAttribute('data-pc', (rsc.dataset.defaultPrescale - 1));
        rsc.setAttribute('data-prescale', rsc.dataset.defaultPrescale);

        if(!('separator' in rsc.dataset))
            rsc.setAttribute('data-separator', ((rsc.dataset.src.includes('?')) ? '&' : '?'));

        rsc.onload = (event) => {event.target.dataset.isLoading = 'doneLoading';};
    }
}

/**
 * Refreshes the linked resource (mainly image).
 * For refresh, the src is set to the previous url but with a new ?_=<timestamp> parameter to avoid caching
 * @param rsc element handle, e.g. from getElementById().
 * The resource needs a src-attribute.
 */
function refreshStaticImageResource(rsc) {
    window.requestAnimationFrame(()=>{refreshStaticImageResource(rsc);});
    if(rsc.dataset.pc < rsc.dataset.prescale) {
        rsc.dataset.pc++;
        return;
    }
    // console.log("prescale elapsed");
    rsc.dataset.pc = 0;

    if(rsc.dataset.isLoading === "loading") {
        rsc.dataset.prescale++;
        // rsc.setAttribute('title', 'refresh every ' + rsc.dataset.prescale + ' loading cycles');
        // rsc.attr('title', '');
        rsc.dataset.refreshRetries++;
        if(rsc.dataset.refreshRetries > 50) { //if data did not load in time for 50 rounds, the source is probably bad
            //console.log('switch to slow retry');
            rsc.classList.add('slowLoading');
            rsc.dataset.prescale = (20 * rsc.dataset.defaultPrescale);
        }
        else {
            // console.log("still busy loading, skipping reloading");
            return;
        }
    }
    rsc.dataset.refreshRetries = 0;
    rsc.classList.remove('slowLoading');
    if(rsc.dataset.prescale >= (20 * rsc.dataset.defaultPrescale))
        rsc.dataset.prescale = rsc.dataset.defaultPrescale;

    // console.log("loading new image");

    let appendix = "" + rsc.dataset.separator + "_=" + (new Date().valueOf());
    rsc.setAttribute('src', "" + rsc.dataset.src + appendix);

    rsc.dataset.isLoading = "loading";
}

//based on https://github.com/aruntj/mjpeg-readable-stream
function refreshMjpegImageResource(rsc) {
    fetch(rsc.dataset.src)
        .then((resp) => {
            if (!resp.ok) {
                throw Error("fetch response !ok");
            }
            if(!resp.body) {
                throw Error("response body not supported");
            }

            const reader = resp.body.getReader();
            let headerString = '';
            let contentLength = -1;
            let bodyBytes = 0;
            let imageBuffer = null;

            const getLength = (headerString) => {
                let contentLength = -1;
                headerString.split('\n').forEach((headerLine) => {
                    if(headerLine.toLowerCase().includes("content-length")) {
                        contentLength = headerLine.substring(headerLine.lastIndexOf(":")+1).trim();
                    }
                });
                return contentLength;
            };

            const readMjpeg = () => {
                reader.read().then(({done, value}) => {
                    if (done) {
                        window.requestAnimationFrame(refreshMjpegImageResource);
                        return;
                    }
                    for (let byte = 0; byte < value.length; byte++) {
                        if ((value[byte] === 0xFF) && (byte+1 < value.length) && (value[byte + 1] === 0xD8)) {
                            contentLength = getLength(headerString);
                            imageBuffer = new Uint8Array(new ArrayBuffer(contentLength));
                        }
                        if (contentLength <= 0) {
                            headerString += String.fromCharCode(value[byte]);
                        } else if (bodyBytes < contentLength) {
                            imageBuffer[bodyBytes] = value[byte];
                            bodyBytes++;
                        } else {
                            let imageBlobUrl = URL.createObjectURL(new Blob([imageBuffer], {type: 'image/jpeg'}));
                            rsc.src = imageBlobUrl;

                            contentLength = 0;
                            bodyBytes = 0;
                            headerString = '';
                        }
                    }
                    window.requestAnimationFrame(readMjpeg);
                }).catch(error => {
                    console.log(error);
                })
            }
            window.requestAnimationFrame(readMjpeg);
        })
        .catch(() => {
            window.requestAnimationFrame(refreshMjpegImageResource);
            throw Error("Fetch error!");
        });

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
        //there is a followspot available to be bound to this gamepad
        connectedGamepads[event.gamepad.index] = new FollowJSGamepad(event.gamepad, spots[event.gamepad.index+1]);
        connectedGamepads[event.gamepad.index].rumble("welcome");
    }

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
                        toggleContextMenu(gamepadObject.assignedSpot.spotNumber);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuUp)
                        gamepadObject.assignedSpot.scrollContextMenu(-1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuDown)
                        gamepadObject.assignedSpot.scrollContextMenu(1);

                    if(index === gamepadObject.assignedSpot.control.gamepad.mapping.buttons.contextMenuSelect) {
                        if(!gamepadObject.assignedSpot.contextMenuState.locked && gamepadObject.assignedSpot.contextMenuState.visible)
                            executeMacro(gamepadObject.assignedSpot.spotNumber, gamepadObject.assignedSpot.contextMenuState.selectedIndex);
                    }

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
    populateVersionInfoStringInFooter();

    updateWindowSize();
    initializeImage();

    enableCaptureKeyboard();
    enableGamepadConnectionEventListeners();

    (async function() {
        await addSpotsToDOM();
        await prepareDMXTable();
        window.requestAnimationFrame(drawAnimationFrameCallback);
    })();
});