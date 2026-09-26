export type ConnectionState = 'connected' | 'degraded' | 'offline';
export type SegmentState = 'pending' | 'confirmed' | 'duplicate' | 'stale' | 'ignored';
export type SegmentSource = 'live' | 'offline' | 'manual';

export interface CaptionSegment {
  id: string;
  sequence: number;
  startTime: number;
  receivedAt: number;
  confirmedAt?: number;
  speaker: string;
  original: string;
  corrected: string;
  numberHints: string;
  source: SegmentSource;
  state: SegmentState;
  duplicateOf?: string;
  staleReason?: string;
  /** 进入重复/过期异常的时间，用于交接里的“最近十分钟新增风险”。 */
  flaggedAt?: number;
  revision: number;
  tags: string[];
}

export interface TermRule {
  id: string;
  source: string;
  replacement: string;
  speaker: string;
  enabled: boolean;
  caseSensitive: boolean;
  usageCount: number;
  createdAt: number;
}

export interface HandoverSpeakerStat {
  speaker: string;
  /** 修改次数合计（所有片段 revision 之和）。 */
  revisions: number;
  /** 有修改的片段数。 */
  edited: number;
  confirmed: number;
  pending: number;
  stale: number;
  duplicate: number;
  ignored: number;
  /** 应用过术语规则的片段数。 */
  ruleHits: number;
  /** 该发言人专属规则的累计调用次数。 */
  scopedRuleUses: number;
}

export interface HandoverRuleStat {
  id: string;
  source: string;
  replacement: string;
  scope: string;
  usageCount: number;
  /** 当前仍命中规则但尚未应用的片段数（常被忽略的规则）。 */
  missed: number;
}

export interface HandoverOpenItem {
  segmentId: string;
  sequence: number;
  speaker: string;
  state: SegmentState | 'outbox';
  stateLabel: string;
  text: string;
  waitSeconds: number;
  note: string;
}

export interface HandoverRisk {
  segmentId: string;
  sequence: number;
  speaker: string;
  kind: 'stale' | 'duplicate';
  kindLabel: string;
  detectedAt: number;
  text: string;
  note: string;
}

export interface HandoverResolution {
  segmentId: string;
  sequence: number;
  speaker: string;
  wasLabel: string;
  nowLabel: string;
  text: string;
}

/** 值守交接快照：生成后冻结，后续校对不再改写。 */
export interface HandoverReport {
  id: string;
  shift: number;
  createdAt: number;
  connection: ConnectionState;
  speakers: HandoverSpeakerStat[];
  rules: HandoverRuleStat[];
  openItems: HandoverOpenItem[];
  recentRisks: HandoverRisk[];
  /** 相对上一份交接已被处理掉的未处理项。 */
  resolved: HandoverResolution[];
  totals: { pending: number; stale: number; duplicate: number; outbox: number; confirmed: number };
}

export interface DeskModel {
  eventName: string;
  eventDate: string;
  segments: CaptionSegment[];
  rules: TermRule[];
  handovers: HandoverReport[];
  selectedId: string;
  connection: ConnectionState;
  simulatedDelay: number;
  fontSize: number;
  nextSequence: number;
  autoStream: boolean;
  lastMergedAt?: number;
  updatedAt: number;
}

export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  subtitle: string;
}

const now = Date.now();
export const STORAGE_KEY = 'sologsb-1011-live-caption-desk-v1';

function segment(
  id: string,
  sequence: number,
  startTime: number,
  speaker: string,
  original: string,
  corrected = original,
  state: SegmentState = 'pending',
): CaptionSegment {
  return {
    id,
    sequence,
    startTime,
    receivedAt: now - (100 - sequence) * 8_000,
    confirmedAt: state === 'confirmed' ? now - (100 - sequence) * 7_000 : undefined,
    speaker,
    original,
    corrected,
    numberHints: '',
    source: 'live',
    state,
    revision: 0,
    tags: [],
  };
}

