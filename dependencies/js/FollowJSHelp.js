"use strict";

/**
 * @file Help overlay: keyboard and gamepad control reference.
 */

const XBOX_BUTTON_NAMES = {
    0: "A",
    1: "B",
    2: "X",
    3: "Y",
    4: "LB",
    5: "RB",
    6: "LT",
    7: "RT",
    8: "View",
    9: "Menu (Start)",
    10: "Left stick click",
    11: "Right stick click",
    12: "D-pad Up",
    13: "D-pad Down",
    14: "D-pad Left",
    15: "D-pad Right",
    16: "Guide (Xbox)"
};

function formatKeyLabel(key) {
    const labels = {
        ArrowUp: "↑",
        ArrowDown: "↓",
        ArrowLeft: "←",
        ArrowRight: "→",
        Enter: "Enter",
        Escape: "Esc"
    };
    return labels[key] || key.toUpperCase();
}

function gamepadButtonLabel(index) {
    return XBOX_BUTTON_NAMES[index] ?? ("Btn " + index);
}

function buildHelpSection(title, rows) {
    let html = '<section class="helpSection"><h4 class="helpSectionTitle">' + title + '</h4><table class="helpTable"><tbody>';
    for(const row of rows) {
        html += '<tr><th scope="row">' + row[0] + '</th><td>' + row[1] + '</td></tr>';
    }
    return html + '</tbody></table></section>';
}

function getReferenceGamepadMapping() {
    let mapping = gamepadLib.xboxOneControllerDefault.mapping.legacy;
    let firstSpot = global.spots !== undefined ? global.spots.find((spot) => spot !== undefined) : undefined;
    if(firstSpot !== undefined && firstSpot.control !== undefined && firstSpot.control.gamepad !== undefined)
        mapping = firstSpot.control.gamepad.mapping;
    return mapping;
}

function buildKeyboardHelpHtml() {
    let mapping = systemConf.keyboardControl.mapping;
    let spotNumbers = global.getSortedSpotNumbers();
    let spotRange = spotNumbers.length > 0
        ? "1–" + Math.min(8, spotNumbers[spotNumbers.length - 1])
        : "1–8";

    let targetRows = [
        ["Virtual marker mode", "Keyboard always controls the virtual marker"],
        ["0 (direct mode)", "No keyboard control"],
        [spotRange + " (direct mode)", "Select spot to control with keyboard"]
    ];

    let controlRows = [
        [formatKeyLabel(mapping.yInc) + " / " + formatKeyLabel(mapping.yDec), "Pan tilt up / down"],
        [formatKeyLabel(mapping.xDec) + " / " + formatKeyLabel(mapping.xInc), "Pan tilt left / right"],
        [formatKeyLabel(mapping.smaller) + " / " + formatKeyLabel(mapping.bigger), "Iris smaller / larger"],
        [formatKeyLabel(mapping.dimDown) + " / " + formatKeyLabel(mapping.dimUp), "Dimmer down / up"],
        [formatKeyLabel(mapping.prevColor) + " / " + formatKeyLabel(mapping.nextColor), "Color wheel prev / next (when CTO off)"],
        [formatKeyLabel(mapping.home), "Home position"],
        [formatKeyLabel(mapping.snap), "Shutter open / close"],
        [formatKeyLabel(mapping.cto), "CTO filter on / off"]
    ];

    let calibRows = [
        [formatKeyLabel(mapping.storeCalibrationPoint), "Store calibration point"],
        [formatKeyLabel(mapping.skipCalibrationPoint), "Skip calibration point"],
        ["(any time)", "While calibrating, keys control that very spot"]
    ];

    let pointerRows = [
        ["Drag (VM mode)", "Move virtual marker on the video"],
        ["Drag (direct mode)", "Move individual spot markers"],
        ["Click", "Open spot context menu"],
        ["⋮ in footer", "Spot menu (macros, calibrate, save home)"]
    ];

    return buildHelpSection("Target selection", targetRows)
        + buildHelpSection("Movement &amp; beam", controlRows)
        + buildHelpSection("During calibration", calibRows)
        + buildHelpSection("Mouse / touch", pointerRows);
}

function axisLabel(axisIndex) {
    const names = {
        0: "Left stick X",
        1: "Left stick Y",
        2: "Right stick X",
        3: "Right stick Y"
    };
    return names[axisIndex] ?? ("Axis " + axisIndex);
}

/** Roles bound to a stick axis index in the active gamepad mapping. */
function getAxisRoles(axisIndex, axes) {
    let roles = [];
    if(axes.x === axisIndex)
        roles.push("pan");
    if(axes.y === axisIndex)
        roles.push("tilt");
    if(axes.r === axisIndex)
        roles.push("iris");
    if(axes.dim === axisIndex)
        roles.push("dimmer");
    return roles.length > 0 ? roles.join(" + ") : "—";
}

