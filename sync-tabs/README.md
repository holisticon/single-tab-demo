# Tab Sync Lab

A TypeScript browser app with no runtime package dependencies that synchronizes a configurable sessionStorage key across same-origin tabs using BroadcastChannel.

Install dependencies with `npm install` from the repository root. Requires Node.js 22.18 or newer. Run `npm start` in this directory to build and serve the app with the `http-server` npm module, then open http://localhost:3000. Use **Open another tab** and type in either editor. Change the key and press **Connect** to join a different group.

Edit TypeScript in `src/` and static assets in `public/`. `npm run build` generates browser JavaScript and copies assets into `dist/`. Restart after edits to rebuild; `dist/` is generated output and should not be edited directly. Tests and the asset-copy script use Node's built-in TypeScript support.

Each key stores a JSON envelope `{ value, clock, writer }`. All application writes go through `SessionSync.set()`. Direct DevTools `sessionStorage.setItem()` calls are not observed. New tabs request existing state, reloads restore their own state, and concurrent writes converge using a logical clock and writer ID. Clear broadcasts an empty value so stale peers cannot restore the old value. A heartbeat reconciles returning tabs and expires disconnected peers after approximately 15 seconds.

Storage stays within the browser session; there is no backend or localStorage persistence. Tabs must use the same origin, browser storage partition, and key. Browser session restoration may preserve sessionStorage. Private hosted access does not change these browser rules.

Run `npm run check` for strict type checks and `npm test` for synchronization tests. Formatting commands are available from the repository root; see the [root README](../README.md).
