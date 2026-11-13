"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { colors, DEM_URL, trailClubStyle } from "./mapStyle";

export type MapSegment = { id: number; name: string; number: number; points: [number, number][] };
export type MapDot = { id: string; lat: number; lng: number; color: string; label: string };

type Props = {
  segments: MapSegment[];
  highlightId?: number | null;
  dots?: MapDot[];
  onSelect?: (id: number) => void;
  /** Extra space (px) around the segments when fitting the view, e.g. for a bottom sheet. */
  padding?: { top: number; bottom: number; left: number; right: number };
  interactive?: boolean;
  /** Zoom to the highlighted segment (true) or keep every segment in view (false). */
  zoomToHighlight?: boolean;
  className?: string;
};

// maplibre and the contour generator are browser-only, so they load on first use.
let setup: Promise<{ maplibregl: typeof import("maplibre-gl"); dem: string; contours: string }> | null = null;
function loadMapLib() {
  setup ??= (async () => {
    const maplibregl = await import("maplibre-gl");
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); // copied by scripts/copy-map-worker.mjs
    const mlcontour = (await import("maplibre-contour")).default;
    const demSource = new mlcontour.DemSource({ url: DEM_URL, encoding: "terrarium", maxzoom: 13, worker: false });
    demSource.setupMaplibre(maplibregl);
    const contours = demSource.contourProtocolUrl({
      multiplier: 3.28084, // feet
      thresholds: { 11: [200, 1000], 12: [100, 500], 13: [100, 500], 14: [50, 200], 15: [20, 100] },
      contourLayer: "contours",
      elevationKey: "ele",
      levelKey: "level",
    });
    return { maplibregl, dem: demSource.sharedDemProtocolUrl, contours };
  })();
  return setup;
}

const toLngLat = (p: [number, number]) => [p[1], p[0]];

function segmentsGeoJSON(segments: MapSegment[], highlightId?: number | null) {
  return {
    type: "FeatureCollection" as const,
    features: segments.map((s) => ({
      type: "Feature" as const,
      id: s.id,
      properties: { id: s.id, name: s.name, hl: s.id === highlightId ? 1 : 0 },
      geometry: { type: "LineString" as const, coordinates: s.points.map(toLngLat) },
    })),
  };
}

function pinsGeoJSON(segments: MapSegment[], highlightId?: number | null) {
  return {
    type: "FeatureCollection" as const,
    features: segments.flatMap((s) => [
      {
        type: "Feature" as const,
        properties: { id: s.id, label: String(s.number), hl: s.id === highlightId ? 1 : 0, end: 0 },
        geometry: { type: "Point" as const, coordinates: toLngLat(s.points[0]) },
      },
      {
        type: "Feature" as const,
        properties: { id: s.id, label: "", hl: s.id === highlightId ? 1 : 0, end: 1 },
        geometry: { type: "Point" as const, coordinates: toLngLat(s.points[s.points.length - 1]) },
      },
    ]),
  };
}

function dotsGeoJSON(dots: MapDot[]) {
  return {
    type: "FeatureCollection" as const,
    features: dots.map((d) => ({
      type: "Feature" as const,
      properties: { color: d.color, label: d.label },
      geometry: { type: "Point" as const, coordinates: [d.lng, d.lat] },
    })),
  };
}

