import type { StyleSpecification } from "maplibre-gl";

// "Redwood & Fog" dark topo map. Built from free, key-less sources:
//  - OpenFreeMap vector tiles (OpenStreetMap data: trails, roads, water, woods)
//  - AWS Terrain Tiles (elevation) for hill shading and contour lines
export const DEM_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

export const colors = {
  ground: "#0E1311",
  wood: "#132119",
  park: "#121c16",
  water: "#173540",
  contour: "#2a3a31",
  contourMajor: "#3a4d42",
  road: "#3d4943",
  trail: "#6b7a71",
  label: "#93A399",
  redwood: "#D0703F",
  fog: "#DCE3DE",
  gold: "#E6B85C",
  ebike: "#8DB8CC",
};

export function trailClubStyle(demTiles: string, contourTiles: string): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      osm: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      dem: { type: "raster-dem", tiles: [demTiles], encoding: "terrarium", tileSize: 256, maxzoom: 13 },
      contours: { type: "vector", tiles: [contourTiles], maxzoom: 15 },
    },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": colors.ground } },
      {
        id: "woods",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "forest"]]],
        paint: { "fill-color": colors.wood },
      },
      {
        id: "parks",
        type: "fill",
        source: "osm",
        "source-layer": "park",
        paint: { "fill-color": colors.park, "fill-opacity": 0.6 },
      },
      {
        id: "hillshade",
        type: "hillshade",
        source: "dem",
        paint: {
          "hillshade-exaggeration": 0.55,
          "hillshade-shadow-color": "#050807",
          "hillshade-highlight-color": "#2f3d35",
          "hillshade-accent-color": "#0b100d",
        },
      },
      { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": colors.water } },
      {
        id: "streams",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        paint: { "line-color": colors.water, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 2] },
      },
      {
        id: "contours",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        paint: {
          "line-color": ["match", ["get", "level"], 1, colors.contourMajor, colors.contour],
          "line-width": ["match", ["get", "level"], 1, 1.1, 0.6],
        },
      },
      {
        id: "contour-labels",
        type: "symbol",
        source: "contours",
        "source-layer": "contours",
        filter: [">", ["get", "level"], 0],
        layout: {
          "symbol-placement": "line",
          "text-field": ["concat", ["number-format", ["get", "ele"], {}], "'"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
        },
        paint: { "text-color": "#4f6157", "text-halo-color": colors.ground, "text-halo-width": 1.2 },
      },
      {
        id: "roads",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["!", ["in", ["get", "class"], ["literal", ["path", "track"]]]],
        paint: { "line-color": colors.road, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 3] },
      },
      {
        id: "trails",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
        paint: {
          "line-color": colors.trail,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.8],
          "line-dasharray": [2, 1.5],
        },
      },
      {
        id: "trail-names",
        type: "symbol",
        source: "osm",
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": colors.label, "text-halo-color": colors.ground, "text-halo-width": 1.5 },
      },
      {
        id: "places",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["town", "village", "suburb", "hamlet"]]],
        layout: {
          "text-field": ["upcase", ["get", "name"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-letter-spacing": 0.15,
        },
        paint: { "text-color": "#7b8b81", "text-halo-color": colors.ground, "text-halo-width": 1.5 },
      },
      {
        id: "peaks",
        type: "symbol",
        source: "osm",
        "source-layer": "mountain_peak",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Italic"],
          "text-size": 11,
        },
        paint: { "text-color": "#7b8b81", "text-halo-color": colors.ground, "text-halo-width": 1.5 },
      },
    ],
  };
}
