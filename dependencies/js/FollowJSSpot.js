"use strict";
/**
 * Followspot instance
 */
class FollowJSSpot {
    /**
     * Create new Spot instance
     * @param spotNumber 1-based spot id (spot1.json → 1); stored at global.spots[spotNumber - 1]
     * @param configObject spot configuration object
     * @param artnetSender shared ArtNet sender instance (one universe buffer for all spots)
     */
    constructor(spotNumber, configObject, artnetSender) {
        this.spotNumber = spotNumber;
        this.reverseDragEnabled = false;
        this.contextMenuState = {
            visible: false,
            selectedIndex: 0,
            locked: false
        };

        try{
            this.config = configObject;
            this.fixture = fixtureLib[this.config.fixtureTypeFromLib];
            this.control = {
                gamepad: {
                    config: gamepadLib[this.config.control.gamepad.typeFromLib].config,
                    mapping: gamepadLib[this.config.control.gamepad.typeFromLib].mapping[this.config.control.gamepad.mappingFromLib]
                },
                keyboard: this.config.control.keyboard
            };
            this.artnetSender = artnetSender;
        }
        catch(e) {
            console.log("Error creating spot: "+e);
        }

        this.state = new Object(this.config.home); // create Object from template
        this.dmxBuffer = [];

        for(const [chan,data] of Object.entries(this.fixture.dmx.channels)) {
            // console.log("set channel "+chan);
            this.dmxBuffer[chan] = data.value;
        }

        this.homeSpot();
    }

    get spotIndex() {
        return this.spotNumber - 1;
    }

    /**
     * Convert current spot status to DMX values and trigger transmission
     * @param doRetransmit For discrete value changes, add an immediate
     * second transmit (helpful if fixtures have a glitch detection algorithm,
     * since sudden changes might be ignored until the second consecutive
     * transmit otherwise, delaying execution of e.g. shutter snap)
     */
    convertAndSend(doRetransmit = false) {
        this.stateToDmxBuffer();
        this.sendDMX(doRetransmit);
    }

    async sendDMX(doRetransmit = false) {
        this.artnetSender.setChannels(this.config.connection.address, this.dmxBuffer);
        if(doRetransmit)
            await this.artnetSender.transmit();
        this.artnetSender.transmit();
    }

    stateToDmxBuffer() {
        let pan  = (this.state.x * (this.fixture.dmx.range.x.max - this.fixture.dmx.range.x.min) + this.fixture.dmx.range.x.min);
        let tilt = (this.state.y * (this.fixture.dmx.range.y.max - this.fixture.dmx.range.y.min) + this.fixture.dmx.range.y.min);

        this.dmxBuffer[this.fixture.dmx.mapping.pan] = Math.floor(pan / 256);
        this.dmxBuffer[this.fixture.dmx.mapping.panFine] = Math.floor(pan % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.tilt] = Math.floor(tilt / 256);
        this.dmxBuffer[this.fixture.dmx.mapping.tiltFine] = Math.floor(tilt % 256);

        let iris = (Math.min(this.state.r, 1) * (this.fixture.dmx.range.r.max - this.fixture.dmx.range.r.min) + this.fixture.dmx.range.r.min);
        let frost = (Math.min(this.state.frost, 1) * (this.fixture.dmx.range.frost.max - this.fixture.dmx.range.frost.min) + this.fixture.dmx.range.frost.min);
        let focus = (Math.min(this.state.focus, 1) * (this.fixture.dmx.range.focus.max - this.fixture.dmx.range.focus.min) + this.fixture.dmx.range.focus.min);
        let dim = (Math.min(this.state.dim, 1) * (this.fixture.dmx.range.dim.max - this.fixture.dmx.range.dim.min) + this.fixture.dmx.range.dim.min);
        let shut = (this.state.shutterOpen === true) ? this.fixture.dmx.presets.shutter.open : this.fixture.dmx.presets.shutter.close;
        let colorW = this.fixture.dmx.colorWheelArray[(this.state.colorWheelIndex % (this.fixture.dmx.colorWheelArray).length)].value;

        this.dmxBuffer[this.fixture.dmx.mapping.radius] = Math.floor(Math.max(iris, 0) % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.frost] = Math.floor(Math.max(frost, 0) % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.focus] = Math.floor(Math.max(focus, 0) % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.dim] = Math.floor(Math.max(dim, 0) / 256);
        this.dmxBuffer[this.fixture.dmx.mapping.dimFine] = Math.floor(Math.max(dim, 0) % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.shutter] = Math.floor(Math.max(shut, 0) % 256);
        this.dmxBuffer[this.fixture.dmx.mapping.colorWheel] = Math.floor(Math.max(colorW, 0) % 256);
    }


