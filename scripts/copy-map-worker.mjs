// maplibre-gl runs its tile/GeoJSON parsing in a web worker loaded from a separate
// file. Bundlers can't serve it, so we copy it into public/ on install.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist";
const to = "public/maplibre";
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`${from}/${f}`, `${to}/${f}`);
