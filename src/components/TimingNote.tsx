/** Short, expandable explanation of how Trail Club times rides vs Strava. */
export default function TimingNote() {
  return (
    <details className="timing-note">
      <summary>How timing works vs. Strava</summary>
      <p>
        Trail Club times every ride itself from your GPS track, so times usually match Strava or land within a second
        or two.
      </p>
      <ul>
        <li>
          <b>One official version of each trail.</b> Strava has several versions of most segments. We use one, so
          everyone is timed on the same line.
        </li>
        <li>
          <b>Race-style timing.</b> The clock starts the last time you cross the start line heading down the trail and
          stops the first time you cross the finish. Waiting for friends at the top doesn’t count.
        </li>
        <li>
          <b>Fair to every device.</b> We estimate the exact moment you crossed each line between GPS points, so a phone
          isn’t penalized next to an Apple Watch.
        </li>
        <li>
          <b>Ride the actual trail.</b> Cutting a switchback or taking a shortcut doesn’t count.
        </li>
      </ul>
      <p>
        Time looks off or a ride is missing? Paste its Strava link into <a href="/me#missing">Me → Missing a ride?</a>
      </p>
    </details>
  );
}
