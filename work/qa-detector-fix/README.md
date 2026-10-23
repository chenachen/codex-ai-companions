# Gemini normal alpha 检测误报修复

## 结果

工作区副本仅修改 `transparent_hole_rows`，原插件文件和 `validate_pet_quality.py` 完全未改。修正版 continuity 输出 `alphaHoles: []`；原版 bundled quality CLI 实际退出码为 0，`ok: true`、`errors: []`。原始失败报告保存在该宠物 QA 目录的 `look-continuity.original.json` 和 `pet-quality.original.json`。

精灵图仍为 2,656,266 字节，SHA-256：

`6eb82abddea0eec915a983bc3a9c01aea743b6f8d25ac040d525f2d897187756`

## 根因与修复

原函数把相邻扫描行左右轮廓之间的所有透明像素都累计为孔洞，因此腿、袖片和尾巴之间向背景开放的空隙被当作内部缺损。原函数遇到完全透明的相邻扫描行时直接跳过，也会遗漏两行以上的贯穿横向断带。

副本先以 alpha <= 16 的像素做四连通边界 flood fill。未与边界连通的透明像素计为内部孔洞；与边界连通的像素不直接计为孔洞。横向断带另外判断：同一横向连续透明段的每列都须有不透明上边界和下边界，且该段宽于其中最大的垂直透明跨度。这样真实贯穿横缝仍被记录，向下开放的 U 形空隙没有下边界，不会进入横缝集合。

材料阈值未调宽：alpha > 16 为实体，行跨度至少 64 像素，材料透明像素仍须大于 `max(32, int(span * 0.25))`。原版 quality 的身体高度 12%–78% 区域、35% 占比、相邻材料行要求均保持原样。新增 `interiorPixels` 和 `seamPixels` 是证据分类字段，原版 quality 继续使用既有 `transparentPixels` 和 `spanPixels`。

## 合成验证

| 用例 | 副本 continuity | 原版 quality 的孔洞判定 |
| --- | --- | --- |
| 完整实体 | 无告警 | 通过 |
| 向下开放的自然 U 形空隙 | 无告警；原函数误报 110 行 | 通过 |
| 封闭大孔洞 | 报告 31 行内部孔洞 | 拒绝 |
| 1 像素贯穿横缝 | 报告 1 行横缝 | 保留原有相邻两行要求，因此仅 continuity 告警 |
| 2 像素贯穿横缝 | 报告 2 行横缝；原函数漏报 | 拒绝 |
| 8 像素贯穿横缝 | 报告 8 行横缝；原函数漏报 | 拒绝 |
| 2×2、alpha=8 的小抗锯齿缝 | 无材料告警 | 通过 |

测试还逐一检查 Gemini 的 16 个方向；副本均无材料孔洞。函数以外的 continuity 源码完全一致，16 对方向的像素差、中心位移、面积比、medianDiffPixels 以及两个原有局部 outlier 警告全部保持一致。原版 quality 的 jump、look_registration、atlas 路径、字节数和 SHA 均保持一致。

## 文件与证据

- `measure_direction_continuity.original.py`：原 bundled 检测器逐字节副本。
- `measure_direction_continuity.py`：修复副本。
- `measure_direction_continuity.patch`：仅一个函数的 unified diff。
- `provenance.json`：原脚本绝对路径、SHA、原质量脚本 SHA、图像 SHA 和原报告 SHA。
- `verification.json`：逐项哈希及新旧报告不变项检查。
- `test_alpha_classification.py`、`test-results.json`：可重复测试和实际结果。
- `synthetic-alpha-contact.png`：合成 alpha 用例图。
- `gemini-normal-alpha-review.png`：原图四个基准方向的诊断预览，红线只标原告警扫描行，未改精灵像素。
- `quality-cli.log`：未修改 bundled quality 的真实 CLI 输出。

原 bundled continuity SHA：`e24b7065af82eab5638f1fcdeb627d497391a2f1e9ba19801827d1db3a6d8c2d`。

修复副本 SHA：`95f7dba75de7b429c7b12b6f22eb37cc1a2a6da1fdd3c68ea91a0b9840ef103d`。

## 重跑方式

在工作区根目录使用已配置 bundled Python：

```powershell
rtk proxy "C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" -B work/qa-detector-fix/test_alpha_classification.py
rtk proxy "C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" -B work/qa-detector-fix/measure_direction_continuity.py work/native-pets/gemini-normal/final/spritesheet-extended.png --json-out work/native-pets/gemini-normal/qa/look-continuity.json
rtk proxy node work/native-pet-pipeline.cjs quality gemini-normal
```

原 pipeline helper 未改。若再次执行 `extended`，它会调用原 bundled continuity 覆盖报告；应随后执行上面的修正版 continuity，再执行原版 quality。此次没有改缩放、生成参数或图片，也没有执行上传或 Pets 创建。
