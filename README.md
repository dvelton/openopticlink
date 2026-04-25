# OpenOpticLink

OpenOpticLink is a static web app that sends short messages between ordinary phones using timed full-screen light pulses. It has no backend, no account system, no app store dependency, and no special hardware requirement.

The app is designed for GitHub Pages. Open it on two phones, install it as a PWA if you want offline use, put the phones in airplane mode, and send a message by pointing one phone camera at the other phone screen.

## What it does

| Feature | Status |
| --- | --- |
| Full-screen white/black pulse transmission | Built |
| Camera brightness receiver | Built |
| GitHub Pages static hosting | Built |
| Offline PWA cache after first load | Built |
| Message templates | Built |
| Store-and-forward relay mode | Built |
| Browser diagnostics | Built |
| Protocol tests | Built |
| QR or barcode transfer | Deliberately not used |
| Native flashlight control | Not a dependency |
| Encryption | Out of scope |

## Why pulses?

OpenOpticLink uses the whole screen as the signal. The receiver only needs to detect timed brightness changes across the camera image.

That makes the project lower bandwidth, but more interesting for distance-oriented optical signaling. The design goal is not "send files quickly." It is "send short, useful messages as far as ordinary phone screens and cameras can reasonably manage."

## How to use it

1. Open the app on two phones.
2. On the sending phone, choose a message and a pulse profile.
3. Tap "Start sending" and set the screen brightness high.
4. On the receiving phone, tap "Start camera."
5. Point the receiving camera at the sending screen until the pulse message verifies.
6. Use Relay mode if a third phone should retransmit the message from another location.

The app works best with short messages. If the receiver is farther away, use PulseLink Far or PulseLink Beacon and hold both phones steady.

## Install for offline use

OpenOpticLink works as an installable PWA. Load it once while online, install it to your home screen, then it can open again without Wi-Fi or cell service.

### iPhone or iPad

1. Open the app in Safari: https://dvelton.github.io/openopticlink/
2. Tap the Share button.
3. Tap "Add to Home Screen."
4. Tap "Add."
5. Open OpenOpticLink from the new home screen icon once while still online so the offline cache is saved.

### Android

1. Open the app in Chrome: https://dvelton.github.io/openopticlink/
2. Tap the three-dot menu.
3. Tap "Install app" or "Add to Home screen."
4. Tap "Install" or "Add."
5. Open OpenOpticLink from the new home screen icon once while still online so the offline cache is saved.

### Desktop Chrome or Edge

1. Open the app: https://dvelton.github.io/openopticlink/
2. Click the install icon in the address bar, or open the browser menu and choose "Install OpenOpticLink."
3. Launch it once while online.

To confirm offline mode works, turn on airplane mode and open the installed app from the home screen. The app should load. Camera access still depends on the browser and device permissions, so grant camera permission when prompted.

## Why this exists

OpenOpticLink focuses on full-screen pulse signaling, short human messages, range profiles, relay workflows, public protocol docs, field testing, and a static PWA that anyone can host or fork.

The project may be useful for:

- Offline and disaster-prep experiments
- Computer networking and signal-decoding demos
- Low-bandwidth air-gapped short message transfer
- Field tests of optical communication with ordinary phones
- Human-relayed communication where each hop has line of sight

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The production build is written to `dist/` and can be served from any static host.

## GitHub Pages deployment

The repository includes `.github/workflows/pages.yml`. After pushing to GitHub, enable GitHub Pages with "GitHub Actions" as the source. A push to `main` will build the app and deploy `dist/`.

## Project structure

```text
src/lib/protocol.ts          Message bundles, pulse encoding, checksums, relay logic
src/lib/pulse-receiver.ts    Browser camera brightness receiver
src/lib/templates.ts         Compact message templates
src/lib/storage.ts           Local relay inbox
src/test/                    Protocol tests
docs/                        Protocol and field docs
public/                      PWA manifest and service worker
```

## Limitations

- This is not a chat replacement. It is a low-bandwidth optical pulse link.
- It does not hide message contents. Anyone who can record the pulses can capture the message.
- Browser camera behavior varies across devices.
- Flashlight transmission is not required because browser torch control is inconsistent, especially across iOS.

## License

MIT. See `LICENSE`.
