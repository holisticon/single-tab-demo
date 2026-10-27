# Inter-tab communication compatibility

Checked against Can I Use on 27 October 2026. This list covers the browser APIs used for primary-tab registration, discovery, message delivery, and takeover.

| Browser technology                                                   | Purpose                                                                                                                                        | Chrome | Edge | Firefox | Safari | iOS Safari |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ------- | ------ | ---------- |
| [Web Locks API](https://caniuse.com/mdn-api_lockmanager)             | Register one primary tab per group. Secondary tabs wait for the exclusive lock and take over when it is released.                              | 69+    | 79+  | 96+     | 15.4+  | 15.4+      |
| [BroadcastChannel](https://caniuse.com/broadcastchannel)             | Announce tabs, discover the primary, send messages addressed to it, and return receipt acknowledgements.                                       | 54+    | 79+  | 38+     | 15.4+  | 15.4+      |
| [Crypto.randomUUID()](https://caniuse.com/mdn-api_crypto_randomuuid) | Generate tab identifiers for routing and message identifiers for matching acknowledgements.                                                    | 92+    | 92+  | 95+     | 15.4+  | 15.4+      |
| [AbortController / AbortSignal](https://caniuse.com/abortcontroller) | Cancel a secondary tab's queued lock request when it disconnects. An acquired lock is released separately by resolving its callback's promise. | 66+    | 16+  | 57+     | 12.1+  | 11.3+      |

## Communication API baseline

Taking the highest required version in each browser gives the following inferred baseline:

| Browser    | Minimum version | Stable release date                                                                                       | Limiting API                                     |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Chrome     | 92              | [20 July 2021](https://chromereleases.googleblog.com/2021/07/stable-channel-update-for-desktop_20.html)   | Crypto.randomUUID()                              |
| Edge       | 92              | [22 July 2021](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-release-schedule)              | Crypto.randomUUID()                              |
| Firefox    | 96              | [11 January 2022](https://www.firefox.com/en-US/firefox/96.0/releasenotes/)                               | Web Locks                                        |
| Safari     | 15.4            | [14 March 2022](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes) | Web Locks, BroadcastChannel, Crypto.randomUUID() |
| iOS Safari | 15.4            | [14 March 2022](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes) | Web Locks, BroadcastChannel, Crypto.randomUUID() |

Dates indicate the initial stable release of each baseline version; rollouts may have continued afterward. Each date links to an official release announcement, release note, or release schedule.

These are API compatibility requirements, not results from testing historical browser versions. They exclude the application's JavaScript syntax and styling requirements. In particular, the current ES2022 build preserves public class fields, which Can I Use marks as partially supported in Safari before 16. Safari 16+ remains the conservative baseline for the complete application. [Public class fields support](https://caniuse.com/mdn-javascript_classes_public_class_fields)

Safari 16 was released on **12 September 2022** for macOS Monterey, macOS Big Sur, and iOS 16. [Official release announcement](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)

## Operating requirements

- Serve over HTTPS or localhost: Web Locks and Crypto.randomUUID() require a secure context. [Web Locks documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [Crypto.randomUUID() documentation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
- Tabs must share the same origin, storage partition, and application group key. BroadcastChannel communication is scoped by origin and storage partition. [BroadcastChannel documentation](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- BroadcastChannel broadcasts to group members. The application processes data only in the addressed primary tab; this routing is not a privacy boundary between tabs in the group.
- Messages and inbox contents stay in memory. No sessionStorage or localStorage data is copied, and past messages are not replayed to a replacement primary tab.
- Heartbeats update the connected-tab list. Primary ownership is controlled by Web Locks, so a suspended primary retains its role until its lock is released.
