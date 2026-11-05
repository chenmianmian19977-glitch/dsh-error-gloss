// tools/gen-family-entries.mjs — 生成「码族」词条（一个前缀覆盖一整族官方错误码）。
//
//   D:\node.exe D:\dsh-error-gloss\tools\gen-family-entries.mjs
//
// 为什么要有这一层（2026-11-05 用户拍板）：
//   官方源码里能数出 188 个大写错误码，但其中 TEAM_*（28）/ GOAL_*（9）/ ASK_*（10）/
//   SESSION_*（5）/ ACTIVATION_*（10）这些整族都是同一子系统的操作错误。为每个码手写
//   一条词条既写不完、也没意义。码族词条只回答两件确定的事：
//     ① 这条报错属于哪个功能模块（用户据此知道跟模型/网络无关）；
//     ② 具体原因在英文原文里，本地不编。
//   精确词条仍优先（codeExact 命中即停），码族只在没有精确词条时接手。
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'catalog', 'entries');
const ASAR = 'app.asar:/dsh/node_modules/@deepseek-ai';

/** 每个族：id / 码正则 / 归属包 / 中文标题 / 释义 / 影响 / 两条建议 / 是否可重试 */
const FAMILIES = [
  {
    id: 'family.team',
    codePattern: '^TEAM_[A-Z_]+$',
    pkg: 'dsh-experimental-agent-team',
    title: '团队协作功能报错',
    summary: 'agent 团队（多成员协作）的一次操作被拒绝。与模型、网络无关。',
    impact: '团队面板里这次操作没有生效；成员、任务或消息保持原样。',
    actions: [['在团队面板里刷新后重试该操作', '点按钮'], ['查看报错原文里的具体说明（英文原文通常直接点明哪个前置条件不满足）', '看日志']],
    retryable: true,
  },
  {
    id: 'family.goal',
    codePattern: '^GOAL_[A-Z_]+$',
    fullPattern: '^(?:SET_|CLEAR_)?GOAL_[A-Z_]+$',
    pkg: 'dsh-goal',
    title: '目标（Goal）功能报错',
    summary: '长期目标的读写或状态切换被拒绝。与模型、网络无关。',
    impact: '目标的这次修改没有生效；当前目标保持原状。',
    actions: [['打开目标面板确认当前目标状态后重试', '点按钮'], ['会话里目标被外部改动过时先用 /goal 查看', '看日志']],
    retryable: true,
  },
  {
    id: 'family.ask',
    codePattern: '^(?:ASK|BAD|DELEGATED|DUPLICATE_WAIT|EMPTY_QUESTIONS|REPLY_QUEUED|CALLER_NOT_LIVE|NO_PROVIDER)[A-Z_]*$',
    pkg: 'dsh-user-questions',
    title: '提问 / 交互请求报错',
    summary: '向用户发起的一次提问或确认没有走通（超时、参数不合法、发起方已不在）。',
    impact: '这一轮卡在等待用户输入这一步；需要重新发起或手动继续。',
    actions: [['等提示重新出现后作答；一直没有就重新发起该操作', '点按钮'], ['查看原文确认是超时还是参数问题', '看日志']],
    retryable: true,
  },
  {
    id: 'family.session',
    codePattern: '^SESSION_[A-Z_]+$',
    pkg: 'dsh-session',
    title: '会话操作报错',
    summary: '对会话的引用、恢复或查询失败（会话不存在、已被清理、不可恢复）。',
    impact: '这条会话相关的操作没有生效；其他会话不受影响。',
    actions: [['回到会话列表重新打开该会话', '点按钮'], ['若提示不可恢复，新建会话并保留结论', '新建会话']],
    retryable: false,
  },
  {
    id: 'family.attachment',
    codePattern: '^ATTACHMENT_[A-Z_]+$',
    pkg: 'dsh-attachment',
    title: '附件处理报错',
    summary: '附件上传、读取或类型校验没有通过。',
    impact: '这次附件没有被带进对话；文本部分不受影响。',
    actions: [['换成本地文件重新拖入（避免超长路径或网络位置）', '点按钮'], ['确认文件类型和大小在允许范围内', '看日志']],
    retryable: true,
  },
  {
    id: 'family.web',
    codePattern: '^WEB_[A-Z_]+$',
    pkg: 'dsh-web-fetch-http',
    title: '联网抓取报错',
    summary: '网页抓取或搜索请求没有完成（被站点拦截、超时、地址不被允许）。',
    impact: '这次联网没有拿到内容；模型会基于已有信息继续或说明缺料。',
    actions: [['换一个来源或稍后重试', '点按钮'], ['检查目标站是否需要登录 / 是否被墙', '看日志']],
    retryable: true,
  },
  {
    id: 'family.sandbox',
    codePattern: '^SANDBOX_[A-Z_]+$',
    pkg: 'dsh-sandbox',
    title: '沙箱不可用',
    summary: '命令需要的沙箱环境没有起来或被策略禁用，命令没有执行。',
    impact: '这条命令没有跑；文件没有被改动。',
    actions: [['在设置的权限 / 沙箱项里确认沙箱模式', '改配置'], ['改用只读或不需要沙箱的命令重试', '点按钮']],
    retryable: true,
  },
  {
    id: 'family.model.adapter',
    codePattern: '^(?:NO_ADAPTER|INVALID_ADAPTER|DUPLICATE_ADAPTER|INVALID_DISCOVERY|NO_DISCOVERY|DUPLICATE_DISCOVERY|INVALID_CATALOG|INVALID_DIRECTORY|DUPLICATE_DIRECTORY|INVALID_MODEL_[A-Z_]+|UNSUPPORTED_REASONING_EFFORT|INVALID_PREPARED_CALL|REGISTRATION_DISPOSED)$',
    pkg: 'dsh-llm',
    title: '模型配置 / 适配器报错',
    summary: '模型注册表或适配器配置不完整（缺适配器、模型信息不合法、推理档位不支持）。',
    impact: '这次请求没有发出去；不会消耗额度。',
    actions: [['打开设置 → 模型，重新检查该模型的 provider / contextWindow / maxTokens', '改配置'], ['切回一个已知可用的模型确认链路正常', '换模型']],
    retryable: false,
  },
  {
    id: 'family.auth.flow',
    codePattern: '^(?:ALREADY_IN_FLIGHT|DECLINED|DUPLICATE_FLOW|NOT_COMMITTED|NO_FLOW|UNKNOWN_METHOD|CANCELLED)$',
    pkg: 'dsh-authorization',
    title: '授权 / 确认流程报错',
    summary: '一次需要授权的操作没有走完（被拒绝、重复发起、流程已失效或已取消）。',
    impact: '该操作未执行；没有产生副作用。',
    actions: [['重新发起操作并按提示确认授权', '点按钮'], ['若被拒绝，检查该工具的权限设置', '改配置']],
    retryable: true,
  },
  {
    id: 'family.activation',
    codePattern: '^ACTIVATION_[A-Z_]+$',
    pkg: 'dsh-subagent',
    title: '子任务激活报错',
    summary: '子代理 / 续跑任务的激活流程没有走完（正在关闭、被拆除、超出并发上限）。',
    impact: '这个子任务没有启动或没能继续；父任务需要重新安排。',
    actions: [['等当前任务收尾后重新发起', '点按钮'], ['减少同时进行的子任务数量', '改配置']],
    retryable: true,
  },
  {
    id: 'family.tool.invoke',
    codePattern: '^(?:UNKNOWN_TOOL|INVALID_ARGS|CODE_RUN_FAILED|INVALID_TOOL_OUTPUT|UNSUPPORTED_SCHEMA)$',
    pkg: 'dsh-tools',
    title: '工具调用报错',
    summary: '工具不存在、参数不合法、或工具返回的内容不符合约定。',
    impact: '这次工具调用没有结果；模型会据此改写下一次调用。',
    actions: [['让模型重试并修正参数', '点按钮'], ['确认该工具在当前 profile 里已启用', '改配置']],
    retryable: true,
  },
];

