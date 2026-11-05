# NOTICE

## 与官方的关系

本项目（dsh-error-gloss）是**第三方社区插件**，与 DeepSeek 官方无隶属、无授权、无背书关系。

"DeepSeek"、"DeepSeek Harness" 及相关标识归其权利人所有，本项目仅在描述兼容对象时以事实性方式引用这些名称。

## 不含官方代码

本仓库不包含、不分发、不修改 DeepSeek Harness 的任何官方代码或资源文件。插件只调用官方公开的扩展点：

- `package.json` 里的 `dsh.client` / `dsh.bundle.patch` 清单声明
- `ctx.locale.register(ns, { zh, en })` 注册界面文案
- `ctx.slots.inject` / `ctx.slots.register` 往官方定义的插槽里挂一个节点

官方原有的报错行、英文原文、`code` 标签一律不被替换、不被遮挡。

## 词典数据的来源

`catalog/entries/*.json` 里的中文释义与建议，由本项目自行撰写。其事实依据来自对**本机已安装的** DeepSeek Harness 产物的只读观察，属于事实性引用（错误码常量、报错文案模板、界面渲染路径），已在每条词条的 `evidence[]` 字段里标注来源路径与行号/键名，例如：

```
app.asar:/dsh/node_modules/@deepseek-ai/dsh-llm/lib/types/error.js
app.asar:/dsh/node_modules/@deepseek-ai/dsh-command-compact/lib/index.js
```

若官方变更了错误码或文案，对应词条会因 `dshVersionRange` 过期而被标记跳过，不会强行套用旧文案。

## 商标与第三方组件

本项目自身零第三方运行时依赖（核心引擎为纯函数，无 npm 依赖）。开发期使用的构建与测试脚本只依赖 Node 标准库。

如权利人认为本项目存在不妥引用，请通过仓库 issue 联系，我们会立即调整或移除。

## 美术资源（角色形象）

界面中的角色头像、插件图标与首图，形象为 **「大肥鱼」**，由 **ZipZipPipe**（B 站）创作，以 **CC BY-NC-SA 4.0** 释出（不可商用、需署名、衍生作品同许可）。本项目对其做了抠图 / 裁切 / 缩放，属衍生作品，同样以 CC BY-NC-SA 4.0 提供。

**这部分不适用 MIT**，详细范围、商用边界、移除方式与 Takedown 流程见 [`PROVENANCE.md`](PROVENANCE.md)。

## 词典数据的许可

代码以 MIT 发布（见 LICENSE）。词典数据（`catalog/` 目录）计划在第二个版本起单独以 CC0 1.0 释出，以便其他插件、文档或翻译项目自由复用；当前版本仍随 MIT。
