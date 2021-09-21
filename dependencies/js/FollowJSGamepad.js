class FollowJSGamepad {
    constructor(gamepadObject, spot) {
        this.id = gamepadObject.id;
        this.currentState = gamepadObject;
        this.lastState = gamepadObject;
        this.assignedSpot = spot;
        // this.lastUpdate = performance.now();
    }

    update(gamepadObject) {
        if(gamepadObject.id !== this.id)
            throw "FollowJSGamepad update: ID mismatch";
        this.lastState = this.currentState;
        this.currentState = gamepadObject;
        // this.lastUpdate = performance.now();
    }
}
module.exports = FollowJSGamepad;