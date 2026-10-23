# 十只原生 Pets 并行分工

用户授权：主智能体 + 6 个子智能体，共 7 个并发。

| 负责人 | 当前负责 | 接续任务 |
|---|---|---|
| blind_review_a | Claude Q版全部剩余动作 | Claude Q版方向 |
| blind_review_b | Claude 正常版全部剩余动作 | Claude 正常版方向 |
| blind_review_c | Grok Q版全部剩余动作 | Grok Q版方向 |
| deepseek_normal_finish | DeepSeek 正常版方向 | Gemini Q版全部动作及方向 |
| deepseek_preview_art | GPT Q版方向 | Gemini 正常版全部动作及方向 |
| gpt_normal_finish | GPT 正常版剩余动作及方向 | Grok 正常版全部动作及方向 |
| 主智能体 | 全部标准组装及最终验收 | Library 归档、原生创建、选择及列表核验 |

每个创作任务由对应子智能体连续生成、逐行检查、自行修复，不再等待主智能体逐行派发。标准九行完成后主智能体组装和验收；方向序列仍按四基准 -> 前八方向 -> 后八方向的依赖推进。最终精灵图由主智能体验收，独立盲审穿插在其他角色生成等待期间。

所有十只均完成并经原生列表确认后才交付总结果。已选中 DeepSeek Q版，其他角色后续安装时不反复切换当前选择。