    homeSpot() {
        this.state = {...this.config.home}; //create shallow copy of home state
        //TODO: check that home is within config.boundaries
        this.convertAndSend(true);
    }

    setCurrentStateAsHomeConfig() {
        this.config.home = {...this.state};
    }

    moveSpot(dX, dY) {
        if (dX !== 0)
            this.state.x = Math.min(Math.max(this.state.x + dX, this.config.boundaries.x.min), this.config.boundaries.x.max);
        if (dY !== 0)
            this.state.y = Math.min(Math.max(this.state.y + dY, this.config.boundaries.y.min), this.config.boundaries.y.max);
        this.convertAndSend();
    }

    setPosition(x, y) {
        this.state.x = Math.min(Math.max(x, this.config.boundaries.x.min), this.config.boundaries.x.max);
        this.state.y = Math.min(Math.max(y, this.config.boundaries.y.min), this.config.boundaries.y.max);
        this.convertAndSend();
    }
    resizeSpot(dR) {
        if(dR !== 0)
            this.state.r = Math.min(Math.max(this.state.r+dR, this.config.boundaries.r.min),this.config.boundaries.r.max);
        this.convertAndSend();
    }
    frostSpot(dF) {
        if(dF !== 0)
            this.state.frost = Math.min(Math.max(this.state.frost+dF, this.config.boundaries.frost.min),this.config.boundaries.frost.max);
        this.convertAndSend();
    }
    focusSpot(dF) {
        if(dF !== 0)
            this.state.focus = Math.min(Math.max(this.state.focus+dF, this.config.boundaries.focus.min),this.config.boundaries.focus.max);
        this.convertAndSend();
    }
    dimSpot(dDim) {
        if(dDim !== 0)
            this.state.dim = Math.min(Math.max(this.state.dim+dDim, this.config.boundaries.dim.min),this.config.boundaries.dim.max);
        this.convertAndSend();
    }
    snapSpot() {
        this.state.shutterOpen = (this.state.shutterOpen === false);
        this.convertAndSend(true);
    }
    snapToCTO() {
        this.state.CTOin = (this.state.CTOin === false);

        if(this.state.CTOin === false)
            this.setColorWheel(this.fixture.dmx.presets.colorWheel.openIndex);
        else
            this.setColorWheel(this.fixture.dmx.presets.colorWheel.ctoIndex);

        this.convertAndSend(true);
    }

    setColorWheel(index) {
        let cwLen = this.fixture.dmx.colorWheelArray.length;
        this.state.colorWheelIndex = (index % cwLen);

        this.convertAndSend(true);
    }
    rotateColorWheel(distance) {
        if(this.state.CTOin === false) {
            let cwLen = this.fixture.dmx.colorWheelArray.length;
            this.state.colorWheelIndex = (((this.state.colorWheelIndex + distance) % cwLen) + cwLen) % cwLen;

            this.convertAndSend(true);
        }
    }

    scrollContextMenu(distance) {
        if(!this.contextMenuState.locked)
            this.contextMenuState.selectedIndex = (((this.contextMenuState.selectedIndex + distance) % this.fixture.dmx.macros.length) + this.fixture.dmx.macros.length) % this.fixture.dmx.macros.length;
    }

