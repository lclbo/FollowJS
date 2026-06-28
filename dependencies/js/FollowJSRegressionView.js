"use strict";

/**
 * @file Regression overlay UI: SVG calib plot, degree summaries, selection actions.
 * @module FollowJSRegressionView
 */

const regression = require('./FollowJSRegression');

const PLOT_SIZE = 360;
const PLOT_MARGIN = 28;

function mapPlotCoordinate(value) {
    return PLOT_MARGIN + (value * (PLOT_SIZE - (2 * PLOT_MARGIN)));
}

function predictedTargetPoints(calibPoints, candidateRegression) {
    return calibPoints.map(function(calibPoint) {
        return regression.forwardRegression(candidateRegression, calibPoint[0], calibPoint[1]);
    });
}

function appendScatterPoints(parentElement, points, markerClass) {
    points.forEach(function(point) {
        const plotPoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        plotPoint.setAttribute("cx", mapPlotCoordinate(point[0]).toString());
        plotPoint.setAttribute("cy", mapPlotCoordinate(1 - point[1]).toString());
        plotPoint.setAttribute("r", "3");
        plotPoint.setAttribute("class", markerClass);
        parentElement.appendChild(plotPoint);
    });
}

function appendCrossPoints(parentElement, points, markerClass) {
    points.forEach(function(point) {
        const plotX = mapPlotCoordinate(point[0]);
        const plotY = mapPlotCoordinate(1 - point[1]);
        const crossSize = 4;
        const lineA = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineA.setAttribute("x1", (plotX - crossSize).toString());
        lineA.setAttribute("y1", plotY.toString());
        lineA.setAttribute("x2", (plotX + crossSize).toString());
        lineA.setAttribute("y2", plotY.toString());
        lineA.setAttribute("class", markerClass);

        const lineB = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineB.setAttribute("x1", plotX.toString());
        lineB.setAttribute("y1", (plotY - crossSize).toString());
        lineB.setAttribute("x2", plotX.toString());
        lineB.setAttribute("y2", (plotY + crossSize).toString());
        lineB.setAttribute("class", markerClass);

        parentElement.appendChild(lineA);
        parentElement.appendChild(lineB);
    });
}

function buildRegressionPlotSvg(calibPoints, targetPoints, regressionsByDegree, activeDegree) {
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.setAttribute("viewBox", "0 0 " + PLOT_SIZE + " " + PLOT_SIZE);
    svgElement.setAttribute("class", "regressionPlotSvg");

    const plotArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    plotArea.setAttribute("x", PLOT_MARGIN.toString());
    plotArea.setAttribute("y", PLOT_MARGIN.toString());
    plotArea.setAttribute("width", (PLOT_SIZE - (2 * PLOT_MARGIN)).toString());
    plotArea.setAttribute("height", (PLOT_SIZE - (2 * PLOT_MARGIN)).toString());
    plotArea.setAttribute("class", "regressionPlotArea");
    svgElement.appendChild(plotArea);

    for(let gridStep = 1; gridStep <= 9; gridStep++) {
        const gridValue = gridStep * 0.1;
        const gridLineX = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLineX.setAttribute("x1", mapPlotCoordinate(gridValue).toString());
        gridLineX.setAttribute("y1", PLOT_MARGIN.toString());
        gridLineX.setAttribute("x2", mapPlotCoordinate(gridValue).toString());
        gridLineX.setAttribute("y2", (PLOT_SIZE - PLOT_MARGIN).toString());
        gridLineX.setAttribute("class", "regressionPlotGridLine");
        svgElement.appendChild(gridLineX);

        const gridLineY = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLineY.setAttribute("x1", PLOT_MARGIN.toString());
        gridLineY.setAttribute("y1", mapPlotCoordinate(1 - gridValue).toString());
        gridLineY.setAttribute("x2", (PLOT_SIZE - PLOT_MARGIN).toString());
        gridLineY.setAttribute("y2", mapPlotCoordinate(1 - gridValue).toString());
        gridLineY.setAttribute("class", "regressionPlotGridLine");
        svgElement.appendChild(gridLineY);
    }

    appendScatterPoints(svgElement, calibPoints, "regressionPlotCalibPoint");
    appendCrossPoints(svgElement, targetPoints, "regressionPlotTargetPoint");

    const markerStyles = {
        2: "regressionPlotFitDeg2",
        3: "regressionPlotFitDeg3",
        4: "regressionPlotFitDeg4"
    };

    for(const degree of [2, 3, 4]) {
        if(regressionsByDegree[degree] === undefined)
            continue;

        const fitPoints = predictedTargetPoints(calibPoints, regressionsByDegree[degree]);
        const markerClass = markerStyles[degree] + (degree === activeDegree ? " regressionPlotFitActive" : "");
        appendCrossPoints(svgElement, fitPoints, markerClass);
    }

    return svgElement;
}

