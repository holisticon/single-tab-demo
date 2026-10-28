# Integrated Satellite System

A static HTML page linking to Central Single Tab Application at http://localhost:3000/?key=main-tab-demo. The explicit group key, `main-tab-demo`, matches Central Single Tab Application's default. The link opens a new tab using `target="_blank"` and `rel="noopener noreferrer"`. There is no browser JavaScript.

If a primary Central Single Tab Application is already open in that group, the new tab sends it a startup message and closes after acknowledgement. Otherwise the new tab registers as primary and stays open.

Uses the repository's Node.js 22.18+, TypeScript, npm workspaces, Prettier, and `http-server` setup. The TypeScript build script copies `public/` into the generated `dist/` directory.

Install dependencies from the repository root with `npm install`. Start the first app in one terminal:

```sh
npm start
```

Start the launcher in another terminal, also from the repository root:

```sh
npm run start:launcher
```

Open http://localhost:3001/ and follow the link. Both servers must be running. If the first app is hosted elsewhere, update the static link in `public/index.html` before building.