    // Calibration methods
    initCalibration() {
        if(global.calibrationActive && global.calibrationSpotNo !== undefined)
            global.getSpot(global.calibrationSpotNo).endCalibration();

        document.getElementById('downloadButtonLanding').innerHTML = '';
        document.getElementById('cancelCalibrationButton').classList.remove("hidden");
        global.mainView.hideAllContextMenus();
        console.log("init calibration for spot " + this.spotNumber);
        global.calibrationActive = true;
        global.calibrationStep = 1;
        global.calibrationSpotNo = this.spotNumber;
        global.calibrationValues = new Array(9*9);
        this.hideAllSpotMarkerExceptFor(this.spotNumber);
        this.hideAllSpotStatusExceptFor(this.spotNumber);
        this.setSpotStatusOpacity(this.spotNumber, 0.3);
        global.mainView.showGridOverlay();
        this.showCalibrationPoint();
    }

    storeCalibrationPoint() {
        global.calibrationValues[global.calibrationStep-1] = [this.state.x, this.state.y];
        global.calibrationStep++;
        this.showCalibrationPoint();
        if(global.calibrationStep > global.calibrationValues.length) {
            this.exportCalibration();
            this.endCalibration();
        }
    }

    skipCalibrationPoint() {
        global.calibrationValues[global.calibrationStep-1] = [null, null];
        global.calibrationStep++;
        this.showCalibrationPoint();
        if(global.calibrationStep > global.calibrationValues.length) {
            this.exportCalibration();
            this.endCalibration();
        }
    }

    endCalibration() {
        global.mainView.highlightImageCoord(false);
        this.showAllSpotMarker();
        this.showAllSpotStatus();
        this.setSpotStatusOpacity(this.spotNumber, 1);
        document.getElementById('cancelCalibrationButton').classList.add("hidden");
        global.mainView.hideGridOverlay();
        global.calibrationActive = false;
        global.calibrationSpotNo = undefined;
    }

    exportCalibration() {
        let plainText = "";
        global.calibrationValues.forEach(function(elem, eIdx) {
            if(elem[0] === null || elem[1] === null)
                plainText = plainText + "-1 -1\n";
            else
                plainText = plainText + ""+elem[0]+" "+elem[1]+"\n";
        });

        let plainBlob = new Blob([plainText], {type: 'application/octet-stream;charset=utf-8'});
        let plainLink = window.URL.createObjectURL(plainBlob);
        let a = document.createElement("a");
        a.download = 'calibration-'+global.globalTimestamp.getFullYear()+'-'+(global.globalTimestamp.getMonth()+1)+'-'+global.globalTimestamp.getDate()+'-spot'+this.spotNumber+'.txt';
        a.href = plainLink;
        a.innerHTML = "<button class='button-green'>Download Calibration</button>";
        document.getElementById('downloadButtonLanding').appendChild(a);
        document.getElementById('cancelCalibrationButton').classList.add("hidden");
    }

    showCalibrationPoint() {
        global.mainView.highlightImageCoord(true,(((global.calibrationStep-1) % 9) + 1) * 0.1,(Math.floor((global.calibrationStep-1) / 9) + 1) * 0.1);
    }

    // Helper methods for calibration
    hideAllSpotMarkerExceptFor(dontHideSpotNo) {
        global.forEachSpot(function(spot) {
            if(spot.spotNumber !== dontHideSpotNo) {
                let spotMarkerElement = document.getElementById("spotMarker["+spot.spotNumber+"]");
                spotMarkerElement.classList.add("hiddenVis");
            }
        });
    }

    showAllSpotMarker() {
        global.forEachSpot(function(spot) {
            let spotMarkerElement = document.getElementById("spotMarker["+spot.spotNumber+"]");
            spotMarkerElement.classList.remove("hiddenVis");
        });
    }

    hideAllSpotStatusExceptFor(dontHideSpotNo) {
        global.forEachSpot(function(spot) {
            if(spot.spotNumber !== dontHideSpotNo) {
                let spotStatusElement = document.getElementById("spotStatusOverlay["+spot.spotNumber+"]");
                spotStatusElement.classList.add("hiddenVis");
            }
        });
    }