export default function TrailMap({ segments, highlightId, dots, onSelect, padding, interactive = true, zoomToHighlight = true, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadMapLib().then(({ maplibregl, dem, contours }) => {
      if (cancelled || !el.current) return;
      const m = new maplibregl.Map({
        container: el.current,
        style: trailClubStyle(dem, contours),
        center: [-122.6, 37.99],
        zoom: 12,
        interactive,
        attributionControl: { compact: true },
      });
      map.current = m;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __tcMap?: MlMap }).__tcMap = m;
      // "style.load" (not "load") so our segment lines still draw if basemap tiles are slow or fail.
      m.once("style.load", () => {
        m.addSource("segments", { type: "geojson", data: segmentsGeoJSON(segments, highlightId) });
        m.addSource("pins", { type: "geojson", data: pinsGeoJSON(segments, highlightId) });
        m.addSource("dots", { type: "geojson", data: dotsGeoJSON(dots ?? []) });
        m.addLayer({
          id: "seg-casing",
          type: "line",
          source: "segments",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": colors.ground, "line-width": ["case", ["==", ["get", "hl"], 1], 9, 6] },
        });
        m.addLayer({
          id: "seg-line",
          type: "line",
          source: "segments",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["case", ["==", ["get", "hl"], 1], colors.redwood, highlightId ? "#7d8a82" : colors.redwood],
            "line-width": ["case", ["==", ["get", "hl"], 1], 5, 3.5],
          },
        });
        m.addLayer({
          id: "seg-hit",
          type: "line",
          source: "segments",
          paint: { "line-color": "#000", "line-opacity": 0, "line-width": 24 },
        });
        m.addLayer({
          id: "pin-end",
          type: "circle",
          source: "pins",
          filter: ["==", ["get", "end"], 1],
          paint: { "circle-radius": 4, "circle-color": colors.ground, "circle-stroke-color": colors.fog, "circle-stroke-width": 2 },
        });
        m.addLayer({
          id: "pin-start",
          type: "circle",
          source: "pins",
          filter: ["==", ["get", "end"], 0],
          paint: {
            "circle-radius": ["case", ["==", ["get", "hl"], 1], 13, 11],
            "circle-color": ["case", ["==", ["get", "hl"], 1], colors.redwood, "#172019"],
            "circle-stroke-color": ["case", ["==", ["get", "hl"], 1], colors.redwood, "#93A399"],
            "circle-stroke-width": 1.5,
          },
        });
        m.addLayer({
          id: "pin-label",
          type: "symbol",
          source: "pins",
          filter: ["==", ["get", "end"], 0],
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
          paint: { "text-color": ["case", ["==", ["get", "hl"], 1], colors.ground, colors.fog] },
        });
        m.addLayer({
          id: "dots",
          type: "circle",
          source: "dots",
          paint: { "circle-radius": 9, "circle-color": ["get", "color"], "circle-stroke-color": colors.ground, "circle-stroke-width": 3 },
        });
        m.addLayer({
          id: "dot-labels",
          type: "symbol",
          source: "dots",
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 11,
            "text-variable-anchor": ["bottom", "top", "left", "right"],
            "text-radial-offset": 1.1,
          },
          paint: { "text-color": ["get", "color"], "text-halo-color": colors.ground, "text-halo-width": 2 },
        });
        for (const layer of ["seg-hit", "pin-start"]) {
          m.on("click", layer, (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (id != null) onSelectRef.current?.(Number(id));
          });
          m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
        }
        loaded.current = true;
        fit(m, segments, zoomToHighlight ? highlightId : null, padding);
      });
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      loaded.current = false;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current) return;
    (m.getSource("segments") as GeoJSONSource).setData(segmentsGeoJSON(segments, highlightId));
    (m.getSource("pins") as GeoJSONSource).setData(pinsGeoJSON(segments, highlightId));
    m.setPaintProperty("seg-line", "line-color", [
      "case",
      ["==", ["get", "hl"], 1],
      colors.redwood,
      highlightId ? "#7d8a82" : colors.redwood,
    ]);
  }, [segments, highlightId]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current) return;
    (m.getSource("dots") as GeoJSONSource).setData(dotsGeoJSON(dots ?? []));
  }, [dots]);

  return <div ref={el} className={className} role="region" aria-label="Trail map" />;
}

function fit(m: MlMap, segments: MapSegment[], highlightId: number | null | undefined, padding?: Props["padding"]) {
  const pts = (highlightId ? segments.filter((s) => s.id === highlightId) : segments).flatMap((s) => s.points);
  if (!pts.length) return;
  let [minLat, minLng, maxLat, maxLng] = [90, 180, -90, -180];
  for (const [lat, lng] of pts) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  m.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: padding ?? 40, duration: 0, maxZoom: 16 },
  );
}
