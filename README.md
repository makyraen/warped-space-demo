# Warped Space — live demo and measurement harness

Real-time browser comparison of a Plummer-softened Newtonian orbit mode and a Schwarzschild-based mode, with no installation.

**Live demo → https://makyraen.github.io/warped-space-demo/**

In the Schwarzschild mode, the deformed surface is the Flamm paraboloid — the isometric embedding of the `t=const` equatorial slice of the Schwarzschild solution — evaluated per vertex in a GLSL vertex shader, using only the central mass; orbiting bodies are noninteracting test particles and do not deform it. Orbital motion advances the reduced radial equation of an equatorial timelike geodesic with a fixed-step kick–drift–kick scheme, while the azimuth is obtained by separate quadrature (not a symplectic leapfrog over the full orbit). A single control switches surface and motion together between this and a Plummer-softened Newtonian reference mode, so the two can be contrasted on the same screen placement — though each mode reinitializes its own dynamical state, so this is not a comparison of identical physical conditions.

## Controls

| | |
|---|---|
| `C` | switch model (rubber sheet ↔ Flamm) |
| `V` | switch view (god ↔ first person) |
| `M` | place a mass — hold and release to set its mass |
| `1`–`5` | place that many masses at once |
| `R` | fixed preset ↔ random placement |
| right click | delete a mass (the central one defines the geometry and is kept) |
| `W A S D` | move in first-person view |

## Contents

| Path | What it is |
|---|---|
| `index.html`, `main.js` | the application itself |
| `measurements/*.mjs` | the harness that produces the reported numbers |
| `measurements/results/*.json` | raw output of those runs |

## Reproducing the measurements

The harness drives the application's own functions through a `window.__warped` hook that only opens when the page is loaded with `?debug`. How much each script reuses varies: the integrator-accuracy and mode-contrast scripts call the application's own `computeAcceleration()` / `updateMassPhysics()` / `initGeodesic()` directly; the precession script builds its own stepping loop around a reduced acceleration function so it can toggle the relativistic correction term on and off (something the application itself has no switch for), and first verifies that function matches the application's `geodesicRadialAccel()` to floating-point precision. See `measurements/README.md` for the full breakdown.

```bash
git clone --branch gh-pages --single-branch https://github.com/makyraen/warped-space-demo.git
cd warped-space-demo
npm ci --prefix measurements
npx --prefix measurements playwright install chromium

python3 -m http.server 8777          # serve this directory, in another terminal
node measurements/energy_drift.mjs   # integrator accuracy (energy error)
node measurements/convergence.mjs    # integrator convergence order
node measurements/precession.mjs     # periapsis precession
ROUNDS=10 SEED=20260828 node measurements/performance.mjs   # render-loop interval (run headed; see below)
node measurements/mode_contrast.mjs  # Newtonian vs. relativistic trajectory contrast
```

The default branch (`main`) carries only a placeholder; the source and measurement scripts live on `gh-pages`, hence `--branch gh-pages` above.

Things to know before comparing your output to `results/`:

- **Initial conditions must be pinned.** Orbit setup draws the angular-momentum factor from a random number, so any quantitative run has to overwrite `geo = {r, phi, vr, L}` explicitly. The scripts do this; ad-hoc runs that skip it will not reproduce.
- **Performance figures are environment-bound.** The reported numbers (Apple M4 Max, Chromium, headed, vsync disabled) are a `requestAnimationFrame` callback interval, not an isolated GPU execution time, and were taken on that specific machine — expect different absolute numbers elsewhere. Headless Chromium falls back to a software rasterizer and reports roughly two orders of magnitude worse, which is why `performance.mjs` checks the renderer string and warns. A physical display that goes to sleep mid-run can also change the composited path; hold it awake (e.g. `caffeinate -d -i -s` on macOS) while measuring. Firefox/WebKit lack the vsync-disable flags used for Chromium, so running `BROWSER=firefox` there measures the display's native refresh rate, not throughput — not directly comparable to the Chromium numbers.

## Notes and limitations

In the Schwarzschild mode, only the central mass contributes to the rendered surface and to the orbital dynamics; additional masses are test particles that do not deform the surface or interact with each other or the centre. The Newtonian reference mode's surface is a Plummer-softened potential graph, not an isometric embedding of physical space, and its orbiting bodies genuinely interact via Plummer-softened pairwise forces (aside from the fixed centre). The first-person view is an exploration interface — its motion is a Newtonian approximation even in the relativistic model, not a geodesic free-fall.

The Flamm paraboloid embeds a *spatial* slice, not spacetime. Free fall draws substantially on the curvature of time, so this picture is not a complete account of gravity on its own.
