# 开发交接 — 2026-10-23

## 当前状态

1. Windows 独立桌宠已实现五位角色正常/Q版轮换，四种立绘状态，以及等待、停止、排查报错等文案状态。每个角色/形态/状态使用台词池，合计 360 条，池内洗牌且跨轮不连续重复。
2. Codex 状态采用 UserPromptSubmit、PreToolUse、PostToolUse、PermissionRequest、Stop、Interrupt、SessionEnd 七类 Hooks；本地会话生命周期记录补充恢复。处理器不把提示词、工具参数或回答正文写入队列。
3. 十只原生 Pet 的 v3 已在原账号逐一更新，完成原生格式校验与上传后 RGBA 回读核对。账号内 Pet ID、下载授权链接和安装回执没有发布。
4. 正常/Q 版脸型、服饰、专属标志各有区别。DeepSeek 白饭、GPT 降智/稳稳接住、Claude 封号、Grok 锐评等台词已扩充；Gemini 避免只依赖香蕉梗。
5. 全家福和最新图集已保存在仓库。v3 只更新 idle 与 running，其他九行（包括 16 个注视方向）有像素保持证据。Grok 的 idle 在上一轮已安装，本轮沿用，因此保留两份 Grok v2 图集供来源校验。

## 下一步最需要解决的问题

用户最新反馈：帧率显得低。已核对原生客户端的时序，待机 6 帧 / 6.6 秒，工作 6 帧 / 0.82 秒，默认工作 3 轮后回待机。这是素材播放规则。v3 把动作幅度压小解决了快速点头，但没有提高换帧率。

用户明确要求 **不要修改 Codex 客户端**。继续只改原生 Pet 时，应改善低频姿态之间的衔接；如用户选择更流畅的独立桌宠，可在本项目自身的播放端接入更多动画帧。当前独立桌宠仍是立绘加浮动，不要描述为已有完整逐帧动画。

## 原生素材开发环境

安装 Python 3.10+，运行 `python -m pip install -r requirements-native.txt`。同时在 Codex 中安装 Work Pets 插件，制作和验收遵循对应 skill。

`work/pet-calm-pipeline.py` 默认使用当前用户 `CODEX_HOME`（缺省 `~/.codex`）下 Work Pets 0.1.6 的 bundled scripts。插件路径不同时设置：

```powershell
$env:WORK_PETS_SCRIPTS = 'C:\path\to\work-pets\skills\create-pet\scripts'
python work/pet-calm-pipeline.py --help
```

不要直接对十只重新运行全部生成流程。先选择最小的受影响动作行，保存新版本目录，视觉检查后再合成和验证。`work/qa-detector-fix/` 保存 alpha 检测误报的局部修复；它是工作区检测器副本，不修改安装的插件。

仓库保留最终图集、原始 state/look strip、参考图、提示词、v3 idle/running 源图、配准参数和必要检查证据。接续前重新取得账号内当前 Pet 图集，确认基线没有被其他机器修改。JSON 中旧电脑绝对路径是历史证据位置，不是可直接使用的新电脑路径。

## 换电脑与验证

- 先执行 README 中的 `npm ci`、`npm test`、`npm run build`，再决定是否启动桌宠或安装 Hooks。
- EXE、Node 路径配置、快捷方式和 Hooks 必须在新电脑生成；不复制旧电脑的用户配置。
- `npm run preview:build` 输出静态 HTML；无需常驻预览服务。若调试时启用服务器或浏览器，结束后关闭。
- `outputs/文案与梗来源.md` 是早期研究记录；实际台词以 `work/pet-data.json` 和最新台词库为准。
- 本仓库初始提交只是迁移备份与可继续开发的基线，没有修改 Codex 原生动画频率。