function formatRegressionSummary(spot) {
    const activeRegression = regression.normalizeRegression(spot.config.translation.regression);
    let summary = "Degree: " + activeRegression.degree;

    if(activeRegression.fitError !== undefined)
        summary += " · fit error: " + activeRegression.fitError.toExponential(4);

    if(spot.config.translation.inverseRegression !== undefined) {
        summary += "\nInverse degree: " + spot.config.translation.inverseRegression.degree;
        if(spot.config.translation.inverseRegression.roundTripError !== undefined)
            summary += " · round-trip error: " + spot.config.translation.inverseRegression.roundTripError.toExponential(4);
    }

    summary += "\n\nCoefficients (a / b):\n";
    summary += regression.formatRegressionCoefficients(activeRegression);
    return summary;
}

function setOverlayMode(mode) {
    const isSelection = mode === "selection";
    document.getElementById("regressionOverlayTitlePrefix").innerText = isSelection ? "Choose Regression" : "Regression";
    document.getElementById("regressionRecommendation").classList.toggle("hidden", !isSelection);
    document.getElementById("regressionSelectionActions").classList.toggle("hidden", !isSelection);
    document.getElementById("regressionCoefficients").classList.toggle("hidden", isSelection);
}

function buildDegreeSummaryHtml(candidateSession, options = {}) {
    const {
        selectable = false,
        selectedDegree = null,
        activeDegree = null,
        recommendedDegree = candidateSession?.recommendedDegree ?? null
    } = options;

    if(candidateSession === undefined || candidateSession === null)
        return "";

    let rows = "";
    for(const degree of [2, 3, 4]) {
        const degreeError = candidateSession.errorsByDegree[degree];
        const isAvailable = candidateSession.regressionsByDegree[degree] !== undefined;
        const isRecommended = degree === recommendedDegree;
        const isSelected = selectable && degree === selectedDegree;
        const isActive = !selectable && degree === activeDegree;
        let rowClass = "regressionDegreeRow";

        if(isRecommended)
            rowClass += " regressionDegreeRecommended";
        if(isSelected)
            rowClass += " regressionDegreeSelected";
        if(isActive)
            rowClass += " regressionDegreeActive";

        const errorText = isAvailable ? degreeError.toExponential(4) : "—";
        let badge = "";
        if(isRecommended)
            badge = "<span class=\"regressionDegreeBadge\">recommended</span>";
        else if(isActive)
            badge = "<span class=\"regressionDegreeBadge regressionDegreeBadgeActive\">active</span>";

        if(selectable && isAvailable) {
            rows += "<button type=\"button\" class=\"" + rowClass + "\" data-degree=\"" + degree + "\">" +
                "<span class=\"regressionDegreeLabel\">Degree " + degree + "</span>" +
                "<span class=\"regressionDegreeError\">" + errorText + "</span>" +
                badge +
                "</button>";
        }
        else {
            rows += "<div class=\"" + rowClass + "\">" +
                "<span class=\"regressionDegreeLabel\">Degree " + degree + "</span>" +
                "<span class=\"regressionDegreeError\">" + errorText + "</span>" +
                badge +
                "</div>";
        }
    }

    return "<div class=\"regressionDegreeSummaryTable\">" + rows + "</div>";
}

function populateDegreeSummary(candidateSession, options = {}) {
    document.getElementById("regressionDegreeSummary").innerHTML =
        buildDegreeSummaryHtml(candidateSession, options);
}

function getSelectionUiState(spotNo, candidateSession, highlightedDegree) {
    const defaultDegree = highlightedDegree ??
        candidateSession.recommendedDegree ??
        [2, 3, 4].find((degree) => candidateSession.regressionsByDegree[degree] !== undefined) ??
        null;

    return {
        spotNo,
        candidateSession,
        selectedDegree: defaultDegree
    };
}

