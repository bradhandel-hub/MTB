import Link from "next/link";
import { BoltIcon, FlagIcon, GhostIcon, MapIcon, UserIcon } from "./Icons";
import type { Bike } from "@/lib/queries";
import type { DateRange } from "@/lib/seasons";

export function BottomNav({ active }: { active: "map" | "segments" | "ghost" | "me" }) {
  const items = [
    { key: "map", href: "/", label: "Map", Icon: MapIcon },
    { key: "segments", href: "/segments", label: "Segments", Icon: FlagIcon },
    { key: "ghost", href: "/ghost", label: "Ghost", Icon: GhostIcon },
    { key: "me", href: "/me", label: "Me", Icon: UserIcon },
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Builds a link to the same page with some query params changed. */
export function withParams(path: string, current: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

export function BikeToggle({ bike, href }: { bike: Bike; href: (b: Bike) => string }) {
  return (
    <div className="seg-toggle" role="group" aria-label="Bike type">
      <Link href={href("analog")} aria-current={bike === "analog" ? "true" : undefined}>Analog</Link>
      <Link href={href("ebike")} className="ebike" aria-current={bike === "ebike" ? "true" : undefined}>E-bike</Link>
      <Link href={href("all")} aria-current={bike === "all" ? "true" : undefined}>All</Link>
    </div>
  );
}

export function RangeTabs({ tabs, active, href }: { tabs: DateRange[]; active: string; href: (key: string) => string }) {
  return (
    <div className="pills" role="group" aria-label="Time range">
      {tabs.map((t) => (
        <Link key={t.key} href={href(t.key)} className="pill" aria-current={t.key === active ? "true" : undefined}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function EBadge() {
  return (
    <span className="e-badge" title="E-bike">
      <BoltIcon />E
    </span>
  );
}

export function KindTag({ kind }: { kind: string }) {
  return <span className={`tag ${kind}`}>{kind}</span>;
}

export function Avatar({ rider }: { rider: { first_name: string; last_name: string; avatar_url?: string | null } }) {
  const init = (rider.first_name[0] ?? "") + (rider.last_name[0] ?? "");
  return (
    <span className="avatar" aria-hidden="true">
      {rider.avatar_url && !rider.avatar_url.includes("avatar/athlete") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rider.avatar_url} alt="" />
      ) : (
        init
      )}
    </span>
  );
}

export const parseBike = (v: string | undefined, fallback: Bike = "all"): Bike =>
  v === "analog" || v === "ebike" || v === "all" ? v : fallback;