    showAllSpotStatus() {
        global.forEachSpot(function(spot) {
            let spotStatusElement = document.getElementById("spotStatusOverlay["+spot.spotNumber+"]");
            spotStatusElement.classList.remove("hiddenVis");
        });
    }

    setSpotStatusOpacity(spotNo, opacity) {
        let spotStatusElement = document.getElementById("spotStatusOverlay["+spotNo+"]");
        spotStatusElement.style.opacity = Math.min(1,Math.max(0,opacity)).toString();
    }

    // Context menu methods
    drawContextMenu() {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");

        this.fixture.dmx.macros.forEach(function(macro,key) {
            let selectClass = "";
            if(key === this.contextMenuState.selectedIndex)
                selectClass = "spotContextMenuHighlight";

            document.getElementById("spotContextMenu["+this.spotNumber+"]").insertAdjacentHTML("beforeend", '' +
                '<div class="'+selectClass+'" id="macroButton['+this.spotNumber+']['+key+']" onclick="executeMacro('+this.spotNumber+','+key+')">' +
                macro.short+'' +
                '</div>');
        }.bind(this));

        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="calib['+this.spotNumber+']" onclick="initCalibration('+this.spotNumber+')"><small>Start Calibration</small></div>');
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="importCalib['+this.spotNumber+']" onclick="startImportCalibration('+this.spotNumber+')"><small>Import Calibration</small></div>');
        spotContextMenuElement.insertAdjacentHTML("beforeend", '<div id="store['+this.spotNumber+']" onclick="storeSpotToConfigFile('+this.spotNumber+')"><small>Store Home &amp; Config</small></div>');
        spotContextMenuElement.insertAdjacentHTML("afterbegin", '<div>Spot #'+this.spotNumber+'</div>');
    }

    updateContextMenu() {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");

        let x = this.state.x;
        let y = this.state.y;
        let x2 = Math.pow(x,2);
        let y2 = Math.pow(y,2);

        let pos_x = this.config.translation.regression.a[0] + (this.config.translation.regression.a[1] * x) + (this.config.translation.regression.a[2] * y) + (this.config.translation.regression.a[3] * x * y) + (this.config.translation.regression.a[4] * x2) + (this.config.translation.regression.a[5] * y2);
        let pos_y = this.config.translation.regression.b[0] + (this.config.translation.regression.b[1] * x) + (this.config.translation.regression.b[2] * y) + (this.config.translation.regression.b[3] * x * y) + (this.config.translation.regression.b[4] * x2) + (this.config.translation.regression.b[5] * y2);

        let translate_y = ((1-pos_y) > 0.65) ? "-100%" : "0";
        let translate_x = (pos_x > 0.75) ? "-100%" : "0";
        spotContextMenuElement.style.transform = "translate("+translate_x+","+translate_y+")";

        spotContextMenuElement.style.top = ((1-pos_y) * global.mainView.y_img_max).toString()+"px";
        spotContextMenuElement.style.left = (pos_x * global.mainView.x_img_max).toString()+"px";

        spotContextMenuElement.childNodes.forEach(function (childElement) {
            childElement.classList.remove("spotContextMenuHighlight");
        });
        document.getElementById('macroButton['+this.spotNumber+']['+this.contextMenuState.selectedIndex+']').classList.add("spotContextMenuHighlight");
    }

    hideContextMenu() {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");
        this.contextMenuState.visible = false;
        spotContextMenuElement.innerHTML = "";
    }

    toggleContextMenu() {
        let spotContextMenuElement = document.getElementById("spotContextMenu["+this.spotNumber+"]");

        if(this.contextMenuState.visible !== false) {
            this.contextMenuState.visible = false;
            spotContextMenuElement.innerHTML = "";
        }
        else {
            if(!this.contextMenuState.locked) {
                this.contextMenuState.visible = true;
                this.contextMenuState.selectedIndex = 0;
                this.drawContextMenu();
                this.updateContextMenu();
            }
        }
    }
}

module.exports = FollowJSSpot;