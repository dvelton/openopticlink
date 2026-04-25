# OpenOpticLink pulse protocol

This document defines the PulseLink v1 protocol used by the reference PWA.

## Goals

- Encode short human messages as timed full-screen white/black pulses.
- Require only a phone screen on the sender and a camera on the receiver.
- Optimize for range and simplicity rather than high throughput.
- Detect corrupted payloads or packet metadata before showing them as verified messages.
- Allow store-and-forward relays without a server or account system.

## Message bundle

The app represents messages internally as a `MessageBundle` object.

```json
{
  "id": "a1b2c3d4e5f60708",
  "createdAt": "2026-04-25T15:00:00.000Z",
  "kind": "text",
  "body": "Meet at the north gate.",
  "title": "Optional title",
  "hopsRemaining": 4
}
```

`kind` is one of `text`, `status`, `location`, or `relay`.

The PulseLink v1 wire format does not transmit JSON or base64url text. It transmits the compact binary packet below. `title` is local UI metadata and is not carried in the pulse stream.

## Pulse packet

PulseLink uses a compact binary packet instead of JSON-on-the-wire. This keeps pulse transmissions short enough to be usable.

| Byte range | Field | Meaning |
| --- | --- | --- |
| 0-3 | Magic | ASCII `OLP1` |
| 4 | Profile | `0=quick`, `1=balanced`, `2=far`, `3=beacon` |
| 5 | Kind | `0=text`, `1=status`, `2=location`, `3=relay` |
| 6 | Hops | Remaining relay hops, 0-255 |
| 7-14 | Message ID | Sender-generated 8-byte message/session ID |
| 15-18 | Created at | Unix timestamp seconds from the original sender |
| 19-20 | Body length | Unsigned 16-bit body byte length |
| 21-24 | Checksum | CRC32 of bytes 0-20 and 25+ with bytes 21-24 set to zero |
| 25+ | Body | UTF-8 message body |

The packet bytes are converted directly to bits. A `1` is a white full-screen symbol. A `0` is a black full-screen symbol.

## Signal layout

```text
leader | preamble | sync | packet_bits | trailer
```

| Segment | Current value | Purpose |
| --- | --- | --- |
| Leader | `0000` | Gives the receiver a dark baseline |
| Preamble | `1010101010101010` | Provides alternating pulses for timing and threshold detection |
| Sync | `1110010110100001` | Marks the start of packet bits |
| Packet bits | Compact binary packet bits | Carries the message |
| Trailer | `000000` | Returns the screen to black before repeating |

The sender repeats the full signal until stopped. Receivers sample camera brightness over time, try each known profile timing, search for the preamble and sync marker, parse the packet, verify the checksum, and display the message.

## Profiles

Profiles change symbol timing and recommended payload size.

| Profile | Symbol duration | Intended use |
| --- | ---: | --- |
| QuickLink | 180 ms | Close transfer |
| FieldLink | 360 ms | General use |
| PulseLink Far | 760 ms | Several meters |
| PulseLink Beacon | 1400 ms | Slow, short messages |

## Relay behavior

Relay mode retransmits the same message bundle with `kind` set to `relay` and `hopsRemaining` reduced by one. A receiver should refuse relay attempts when `hopsRemaining` is zero.

## Compatibility expectations

Implementations should:

- Ignore pulse streams that do not contain the PulseLink preamble and sync sequence.
- Treat checksum failure as a failed receive, not as partially valid text.
- Continue sampling when a partial packet is detected.
- Reject packets with invalid profile, kind, checksum, or body length fields.
