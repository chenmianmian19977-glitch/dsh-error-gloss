# 素材来源与许可范围（PROVENANCE）

本仓库的**代码与词典数据**按 MIT 许可（见 [`LICENSE`](LICENSE)）。`client/assets/`、`client/icon.png`、`assets/` 下的**美术素材**不在 MIT 覆盖范围内，按本文说明提供。

## 一、许可范围

| 范围 | 许可 |
|---|---|
| `src/`、`client/*.js`（除素材）、`catalog/`、`tools/`、`cordis.patch.yml`、文档 | **MIT**（见 `LICENSE`） |
| `client/icon.png`（插件列表图标） | **CC BY-NC-SA 4.0**，与下方头像同一来源，仅用于标识本插件 |
| `client/assets/mascot-*.webp`（注解行头像，四表情） | **CC BY-NC-SA 4.0** |
| `assets/hero.webp`（README 首图） | **CC BY-NC-SA 4.0** |
| `docs/screenshots/*.png`（README 效果截图） | **CC BY-NC-SA 4.0**：截图里含有上面这个角色形象 |

**明确一点**：本项目对上述美术素材**不授予 MIT**，也不授予任何再许可。

## 二、角色形象

界面中的角色为 **「大肥鱼」**，由 **ZipZipPipe**（B 站）创作。

- **原许可**：CC BY-NC-SA 4.0（署名 — 非商业性使用 — 相同方式共享）
- **作者声明**（2026-09-12 公开发布）：该形象不可以任何形式商业化，不授权他人售卖相关商品
- **本项目所做的修改**：洋红键色抠图、按脸部重新裁切、缩放至 128×128、转 WebP；图标与首图为裁切 / 缩放。上述修改构成**衍生作品**，因此本项目提供的这些图片同样以 **CC BY-NC-SA 4.0** 释出。
- **署名方式**：再分发时请保留「角色形象 © ZipZipPipe，CC BY-NC-SA 4.0」并提供许可链接 <https://creativecommons.org/licenses/by-nc-sa/4.0/>

## 三、商用 / 再分发的边界

- 代码可以商用（MIT），但**包含上述图片的分发物整体受 NC 约束**。
- 需要纯 MIT 的版本：删除 `client/assets/` 与 `client/icon.png`（README 首图同理），再运行 `node tools/build-client.mjs`。构建脚本检测不到头像时会自动回落到代码里自带的原创鲸尾徽章（纯 SVG），功能完全不受影响。
- 想要角色形象但需规避 SA 传染：自行向原作者取得授权，或自行替换为你有权使用的素材（放入 `client/assets/`，命名 `mascot-calm|serious|thinking|sorry.webp` 即可）。

## 四、元数据清理

随包图片均由本项目脚本（`tools/matte.py`）重新编码：Pillow 写出的 WebP 不含 EXIF / XMP / 文本块；`icon.png` 与 `hero.webp` 亦为重新裁切编码的结果。不保留原文件内嵌的生成工具信息。

## 五、权利主张 / Takedown

如你认为本仓库中有素材侵犯了你的权利，请在仓库开一条 issue，说明**文件名**与**依据**，我们核实后会**立即替换或移除**，不附加其它条件。也欢迎直接提供可自由再分发的替代素材。
