"use strict";

/**
 * @file debug only — temporary Art-Net universe matrix overlay (disabled by default).
 * Enable: uncomment markup in main.html and hooks in follow.js.
 */

let overlayVisible = false;
let gridBuilt = false;
let transmitCount = 0;
let cellElements = [];

function ensureGrid() {
    if(gridBuilt)
        return;
    let grid = document.getElementById("artNetDebugGrid");
    if(grid === null)
        return;

    let html = "";
    for(let channel = 1; channel <= 512; channel++) {
        html += '<div class="artNetDebugCell" id="artNetDebugCh' + channel + '" data-channel="' + channel + '">'
            + '<span class="artNetDebugChNo">' + channel + "</span>"
            + '<span class="artNetDebugChVal">0</span>'
            + "</div>";
    }
    grid.innerHTML = html;
    cellElements = [];
    for(let channel = 1; channel <= 512; channel++) {
        let cell = document.getElementById("artNetDebugCh" + channel);
        if(cell !== null)
            cellElements[channel - 1] = cell;
    }
    gridBuilt = true;
}

function isOverlayVisible() {
    let overlay = document.getElementById("artNetDebugOverlay");
    if(overlay === null)
        return false;
    return overlayVisible && !overlay.classList.contains("hidden");
}

/**
 * Refresh matrix from the frame bytes packed into the UDP packet.
 * @param {number[]|Uint8Array} frame 512-channel universe buffer.
 * @param {number} [sequence] Art-Net DMX sequence byte for this packet.
 */
function onArtNetTransmit(frame, sequence) {
    if(!isOverlayVisible())
        return;
    ensureGrid();
    if(frame === undefined || frame === null)
        return;

    transmitCount++;
    let counter = document.getElementById("artNetDebugTransmitCount");
    if(counter !== null) {
        let seqLabel = Number.isFinite(sequence) ? " seq:" + sequence : "";
        counter.textContent = "tx: " + transmitCount + seqLabel;
    }

    for(let i = 0; i < 512; i++) {
        let cell = cellElements[i];
        if(cell === undefined)
            continue;
        let value = frame[i];
        if(value === undefined || value === null || !Number.isFinite(value))
            value = 0;
        else
            value = Math.max(0, Math.min(255, Math.floor(value)));

        let valueEl = cell.querySelector(".artNetDebugChVal");
        if(valueEl !== null)
            valueEl.textContent = String(value);

        cell.classList.toggle("artNetDebugCellActive", value !== 0);
    }
}

function closeArtNetDebugOverlay() {
    let overlay = document.getElementById("artNetDebugOverlay");
    if(overlay === null)
        return;
    overlay.classList.add("hidden");
    overlayVisible = false;
}

function openArtNetDebugOverlay() {
    let overlay = document.getElementById("artNetDebugOverlay");
    if(overlay === null)
        return;
    overlay.classList.remove("hidden");
    overlayVisible = true;
    ensureGrid();
}

function initArtNetDebugOverlay() {
    ensureGrid();
}

module.exports = {
    initArtNetDebugOverlay,
    onArtNetTransmit,
    closeArtNetDebugOverlay,
    openArtNetDebugOverlay
};
