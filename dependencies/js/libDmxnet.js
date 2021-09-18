/*
    Modified version of node.js module "dmxnet" by margau: https://github.com/margau/dmxnet
    MIT License: https://github.com/margau/dmxnet/blob/master/LICENSE
 */

const dgram = require('dgram');
const jspack = require('jspack').jspack;
//Require Logger
// const manager = require('simple-node-logger').createLogManager();
//Init Logger
// const log = manager.createLogger('dmxnet');

// ArtDMX Header for jspack
const ArtDmxHeaderFormat = '!7sBHHBBBBH';
// ArtDMX Payload for jspack
const ArtDmxPayloadFormat = '512B';


//dmxnet constructor
function dmxnet(options) {
    this.verbose=options.verbose || 0;
    this.oem=options.oem || 2908; //OEM code hex
    // if(this.verbose>0) {
    //     log.setLevel('info');
    //     if(this.verbose>1) {
    //         log.setLevel('debug');
    //     }
    // } else {
    //     log.setLevel('warn');
    // }
    // log.info("started with options "+JSON.stringify(options));
    //ToDo: Register Sender and Receiver
    //ToDo: Send ArtPoll
    return this;
}
//get a new sender object
dmxnet.prototype.newSender=function(options) {
    return new sender(options,this);
}

//define sender with user options and inherited parent object
sender=function (options,parent){
    //save parent object
    this.parent=parent;

    this.socket_ready=false;
    //set options
    var options = options || {};
    this.net=options.net || 0;
    this.subnet=options.subnet || 0;
    this.universe=options.universe || 0;
    this.subuni=options.subuni;
    this.ip=options.ip || "255.255.255.255";
    this.port=options.port || 6454;
    this.verbose=this.parent.verbose;
    this.highestChannelToTransmit = 2;

    //Validate Input
    if(this.net>127) {
        throw "Invalid Net, must be smaller than 128";
    }
    if(this.universe>15) {
        throw "Invalid Universe, must be smaller than 16";
    }
    if(this.subnet>15) {
        throw "Invalid subnet, must be smaller than 16";
    }
    if((this.net<0)||(this.subnet<0)||(this.universe<0)) {
        throw "Subnet, Net or Universe must be 0 or bigger!";
    }
    // if(this.verbose>0) {
    //     log.info("new dmxnet sender started with params: "+JSON.stringify(options));
    // }

    //init dmx-value array
    this.values = [];
    // fill all 512 channels
    for(var i = 0; i < 512; i++) {
        this.values[i]=0;
    }

    //Build Subnet/Universe/Net Int16
    if(!this.subuni) {
        this.subuni=(this.subnet<<4)|(this.universe);
    }

    //ArtDmxSeq
    this.ArtDmxSeq=1;

    //Create Socket
    this.socket=dgram.createSocket('udp4');
    _this=this;
    //Check IP and Broadcast
    if(isBroadcast(this.ip)) {
        this.socket.bind(function() {
            _this.socket.setBroadcast(true);
            _this.socket_ready=true;
        });

    } else {
        this.socket_ready=true;
    }
    //Transmit first Frame
    this.transmit();

    // Workaround for this-Contect inside setInterval
    var _this=this;
    //Send Frame all 1000ms even there is no channel change
    this.interval=setInterval(function() {
        _this.transmit();
    },1000);
}

//Transmit function
sender.prototype.transmit = function () {
    // console.log("transmit ArtNet");
    //Only transmit if socket is ready
    if(this.socket_ready) {
        // if(this.ArtDmxSeq>255) {
        //     this.ArtDmxSeq=1;
        // }

        // disable auto-retransmit since transmit was called
        // clearInterval(this.interval);

        // disable sequential order functionality
        this.ArtDmxSeq = 0;

        //Build packet: ID Int8[8], OpCode Int16 0x5000 (conv. to 0x0050), ProtVer Int16, Sequence Int8, PhysicalPort Int8, SubnetUniverseNet Int16, Length Int16
        let udppacket = new Buffer(jspack.Pack(ArtDmxHeaderFormat + ArtDmxPayloadFormat, ["Art-Net", 0, 0x0050, 14, this.ArtDmxSeq, 0, this.subuni, this.net, this.values.length].concat(this.values)));

        //Increase Sequence Counter
        // this.ArtDmxSeq++;

        // log.debug("Packet content: "+udppacket.toString('hex'));
        //Send UDP

        var client=this.socket;
        _this=this;

        client.send(udppacket, 0, udppacket.length, this.port, this.ip, function(err, bytes) {
            if (err)
                throw err;
            // log.info('ArtDMX frame sent to ' + _this.ip +':'+ _this.port);
        });

        //Send Frame all 1000ms even there is no channel change
        // this.interval=setInterval(function() {
        //     console.log("auto-retransmit");
        //     _this.transmit();
        // },1000);
    }
};

function increaseArraySizeToFitUpToChannel(channel, valArray) {
    for(let i=0;i<channel;i++) {
        if(!(i in valArray))
            valArray[i] = 0;
    }
}

//SetChannel function
sender.prototype.setChannel = function (channel, value) {
    let index = channel - 1;

    if((channel > 512) || (channel < 1)) {
        throw "Channel must be between 1 and 512";
    }
    if((value > 255) || (value < 0)) {
        throw "Value must be between 0 and 255";
    }

    this.values[index] = value;

    if(channel > this.highestChannelToTransmit)
        this.highestChannelToTransmit = channel;

    // if(index > this.values.length) {
    //     increaseArraySizeToFitUpToChannel(channel, this.values);
    // }

    this.transmit();
};

//PrepChannel function
sender.prototype.prepChannel = function (channel, value) {
    let index = channel - 1;

    if((channel > 512) || (channel < 1)) {
        throw "Channel must be between 1 and 512";
    }
    if((value > 255) || (value<0)) {
        throw "Value must be between 0 and 255";
    }
    this.values[index] = value;

    if(channel > this.highestChannelToTransmit)
        this.highestChannelToTransmit = channel;
};

//SetChannels
sender.prototype.setChannels = function (start, channels) {
    let index = start - 1;
    let length = channels.length;
    if((start > 512) || (start < 1)) {
        throw "Channel must be between 1 and 512";
    }
    if((start + length - 1) > 512) {
        throw "Channel Array exceeds 512";
    }
    this.values.splice(index, 0, ...channels);

    this.transmit();
};

//Fill Channels
sender.prototype.fillChannels = function (start, stop, value) {
    let indexStart = start - 1;
    let indexStop = stop - 1;

    if((start > 512) || (start < 1)) {
        throw "Start Channel must be between 1 and 512";
    }
    if((stop > 512) || (stop < 1)) {
        throw "Stop Channel must be between 1 and 512";
    }
    if((value > 255) || (value < 0)) {
        throw "Value must be between 0 and 255";
    }
    for(let i=indexStart; i<=indexStop; i++) {
        this.values[i] = value;
    }
    this.transmit();
};

//Stop sender
sender.prototype.stop = function() {
    clearInterval(this.interval);
    this.socket.close();
};

function isBroadcast(ipaddress) {
    let oct=ipaddress.split('.');
    if(oct.length !== 4) {
        throw "Wrong IPv4 length";
    }
    for(let i=0; i<4; i++) {
        if((parseInt(oct[i]) > 255)||(parseInt(oct[i]) < 0)) {
            throw "Invalid IP (Octet "+(i+1)+")";
        }
    }
    if(Number.parseInt(oct[3]) === 255) {
        return true;
    }
    return false;
}

//ToDo: Receiver
//Export dmxnet
module.exports = {dmxnet};
