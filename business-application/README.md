# business-application

Use the [root instructions](../README.md#start) to start both applications.

1. Open http://localhost:3001.
2. Enter a message.
3. Select **Open central-tasklist**.

The GET form opens the central application in a new tab. It sets `key=main-tab-demo` and puts the encoded text in `message`.

If a primary exists, the new tab sends its relative URL (including the query string and fragment) and requests to close. Otherwise, the new tab becomes primary.

The page uses HTML, HAP foundation styles, and no browser JavaScript.

Change the form's `action` in [public/index.html](public/index.html) if the central address changes. Rebuild the application after this change.
