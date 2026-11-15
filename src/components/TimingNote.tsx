/** Short, expandable explanation of how Trail Club times rides vs Strava. */
export default function TimingNote() {
  return (
    <details className="timing-note">
      <summary>How timing works vs. Strava</summary>
      <ul>
        <li>
          <b>Times come from Strava.</b> Each Trail Club segment is one specific Strava segment (linked at the top of
          its page), and your time is Strava’s time for that run. It should match your history on that segment.
        </li>
        <li>
          <b>One official version of each trail.</b> Strava has several versions of most trails. If yours look
          different, check you’re comparing the same segment.
        </li>
        <li>
          <b>Trails Strava won’t time</b> (some steep descents Strava marks “hazardous”) are timed by Trail Club from
          your GPS, race-style: start line to finish line.
        </li>
        <li>
          <b>Which rides count:</b> bike rides since Nov 1, 2025, shared with Followers or Everyone. Rides set to “Only
          you” stay private.
        </li>
      </ul>
      <p>
        Ride missing or a time looks off? Paste its Strava link into <a href="/me#missing">Me → Missing a ride?</a>
      </p>
    </details>
  );
}
