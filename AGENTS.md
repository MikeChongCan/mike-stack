# AGENTS.md

- `skills/<name>/SKILL.md`: skills. Only SKILL.md folders go here.
- `mods/<name>/`: Claude Code mods (plugins with hooks code).
- Each mod has `.claude-plugin/plugin.json`. Bump its `version` when you change the mod.
- Keep tests next to the code (`*.test.ts`) and run them before you commit.
- No personal data: no home paths, emails, keys, or exported sessions.
- Update README.md and README-zh.md together.
