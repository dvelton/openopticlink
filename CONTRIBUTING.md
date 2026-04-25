# Contributing

OpenOpticLink is meant to be easy to test with ordinary phones and easy to host as a static site.

## Local setup

```bash
npm install
npm run dev
npm test
npm run build
```

## Good first contributions

- Improve receiver instructions and error messages.
- Add range test results for specific phone/browser combinations.
- Improve pulse timing or camera brightness detection.
- Add additional compact message templates.
- Improve docs for classroom or emergency-prep use.

## Protocol contributions

Protocol changes should include:

- A docs update in `docs/protocol.md`
- Tests in `src/test/`
- A compatibility note if older pulse streams will stop decoding

## Range contributions

If a change claims better range or reliability, include test notes using `docs/range-testing.md`.

## Project boundaries

- No backend service is required.
- No account system is required.
- No app-store native client is required.
- Encryption is out of scope for this project.
- Flashlight/torch support should not be required for the core web app.
