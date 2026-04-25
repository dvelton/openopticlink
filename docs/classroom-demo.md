# Classroom demo

OpenOpticLink can demonstrate basic networking and signal-processing concepts with two phones and no network.

## Concepts to show

| Concept | What students can observe |
| --- | --- |
| Binary signaling | White screen means 1, black screen means 0 |
| Clock timing | Slower profiles are easier to decode at distance |
| Preamble/sync | The receiver looks for a known pulse pattern before reading data |
| Noise | Bright rooms, motion, and glare reduce the signal |
| Checksums | Corrupt data is rejected |
| Bandwidth | Far mode trades speed for reliability |
| Relays | A received message can be forwarded by another phone |

## Suggested demo

1. Put both phones in airplane mode after loading the PWA.
2. Send "Hello from light."
3. Move the phones farther apart and switch from QuickLink to PulseLink Far.
4. Partially block the camera and show that the receiver loses confidence.
5. Receive the message on a third phone and relay it.

## Discussion prompts

- Why is this slower than Wi-Fi?
- Why does a full-screen pulse work farther than a detailed barcode?
- Why does distance reduce reliability?
- What kinds of messages are worth sending over a low-bandwidth link?
