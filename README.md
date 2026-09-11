# carbonxmod.github.io

Isomorphic M-Audio Oxygen mod

## Local preview

Serve this directory with a static server, for example `python -m http.server 4173`.
The checked-in site is ready to serve; no build is needed to view it.

## 3D assembly animation

The scroll-driven sequence sits just below the intro. The brace slides in first,
then the key arrives. The sequence inserts the 1.1 mm retaining wire,
fits the two buttons one at a time, fills an octave, and
extends the pattern across four octaves. Scroll upward to reverse it. The stage
buttons allow jumping between steps; reduced-motion mode presents static views.
Each step has its own progress segment. Highlights follow the displayed frame,
using the shared stage timings in `src/assembly-stages.js`.
GSAP ScrollTrigger scrubs a sequence of rendered 3D frames while CSS keeps the
product in view. No WebGL is needed in the visitor's browser. Without JavaScript,
a completed 3D note and the finished photograph remain visible.

`src/assembly-scene.js` uses Three.js and the four original STL meshes in `files/preview/`.
`assets/assembly-placements.json` records the part translations from
`files/carbonXmod.step`, in millimetres. That CAD file contains 12 keys,
24 buttons, and one brace. Octaves repeat at 162 mm; the wire passes through
the CAD hinge at Y = 2.5 mm, Z = 26.3 mm.

The motion illustrates assembly and does not simulate
flexing, contact, or snap fits.

After editing the scroll behaviour in `src/assembly.js`:

```sh
pnpm install
pnpm build
```

After changing the 3D scene, regenerate the wide and narrow WebP sequences:

```sh
pnpm exec playwright install chromium
pnpm render:assembly
pnpm build
```

To use a system Chromium, set `CHROMIUM_PATH=/usr/bin/chromium` when running
`pnpm render:assembly`. The renderer starts and stops its own local server.

Commit the generated `assets/assembly-frames/`, rebuilt `assets/assembly.js`,
and its license comments alongside the source. The browser only loads nearby
frames and retains a small decoded working set. GSAP is bundled locally;
Three.js is used at build time (see `assets/THREE-LICENSE.txt`).

Run `pnpm test:assembly` to check pinned scrolling, reverse playback, mobile,
reduced motion, and previews without WebGL or a web server. The test also accepts
`CHROMIUM_PATH` and starts its own server.
