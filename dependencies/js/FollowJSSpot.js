/**
 * Followspot instance
 */
class FollowJSSpot {
    /**
     * Create new Spot instance
     * @param spotNumber number of the spot within the system (1,2,3,...). Must match spots[i]-Index
     * @param configObject spot configuration object
     * @param artnetSender ArtNet sender instance
     */
    constructor(spotNumber, configObject, artnetSender) {
        this.spotNumber = spotNumber;
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
    sendDMX() {
        this.artnetSender.setChannels(this.config.connection.address, this.dmxBuffer).then(this.artnetSender.transmit());
    }

    async allToDMX() {
        return new Promise((resolve, reject) => {
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
            let colorW = this.fixture.dmx.colorWheel[(this.state.colorWheelIndex % (this.fixture.dmx.colorWheel).length)];

            this.dmxBuffer[this.fixture.dmx.mapping.radius] = Math.floor(Math.max(iris, 0) % 256);
            this.dmxBuffer[this.fixture.dmx.mapping.frost] = Math.floor(Math.max(frost, 0) % 256);
            this.dmxBuffer[this.fixture.dmx.mapping.focus] = Math.floor(Math.max(focus, 0) % 256);
            this.dmxBuffer[this.fixture.dmx.mapping.dim] = Math.floor(Math.max(dim, 0) / 256);
            this.dmxBuffer[this.fixture.dmx.mapping.dimFine] = Math.floor(Math.max(dim, 0) % 256);
            this.dmxBuffer[this.fixture.dmx.mapping.shutter] = Math.floor(Math.max(shut, 0) % 256);
            this.dmxBuffer[this.fixture.dmx.mapping.colorWheel] = (this.state.CTOin === true) ? this.fixture.dmx.presets.color.cto : Math.floor(Math.max(colorW, 0) % 256);

            resolve();
        });
    }


    homeSpot() {
        this.state = {...this.config.home}; //create shallow copy of home state
        //TODO: check that home is within config.boundaries

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX()
        });
    }

    moveSpot(dX, dY) {
        if (dX !== 0)
            this.state.x = Math.min(Math.max(this.state.x + dX, this.config.boundaries.x.min), this.config.boundaries.x.max);
        if (dY !== 0)
            this.state.y = Math.min(Math.max(this.state.y + dY, this.config.boundaries.y.min), this.config.boundaries.y.max);

        // console.log("Spot "+this.spotNumber+": x: "+this.state.x+", y: "+this.state.y);

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX()
        });
    }
    resizeSpot(dR) {
        if(dR !== 0)
            this.state.r = Math.min(Math.max(this.state.r+dR, this.config.boundaries.r.min),this.config.boundaries.r.max);

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }
    frostSpot(dF) {
        if(dF !== 0)
            this.state.frost = Math.min(Math.max(this.state.frost+dF, this.config.boundaries.frost.min),this.config.boundaries.frost.max);

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }
    focusSpot(dF) {
        if(dF !== 0)
            this.state.focus = Math.min(Math.max(this.state.focus+dF, this.config.boundaries.focus.min),this.config.boundaries.focus.max);

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }
    dimSpot(dDim) {
        if(dDim !== 0)
            this.state.dim = Math.min(Math.max(this.state.dim+dDim, this.config.boundaries.dim.min),this.config.boundaries.dim.max);

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }
    snapSpot() {
        this.state.shutterOpen = (this.state.shutterOpen === false);

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }
    snapToCTO() {
        this.state.CTOin = (this.state.CTOin === false);

        if(this.state.CTOin === false)
            this.state.colorWheelIndex = 0;

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }
    rotateColorWheel(distance) {
        let cwLen = this.fixture.dmx.colorWheel.length;
        this.state.colorWheelIndex = (((this.state.colorWheelIndex + distance) % cwLen) + cwLen) % cwLen;

        const _this=this;
        this.allToDMX().then(function() {
            _this.sendDMX();
        });
    }

    scrollContextMenu(distance) {
        if(!this.contextMenuState.locked)
            this.contextMenuState.selectedIndex = (((this.contextMenuState.selectedIndex + distance) % this.fixture.dmx.macros.length) + this.fixture.dmx.macros.length) % this.fixture.dmx.macros.length;
    }
}

module.exports = FollowJSSpot;