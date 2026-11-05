// src/chain.mjs — v0.3 因果链聚合（A 阶段先实现，供自测与后续 Host 订阅复用）。
import { normalizeMessage } from './match.mjs';

/**
 * 把一串 session 事件聚成因果链。识别「溢出 → 自动压缩 → 压缩失败 → 本轮终止」这条典型链。
 * @param {Array<{type:string,seq:number,time:number,data:object}>} events
 */
export function aggregateChain(events = []) {
  const rows = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const steps = [];
  for (const e of rows) {
    const d = e.data ?? {};
    if (e.type === 'turn/end' && d.reason?.kind === 'error') {
      const err = d.reason.error ?? {};
      steps.push({ step: '本轮失败', code: err.code ?? '', message: normalizeMessage(err.message), at: e.seq, kind: 'terminal' });
    } else if (e.type === 'llm/retry' && d.failure?.code) {
      steps.push({ step: '模型重试', code: d.failure.code, message: normalizeMessage(d.failure.message), at: e.seq, kind: 'retry' });
    } else if (e.type === 'tool/result' && d.error?.code) {
      steps.push({ step: '工具报错', code: d.error.code, message: normalizeMessage(d.message?.content?.[0]?.text), at: e.seq, kind: 'tool' });
    } else if (e.type === 'compaction/summary' || e.type === 'manual-compaction') {
      const text = normalizeMessage(d.outcome?.text ?? d.text ?? '');
      if (text) steps.push({ step: '压缩结算', code: 'COMPACTION', message: text, at: e.seq, kind: 'compaction' });
    }
  }
  const hasOverflow = steps.some((s) => s.code === 'CONTEXT_WINDOW_EXCEEDED');
  const compactionFailed = steps.some((s) => /could not produce a useful summary/i.test(s.message));
  const rootCause = hasOverflow
    ? (compactionFailed
        ? '上下文溢出后自动压缩未产出可用摘要，溢出未被回收，本轮终止。'
        : '上下文溢出触发本轮失败，自动压缩结果需查看会话日志。')
    : '';
  return {
    steps,
    rootCause,
    isChain: hasOverflow && compactionFailed,
    suggestedActions: hasOverflow
      ? ['新建会话并保留关键结论', '手动执行 /compact', '查看会话 token 曲线与压缩记录']
      : [],
  };
}
