# Tab Sync Lab

A small TypeScript web app for syncing a sessionStorage key between tabs.

Requires Node.js 22.18 or newer. Install development dependencies from the repository root:

```sh
npm install
```

Build and start the app:

```sh
npm start
```

Open http://localhost:3000 and select **Open another tab**. Type in either tab to synchronize the value. Choose the same storage key to connect tabs, or different keys to keep them separate. The `http-server` npm module serves the built app on the loopback interface with caching disabled. Restart the server after editing source files to rebuild the app.

`sessionStorage` is isolated per tab, so the app uses `BroadcastChannel` to relay updates and writes the synchronized value into each tab’s sessionStorage. See [implementation notes](sync-tabs/README.md).

Application code lives in `sync-tabs/src/`, tests in `sync-tabs/tests/`, and static assets in `sync-tabs/public/`. The build compiles TypeScript and copies static assets into the generated `sync-tabs/dist/` directory. There are no runtime package dependencies.

Available commands:

| Command                | Purpose                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`        | Compile browser modules and copy static assets.                                                                            |
| `npm run check`        | Strictly type-check application code, tests, and build scripts.                                                            |
| `npm test`             | Test synchronization, new-tab hydration, reload recovery, concurrent edits, clearing, key isolation, and storage failures. |
| `npm run format`       | Format source, styles, markup, and configuration with Prettier.                                                            |
| `npm run format:check` | Check formatting without changing files.                                                                                   |
