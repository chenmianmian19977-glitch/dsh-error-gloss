/**
 * dsh-error-gloss —— host 半端（Node 侧）
 *
 * 为什么需要这个文件（2026-11-05 取证）：
 *   本插件是「纯客户端」插件，UI 全在 ./bundle.js 里。但 DSH 的
 *   `@deepseek-ai/dsh-client-modules` 是这样找客户端 bundle 的：
 *
 *     locatePkgJson(loaderName)   // loaderName = cordis 那一行的 name，即包名
 *       → loader.internal.resolveSync(包名)   // 必须能解析到「包的入口」
 *       → 向上找到最近的 package.json，读 dsh.client 与 exports["./client"]
 *       → 把 ./client 作为浏览器里加载的 bundle
 *
 *   也就是说：**没有入口（main / exports["."]）的包，resolveSync 会直接失败**，
 *   于是客户端 bundle 永远不会被装载，插件「装上了但什么也不显示」。
 *   本机 dsh-purge / dsh-context / dsh-mermaid / dsh-md-studio / dsh-bili-scroll
 *   全都有 host 半端，这不是可选项。
 *
 * 这个 host 半端不做任何事：不注册工具、不起服务、不写文件、不发网络请求。
 * 它的唯一职责是「让那一行能被解析」，把浏览器半端带上车。
 */

export const name = 'dsh-error-gloss';

/** 不依赖任何宿主服务（纯客户端渲染 + locale 字典）。 */
export const inject = [];

export function apply(ctx) {
  // fail-open：host 侧零副作用，任何异常都不应影响宿主启动。
  try {
    ctx?.logger?.debug?.('[dsh-error-gloss] host half mounted (client-only plugin)');
  } catch { /* ignore */ }
}
