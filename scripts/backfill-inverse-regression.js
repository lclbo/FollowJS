"use strict";

/**
 * @file One-off migration: add `translation.inverseRegression` to spot configs from forward fit.
 */

const fs = require("fs");
const path = require("path");
const regression = require("../dependencies/js/FollowJSRegression");

const spotsDir = path.join(__dirname, "..", "config", "spots");

function backfillSpotFile(filePath) {
    const config = JSON.parse(fs.readFileSync(filePath).toString());
    if(config.translation === undefined || config.translation.regression === undefined) {
        console.log("skip (no forward regression): " + path.basename(filePath));
        return;
    }

    const forwardRegression = regression.normalizeRegression(config.translation.regression);
    let calibPoints;
    let targetPoints;

    if(config.translation.lastCalibration !== undefined &&
        Array.isArray(config.translation.lastCalibration.calibPoints) &&
        Array.isArray(config.translation.lastCalibration.targetPoints)) {
        calibPoints = config.translation.lastCalibration.calibPoints;
        targetPoints = config.translation.lastCalibration.targetPoints;
        console.log("using stored calibration pairs: " + path.basename(filePath));
    }
    else {
        const synthetic = regression.buildSyntheticCalibrationPairsFromForward(forwardRegression);
        calibPoints = synthetic.calibPoints;
        targetPoints = synthetic.targetPoints;
        console.log("using synthetic grid pairs: " + path.basename(filePath));
    }

    config.translation.inverseRegression = regression.buildInverseRegressionConfig(
        forwardRegression,
        calibPoints,
        targetPoints
    );

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    console.log(
        "updated " + path.basename(filePath) +
        " · inverse degree " + config.translation.inverseRegression.degree +
        " · round-trip " + config.translation.inverseRegression.roundTripError.toExponential(4)
    );
}

const files = fs.readdirSync(spotsDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

files.forEach((file) => backfillSpotFile(path.join(spotsDir, file)));