function buildGamepadSchematic(gp) {
    let buttons = gp.buttons;
    let analogButtons = gp.analogButtons;
    let axes = gp.axes;
    let dpadLabel = gamepadButtonLabel(buttons.focusUp) + " / " + gamepadButtonLabel(buttons.focusDown)
        + " · " + gamepadButtonLabel(buttons.colorWheelPrev) + " / " + gamepadButtonLabel(buttons.colorWheelNext);

    return ''
        + '<div class="helpGamepadSchematic" aria-hidden="true">'
        + '<div class="helpPadMapTitle">Quick map</div>'
        + '<div class="helpPadMapBody">'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(analogButtons.faster) + ' (hold)</span><span>Faster movement</span></div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(buttons.frostDown) + ' / ' + gamepadButtonLabel(buttons.frostUp) + ' (hold)</span><span>Frost down / up</span></div>'
        + '<div class="helpPadMapSticks">'
        + '  <div class="helpPadMapStick"><strong>Left stick</strong>'
        + '    <div>X · ' + getAxisRoles(0, axes) + '</div>'
        + '    <div>Y · ' + getAxisRoles(1, axes) + '</div>'
        + '  </div>'
        + '  <div class="helpPadMapStick"><strong>Right stick</strong>'
        + '    <div>X · ' + getAxisRoles(2, axes) + '</div>'
        + '    <div>Y · ' + getAxisRoles(3, axes) + '</div>'
        + '  </div>'
        + '</div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">D-pad</span><span>Focus ↑↓ (hold), color ←→</span></div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(buttons.snap) + '</span><span>Shutter on / off</span></div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(buttons.snapCTO) + '</span><span>CTO filter on / off</span></div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(buttons.home) + '</span><span>Home position</span></div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(buttons.contextMenuShow) + '</span><span>Spot context menu</span></div>'
        + '<div class="helpPadMapRow"><span class="helpPadMapKey">' + gamepadButtonLabel(buttons.storeCalibrationPoint) + ' / ' + gamepadButtonLabel(buttons.skipCalibrationPoint) + '</span><span>Store / skip calib. point</span></div>'
        + '</div>'
        + '<div class="helpPadMapHint">Labels from the first spot&apos;s mapping · ' + dpadLabel + '</div>'
        + '</div>';
}

function buildGamepadHelpHtml() {
    let gp = getReferenceGamepadMapping();
    let buttons = gp.buttons;
    let analogButtons = gp.analogButtons;
    let axes = gp.axes;

    let assignmentRows = [
        ["Mode switch (video)", "Virtual marker vs direct control"],
        ["Footer table", "Lists each connected pad (index, ID, type)"],
        ["Virtual marker mode", "Pad 0 controls the virtual marker"],
        ["Direct mode", "Pad 0 → spot 1, pad 1 → spot 2, …"],
        ["During calibration", "First connected pad controls the spot being calibrated"]
    ];

    let stickRows = [
        [axisLabel(axes.x) + " + " + axisLabel(axes.y), "Pan / tilt"],
        [axisLabel(axes.r), "Iris (beam size)"],
        [axisLabel(axes.dim), "Dimmer"],
        [gamepadButtonLabel(analogButtons.faster) + " (hold)", "Move faster"],
        [gamepadButtonLabel(buttons.frostDown) + " / " + gamepadButtonLabel(buttons.frostUp), "Frost down / up (hold)"]
    ];

    let buttonRows = [
        [gamepadButtonLabel(buttons.home), "Home position"],
        [gamepadButtonLabel(buttons.snap), "Shutter open / close"],
        [gamepadButtonLabel(buttons.snapCTO), "CTO filter on / off"],
        [gamepadButtonLabel(buttons.colorWheelPrev) + " / " + gamepadButtonLabel(buttons.colorWheelNext), "Color wheel prev / next (when CTO off)"],
        [gamepadButtonLabel(buttons.focusDown) + " / " + gamepadButtonLabel(buttons.focusUp) + " (hold)", "Focus down / up"],
        [gamepadButtonLabel(buttons.contextMenuShow), "Open / close spot context menu"],
        [gamepadButtonLabel(buttons.contextMenuUp) + " / " + gamepadButtonLabel(buttons.contextMenuDown), "Menu item up / down (tap; same as D-pad)"],
        [gamepadButtonLabel(buttons.contextMenuSelect), "Run highlighted macro"],
        [gamepadButtonLabel(buttons.contextMenuCancel), "Close context menu"]
    ];

    let calibRows = [
        [gamepadButtonLabel(buttons.storeCalibrationPoint), "Store calibration point (A)"],
        [gamepadButtonLabel(buttons.skipCalibrationPoint), "Skip calibration point (B)"]
    ];

    return buildGamepadSchematic(gp)
        + buildHelpSection("Control mode", assignmentRows)
        + buildHelpSection("Sticks &amp; triggers", stickRows)
        + buildHelpSection("Buttons", buttonRows)
        + buildHelpSection("During calibration", calibRows);
}

function ensureHelpContent() {
    let keyboardColumn = document.getElementById("helpKeyboardColumn");
    let gamepadColumn = document.getElementById("helpGamepadColumn");
    if(keyboardColumn === null || gamepadColumn === null)
        return;

    keyboardColumn.innerHTML = '<div class="helpColumnInner"><h3 class="helpColumnTitle">Keyboard</h3>' + buildKeyboardHelpHtml() + '</div>';
    gamepadColumn.innerHTML = '<div class="helpColumnInner"><h3 class="helpColumnTitle">Gamepad</h3>' + buildGamepadHelpHtml() + '</div>';
}

function closeHelpOverlay() {
    let overlay = document.getElementById("helpOverlay");
    if(overlay !== null)
        overlay.classList.add("hidden");
}

function toggleHelpOverlay() {
    let overlay = document.getElementById("helpOverlay");
    if(overlay === null)
        return;
    if(overlay.classList.contains("hidden")) {
        ensureHelpContent();
        overlay.classList.remove("hidden");
    }
    else {
        closeHelpOverlay();
    }
}

function initHelpOverlay() {
    let overlay = document.getElementById("helpOverlay");
    if(overlay === null)
        return;
    overlay.addEventListener("click", (event) => {
        if(event.target === overlay)
            closeHelpOverlay();
    });
    document.addEventListener("keydown", (event) => {
        if(event.key === "Escape" && !overlay.classList.contains("hidden"))
            closeHelpOverlay();
    });
}

module.exports = {
    initHelpOverlay,
    toggleHelpOverlay,
    closeHelpOverlay
};