let written = 0;
for (const f of FAMILIES) {
  const entry = {
    id: f.id,
    code: '',
    templateId: 'FAMILY',
    title: f.title,
    summary: f.summary,
    causes: [
      {
        text: `${f.summary.replace(/。$/, '')}；具体是哪一项前置条件不满足，只有英文原文里写着`,
        certainty: '需查',
      },
    ],
    impact: f.impact,
    actions: f.actions.map(([text, op]) => ({ text, op })),
    severity: 'error',
    retryable: f.retryable,
    autoRecoverable: false,
    causeAssertion: 'forbidden',
    docRefs: [`${ASAR}/${f.pkg}/lib/index.js`],
    logRefs: ['~/.dsh/storages/session_projcache/sessions/{sessionId}.json'],
    match: { codePattern: f.codePattern, priority: 50 },
    version: '0.1.0',
    evidence: [
      {
        kind: 'source-template',
        path: `${ASAR}/${f.pkg}/lib/index.js`,
        key: `code 常量 + new HarnessError(msg, '${f.id.replace('family.', '').toUpperCase()}…')`,
        sample: f.codePattern,
        count: 1,
      },
    ],
  };
  writeFileSync(join(OUT, `${f.id}.json`), JSON.stringify(entry, null, 2) + '\n', 'utf8');
  written += 1;
}
console.log(`已生成 ${written} 条码族词条：${FAMILIES.map((f) => f.id).join(', ')}`);