function refreshSelectionUi(selectionUiState) {
    const { spotNo, candidateSession, selectedDegree } = selectionUiState;

    populateDegreeSummary(candidateSession, {
        selectable: true,
        selectedDegree,
        recommendedDegree: candidateSession.recommendedDegree
    });

    document.querySelectorAll("#regressionDegreeSummary .regressionDegreeRow[data-degree]").forEach(function(rowElement) {
        rowElement.addEventListener("click", function() {
            const degree = Number.parseInt(rowElement.dataset.degree, 10);
            if(candidateSession.regressionsByDegree[degree] === undefined)
                return;

            selectionUiState.selectedDegree = degree;
            refreshSelectionUi(selectionUiState);
            populateRegressionPlot(
                candidateSession.calibPoints,
                candidateSession.targetPoints,
                candidateSession.regressionsByDegree,
                degree
            );
        });
    });

    const recommendationElement = document.getElementById("regressionRecommendation");
    recommendationElement.classList.remove("regressionRecommendationError");
    if(candidateSession.recommendedDegree !== null) {
        recommendationElement.innerText = "Lowest error: degree " + candidateSession.recommendedDegree +
            ". Select a candidate to preview on the plot, then test it on stage.";
    }
    else {
        recommendationElement.innerText = "No regression candidates available.";
    }

    const actionsElement = document.getElementById("regressionSelectionActions");
    actionsElement.innerHTML = "";

    const testButton = document.createElement("button");
    testButton.type = "button";
    testButton.className = "button-green";
    testButton.innerText = selectedDegree === null ?
        "Test selected degree" :
        "Test degree " + selectedDegree;
    testButton.disabled = selectedDegree === null;
    testButton.addEventListener("click", function() {
        if(selectionUiState.selectedDegree !== null)
            global.testRegressionDegree(spotNo, selectionUiState.selectedDegree);
    });
    actionsElement.appendChild(testButton);

    const skipButton = document.createElement("button");
    skipButton.type = "button";
    skipButton.innerText = "Skip results";
    skipButton.addEventListener("click", function() {
        global.skipRegressionSelection();
    });
    actionsElement.appendChild(skipButton);

    populateRegressionPlot(
        candidateSession.calibPoints,
        candidateSession.targetPoints,
        candidateSession.regressionsByDegree,
        selectedDegree
    );
}

function populateSelectionActions(spotNo, candidateSession, highlightedDegree) {
    document.getElementById("regressionDegreeSummary").classList.remove("hidden");
    global.regressionSelectionUiState = getSelectionUiState(spotNo, candidateSession, highlightedDegree);
    refreshSelectionUi(global.regressionSelectionUiState);
}

function populateRegressionPlot(calibPoints, targetPoints, regressionsByDegree, activeDegree) {
    const plotLanding = document.getElementById("regressionPlotLanding");
    plotLanding.innerHTML = "";
    plotLanding.appendChild(buildRegressionPlotSvg(
        calibPoints,
        targetPoints,
        regressionsByDegree,
        activeDegree
    ));
}

/** @param {number} spotNo @param {import('./FollowJSRegression').RegressionCandidateSession} candidateSession @param {2|3|4|null} [highlightedDegree] */
function showRegressionSelectionOverlay(spotNo, candidateSession, highlightedDegree = null) {
    global.regressionSelectionFailed = false;
    document.getElementById("regressionRecommendation").classList.remove("regressionRecommendationError");
    global.mainView.hideAllContextMenus();
    setOverlayMode("selection");
    document.getElementById("regressionOverlaySpotNo").innerText = spotNo.toString();
    populateSelectionActions(spotNo, candidateSession, highlightedDegree);
    document.getElementById("regressionOverlay").classList.remove("hidden");
}

function populateFailedRegressionPlot(calibPoints, targetPoints) {
    const plotLanding = document.getElementById("regressionPlotLanding");
    plotLanding.innerHTML = "";

    if(calibPoints === undefined || calibPoints.length === 0) {
        plotLanding.innerHTML = "<p class=\"regressionPlotEmptyMessage\">No calibration points to display.</p>";
        return;
    }

    plotLanding.appendChild(buildRegressionPlotSvg(calibPoints, targetPoints, {}, null));
}

function showRegressionSelectionFailedOverlay(spotNo, message, candidateSession = null) {
    global.regressionSelectionFailed = true;
    global.regressionSelectionSession = null;
    global.regressionSelectionUiState = null;

    global.mainView.hideAllContextMenus();
    setOverlayMode("selection");
    document.getElementById("regressionOverlaySpotNo").innerText = spotNo.toString();
    document.getElementById("regressionRecommendation").innerText = message;
    document.getElementById("regressionRecommendation").classList.add("regressionRecommendationError");
    document.getElementById("regressionRecommendation").classList.remove("hidden");
    document.getElementById("regressionDegreeSummary").innerHTML = "";
    document.getElementById("regressionDegreeSummary").classList.add("hidden");
    document.getElementById("regressionCoefficients").classList.add("hidden");

    populateFailedRegressionPlot(
        candidateSession?.calibPoints,
        candidateSession?.targetPoints
    );

    const actionsElement = document.getElementById("regressionSelectionActions");
    actionsElement.innerHTML = "";
    actionsElement.classList.remove("hidden");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.innerText = "Close";
    closeButton.addEventListener("click", function() {
        global.regressionView.closeRegressionOverlay();
    });
    actionsElement.appendChild(closeButton);

    document.getElementById("regressionOverlay").classList.remove("hidden");
}

