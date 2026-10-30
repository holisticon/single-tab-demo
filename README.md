# Central Single Tab Application and Integrated Satellite System

This repository contains two technical demonstration applications.

| Application                    | Address               | Function                                                |
| ------------------------------ | --------------------- | ------------------------------------------------------- |
| Central Single Tab Application | http://localhost:3000 | Register a primary tab and receive messages.            |
| Integrated Satellite System    | http://localhost:3001 | Open the central application with a message in the URL. |

## Requirements

- Node.js 22.18 or later, with npm.
- A browser that supports Web Locks and BroadcastChannel.
- HTTPS or localhost.

## Start

Run these commands from the repository root.

1. Install the packages:

   ```sh
   npm install
   ```

2. Start the central application:

   ```sh
   npm start
   ```

3. Start the satellite application in a second terminal:

   ```sh
   npm run start:launcher
   ```

4. Open http://localhost:3001.
5. Enter a message.
6. Select **Open Central Single Tab Application**.

The first central tab stays open as primary. Each later tab sends its message to the primary and requests to close.

## Development

| Command                | Function                                             |
| ---------------------- | ---------------------------------------------------- |
| `npm run build`        | Build both applications.                             |
| `npm run check`        | Check TypeScript types.                              |
| `npm test`             | Test registration, message sending, and tab closure. |
| `npm run format`       | Format the files.                                    |
| `npm run format:check` | Check file format.                                   |

Restart the servers after source changes. Builds write files to each application's `dist/` directory.

Both applications use `@holisticon/hap-foundation` 2.0.0. Shared styles are in `styles/hap-app.css`. The npm cache is in `.npm-cache/`.

## Application details

- [Central application and communication](sync-tabs/README.md)
- [Satellite application](tab-launcher/README.md)
- [Browser compatibility](docs/inter-tab-communication.md)
