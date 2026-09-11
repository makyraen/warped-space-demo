# Warped Space

A browser application for comparing Plummer-softened Newtonian orbits with Schwarzschild test-particle geodesics and a Flamm surface.

[Open the demo](https://makyraen.github.io/warped-space-demo/)

Place masses, switch models with **C**, change the view with **V**, and reset with **R**. The interface also provides buttons and mass presets. Planar placement is preserved when switching models; physical initial conditions are not matched between the two models.

## Run locally and reproduce the experiments

Clone the `gh-pages` branch, open its folder, and run `node serve.mjs` with Node.js 20 or later. Visit `http://127.0.0.1:8777/`. The app loads pinned Three.js and GSAP versions from CDNs and requires internet access.

The [measurement instructions](measurements/README.md) describe package installation, the numerical experiments, performance measurements, and data verification. App physics is shared with the measurement code through `physics/geodesic.mjs`. Radial motion uses fixed-step kick–drift–kick integration and azimuth uses trapezoidal quadrature. The independent trajectory reference uses a Darwin-parameter representation and SciPy DOP853.

For the archived data checks, run:

```text
node measurements/verify-results.mjs --data-only
```

The numerical comparison covers nine bound orbits over approximately six radial periods. Current performance data were collected in headless Edge on a Windows PC with Intel integrated graphics. Round-average callback interval medians were 2.79–3.01 ms, while the largest pooled p95 was 17.33 ms. These are browser callback intervals, not GPU timings or a guarantee of uniform 60 Hz presentation.

## Model limits

In Schwarzschild mode, one fixed central mass determines the surface and orbital dynamics. Other bodies are noninteracting test particles. The Flamm paraboloid displays a spatial slice. It does not represent all of spacetime or determine the geodesic motion by its shape alone. The first-person camera uses approximate exploratory motion.

The Newtonian mode uses Plummer-softened forces. Its displayed surface is a potential graph. Inner-radius adjustments and outer boundary reflections are interface constraints; trajectories affected by them are not free geodesics. The reported numerical trajectory checks avoid these boundaries.

The optional `?studyModel=RUBBER` and `?studyModel=FLAMM` addresses lock the selected model. Their switching behavior has been checked automatically. No participant usability or learning-effect results are reported.

This public repository contains the deployed app, measurement code, and numerical data. The manuscript, private project notes, reference PDFs, and participant-study planning documents are maintained separately.