/** @param {number} spotNo @param {Array<[number, number]|null>} calibrationValues */
function showRegressionSelectionOverlayFromCalibration(spotNo, calibrationValues) {
    let candidateSession;

    try {
        candidateSession = regression.buildRegressionCandidateSession(calibrationValues);
    }
    catch(error) {
        showRegressionSelectionFailedOverlay(
            spotNo,
            "No regression was possible: " + error.message
        );
        return;
    }

    if(candidateSession.recommendedDegree === null) {
        showRegressionSelectionFailedOverlay(
            spotNo,
            "No regression was possible. There were not enough valid calibration points or no stable polynomial fit for degrees 2–4.",
            candidateSession
        );
        return;
    }

    global.regressionSelectionSession = {
        spotNo,
        candidateSession
    };
    showRegressionSelectionOverlay(spotNo, candidateSession, null);
}

function populateRegressionOverlay(spot) {
    setOverlayMode("view");
    document.getElementById("regressionOverlaySpotNo").innerText = spot.spotNumber.toString();
    document.getElementById("regressionRecommendation").classList.add("hidden");
    document.getElementById("regressionSelectionActions").classList.add("hidden");
    document.getElementById("regressionCoefficients").classList.remove("hidden");
    document.getElementById("regressionCoefficients").innerText = formatRegressionSummary(spot);

    const lastCalibration = spot.config.translation.lastCalibration;
    const plotLanding = document.getElementById("regressionPlotLanding");
    plotLanding.innerHTML = "";

    if(lastCalibration === undefined || lastCalibration.calibPoints === undefined || lastCalibration.calibPoints.length === 0) {
        document.getElementById("regressionDegreeSummary").innerHTML = "";
        document.getElementById("regressionDegreeSummary").classList.add("hidden");
        plotLanding.innerText = "No stored calibration points. Run calibration to generate a plot.";
        return;
    }

    let candidateSession = {
        calibPoints: lastCalibration.calibPoints,
        targetPoints: lastCalibration.targetPoints,
        errorsByDegree: lastCalibration.errorsByDegree ?? {},
        regressionsByDegree: lastCalibration.regressionsByDegree,
        recommendedDegree: regression.selectBestRegressionDegree(lastCalibration.errorsByDegree ?? {})
    };

    if(candidateSession.regressionsByDegree === undefined) {
        const candidates = regression.buildRegressionCandidates(lastCalibration.calibPoints, lastCalibration.targetPoints);
        candidateSession.regressionsByDegree = candidates.regressionsByDegree;
        candidateSession.errorsByDegree = candidates.errorsByDegree;
        candidateSession.recommendedDegree = regression.selectBestRegressionDegree(candidates.errorsByDegree);
    }

    const activeDegree = regression.normalizeRegression(spot.config.translation.regression).degree;
    document.getElementById("regressionDegreeSummary").classList.remove("hidden");
    populateDegreeSummary(candidateSession, {
        selectable: false,
        activeDegree,
        recommendedDegree: candidateSession.recommendedDegree
    });

    populateRegressionPlot(
        lastCalibration.calibPoints,
        lastCalibration.targetPoints,
        candidateSession.regressionsByDegree,
        activeDegree
    );
}

/**
 * Open read-only regression overlay for spot's stored coefficients.
 * @param {number} spotNo
 */
function showRegressionOverlay(spotNo) {
    const spot = global.getSpot(spotNo);
    if(spot === undefined)
        return;

    global.mainView.hideAllContextMenus();
    populateRegressionOverlay(spot);
    document.getElementById("regressionOverlay").classList.remove("hidden");
}

/** Hide overlay; calls skipRegressionSelection when a selection session is active. */
function closeRegressionOverlay() {
    if(global.regressionSelectionFailed) {
        global.regressionSelectionFailed = false;
        document.getElementById("regressionOverlay").classList.add("hidden");
        return;
    }

    if(global.regressionSelectionSession !== undefined && global.regressionSelectionSession !== null) {
        global.skipRegressionSelection();
        return;
    }

    global.regressionSelectionUiState = null;
    document.getElementById("regressionOverlay").classList.add("hidden");
}

module.exports = {
    showRegressionOverlay,
    showRegressionSelectionOverlay,
    showRegressionSelectionFailedOverlay,
    showRegressionSelectionOverlayFromCalibration,
    closeRegressionOverlay,
    populateRegressionOverlay
};
