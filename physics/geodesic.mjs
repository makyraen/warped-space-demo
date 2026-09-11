// Schwarzschild timelike geodesics, G=c=1. L is per unit rest mass.
// This module is used by both the application and numerical validation.
export function geodesicRadialAccel(r, L, M) {
    const invR = 1 / r;
    return -M * invR * invR + L * L * invR * invR * invR
        - 3 * M * L * L * invR * invR * invR * invR;
}

export function geodesicEnergySquared(g, M) {
    return g.vr * g.vr + (1 - 2 * M / g.r) * (1 + g.L * g.L / (g.r * g.r));
}

export function advanceGeodesic(g, M, dtau, {
    angleRule = 'trapezoid', innerRadius = 0, outerRadius = Infinity,
} = {}) {
    if (angleRule !== 'trapezoid' && angleRule !== 'right-endpoint') {
        throw new Error('Unknown angular quadrature: ' + angleRule);
    }
    const rBefore = g.r;
    g.vr += geodesicRadialAccel(g.r, g.L, M) * dtau / 2;
    g.r += g.vr * dtau;
    let boundary = null;
    if (g.r > outerRadius) {
        g.r = outerRadius;
        if (g.vr > 0) g.vr *= -0.8;
        boundary = 'outer';
    }
    if (g.r < innerRadius) {
        g.r = innerRadius;
        g.vr = 0;
        boundary = 'inner';
    }
    const omegaAfter = g.L / (g.r * g.r);
    g.phi += dtau * (angleRule === 'trapezoid'
        ? (g.L / (rBefore * rBefore) + omegaAfter) / 2
        : omegaAfter);
    g.vr += geodesicRadialAccel(g.r, g.L, M) * dtau / 2;
    return boundary;
}
