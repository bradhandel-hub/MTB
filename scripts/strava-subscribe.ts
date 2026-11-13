// One-time setup: tells Strava to send ride events to this app's webhook.
// Run after deploying:  APP_URL=https://your-app STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... \
//                      STRAVA_WEBHOOK_VERIFY_TOKEN=... npm run strava:subscribe
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};

async function main() {
  const body = new URLSearchParams({
    client_id: need("STRAVA_CLIENT_ID"),
    client_secret: need("STRAVA_CLIENT_SECRET"),
    callback_url: `${need("APP_URL")}/api/strava/webhook`,
    verify_token: need("STRAVA_WEBHOOK_VERIFY_TOKEN"),
  });
  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", { method: "POST", body });
  const json = await res.json();
  console.log(res.status, json);
  if (res.ok) console.log(`\nSet STRAVA_SUBSCRIPTION_ID=${json.id} in your environment.`);
}

main();
