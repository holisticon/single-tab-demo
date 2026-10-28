# Central Single Tab Application

A TypeScript browser app with no runtime package dependencies that keeps one primary tab per group. New instances automatically send their startup message to the primary and close after receipt confirmation.

Install dependencies with `npm install` from the repository root. Requires Node.js 22.18 or newer. Run `npm start` in this directory to build and serve the app with the `http-server` npm module, then open http://localhost:3000. The first tab displays the primary inbox. Use **Open another tab** to test automatic startup handoff: the new instance sends a message and closes after acknowledgement. Change the group key and press **Connect** to join a different group.

Edit TypeScript in `src/` and static assets in `public/`. `npm run build` generates browser JavaScript and copies assets into `dist/`. Restart after edits to rebuild; `dist/` is generated output and should not be edited directly. Tests and the asset-copy script use Node's built-in TypeScript support.

`MainTabConnection` in `src/main-tab.ts` holds an exclusive Web Lock named for the group. The first request gets the lock; later requests wait in order. Closing the connection aborts a queued request or releases a held lock. The browser also releases locks when a tab is destroyed. Heartbeats update the visible tab list; Web Locks control ownership, so a delayed heartbeat cannot elect a second main tab.

New tabs discover the primary through BroadcastChannel announcements. `send(value)` sends a message addressed to its ID, and only that tab processes it and returns an acknowledgement. BroadcastChannel is a group transport, so this routing is not an access boundary between group members.

`handoffOnStartup()` in `src/startup-handoff.ts` waits for the registration result. If this instance becomes primary, it stays open. Otherwise it sends exactly one startup message and waits for the matching acknowledgement. Confirmed delivery closes its connection, cancels its queued lock request, and calls `window.close()`. If the primary disappears and this instance takes over before acknowledgement, it remains open as primary.

The default message is `Another instance of Central Single Tab Application was opened.` An optional `message` query parameter supplies custom text. No message is automatically sent by the first primary.

If discovery or acknowledgement times out after five seconds, the instance stays open and reports that delivery could not be confirmed. Reload to try again. A late acknowledgement after timeout does not close it. Messages are not automatically retried or replayed after a primary change.

Browsers can refuse `window.close()` for tabs opened through browser controls. After successful delivery, the page shows that the user can close it manually if it remains open. The instance has already disconnected, so it cannot later take over as primary. [Window.close() documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/close)

The primary inbox keeps up to 100 received messages in memory. Reloading or changing groups clears it. A returning tab registers again and runs the startup check. The app never reads or writes sessionStorage or localStorage. It does not copy past messages or storage data between tabs.

Tab titles show `Primary` or `Secondary` and update automatically when a tab takes over as main. The main tab requests focus when it receives a message. Browsers may ignore the request. Messages received while the tab is hidden or unfocused add an unread count to its title. Returning focus to the visible tab clears the count, as does leaving the group.

Browsers must support Web Locks and BroadcastChannel; use HTTPS or localhost. Tabs must use the same origin, browser storage partition, and group key. If a main tab is suspended, it retains its lock until the browser releases it; messages wait for that tab to run again rather than causing a second main tab to be elected.

Run `npm run check` for strict type checks and `npm test` for registration and messaging tests. Tests model FIFO Web Locks on Node 22 and also exercise native Web Locks when available. Formatting commands are available from the repository root; see the [root README](../README.md).
