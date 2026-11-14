// / — the public landing page. The console lives at /app.
// The nav reads "Open the demo" or "Open dashboard" depending on the wallet session.

import { Landing } from "./components/Landing";

export default function Home() {
  return <Landing />;
}
