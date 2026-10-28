# Central Single Tab Application and Integrated Satellite System

A small TypeScript web app where the first tab registers as the main tab and later tabs send data to it.

The repository also includes [Integrated Satellite System](tab-launcher/README.md), a static launcher that opens Central Single Tab Application in a new tab.

Requires Node.js 22.18 or newer. Install development dependencies from the repository root:

```sh
npm install
```

Build and start the app:

```sh
npm start
```

Open http://localhost:3000. This first tab becomes the main tab and displays an inbox. Select **Open another tab**, enter a message in the secondary tab, and click **Send to main tab**. The main tab receives the data, and the sender gets a receipt confirmation. Choose the same group key to connect tabs, or different keys to keep them separate.

To run the second app, keep the first server running and use a separate terminal from the repository root:

```sh
npm run start:launcher
```

Open http://localhost:3001/. Its static HTML link opens the first app at http://localhost:3000/ in a new tab. Both apps use TypeScript tooling and `http-server`; the launcher needs no browser JavaScript.

Web Locks register exactly one main tab per group; later tabs queue for that role. If the main tab closes or leaves the group, the next waiting tab takes over. BroadcastChannel carries messages addressed to the main tab. Drafts and received data stay in memory; the app never reads or writes sessionStorage. Past messages are not copied to new tabs or to a replacement main tab. See [implementation notes](sync-tabs/README.md).

Use a browser with Web Locks and BroadcastChannel support over HTTPS or localhost. Tabs must share the same origin, browser storage partition, and group key. The `http-server` npm module serves the built app on the loopback interface with caching disabled. Restart the server after editing source files to rebuild the app.

Application code lives in `sync-tabs/src/`, tests in `sync-tabs/tests/`, and static assets in `sync-tabs/public/`. The build compiles TypeScript and copies static assets into the generated `sync-tabs/dist/` directory. There are no runtime package dependencies.

Available commands:

| Command                  | Purpose                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `npm start`              | Build and serve Central Single Tab Application on port 3000.                                                |
| `npm run start:launcher` | Build and serve Integrated Satellite System on port 3001.                                                   |
| `npm run build`          | Build both apps.                                                                                            |
| `npm run check`          | Strictly type-check application code, tests, and build scripts in both apps.                                |
| `npm test`               | Test main-tab registration, targeted delivery, receipts, takeover, group isolation, and late-tab discovery. |
| `npm run format`         | Format source, styles, markup, and configuration with Prettier.                                             |
| `npm run format:check`   | Check formatting without changing files.                                                                    |
