"use strict";

/**
 * @file Pan/tilt ↔ screen polynomial regression (degrees 2–4).
 * Forward map: normalized fixture (pan, tilt) → screen (x, y).
 * Inverse map: screen → fixture via fitted inverse polynomial; Newton fallback when absent.
 * @module FollowJSRegression
 */

/**
 * @typedef {[number, number]} Vec2 Normalized coordinate pair.
 */

/**
 * @typedef {Object} RegressionCoeffs Polynomial coefficients (shared basis for x/y outputs).
 * @property {2|3|4} [degree] Defaults from `a.length` when omitted.
 * @property {number[]} a Basis weights for first output axis.
 * @property {number[]} b Basis weights for second output axis.
 * @property {number} [fitError] Mean squared calibration residual.
 * @property {number} [roundTripError] Mean squared screen error after screen→fixture→screen.
 */

/**
 * @typedef {Object} AxisBoundaries
 * @property {{min: number, max: number}} x Pan boundary (normalized 0–1).
 * @property {{min: number, max: number}} y Tilt boundary (normalized 0–1).
 */

/**
 * @typedef {Object} TranslationConfig Spot `config.translation` slice.
 * @property {RegressionCoeffs} regression Forward (fixture → screen) coefficients.
 * @property {RegressionCoeffs} [inverseRegression] Inverse (screen → fixture) coefficients.
 * @property {Object} [lastCalibration] Cached calib session from last accept.
 */

/**
 * @typedef {Object} RegressionCandidateSession Output of {@link buildRegressionCandidateSession}.
 * @property {Vec2[]} calibPoints Measured fixture positions per grid cell.
 * @property {Vec2[]} targetPoints Screen targets (0.1…0.9 grid).
 * @property {Object.<number, number>} errorsByDegree Forward fit MSE keyed by degree.
 * @property {Object.<number, RegressionCoeffs>} regressionsByDegree Forward fits keyed by degree.
 * @property {2|3|4|null} recommendedDegree Lowest forward MSE among 2/3/4.
 */

/** @type {Object.<number, number>} Monomial count per polynomial degree. */
const COEFFICIENT_COUNTS = {
    2: 6,
    3: 10,
    4: 15
};

function coefficientCountForDegree(degree) {
    return COEFFICIENT_COUNTS[degree];
}

function inferDegreeFromCoefficientCount(count) {
    for(const [degree, coefficientCount] of Object.entries(COEFFICIENT_COUNTS)) {
        if(coefficientCount === count)
            return Number.parseInt(degree, 10);
    }
    return null;
}

/**
 * Ensures `regression.degree` is set (inferred from coefficient count, default 2).
 * @param {RegressionCoeffs} regression
 * @returns {RegressionCoeffs} Same object, mutated if needed.
 */
function normalizeRegression(regression) {
    if(regression.degree === undefined) {
        regression.degree = inferDegreeFromCoefficientCount(regression.a.length) ?? 2;
    }
    return regression;
}

function buildBasisTerms(x, y, degree) {
    const x2 = x * x;
    const y2 = y * y;
    const terms = [1, x, y, x * y, x2, y2];

    if(degree >= 3) {
        terms.push(y * x2, x * y2, x2 * x, y2 * y);
    }
    if(degree >= 4) {
        terms.push(x2 * x * y, x2 * y2, x * y2 * y, x2 * x2, y2 * y2);
    }

    return terms;
}

function buildBasisDerivatives(x, y, degree) {
    const x2 = x * x;
    const y2 = y * y;
    const dx = [0, 1, 0, y, 2 * x, 0];
    const dy = [0, 0, 1, x, 0, 2 * y];

    if(degree >= 3) {
        dx.push(2 * x * y, y2, 3 * x2, 0);
        dy.push(x2, 2 * x * y, 0, 3 * y2);
    }
    if(degree >= 4) {
        dx.push(3 * x2 * y, 2 * x * y2, y2 * y, 4 * x2 * x, 0);
        dy.push(x2 * x, 2 * x2 * y, 3 * x * y2, 0, 4 * y2 * y);
    }

    return { dx, dy };
}

