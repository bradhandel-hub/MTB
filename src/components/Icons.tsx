// Inline stroke icons, decorative unless given a label.
type P = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const MapIcon = ({ size = 22 }: P) => (<svg {...base(size)}><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></svg>);
export const FlagIcon = ({ size = 22 }: P) => (<svg {...base(size)}><path d="M5 21V4h12l-2.5 4L17 12H5" /></svg>);
export const GhostIcon = ({ size = 22 }: P) => (<svg {...base(size)}><circle cx="8" cy="14" r="3" /><circle cx="16" cy="10" r="3" /><path d="M3 20c4-2 6-8 18-14" /></svg>);
export const UserIcon = ({ size = 22 }: P) => (<svg {...base(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
export const BackIcon = ({ size = 20 }: P) => (<svg {...base(size)}><path d="M15 6l-6 6 6 6" /></svg>);
export const ChevronIcon = ({ size = 18 }: P) => (<svg {...base(size)}><path d="M9 6l6 6-6 6" /></svg>);
export const TrendIcon = ({ size = 20 }: P) => (<svg {...base(size)} stroke="var(--redwood)"><path d="M4 16l5-5 4 4 7-8" /><path d="M15 7h5v5" /></svg>);
export const CrownIcon = ({ size = 20 }: P) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="var(--gold)" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>);
export const BoltIcon = ({ size = 10 }: P) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>);
export const PlayIcon = ({ size = 14 }: P) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>);
export const PauseIcon = ({ size = 18 }: P) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>);
export const DotIcon = ({ size = 20 }: P) => (<svg {...base(size)} stroke="var(--muted)"><circle cx="12" cy="12" r="4" /></svg>);
