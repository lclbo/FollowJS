"use strict";

function forwardRegression(regression, x, y) {
    let x2 = x * x;
    let y2 = y * y;
    let a = regression.a;
    let b = regression.b;

    return [
        a[0] + (a[1] * x) + (a[2] * y) + (a[3] * x * y) + (a[4] * x2) + (a[5] * y2),
        b[0] + (b[1] * x) + (b[2] * y) + (b[3] * x * y) + (b[4] * x2) + (b[5] * y2)
    ];
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function inverseRegression(regression, targetPosX, targetPosY, startX, startY, boundaries) {
    let x = startX;
    let y = startY;
    let a = regression.a;
    let b = regression.b;

    for(let iteration = 0; iteration < 25; iteration++) {
        let pos = forwardRegression(regression, x, y);
        let errorX = pos[0] - targetPosX;
        let errorY = pos[1] - targetPosY;

        if(Math.abs(errorX) < 1e-6 && Math.abs(errorY) < 1e-6)
            break;

        let dfx_dx = a[1] + (a[3] * y) + (2 * a[4] * x);
        let dfx_dy = a[2] + (a[3] * x) + (2 * a[5] * y);
        let dfy_dx = b[1] + (b[3] * y) + (2 * b[4] * x);
        let dfy_dy = b[2] + (b[3] * x) + (2 * b[5] * y);
        let determinant = (dfx_dx * dfy_dy) - (dfx_dy * dfy_dx);

        if(Math.abs(determinant) < 1e-12)
            break;

        x -= ((errorX * dfy_dy) - (errorY * dfx_dy)) / determinant;
        y -= ((dfx_dx * errorY) - (dfy_dx * errorX)) / determinant;

        x = clamp(x, boundaries.x.min, boundaries.x.max);
        y = clamp(y, boundaries.y.min, boundaries.y.max);
    }

    return [x, y];
}

function screenPixelsToRegressionCoords(leftPx, topPx, xImgMax, yImgMax) {
    return [
        leftPx / xImgMax,
        1 - (topPx / yImgMax)
    ];
}

module.exports = {
    forwardRegression,
    inverseRegression,
    screenPixelsToRegressionCoords
};
