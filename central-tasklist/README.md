# central-tasklist

Use the [root instructions](../README.md#start) to start the applications.

## Communication walkthrough

All communication is in [tab-communication.ts](src/communication/tab-communication.ts). The module has no application imports or DOM dependencies.

1. Open a BroadcastChannel for the group.
2. Request the group lock with `ifAvailable: true`.
3. If the browser grants the lock, stay open as primary.
4. If another tab holds the lock, send the message through BroadcastChannel.

Only the primary processes incoming messages. The primary keeps the lock callback promise pending. `close()` resolves that promise and closes the channel.

```mermaid
sequenceDiagram
    participant N as New instance
    participant L as Web Locks
    participant P as Existing primary
    N->>L: Request registration with ifAvailable=true
    alt No primary exists
        L-->>N: Granted lock
        Note over N: Stay open as primary
    else A primary exists
        L-->>N: null
        N->>P: Broadcast payload
        Note over N: Disconnect and request window.close()
    end
```

The only message format is:

```ts
{ type: 'message', value: 'Message text' }
```

## Code structure

| File                                                           | Function                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [tab-communication.ts](src/communication/tab-communication.ts) | Register the tab, validate data, send messages, and release resources. |
| [startup-handoff.ts](src/startup-handoff.ts)                   | Keep the primary open. Send once and close a secondary.                |
| [app.ts](src/app.ts)                                           | Read URL parameters and control the interface.                         |

Use the communication module separately:

```ts
import { TabCommunication } from './src/communication/tab-communication.ts';

const tabs = new TabCommunication('main-tab-demo');
tabs.subscribe({
  onChange: () => {
    if (tabs.state === 'secondary') tabs.send('Message text');
  },
  onMessage: ({ value }) => console.log(value),
  onError: (error) => console.error(error),
});
```

Call `tabs.close()` when the application stops. Tests can supply `locks` and `createChannel` substitutes.

## URL parameters

| Parameter | Default                                            |
| --------- | -------------------------------------------------- |
| `key`     | `main-tab-demo`                                    |
| `message` | `Another instance of central-tasklist was opened.` |

## Limits

- Tabs must share the same origin, browser storage partition, and group key.
- Sending has no receipt confirmation or automatic retry. A message can be lost if the primary closes.
- Registration or send errors keep the tab open.
- The browser can prevent focus changes or tab closure. Close the secondary manually if necessary.
- The inbox holds up to 100 messages in memory. The application does not use sessionStorage or localStorage.
