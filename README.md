# mike-stack

[中文](README-zh.md)

Skills and mods for Claude Code.

## Mods

### carry

`/carry [lines] [note]` moves your work into a new session:

1. Exports the conversation to `~/.claude/carry/<session-id>-<timestamp>.txt` (a new file each time, because `/export` does not overwrite a file).
2. Runs `/clear`.
3. Tells the new session to read the end of the export (default 400 lines) and continue.

Over 100 lines, a subagent reads the export and returns a summary plus line ranges.

Install: copy `mods/carry` to `~/.claude/local-mods/carry`.

## License

[MIT](LICENSE)