const seededSegments: CaptionSegment[] = [
  segment('seg-1', 1, 0, '主持人', '欢迎大家来到二零二六年产品发布会。', '欢迎大家来到2026年产品发布会。', 'confirmed'),
  segment('seg-2', 2, 7, '主讲人', '今天我们会介绍三个模块,首先是实时协作。', '今天我们会介绍三个模块，首先是实时协作。', 'confirmed'),
  segment('seg-3', 3, 15, '主讲人', '延迟和质量监测会帮助我们保持字幕稳定。', '延迟和质量监测会帮助我们保持字幕稳定。', 'confirmed'),
  segment('seg-4', 4, 24, '嘉宾 / 周然', '我们使用 studio cloud 作为演示环境。', '我们使用 Studio Cloud 作为演示环境。', 'pending'),
  segment('seg-5', 5, 34, '嘉宾 / 周然', '每分钟大约会收到一百二十个片段。', '每分钟大约会收到120个片段。', 'pending'),
  segment('seg-6', 6, 43, '主持人', '如果主持人提到 co pilot,需要统一大小写。', '如果主持人提到 Co-Pilot，需要统一大小写。', 'pending'),
  segment('seg-7', 7, 52, '主持人', '这个例子会演示五G网络下的字幕恢复。', '这个例子会演示5G网络下的字幕恢复。', 'pending'),
];

const duplicate: CaptionSegment = {
  ...segment('seg-8', 8, 61, '主讲人', '今天我们重点讨论字幕队列。', '今天我们重点讨论字幕队列。', 'duplicate'),
  source: 'live',
  duplicateOf: 'seg-2',
  staleReason: '与第 2 段高度相似',
  flaggedAt: now - 6 * 60_000,
};

export function createInitialModel(): DeskModel {
  return {
    eventName: '新品发布会现场字幕',
    eventDate: new Date(now).toISOString().slice(0, 10),
    segments: [...seededSegments, duplicate],
    rules: [
      { id: 'term-1', source: 'co pilot', replacement: 'Co-Pilot', speaker: '', enabled: true, caseSensitive: false, usageCount: 4, createdAt: now - 86_400_000 },
      { id: 'term-2', source: 'studio cloud', replacement: 'Studio Cloud', speaker: '', enabled: true, caseSensitive: false, usageCount: 7, createdAt: now - 43_200_000 },
      { id: 'term-3', source: '五G', replacement: '5G', speaker: '', enabled: true, caseSensitive: true, usageCount: 2, createdAt: now - 3_600_000 },
    ],
    handovers: [],
    selectedId: 'seg-4',
    connection: 'connected',
    simulatedDelay: 1.8,
    fontSize: 18,
    nextSequence: 9,
    autoStream: true,
    updatedAt: now,
  };
}

export function cloneModel(model: DeskModel): DeskModel {
  return structuredClone(model);
}

export function normalizeNumbers(text: string): string {
  const digitMap: Record<string, string> = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9' };
  const chineseNumber = (raw: string): number => {
    const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (!/[十百千万]/u.test(raw)) return Number([...raw].map((char) => digits[char] ?? 0).join(''));
    let total = 0;
    let section = 0;
    let number = 0;
    for (const char of raw) {
      if (digits[char] !== undefined) {
        number = digits[char];
      } else if (char === '十') {
        section += (number || 1) * 10;
        number = 0;
      } else if (char === '百') {
        section += (number || 1) * 100;
        number = 0;
      } else if (char === '千') {
        section += (number || 1) * 1000;
        number = 0;
      } else if (char === '万') {
        total += (section + number) * 10_000;
        section = 0;
        number = 0;
      }
    }
    return total + section + number;
  };

  return text
    .replace(/[０-９]/g, (char) => digitMap[char] ?? char)
    .replace(/([零〇一二两三四五六七八九十百千万]+)/gu, (match) => String(chineseNumber(match)))
    .replace(/(?<=\d)[，,](?=\d{3}\b)/g, ',');
}

