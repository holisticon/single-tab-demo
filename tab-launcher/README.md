# Integrated Satellite System

A static HTML page with a message field and a GET form that opens Central Single Tab Application in a new tab. The form includes `key=main-tab-demo`, matching Central Single Tab Application's default group, and attaches the field's contents as the `message` query parameter. The browser encodes spaces, special characters, and Unicode automatically. For example, entering `Hello world` opens `http://localhost:3000/?key=main-tab-demo&message=Hello+world`.

Submitting requires a nonempty message. The form uses `target="_blank"` and `rel="noopener noreferrer"`. There is no browser JavaScript.

If a primary Central Single Tab Application is already open in that group, the new tab sends it a startup message and closes after acknowledgement. Otherwise the new tab registers as primary and stays open.

Uses the repository's Node.js 22.18+, TypeScript, npm workspaces, Prettier, and `http-server` setup. The TypeScript build script copies `public/` into the generated `dist/` directory.

Styling declares published npm package `@holisticon/hap-foundation` 2.0.0 for typography, text fields, buttons, and tokens. The build includes the npm-installed foundation CSS and the shared app stylesheet, so the satellite matches the central application.

Install dependencies from the repository root with `npm install`. Start the first app in one terminal:

```sh
npm start
```

Start the launcher in another terminal, also from the repository root:

```sh
npm run start:launcher
```

Open http://localhost:3001/, enter a message, and select **Open Central Single Tab Application**. Both servers must be running. If the first app is hosted elsewhere, update the form's `action` in `public/index.html` before building.
