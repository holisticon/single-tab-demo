# Central Single Tab Application and Integrated Satellite System

A small TypeScript web app where the first tab registers as the primary. Later instances automatically send it a startup message and close after receipt confirmation.

The repository also includes [Integrated Satellite System](tab-launcher/README.md), a static launcher with a message field that opens Central Single Tab Application in a new tab and attaches the message to its URL.

Requires Node.js 22.18 or newer. Install development dependencies from the repository root:

```sh
npm install
```

Build and start the app:

```sh
npm start
```

Open http://localhost:3000. This first tab becomes the primary and displays an inbox. Select **Open another tab**: the new instance discovers the primary, sends a startup message, and closes after receiving an acknowledgement. The same happens when opening Central Single Tab Application from Integrated Satellite System. Choose the same group key to connect instances, or different keys to keep them separate.

By default, the startup message is `Another instance of Central Single Tab Application was opened.` Supply a `message` query parameter to send different text, for example `http://localhost:3000/?key=main-tab-demo&message=Opened%20from%20satellite`.

If receipt is not confirmed within five seconds, the new instance stays open and reports the unconfirmed delivery. Browsers may refuse to close tabs opened through browser controls; after confirmed delivery, such instances disconnect and show a manual-close notice. [Browser closing restrictions](https://developer.mozilla.org/en-US/docs/Web/API/Window/close)

To run the second app, keep the first server running and use a separate terminal from the repository root:

```sh
npm run start:launcher
```

Open http://localhost:3001/, enter a message, and submit the form. It opens the first app at http://localhost:3000/ in a new tab with `key=main-tab-demo` and the URL-encoded `message` parameter. Both apps use TypeScript tooling and `http-server`; the launcher needs no browser JavaScript.

Web Locks register exactly one primary per group; later tabs queue for that role while delivering their startup message. A duplicate cancels its queued registration after confirmed delivery. If the primary disappears before acknowledgement, a waiting instance can become primary and stays open. BroadcastChannel carries messages addressed to the primary. Received data stays in memory; the app never reads or writes sessionStorage. Past messages are not copied to new tabs or to a replacement primary. See [implementation notes](sync-tabs/README.md).

Use a browser with Web Locks and BroadcastChannel support over HTTPS or localhost. Tabs must share the same origin, browser storage partition, and group key. The `http-server` npm module serves the built app on the loopback interface with caching disabled. Restart the server after editing source files to rebuild the app.

Application code lives in `sync-tabs/src/`, tests in `sync-tabs/tests/`, and static assets in `sync-tabs/public/`. The build compiles TypeScript and copies static assets into the generated `sync-tabs/dist/` directory. There are no runtime package dependencies.

Available commands:

| Command                  | Purpose                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm start`              | Build and serve Central Single Tab Application on port 3000.                                    |
| `npm run start:launcher` | Build and serve Integrated Satellite System on port 3001.                                       |
| `npm run build`          | Build both apps.                                                                                |
| `npm run check`          | Strictly type-check application code, tests, and build scripts in both apps.                    |
| `npm test`               | Test registration, delivery, startup handoff, closing, timeouts, takeover, and group isolation. |
| `npm run format`         | Format source, styles, markup, and configuration with Prettier.                                 |
| `npm run format:check`   | Check formatting without changing files.                                                        |
