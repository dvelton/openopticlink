# Range testing guide

Range is a product feature, not a single number. It changes with phone model, browser, screen brightness, camera zoom, lighting, hand steadiness, and pulse profile.

## Test setup

Use two phones:

- Sender: screen brightness at maximum, auto-lock disabled.
- Receiver: camera permission granted, lens clean.
- Message: one short template and one custom 100-character message.
- Lighting: record whether testing is indoors, outdoors, daylight, dusk, or dark.

## Procedure

1. Start at 0.5 m with FieldLink.
2. Send the same message three times.
3. Record whether each attempt completes and how long it takes.
4. Move to 1 m, 2 m, 3 m, 5 m, and 10 m.
5. Repeat with PulseLink Far.
6. Try PulseLink Beacon with a short template at the farthest distance that still produces a strong brightness signal.
7. In dusk or darkness, continue with 15 m, 25 m, and 50 m signal-only checks. Record whether the receiver sees a brightness signal even if packet decoding does not complete.

## Record format

```text
Sender phone:
Receiver phone:
Browser:
Profile:
Distance:
Lighting:
Zoom used:
Message length:
Attempts:
Successful:
Average completion time:
Notes:
```

## Practical expectations

These are starting targets, not certified limits. Verified text decoding is harder than visible flashing, so record both outcomes separately.

| Distance | Expected behavior |
| --- | --- |
| 0.2-1 m | Baseline reliable |
| 1-3 m | Practical |
| 3-10 m | Experimental text-message target |
| 10 m+ | Beacon target in dusk or darkness |
| Tens of meters | Signal-detection territory; packet decoding is an open testing goal |

## What to improve

Useful pull requests should include before/after range data when possible. Improvements may come from better camera constraints, zoom support, symbol timing, thresholding, preamble detection, adaptive target tracking, or alternate pulse/color coding.
