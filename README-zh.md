# mike-stack

[English](README.md)

Claude Code 的 skill 和 mod。

## Mod

### carry

`/carry [行数] [备注]` 把当前工作带到新会话：

1. 把对话导出到 `~/.claude/carry/<session-id>.txt`。
2. 运行 `/clear`。
3. 让新会话读导出文件的末尾（默认 400 行），然后继续。

超过 100 行时，由子代理读取，返回摘要和行号范围。

安装：把 `mods/carry` 复制到 `~/.claude/local-mods/carry`。

## 许可证

[MIT](LICENSE)