export function normalizePunctuation(text: string): string {
  return text
    .replace(/([，。！？；：])(?=[^\s，。！？；：])/gu, '$1')
    .replace(/\s+([，。！？；：])/gu, '$1')
    .replace(/([,;:!?])(?=[^\s,;:!?])/g, (match) => ({ ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' }[match] ?? match));
}

export function applyRules(text: string, model: DeskModel): { text: string; used: string[] } {
  let next = text;
  const used: string[] = [];
  for (const rule of model.rules.filter((item) => item.enabled)) {
    if (!rule.source || !next) continue;
    const flags = rule.caseSensitive ? 'g' : 'gi';
    const expression = new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    if (expression.test(next)) {
      next = next.replace(expression, rule.replacement);
      used.push(rule.id);
    }
  }
  return { text: normalizePunctuation(next), used };
}

export function isDuplicate(candidate: CaptionSegment, existing: CaptionSegment[]): CaptionSegment | undefined {
  const normalize = (value: string) => value.replace(/[\s，。！？；：,.;:!?]/g, '').toLocaleLowerCase();
  const candidateText = normalize(candidate.corrected || candidate.original);
  return existing.find((segmentItem) => {
    if (segmentItem.id === candidate.id || segmentItem.state === 'ignored') return false;
    const text = normalize(segmentItem.corrected || segmentItem.original);
    if (!candidateText || !text) return false;
    return text === candidateText || (Math.abs(segmentItem.startTime - candidate.startTime) < 12 && (text.includes(candidateText) || candidateText.includes(text)));
  });
}

export function mergeConfirmedSegments(model: DeskModel): DeskModel {
  const seen: string[] = [];
  const segments = model.segments
    .map((item) => ({ ...item }))
    .sort((a, b) => a.sequence - b.sequence || a.startTime - b.startTime)
    .map((item): CaptionSegment => {
      if (item.source === 'offline' && item.state === 'confirmed') {
        item.source = item.confirmedAt && Date.now() - item.confirmedAt > 90_000 ? 'offline' : 'live';
        item.staleReason = Date.now() - item.receivedAt > 90_000 ? `离线恢复后合并，原始片段已延迟 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒` : undefined;
        if (item.staleReason) {
          item.flaggedAt = Date.now();
          item.state = 'stale';
        }
      }
      const duplicate = isDuplicate(item, seen.map((id) => model.segments.find((segmentItem) => segmentItem.id === id)).filter(Boolean) as CaptionSegment[]);
      if (duplicate && item.state !== 'confirmed') {
        if (item.state !== 'duplicate') item.flaggedAt = Date.now();
        item.state = 'duplicate';
        item.duplicateOf = duplicate.id;
      }
      if (item.state !== 'ignored') seen.push(item.id);
      return item;
    });

  return {
    ...model,
    segments,
    connection: 'connected',
    simulatedDelay: Math.max(0.8, model.simulatedDelay - 0.7),
    lastMergedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function queueStats(model: DeskModel) {
  const pending = model.segments.filter((item) => item.state === 'pending');
  const stale = model.segments.filter((item) => item.state === 'stale');
  const duplicate = model.segments.filter((item) => item.state === 'duplicate');
  const offline = model.segments.filter((item) => item.source === 'offline' && item.state === 'confirmed');
  return {
    pending: pending.length,
    stale: stale.length,
    duplicate: duplicate.length,
    offline: offline.length,
    backlog: pending.length + stale.length + duplicate.length + offline.length,
    oldestWaitSeconds: pending.length ? Math.max(...pending.map((item) => Math.round((Date.now() - item.receivedAt) / 1000))) : 0,
  };
}

export function segmentStateLabel(state: SegmentState): string {
  return {
    pending: '待确认',
    confirmed: '已确认',
    duplicate: '重复片段',
    stale: '过期修改',
    ignored: '已忽略',
  }[state];
}

/** 交接中“新增风险”的统计窗口：最近 10 分钟。 */
export const HANDOVER_RISK_WINDOW_MS = 10 * 60_000;

function isOpenForHandover(item: CaptionSegment): boolean {
  return item.state === 'pending' || item.state === 'stale' || item.state === 'duplicate'
    || (item.state === 'confirmed' && item.source === 'offline');
}

/**
 * 生成一份值守交接快照。返回值只包含派生数据，存入 model.handovers 后不再被后续校对改写；
 * 下一份快照会通过对比上一份的 openItems 标出已解决的异常。
 */
export function buildHandoverReport(model: DeskModel, now = Date.now()): HandoverReport {
  const speakerStats = new Map<string, HandoverSpeakerStat>();
  const statFor = (speaker: string): HandoverSpeakerStat => {
    const key = speaker || '未知发言人';
    const existing = speakerStats.get(key);
    if (existing) return existing;
    const created: HandoverSpeakerStat = {
      speaker: key, revisions: 0, edited: 0, confirmed: 0, pending: 0,
      stale: 0, duplicate: 0, ignored: 0, ruleHits: 0, scopedRuleUses: 0,
    };
    speakerStats.set(key, created);
    return created;
  };
  for (const item of model.segments) {
    const stat = statFor(item.speaker);
    stat.revisions += item.revision;
    if (item.revision > 0) stat.edited += 1;
    if (item.tags.includes('术语已应用')) stat.ruleHits += 1;
    stat[item.state] += 1;
  }
  for (const rule of model.rules) {
    if (!rule.speaker) continue;
    const stat = speakerStats.get(rule.speaker);
    if (stat) stat.scopedRuleUses += rule.usageCount;
  }

  const activeSegments = model.segments.filter((item) => item.state !== 'ignored');
  const rules: HandoverRuleStat[] = model.rules
    .map((rule) => {
      const flags = rule.caseSensitive ? 'g' : 'gi';
      const expression = new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      // 未应用 = 应用该规则后文本会发生变化；已改正成目标文本的片段不算（replace 不受 lastIndex 影响）。
      const missed = rule.source
        ? activeSegments.filter((item) => (!rule.speaker || rule.speaker === item.speaker)
            && item.corrected.replace(expression, rule.replacement) !== item.corrected).length
        : 0;
      return { id: rule.id, source: rule.source, replacement: rule.replacement, scope: rule.speaker || '全部发言人', usageCount: rule.usageCount, missed };
    })
    .sort((a, b) => b.missed - a.missed || b.usageCount - a.usageCount);

  const openItems: HandoverOpenItem[] = model.segments
    .filter(isOpenForHandover)
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => {
      const outbox = item.state === 'confirmed';
      return {
        segmentId: item.id,
        sequence: item.sequence,
        speaker: item.speaker,
        state: outbox ? 'outbox' : item.state,
        stateLabel: outbox ? '离线待合并' : segmentStateLabel(item.state),
        text: item.corrected,
        waitSeconds: Math.max(0, Math.round((now - item.receivedAt) / 1000)),
        note: item.staleReason ?? '',
      };
    });

  const recentRisks: HandoverRisk[] = model.segments
    .filter((item) => (item.state === 'stale' || item.state === 'duplicate')
      && typeof item.flaggedAt === 'number' && now - item.flaggedAt <= HANDOVER_RISK_WINDOW_MS)
    .sort((a, b) => (b.flaggedAt ?? 0) - (a.flaggedAt ?? 0))
    .map((item) => ({
      segmentId: item.id,
      sequence: item.sequence,
      speaker: item.speaker,
      kind: item.state as 'stale' | 'duplicate',
      kindLabel: segmentStateLabel(item.state),
      detectedAt: item.flaggedAt ?? now,
      text: item.corrected,
      note: item.staleReason ?? '',
    }));

  const previous = model.handovers[model.handovers.length - 1];
  const resolved: HandoverResolution[] = [];
  if (previous) {
    for (const open of previous.openItems) {
      const current = model.segments.find((item) => item.id === open.segmentId);
      if (!current) {
        resolved.push({ segmentId: open.segmentId, sequence: open.sequence, speaker: open.speaker, wasLabel: open.stateLabel, nowLabel: '已不在队列', text: open.text });
        continue;
      }
      if (isOpenForHandover(current)) continue;
      const nowLabel = current.state === 'confirmed'
        ? open.state === 'outbox' ? '已合并进直播区' : '已确认进直播区'
        : segmentStateLabel(current.state);
      resolved.push({ segmentId: open.segmentId, sequence: open.sequence, speaker: open.speaker, wasLabel: open.stateLabel, nowLabel, text: open.text });
    }
  }

  return {
    id: `handover-${now.toString(36)}-${model.handovers.length + 1}`,
    shift: model.handovers.length + 1,
    createdAt: now,
    connection: model.connection,
    speakers: [...speakerStats.values()].sort((a, b) => b.revisions - a.revisions || (b.stale + b.duplicate) - (a.stale + a.duplicate)),
    rules,
    openItems,
    recentRisks,
    resolved,
    totals: {
      pending: model.segments.filter((item) => item.state === 'pending').length,
      stale: model.segments.filter((item) => item.state === 'stale').length,
      duplicate: model.segments.filter((item) => item.state === 'duplicate').length,
      outbox: model.segments.filter((item) => item.state === 'confirmed' && item.source === 'offline').length,
      confirmed: model.segments.filter((item) => item.state === 'confirmed').length,
    },
  };
}

/** 把冻结的交接快照导出为纯文本，方便粘贴到接班群或工单。 */
export function handoverToText(report: HandoverReport): string {
  const time = new Date(report.createdAt).toLocaleString('zh-CN', { hour12: false });
  return [
    `【值守交接 · 第 ${report.shift} 班】${time}`,
    `队列：待确认 ${report.totals.pending} · 过期 ${report.totals.stale} · 重复 ${report.totals.duplicate} · 离线待合并 ${report.totals.outbox} · 已确认 ${report.totals.confirmed}`,
    '',
    '发言人汇总：',
    ...report.speakers.map((stat) => `- ${stat.speaker}：修改 ${stat.revisions} 次（${stat.edited} 段）· 术语命中 ${stat.ruleHits} 段 · 专属规则 ${stat.scopedRuleUses} 次 · 待确认 ${stat.pending} · 过期 ${stat.stale} · 重复 ${stat.duplicate} · 已确认 ${stat.confirmed}`),
    '',
    '术语规则：',
    ...(report.rules.length
      ? report.rules.map((rule) => `- ${rule.source} → ${rule.replacement}（${rule.scope}）：已用 ${rule.usageCount} 次${rule.missed ? `，仍有 ${rule.missed} 段未应用` : '，已全部应用'}`)
      : ['- 暂无规则']),
    '',
    `未处理片段（${report.openItems.length}）：`,
    ...(report.openItems.length
      ? report.openItems.map((item) => `- [${item.stateLabel}] #${item.sequence} ${item.speaker}：${item.text}（等待 ${item.waitSeconds} 秒）${item.note ? `｜${item.note}` : ''}`)
      : ['- 无']),
    '',
    `最近 10 分钟新增风险（${report.recentRisks.length}）：`,
    ...(report.recentRisks.length
      ? report.recentRisks.map((risk) => `- [${risk.kindLabel}] #${risk.sequence} ${risk.speaker}：${risk.note || risk.text}`)
      : ['- 无']),
    '',
    `自上一份交接已解决（${report.resolved.length}）：`,
    ...(report.resolved.length
      ? report.resolved.map((item) => `- #${item.sequence} ${item.speaker}：${item.wasLabel} → ${item.nowLabel}`)
      : ['- 无']),
  ].join('\n');
}

export function createLiveSegment(sequence: number): CaptionSegment {
  const speakers = ['主持人', '主讲人', '嘉宾 / 周然', '现场提问'];
  const samples = [
    '接下来请产品团队介绍新的工作流。',
    '请注意屏幕右侧的实时队列状态。',
    '在弱网环境下我们会保留未确认片段。',
    '如果网络恢复,系统会按照时间顺序自动合并。',
    '这段字幕包含二零二五年的项目数据。',
    '大家可以在会后查看完整回放和术语表。',
  ];
  const start = Math.max(0, sequence * 9 - 10);
  return {
    id: `seg-live-${sequence}-${Date.now().toString(36)}`,
    sequence,
    startTime: start,
    receivedAt: Date.now(),
    speaker: speakers[(sequence - 1) % speakers.length],
    original: samples[(sequence - 1) % samples.length],
    corrected: samples[(sequence - 1) % samples.length],
    numberHints: '',
    source: 'live',
    state: 'pending',
    revision: 0,
    tags: [],
  };
}

export function simulateLatency(model: DeskModel): DeskModel {
  if (model.connection === 'offline') return model;
  const step = model.connection === 'degraded' ? 0.7 : model.simulatedDelay > 2.8 ? -0.3 : 0.15;
  const delay = Math.max(0.7, Math.min(8.9, Number((model.simulatedDelay + step).toFixed(1))));
  const applyStream = model.autoStream && Math.random() > 0.68;
  let nextSequence = model.nextSequence;
  let segments = model.segments;
  if (applyStream) {
    const candidate = createLiveSegment(model.nextSequence);
    const duplicate = isDuplicate(candidate, segments);
    segments = [...segments, duplicate ? { ...candidate, state: 'duplicate', duplicateOf: duplicate.id, staleReason: `与第 ${duplicate.sequence} 段重复`, flaggedAt: Date.now() } : candidate];
    nextSequence += 1;
  }
  const pendingCutoff = Date.now() - 90_000;
  segments = segments.map((item) => item.state === 'pending' && item.receivedAt < pendingCutoff
    ? { ...item, state: 'stale', staleReason: `片段已等待 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒`, flaggedAt: Date.now() }
    : item);
  return {
    ...model,
    segments,
    nextSequence,
    simulatedDelay: delay,
    connection: delay > 4.2 ? 'degraded' : model.connection,
    updatedAt: Date.now(),
  };
}

export function toSrt(model: DeskModel): string {
  const stamp = (seconds: number, separator = ',') => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds - Math.floor(seconds)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
  };
  return model.segments
    .filter((item) => item.state === 'confirmed')
    .sort((a, b) => a.startTime - b.startTime)
    .map((item, index) => `${index + 1}\n${stamp(item.startTime)} --> ${stamp(item.startTime + 7)}\n[${item.speaker}] ${item.corrected}\n`)
    .join('\n');
}
