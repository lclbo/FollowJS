"use strict";

/**
 * Spot indexing conventions:
 * - Config files: spot1.json, spot2.json, … (1-based names)
 * - spotNumber: 1, 2, 3, … (display, DOM ids, keyboard keys)
 * - spotIndex: 0, 1, 2, … (global.spots array slot; spot1.json → index 0)
 */

function spotIndexFromNumber(spotNumber) {
    return spotNumber - 1;
}

function spotNumberFromIndex(spotIndex) {
    return spotIndex + 1;
}

function getSpot(spotNumber) {
    return global.spots[spotIndexFromNumber(spotNumber)];
}

function spotExists(spotNumber) {
    let spot = getSpot(spotNumber);
    return spot !== undefined && spot !== null;
}

function getSortedSpotIndices() {
    return Object.keys(global.spots)
        .map(Number)
        .filter((spotIndex) => global.spots[spotIndex] !== undefined)
        .sort((a, b) => a - b);
}

function getSortedSpotNumbers() {
    return getSortedSpotIndices().map((spotIndex) => global.spots[spotIndex].spotNumber);
}

function forEachSpot(callback) {
    getSortedSpotIndices().forEach((spotIndex) => {
        callback(global.spots[spotIndex], spotIndex);
    });
}

module.exports = {
    spotIndexFromNumber,
    spotNumberFromIndex,
    getSpot,
    spotExists,
    getSortedSpotIndices,
    getSortedSpotNumbers,
    forEachSpot
};
