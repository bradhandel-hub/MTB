"use client";

import { useRouter } from "next/navigation";
import TrailMap, { type MapSegment } from "./TrailMap";

export default function HomeMap({ segments, selected, bike }: { segments: MapSegment[]; selected: number | null; bike: string }) {
  const router = useRouter();
  return (
    <TrailMap
      className="map"
      segments={segments}
      highlightId={selected}
      padding={{ top: 90, bottom: 150, left: 30, right: 30 }}
      zoomToHighlight={false}
      onSelect={(id) => router.replace(`/?seg=${id}${bike !== "all" ? `&bike=${bike}` : ""}`, { scroll: false })}
    />
  );
}
