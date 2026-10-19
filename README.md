# Warped Space

A browser application for comparing Plummer-softened Newtonian orbits with Schwarzschild test-particle geodesics and a Flamm surface.

[Open the demo](https://makyraen.github.io/warped-space-demo/)

Place masses, switch models with **C**, change the view with **V**, add a mass with **M**, place preset masses with **1~5**, and toggle fixed/random placement with **R**. **Reset All** clears the scene. Planar placement is preserved when switching models; physical initial conditions are not matched between the two models.

## Run locally

Clone the `gh-pages` branch, open its folder, and run `node serve.mjs` with Node.js 20 or later. Visit `http://127.0.0.1:8777/`. The app loads pinned Three.js and GSAP versions from CDNs and requires internet access.

## Model limits

In Schwarzschild mode, one fixed central mass determines the surface and orbital dynamics. Other bodies are noninteracting test particles. Radial motion uses fixed-step kick-drift-kick integration and azimuth uses trapezoidal quadrature. The Flamm paraboloid displays a spatial slice. It does not represent all of spacetime or determine the geodesic motion by its shape alone. The first-person camera uses approximate exploratory motion.

The Newtonian mode uses Plummer-softened forces. Its displayed surface is a potential graph. Inner-radius adjustments and outer boundary reflections are interface constraints; trajectories affected by them are not free geodesics.

This public repository contains the deployed app only. Measurement code and numerical data are available from the authors on request.
