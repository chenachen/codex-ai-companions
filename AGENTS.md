# Project guidance

- Communicate in concise Chinese. Check actual files and results before reporting completion.
- Create development branches with a `feature/` prefix.
- Do not modify or patch the Codex client. Native Pet work changes sprite assets only.
- The current v3 native idle/running rows are the accepted baseline. Preserve unrelated animation rows and character identity/logos.
- For new Pet visuals, use the Pets/image generation skills; do not procedurally redraw the characters.
- Use parallel agents when useful. Default maximum is four total agents, including the primary agent; do not raise it without explicit user authorization.
- Close preview servers, browser debugging sessions, rendering processes and temporary helpers when finished. Avoid running multiple heavy local renders at once.
- Keep runtime queues, local hook/config backups, credentials, signed URLs and upload sessions out of Git.
- `npm test` checks desktop state aggregation and caption shuffle behavior. `npm run build` compiles the WPF program without starting it.
- `npm run hooks:install` changes the current user's Codex configuration. Do not run it as a routine test.
- Refer to `docs/HANDOFF.md` before resuming animation work.
