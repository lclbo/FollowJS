"use strict";

/**
 * @file 1-based spotNumber ↔ `global.spots` array index.
 * Convention: spot1.json → spotNumber 1 → `global.spots[0]`.
 * @module FollowJSSpotIndex
 */

/** @param {number} spotNumber 1-based spot id. @returns {number} Array index. */
function spotIndexFromNumber(spotNumber) {
    return spotNumber - 1;
}

/** @param {number} spotIndex Array index. @returns {number} 1-based spot id. */
function spotNumberFromIndex(spotIndex) {
    return spotIndex + 1;
}

/**
 * @param {number} spotNumber 1-based.
 * @returns {import('./FollowJSSpot')|undefined}
 */
function getSpot(spotNumber) {
    return global.spots[spotIndexFromNumber(spotNumber)];
}

/** @param {number} spotNumber @returns {boolean} */
function spotExists(spotNumber) {
    let spot = getSpot(spotNumber);
    return spot !== undefined && spot !== null;
}

/** @returns {number[]} Sorted occupied slots in `global.spots`. */
function getSortedSpotIndices() {
    return Object.keys(global.spots)
        .map(Number)
        .filter((spotIndex) => global.spots[spotIndex] !== undefined)
        .sort((a, b) => a - b);
}

/** @returns {number[]} Sorted 1-based spot numbers. */
function getSortedSpotNumbers() {
    return getSortedSpotIndices().map((spotIndex) => global.spots[spotIndex].spotNumber);
}

/**
 * @param {(spot: import('./FollowJSSpot'), spotIndex: number) => void} callback
 */
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
