# Inter-tab communication compatibility

Support data was checked against Can I Use on 27 October 2026. Updated for the simplified protocol on 30 October 2026.

Only two browser APIs are required for communication:

| Technology                                               | Purpose                                                                               | Chrome | Edge | Firefox | Safari | iOS Safari |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | ---- | ------- | ------ | ---------- |
| [Web Locks](https://caniuse.com/mdn-api_lockmanager)     | Check registration once with `ifAvailable: true`; hold the lock if no primary exists. | 69+    | 79+  | 96+     | 15.4+  | 15.4+      |
| [BroadcastChannel](https://caniuse.com/broadcastchannel) | Send the payload to the existing primary.                                             | 54+    | 79+  | 38+     | 15.4+  | 15.4+      |

There are no discovery messages, acknowledgements, heartbeats, departure messages, or takeover queues. Crypto.randomUUID() and AbortController are no longer used.

## Communication API baseline

The highest required API version per browser gives this inferred baseline:

| Browser    | Minimum version | Stable release date                                                                                         | Limiting API                   |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Chrome     | 69              | [4 September 2018](https://chromereleases.googleblog.com/2018/09/stable-channel-update-for-desktop.html)    | Web Locks                      |
| Edge       | 79              | [15 January 2020](https://blogs.windows.com/msedgedev/2020/01/15/upgrading-new-microsoft-edge-79-chromium/) | Web Locks and BroadcastChannel |
| Firefox    | 96              | [11 January 2022](https://www.firefox.com/en-US/firefox/96.0/releasenotes/)                                 | Web Locks                      |
| Safari     | 15.4            | [14 March 2022](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes)   | Web Locks and BroadcastChannel |
| iOS Safari | 15.4            | [14 March 2022](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes)   | Web Locks and BroadcastChannel |

Dates indicate the initial stable release, with links to official release information. This table covers API availability, not tests of historical browsers or the complete application's syntax and styling. The ES2022 build preserves public class fields, with partial Safari support before 16. HAP foundation additionally uses modern CSS, including native nesting and `light-dark()`. [Public class fields support](https://caniuse.com/mdn-javascript_classes_public_class_fields)

Safari 16 was released on [12 September 2022](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/).

## Operating requirements

- Use HTTPS or localhost: Web Locks requires a secure context. [Web Locks documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- Tabs must share the same origin, storage partition, and group key. [BroadcastChannel documentation](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- Registration is checked once. An existing primary does not reply to that check; the browser returns whether the exclusive lock is available.
- The sender closes after posting the payload. Sending is best-effort: no receipt or retry is exchanged.
- Browser restrictions can prevent automatic closing; the instance disconnects and displays a manual-close notice. [Window.close() documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/close)
- Messages stay in memory. No sessionStorage or localStorage data is copied.
