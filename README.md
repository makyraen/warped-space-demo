# Warped Space — live demo and measurement harness

Real-time visualisation of Schwarzschild spatial curvature and geodesic motion, running in the browser with no installation.

**Live demo → https://makyraen.github.io/warped-space-demo/**

The deformed surface is the Flamm paraboloid, the isometric embedding of the equatorial slice of the Schwarzschild solution, evaluated per vertex in a GLSL vertex shader. Orbital motion comes from integrating the equatorial Schwarzschild geodesic equation with a symplectic leapfrog scheme. A single control switches surface and motion together between the Newtonian and relativistic formulations, so the two models can be contrasted on the same configuration.

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

The harness drives the application's own functions through a `window.__warped` hook that only opens when the page is loaded with `?debug`. Nothing is reimplemented for measurement: when integrators are compared, the force evaluation stays the application's `computeAcceleration()` and only the stepping scheme is swapped, so the comparison is controlled on the integrator alone.

```bash
git clone https://github.com/makyraen/warped-space-demo.git
cd warped-space-demo
npm install --prefix measurements
npx --prefix measurements playwright install chromium

python3 -m http.server 8777        # serve this directory
node measurements/energy_drift.mjs # integrator accuracy
node measurements/precession.mjs   # perihelion precession
node measurements/performance.mjs  # frame time (run headed; see below)
```

Two things to know before comparing your output to `results/`:

- **Initial conditions must be pinned.** Orbit setup draws the eccentricity factor from a random number, so any quantitative run has to overwrite `geo = {r, phi, vr, L}` explicitly. The scripts do this; ad-hoc runs that skip it will not reproduce.
- **Performance figures are GPU-bound and were taken on a specific machine** (GeForce GTX 1070, 1280×720, device pixel ratio 1). Headless Chromium falls back to a software rasteriser and reports roughly two orders of magnitude worse, which is why `performance.mjs` checks the renderer string and warns. Your numbers will differ; the other two scripts are pure numerical integration and are platform-independent.

## Notes and limitations

Multiple masses are a linear superposition, justified only in the weak field; the embedding and the motion are both exact only for a single central mass with a single test particle. Orbiting masses are test particles on that fixed background and do not perturb each other or the centre. The first-person view is an exploration interface — its motion is a Newtonian approximation even in the relativistic model.

The Flamm paraboloid embeds a *spatial* slice, not spacetime. Free fall draws substantially on the curvature of time, so this picture is not a complete account of gravity on its own.
