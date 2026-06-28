"use strict";

/**
 * @file Post-calibration regression workflow: trial degree on spot, pending accept/decline, persist to JSON.
 * Mutates `global.pendingRegressionApplied` and spot `config.translation` until accept or decline.
 * @module FollowJSRegressionPending
 */

const regression = require('./FollowJSRegression');

/** @param {Object} translation Deep clone via JSON. */
function cloneTranslation(translation) {
    return JSON.parse(JSON.stringify(translation));
}

/** @param {import('./FollowJSRegression').RegressionCandidateSession} candidateSession */
function buildLastCalibrationFromSession(candidateSession) {
    return {
        calibPoints: candidateSession.calibPoints,
        targetPoints: candidateSession.targetPoints,
        errorsByDegree: candidateSession.errorsByDegree,
        regressionsByDegree: candidateSession.regressionsByDegree
    };
}

/**
 * Apply forward degree + auto-selected inverse regression to spot (live preview).
 * @param {import('./FollowJSSpot')} spot
 * @param {import('./FollowJSRegression').RegressionCandidateSession} candidateSession
 * @param {2|3|4} degree
 * @returns {boolean} False if degree unavailable in session.
 */
function applyRegressionToSpot(spot, candidateSession, degree) {
    const candidateRegression = candidateSession.regressionsByDegree[degree];
    if(candidateRegression === undefined)
        return false;

    spot.config.translation.regression = {
        degree: candidateRegression.degree,
        a: candidateRegression.a.slice(),
        b: candidateRegression.b.slice(),
        fitError: candidateSession.errorsByDegree[degree]
    };
    spot.config.translation.lastCalibration = buildLastCalibrationFromSession(candidateSession);
    spot.config.translation.inverseRegression = regression.buildInverseRegressionConfig(
        spot.config.translation.regression,
        candidateSession.calibPoints,
        candidateSession.targetPoints
    );
    spot.config.translation.lastCalibration.inverseErrorsByDegree =
        regression.buildInverseRegressionCandidates(
            spot.config.translation.regression,
            candidateSession.calibPoints,
            candidateSession.targetPoints
        ).errorsByDegree;
    spot.invalidateScreenCache();
    return true;
}

/** Sync pending-regression banner DOM from `global.pendingRegressionApplied`. */
function updatePendingBanner() {
    const banner = document.getElementById("regressionPendingBanner");
    const pending = global.pendingRegressionApplied;

    if(pending === undefined || pending === null) {
        banner.classList.add("hidden");
        return;
    }

    document.getElementById("regressionPendingSpotNo").innerText = pending.spotNo.toString();
    document.getElementById("regressionPendingDegree").innerText = pending.appliedDegree.toString();
    document.getElementById("regressionPendingError").innerText = pending.appliedError.toExponential(3);
    banner.classList.remove("hidden");
}

/**
 * User picked a forward degree in overlay: apply to spot, close overlay, show pending banner.
 * @param {number} spotNo
 * @param {2|3|4} degree
 */
function testRegressionDegree(spotNo, degree) {
    const selection = global.regressionSelectionSession;
    if(selection === undefined || selection === null || selection.spotNo !== spotNo)
        return;

    const spot = global.getSpot(spotNo);
    if(spot === undefined)
        return;

    const candidateSession = selection.candidateSession;
    const isNewPendingSpot = global.pendingRegressionApplied === undefined ||
        global.pendingRegressionApplied === null ||
        global.pendingRegressionApplied.spotNo !== spotNo;

    if(isNewPendingSpot) {
        global.pendingRegressionApplied = {
            spotNo,
            savedTranslation: cloneTranslation(spot.config.translation),
            candidateSession,
            appliedDegree: degree,
            appliedError: candidateSession.errorsByDegree[degree]
        };
    }
    else {
        global.pendingRegressionApplied.appliedDegree = degree;
        global.pendingRegressionApplied.appliedError = candidateSession.errorsByDegree[degree];
        global.pendingRegressionApplied.candidateSession = candidateSession;
    }

    if(!applyRegressionToSpot(spot, candidateSession, degree))
        return;

    global.pendingRegressionApplied.appliedInverseDegree = spot.config.translation.inverseRegression.degree;
    global.pendingRegressionApplied.appliedInverseRoundTripError = spot.config.translation.inverseRegression.roundTripError;

    global.regressionSelectionSession = null;
    global.mainView.drawSpots();
    global.regressionView.closeRegressionOverlay();
    updatePendingBanner();
}

/** Close selection overlay without applying (when no pending state to preserve). */
function skipRegressionSelection() {
    global.regressionSelectionSession = null;
    global.regressionView.closeRegressionOverlay();
}

/** Re-open degree picker for current pending regression. */
function reviewRegressionCandidates() {
    const pending = global.pendingRegressionApplied;
    if(pending === undefined || pending === null)
        return;

    global.regressionSelectionSession = {
        spotNo: pending.spotNo,
        candidateSession: pending.candidateSession
    };
    global.regressionView.showRegressionSelectionOverlay(
        pending.spotNo,
        pending.candidateSession,
        pending.appliedDegree
    );
}

/** Write pending regression to spot JSON; clear pending state. */
function acceptPendingRegression() {
    const pending = global.pendingRegressionApplied;
    if(pending === undefined || pending === null)
        return;

    global.storeSpotToConfigFile(pending.spotNo, false);
    global.pendingRegressionApplied = null;
    updatePendingBanner();
}

/** Restore pre-trial translation; clear pending state. */
function declinePendingRegression() {
    const pending = global.pendingRegressionApplied;
    if(pending === undefined || pending === null)
        return;

    const spot = global.getSpot(pending.spotNo);
    if(spot !== undefined)
        spot.config.translation = cloneTranslation(pending.savedTranslation);

    global.pendingRegressionApplied = null;
    global.mainView.drawSpots();
    updatePendingBanner();
}

/** Decline if pending regression targets this spot (e.g. before re-calibrating). @param {number} spotNo */
function discardPendingRegressionForSpot(spotNo) {
    if(global.pendingRegressionApplied?.spotNo === spotNo)
        declinePendingRegression();
}

/**
 * Entry after calib grid completes: build candidate session and open overlay.
 * @param {number} spotNo
 * @param {Array<[number, number]|null>} calibrationValues
 */
function beginRegressionSelection(spotNo, calibrationValues) {
    global.regressionView.showRegressionSelectionOverlayFromCalibration(spotNo, calibrationValues);
}

module.exports = {
    beginRegressionSelection,
    testRegressionDegree,
    skipRegressionSelection,
    reviewRegressionCandidates,
    acceptPendingRegression,
    declinePendingRegression,
    discardPendingRegressionForSpot,
    updatePendingBanner
};
