# Tab Sync Lab

A TypeScript browser app with no runtime package dependencies that registers one main tab per group and delivers data from secondary tabs to it.

Install dependencies with `npm install` from the repository root. Requires Node.js 22.18 or newer. Run `npm start` in this directory to build and serve the app with the `http-server` npm module, then open http://localhost:3000. The first tab displays the main inbox. Use **Open another tab** to open a sender, enter data, and press **Send to main tab**. Change the group key and press **Connect** to join a different group.

Edit TypeScript in `src/` and static assets in `public/`. `npm run build` generates browser JavaScript and copies assets into `dist/`. Restart after edits to rebuild; `dist/` is generated output and should not be edited directly. Tests and the asset-copy script use Node's built-in TypeScript support.

`MainTabConnection` in `src/main-tab.ts` holds an exclusive Web Lock named for the group. The first request gets the lock; later requests wait in order. Closing the connection aborts a queued request or releases a held lock. The browser also releases locks when a tab is destroyed. Heartbeats update the visible tab list; Web Locks control ownership, so a delayed heartbeat cannot elect a second main tab.

New tabs discover the main tab through BroadcastChannel announcements. `send(value)` sends a message addressed to its ID, and only that tab processes it and returns an acknowledgement. BroadcastChannel is a group transport, so this routing is not an access boundary between group members. The UI confirms delivery only after an acknowledgement, or reports an unconfirmed receipt after five seconds. Messages are not queued for retries or replayed after a main-tab change.

The main inbox keeps up to 100 received messages in memory. Reloading or changing groups clears it. A returning tab registers again and joins the end of the lock queue. The app never reads or writes sessionStorage or localStorage. It does not copy drafts, past messages, or storage data between tabs.

Browsers must support Web Locks and BroadcastChannel; use HTTPS or localhost. Tabs must use the same origin, browser storage partition, and group key. If a main tab is suspended, it retains its lock until the browser releases it; messages wait for that tab to run again rather than causing a second main tab to be elected.

Run `npm run check` for strict type checks and `npm test` for registration and messaging tests. Tests model FIFO Web Locks on Node 22 and also exercise native Web Locks when available. Formatting commands are available from the repository root; see the [root README](../README.md).
