# Project guidance

- Communicate in concise Chinese. Check actual files and results before reporting completion.
- Create development branches with a `feature/` prefix.
- Do not modify or patch the Codex client. Native Pet work changes sprite assets only.
- The v5 native PNGs in `pets/` are the accepted baseline. `spriteVersionNumber: 2` is the atlas format, not the artwork revision. Preserve unrelated animation rows and character identity/logos.
- For new Pet visuals, use the Pets/image generation skills; do not procedurally redraw the characters.
- Use parallel agents when useful. Default maximum is four total agents, including the primary agent; do not raise it without explicit user authorization.
- Close preview servers, browser debugging sessions, rendering processes and temporary helpers when finished. Avoid running multiple heavy local renders at once.
- Keep credentials, signed URLs, upload sessions and temporary artifacts out of Git.
- `npm test` checks local Pet imports in temporary directories. `npm run preview:native` builds the native animation preview.
- Native atlases are 1536×2288 RGBA PNGs: 8×11 cells of 192×208, with 73 populated poses and 15 transparent cells. Neutral visible height is approximately 160px, with the bottom at y=202.
- After artwork changes, update SHA-256 and byte counts in `docs/native-pets-manifest.json`, then rebuild and inspect the native preview. Generated previews are not committed.
