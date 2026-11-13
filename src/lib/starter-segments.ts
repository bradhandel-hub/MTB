// The first 10 Trail Club segments, picked by the group. The admin page imports
// these from Strava in one click; after that the copy in our database is the
// official version (start/finish can be adjusted without touching Strava).
export const STARTER_SEGMENTS: { name: string; stravaId: number }[] = [
  { name: "Hobo", stravaId: 17969543 },
  { name: "Alchemist Climb", stravaId: 18410450 },
  { name: "Eclipse Climb", stravaId: 34303561 },
  { name: "Split Rock", stravaId: 9087084 },
  { name: "Solstice", stravaId: 3788676 },
  { name: "Cake Boss", stravaId: 38918969 },
  { name: "Happersberger", stravaId: 925819 },
  { name: "1000 S's", stravaId: 4457654 },
  { name: "Tammoflomeless", stravaId: 42295799 },
  { name: "Tammo Ro/ck", stravaId: 39824583 },
];