/**
 * Evaluate forward map: fixture (pan, tilt) → screen (x, y).
 * @param {RegressionCoeffs} regression
 * @param {number} x Normalized pan.
 * @param {number} y Normalized tilt.
 * @returns {Vec2} Screen position (may lie outside 0–1).
 */
function forwardRegression(regression, x, y) {
    regression = normalizeRegression(regression);
    const terms = buildBasisTerms(x, y, regression.degree);
    const a = regression.a;
    const b = regression.b;
    let posX = 0;
    let posY = 0;

    for(let i = 0; i < terms.length; i++) {
        posX += a[i] * terms[i];
        posY += b[i] * terms[i];
    }

    return [posX, posY];
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Iterative inverse via Newton–Raphson on the forward map (up to 25 steps).
 * @param {RegressionCoeffs} regression Forward coefficients.
 * @param {number} targetPosX Target screen x.
 * @param {number} targetPosY Target screen y.
 * @param {number} startX Initial pan guess (typically current pan).
 * @param {number} startY Initial tilt guess.
 * @param {AxisBoundaries} boundaries Clamped each iteration.
 * @returns {Vec2} Normalized pan/tilt.
 */
function inverseRegressionNewton(regression, targetPosX, targetPosY, startX, startY, boundaries) {
    regression = normalizeRegression(regression);
    let x = startX;
    let y = startY;

    for(let iteration = 0; iteration < 25; iteration++) {
        const pos = forwardRegression(regression, x, y);
        const errorX = pos[0] - targetPosX;
        const errorY = pos[1] - targetPosY;

        if(Math.abs(errorX) < 1e-6 && Math.abs(errorY) < 1e-6)
            break;

        const derivatives = buildBasisDerivatives(x, y, regression.degree);
        let dfx_dx = 0;
        let dfx_dy = 0;
        let dfy_dx = 0;
        let dfy_dy = 0;

        for(let i = 0; i < regression.a.length; i++) {
            dfx_dx += regression.a[i] * derivatives.dx[i];
            dfx_dy += regression.a[i] * derivatives.dy[i];
            dfy_dx += regression.b[i] * derivatives.dx[i];
            dfy_dy += regression.b[i] * derivatives.dy[i];
        }

        const determinant = (dfx_dx * dfy_dy) - (dfx_dy * dfy_dx);
        if(Math.abs(determinant) < 1e-12)
            break;

        x -= ((errorX * dfy_dy) - (errorY * dfx_dy)) / determinant;
        y -= ((dfx_dx * errorY) - (dfy_dx * errorX)) / determinant;

        x = clamp(x, boundaries.x.min, boundaries.x.max);
        y = clamp(y, boundaries.y.min, boundaries.y.max);
    }

    return [x, y];
}

/**
 * Evaluate inverse polynomial: screen → fixture. Same basis eval as {@link forwardRegression}.
 * @param {RegressionCoeffs} inverseRegression Coefficients fit with screen as input.
 * @param {number} screenX
 * @param {number} screenY
 * @returns {Vec2} Normalized pan/tilt (unclamped).
 */
function evaluateInverseRegression(inverseRegression, screenX, screenY) {
    return forwardRegression(inverseRegression, screenX, screenY);
}

function computeInverseFitError(inverseRegression, calibPoints, targetPoints) {
    let sumSquaredError = 0;

    for(let pointIndex = 0; pointIndex < targetPoints.length; pointIndex++) {
        const predicted = evaluateInverseRegression(
            inverseRegression,
            targetPoints[pointIndex][0],
            targetPoints[pointIndex][1]
        );
        const deltaX = predicted[0] - calibPoints[pointIndex][0];
        const deltaY = predicted[1] - calibPoints[pointIndex][1];
        sumSquaredError += (deltaX * deltaX) + (deltaY * deltaY);
    }

    return sumSquaredError / targetPoints.length;
}

/**
 * Mean squared screen error after screen → inverse → forward round-trip.
 * Used to pick inverse polynomial degree.
 * @param {RegressionCoeffs} forwardModel
 * @param {RegressionCoeffs} inverseRegression
 * @param {Vec2[]} calibPoints Ground-truth fixture pairs (for Jacobian context; error is in screen space).
 * @param {Vec2[]} targetPoints Screen targets aligned with calibPoints.
 * @returns {number} MSE in screen units².
 */
function computeRoundTripError(forwardModel, inverseRegression, calibPoints, targetPoints) {
    forwardModel = normalizeRegression(forwardModel);
    let sumSquaredError = 0;

    for(let pointIndex = 0; pointIndex < targetPoints.length; pointIndex++) {
        const fixture = evaluateInverseRegression(
            inverseRegression,
            targetPoints[pointIndex][0],
            targetPoints[pointIndex][1]
        );
        const roundTrip = forwardRegression(forwardModel, fixture[0], fixture[1]);
        const deltaX = roundTrip[0] - targetPoints[pointIndex][0];
        const deltaY = roundTrip[1] - targetPoints[pointIndex][1];
        sumSquaredError += (deltaX * deltaX) + (deltaY * deltaY);
    }

    return sumSquaredError / targetPoints.length;
}

function fitInversePolynomialRegression(screenPoints, fixturePoints, degree) {
    return fitPolynomialRegression(screenPoints, fixturePoints, degree);
}

/**
 * Fit screen→fixture polynomials for degrees 2–4; rank by {@link computeRoundTripError}.
 * @param {RegressionCoeffs} forwardModel Selected forward fit.
 * @param {Vec2[]} calibPoints
 * @param {Vec2[]} targetPoints
 * @returns {{ errorsByDegree: Object.<number, number>, regressionsByDegree: Object.<number, RegressionCoeffs> }}
 */
function buildInverseRegressionCandidates(forwardModel, calibPoints, targetPoints) {
    const errorsByDegree = {};
    const regressionsByDegree = {};

    for(const degree of [2, 3, 4]) {
        if(targetPoints.length < coefficientCountForDegree(degree))
            continue;

        try {
            const candidateInverse = fitInversePolynomialRegression(targetPoints, calibPoints, degree);
            errorsByDegree[degree] = computeRoundTripError(forwardModel, candidateInverse, calibPoints, targetPoints);
            regressionsByDegree[degree] = candidateInverse;
        }
        catch(error) {
            // Skip degrees that do not have a stable fit.
        }
    }

    return { errorsByDegree, regressionsByDegree };
}

/**
 * Pick lowest round-trip-error inverse among fitted candidates.
 * @param {RegressionCoeffs} forwardModel
 * @param {Vec2[]} calibPoints
 * @param {Vec2[]} targetPoints
 * @returns {Object} `{ regression, fitError, roundTripError, errorsByDegree, regressionsByDegree, degree }`
 */
function buildBestInverseRegression(forwardModel, calibPoints, targetPoints) {
    const { errorsByDegree, regressionsByDegree } = buildInverseRegressionCandidates(forwardModel, calibPoints, targetPoints);
    const bestDegree = selectBestRegressionDegree(errorsByDegree);

    if(bestDegree === null)
        throw new Error("Could not fit inverse regression");

    const bestInverse = regressionsByDegree[bestDegree];

    return {
        regression: bestInverse,
        fitError: computeInverseFitError(bestInverse, calibPoints, targetPoints),
        roundTripError: errorsByDegree[bestDegree],
        errorsByDegree,
        regressionsByDegree,
        degree: bestDegree
    };
}

/**
 * Bootstrap calib pairs from forward-only config: Newton on 9×9 screen grid (0.1…0.9).
 * Used when `lastCalibration` is absent (migration / backfill).
 * @param {RegressionCoeffs} forwardModel
 * @param {number} [gridSteps=9]
 * @returns {{ calibPoints: Vec2[], targetPoints: Vec2[] }}
 */
function buildSyntheticCalibrationPairsFromForward(forwardModel, gridSteps = 9) {
    forwardModel = normalizeRegression(forwardModel);
    const calibPoints = [];
    const targetPoints = [];
    const boundaries = {
        x: { min: 0, max: 1 },
        y: { min: 0, max: 1 }
    };
    let seedX = 0.5;
    let seedY = 0.5;

    for(let gridY = 1; gridY <= gridSteps; gridY++) {
        for(let gridX = 1; gridX <= gridSteps; gridX++) {
            const screenX = gridX * 0.1;
            const screenY = gridY * 0.1;
            const fixture = inverseRegressionNewton(
                forwardModel,
                screenX,
                screenY,
                seedX,
                seedY,
                boundaries
            );
            seedX = fixture[0];
            seedY = fixture[1];
            calibPoints.push(fixture);
            targetPoints.push([screenX, screenY]);
        }
    }

    return { calibPoints, targetPoints };
}

function buildInverseRegressionFromForward(forwardModel, gridSteps = 9) {
    const { calibPoints, targetPoints } = buildSyntheticCalibrationPairsFromForward(forwardModel, gridSteps);
    return buildBestInverseRegression(forwardModel, calibPoints, targetPoints);
}

/**
 * Serializable inverse block for spot config (`translation.inverseRegression`).
 * @param {RegressionCoeffs} forwardModel
 * @param {Vec2[]} calibPoints
 * @param {Vec2[]} targetPoints
 * @returns {RegressionCoeffs}
 */
function buildInverseRegressionConfig(forwardModel, calibPoints, targetPoints) {
    const inverseSession = buildBestInverseRegression(forwardModel, calibPoints, targetPoints);

    return {
        degree: inverseSession.regression.degree,
        a: inverseSession.regression.a.slice(),
        b: inverseSession.regression.b.slice(),
        fitError: inverseSession.fitError,
        roundTripError: inverseSession.roundTripError
    };
}

/**
 * Runtime screen→fixture: inverse polynomial when present, else {@link inverseRegressionNewton}.
 * @param {TranslationConfig} translation Spot translation config (or subset).
 * @param {number} screenX
 * @param {number} screenY
 * @param {AxisBoundaries} boundaries
 * @param {number} startX Newton seed pan when falling back.
 * @param {number} startY Newton seed tilt when falling back.
 * @returns {Vec2} Clamped normalized pan/tilt.
 */
function screenToFixture(translation, screenX, screenY, boundaries, startX, startY) {
    if(translation !== undefined && translation.inverseRegression !== undefined && translation.inverseRegression.a !== undefined) {
        const fixture = evaluateInverseRegression(translation.inverseRegression, screenX, screenY);
        return [
            clamp(fixture[0], boundaries.x.min, boundaries.x.max),
            clamp(fixture[1], boundaries.y.min, boundaries.y.max)
        ];
    }

    if(translation === undefined || translation.regression === undefined)
        return [startX, startY];

    return inverseRegressionNewton(
        translation.regression,
        screenX,
        screenY,
        startX,
        startY,
        boundaries
    );
}

/** @deprecated Use {@link inverseRegressionNewton} or {@link screenToFixture}. Alias for Newton inverse. */
function inverseRegression(regression, targetPosX, targetPosY, startX, startY, boundaries) {
    return inverseRegressionNewton(regression, targetPosX, targetPosY, startX, startY, boundaries);
}

/**
 * Map marker pixel position to normalized regression coords (y flipped for screen space).
 * @param {number} leftPx
 * @param {number} topPx
 * @param {number} xImgMax Image width in px.
 * @param {number} yImgMax Image height in px.
 * @returns {Vec2}
 */
function screenPixelsToRegressionCoords(leftPx, topPx, xImgMax, yImgMax) {
    return [
        leftPx / xImgMax,
        1 - (topPx / yImgMax)
    ];
}

function solveLinearSystem(matrix, values) {
    const size = matrix.length;
    const augmented = matrix.map((row, rowIndex) => row.concat([values[rowIndex]]));

    for(let pivotColumn = 0; pivotColumn < size; pivotColumn++) {
        let pivotRow = pivotColumn;
        for(let row = pivotColumn + 1; row < size; row++) {
            if(Math.abs(augmented[row][pivotColumn]) > Math.abs(augmented[pivotRow][pivotColumn]))
                pivotRow = row;
        }

        if(Math.abs(augmented[pivotRow][pivotColumn]) < 1e-12)
            throw new Error("Singular calibration matrix");

        if(pivotRow !== pivotColumn) {
            const temp = augmented[pivotRow];
            augmented[pivotRow] = augmented[pivotColumn];
            augmented[pivotColumn] = temp;
        }

        const pivotValue = augmented[pivotColumn][pivotColumn];
        for(let column = pivotColumn; column <= size; column++)
            augmented[pivotColumn][column] /= pivotValue;

        for(let row = 0; row < size; row++) {
            if(row === pivotColumn)
                continue;

            const factor = augmented[row][pivotColumn];
            for(let column = pivotColumn; column <= size; column++)
                augmented[row][column] -= factor * augmented[pivotColumn][column];
        }
    }

    return augmented.map((row) => row[size]);
}

/**
 * Least-squares polynomial fit: calib inputs → target outputs (separate `a`/`b` for each output axis).
 * @param {Vec2[]} calibPoints Input basis coordinates (fixture for forward, screen for inverse).
 * @param {Vec2[]} targetPoints Desired outputs per point.
 * @param {2|3|4} degree
 * @returns {RegressionCoeffs}
 */
function fitPolynomialRegression(calibPoints, targetPoints, degree) {
    const coefficientCount = coefficientCountForDegree(degree);
    if(calibPoints.length < coefficientCount)
        throw new Error("Not enough calibration points for polynomial degree " + degree);

    const ata = Array.from({ length: coefficientCount }, () => new Array(coefficientCount).fill(0));
    const atTargetX = new Array(coefficientCount).fill(0);
    const atTargetY = new Array(coefficientCount).fill(0);

    for(let pointIndex = 0; pointIndex < calibPoints.length; pointIndex++) {
        const calibX = calibPoints[pointIndex][0];
        const calibY = calibPoints[pointIndex][1];
        const targetX = targetPoints[pointIndex][0];
        const targetY = targetPoints[pointIndex][1];
        const terms = buildBasisTerms(calibX, calibY, degree);

        for(let row = 0; row < coefficientCount; row++) {
            atTargetX[row] += terms[row] * targetX;
            atTargetY[row] += terms[row] * targetY;
            for(let column = 0; column < coefficientCount; column++)
                ata[row][column] += terms[row] * terms[column];
        }
    }

    return {
        degree,
        a: solveLinearSystem(ata, atTargetX),
        b: solveLinearSystem(ata, atTargetY)
    };
}

/**
 * Extract valid pairs from 81-slot calibration grid (`calibrationValues` indexed row-major 9×9).
 * Skips cells with null pan/tilt. Target screen is fixed gridX/gridY × 0.1.
 * @param {Array<Vec2|null>} calibrationValues Length-81 array from calib session.
 * @returns {{ calibPoints: Vec2[], targetPoints: Vec2[] }}
 */
function buildCalibrationPairs(calibrationValues) {
    const calibPoints = [];
    const targetPoints = [];

    for(let gridY = 1; gridY <= 9; gridY++) {
        for(let gridX = 1; gridX <= 9; gridX++) {
            const valueIndex = ((gridY - 1) * 9) + (gridX - 1);
            const calibrationValue = calibrationValues[valueIndex];
            if(calibrationValue === undefined || calibrationValue[0] === null || calibrationValue[1] === null)
                continue;

            calibPoints.push([calibrationValue[0], calibrationValue[1]]);
            targetPoints.push([gridX * 0.1, gridY * 0.1]);
        }
    }

    return { calibPoints, targetPoints };
}

function buildRegressionFromCalibrationValues(calibrationValues, degree) {
    const { calibPoints, targetPoints } = buildCalibrationPairs(calibrationValues);
    return fitPolynomialRegression(calibPoints, targetPoints, degree);
}

/**
 * Forward fit MSE on calibration pairs (screen-space residual).
 * @param {RegressionCoeffs} regression
 * @param {Vec2[]} calibPoints
 * @param {Vec2[]} targetPoints
 * @returns {number}
 */
function computeRegressionError(regression, calibPoints, targetPoints) {
    let sumSquaredError = 0;

    for(let pointIndex = 0; pointIndex < calibPoints.length; pointIndex++) {
        const predicted = forwardRegression(regression, calibPoints[pointIndex][0], calibPoints[pointIndex][1]);
        const deltaX = predicted[0] - targetPoints[pointIndex][0];
        const deltaY = predicted[1] - targetPoints[pointIndex][1];
        sumSquaredError += (deltaX * deltaX) + (deltaY * deltaY);
    }

    return sumSquaredError / calibPoints.length;
}

/**
 * Fit forward degrees 2–4 on calib pairs; collect MSE per degree.
 * @param {Vec2[]} calibPoints
 * @param {Vec2[]} targetPoints
 * @returns {{ errorsByDegree: Object.<number, number>, regressionsByDegree: Object.<number, RegressionCoeffs> }}
 */
function buildRegressionCandidates(calibPoints, targetPoints) {
    const errorsByDegree = {};
    const regressionsByDegree = {};

    for(const degree of [2, 3, 4]) {
        if(calibPoints.length < coefficientCountForDegree(degree))
            continue;

        try {
            const candidateRegression = fitPolynomialRegression(calibPoints, targetPoints, degree);
            errorsByDegree[degree] = computeRegressionError(candidateRegression, calibPoints, targetPoints);
            regressionsByDegree[degree] = candidateRegression;
        }
        catch(error) {
            // Skip degrees that do not have a stable fit.
        }
    }

    return { errorsByDegree, regressionsByDegree };
}

/**
 * @param {Object.<number, number>} errorsByDegree
 * @returns {2|3|4|null} Degree with lowest MSE, or null if none fit.
 */
function selectBestRegressionDegree(errorsByDegree) {
    let bestDegree = null;
    let bestError = Number.POSITIVE_INFINITY;

    for(const degree of [2, 3, 4]) {
        if(errorsByDegree[degree] === undefined)
            continue;

        if(errorsByDegree[degree] < bestError) {
            bestError = errorsByDegree[degree];
            bestDegree = degree;
        }
    }

    return bestDegree;
}

function buildBestRegressionFromCalibrationValues(calibrationValues) {
    const { calibPoints, targetPoints } = buildCalibrationPairs(calibrationValues);
    const { errorsByDegree, regressionsByDegree } = buildRegressionCandidates(calibPoints, targetPoints);
    const bestDegree = selectBestRegressionDegree(errorsByDegree);

    if(bestDegree === null)
        throw new Error("Could not fit regression from calibration data");

    const bestRegression = regressionsByDegree[bestDegree];
    bestRegression.fitError = errorsByDegree[bestDegree];

    return {
        regression: bestRegression,
        calibPoints,
        targetPoints,
        errorsByDegree,
        regressionsByDegree
    };
}

/**
 * Build overlay/session payload after calibration completes.
 * @param {Array<Vec2|null>} calibrationValues
 * @returns {RegressionCandidateSession}
 */
function buildRegressionCandidateSession(calibrationValues) {
    const { calibPoints, targetPoints } = buildCalibrationPairs(calibrationValues);
    const { errorsByDegree, regressionsByDegree } = buildRegressionCandidates(calibPoints, targetPoints);

    return {
        calibPoints,
        targetPoints,
        errorsByDegree,
        regressionsByDegree,
        recommendedDegree: selectBestRegressionDegree(errorsByDegree)
    };
}

function formatRegressionCoefficients(regression) {
    regression = normalizeRegression(regression);
    let text = "";

    for(let i = 0; i < regression.a.length; i++)
        text += regression.a[i] + " " + regression.b[i] + "\n";

    return text;
}

module.exports = {
    COEFFICIENT_COUNTS,
    coefficientCountForDegree,
    inferDegreeFromCoefficientCount,
    normalizeRegression,
    forwardRegression,
    inverseRegression,
    inverseRegressionNewton,
    evaluateInverseRegression,
    screenToFixture,
    screenPixelsToRegressionCoords,
    fitPolynomialRegression,
    fitInversePolynomialRegression,
    buildCalibrationPairs,
    buildRegressionFromCalibrationValues,
    buildRegressionCandidates,
    buildInverseRegressionCandidates,
    buildRegressionCandidateSession,
    buildBestRegressionFromCalibrationValues,
    buildBestInverseRegression,
    buildInverseRegressionConfig,
    buildInverseRegressionFromForward,
    buildSyntheticCalibrationPairsFromForward,
    computeRegressionError,
    computeInverseFitError,
    computeRoundTripError,
    selectBestRegressionDegree,
    formatRegressionCoefficients
};