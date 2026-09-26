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

export interface HandoverSpeakerSummary {
  speaker: string;
  total: number;
  pending: number;
  confirmed: number;
  duplicate: number;
  stale: number;
  ignored: number;
  revisions: number;
  ruleHits: number;
}

export interface HandoverRuleUsage {
  ruleId: string;
  source: string;
  replacement: string;
  speaker: string;
  enabled: boolean;
  usageCount: number;
  delta: number;
  pendingHits: number;
}

export interface HandoverOpenItem {
  segmentId: string;
  sequence: number;
  speaker: string;
  state: SegmentState;
  reason: string;
  waitSeconds: number;
  text: string;
}

export interface HandoverResolvedItem {
  segmentId: string;
  sequence: number;
  speaker: string;
  previousState: SegmentState;
  resolvedAs: 'confirmed' | 'ignored' | 'removed';
  note: string;
}

export type HandoverRiskKind = 'new-stale' | 'new-duplicate' | 'new-pending' | 'offline-outbox' | 'backlog' | 'connection';

export interface HandoverRisk {
  kind: HandoverRiskKind;
  label: string;
  detail: string;
}

export interface HandoverReport {
  id: string;
  index: number;
  createdAt: number;
  connection: ConnectionState;
  stats: {
    pending: number;
    stale: number;
    duplicate: number;
    offline: number;
    backlog: number;
    oldestWaitSeconds: number;
  };
  speakers: HandoverSpeakerSummary[];
  rules: HandoverRuleUsage[];
  openItems: HandoverOpenItem[];
  recentRisks: HandoverRisk[];
  resolved: HandoverResolvedItem[];
  previousId?: string;
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
};

export function createInitialModel(): DeskModel {
  return {
    eventName: '新品发布会现场字幕',
    eventDate: new Date(now).toISOString().slice(0, 10),
    segments: [...seededSegments, duplicate],
    handovers: [],
    rules: [
      { id: 'term-1', source: 'co pilot', replacement: 'Co-Pilot', speaker: '', enabled: true, caseSensitive: false, usageCount: 4, createdAt: now - 86_400_000 },
      { id: 'term-2', source: 'studio cloud', replacement: 'Studio Cloud', speaker: '', enabled: true, caseSensitive: false, usageCount: 7, createdAt: now - 43_200_000 },
      { id: 'term-3', source: '五G', replacement: '5G', speaker: '', enabled: true, caseSensitive: true, usageCount: 2, createdAt: now - 3_600_000 },
    ],
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
        if (item.staleReason) item.state = 'stale';
      }
      const duplicate = isDuplicate(item, seen.map((id) => model.segments.find((segmentItem) => segmentItem.id === id)).filter(Boolean) as CaptionSegment[]);
      if (duplicate && item.state !== 'confirmed') {
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
    segments = [...segments, duplicate ? { ...candidate, state: 'duplicate', duplicateOf: duplicate.id, staleReason: `与第 ${duplicate.sequence} 段重复` } : candidate];
    nextSequence += 1;
  }
  const pendingCutoff = Date.now() - 90_000;
  segments = segments.map((item) => item.state === 'pending' && item.receivedAt < pendingCutoff
    ? { ...item, state: 'stale', staleReason: `片段已等待 ${Math.round((Date.now() - item.receivedAt) / 1000)} 秒` }
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

export const HANDOVER_RISK_WINDOW_MS = 10 * 60_000;
const HANDOVER_OPEN_STATES: SegmentState[] = ['pending', 'stale', 'duplicate'];

function ruleMatcher(rule: TermRule): RegExp {
  return new RegExp(rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), rule.caseSensitive ? '' : 'i');
}

/**
 * 生成一份值守交接快照。返回的对象是完全独立的数据副本，
 * 追加到 model.handovers 后不再被任何校对操作改写（冻结）。
 */
export function generateHandover(model: DeskModel, now = Date.now()): HandoverReport {
  const previous = model.handovers[model.handovers.length - 1];
  const openSegments = model.segments.filter((item) => HANDOVER_OPEN_STATES.includes(item.state));

  const speakers = new Map<string, HandoverSpeakerSummary>();
  for (const item of model.segments) {
    const entry = speakers.get(item.speaker) ?? {
      speaker: item.speaker, total: 0, pending: 0, confirmed: 0,
      duplicate: 0, stale: 0, ignored: 0, revisions: 0, ruleHits: 0,
    };
    entry.total += 1;
    entry.revisions += item.revision;
    if (item.tags.includes('术语已应用')) entry.ruleHits += 1;
    if (item.state === 'pending') entry.pending += 1;
    else if (item.state === 'confirmed') entry.confirmed += 1;
    else if (item.state === 'duplicate') entry.duplicate += 1;
    else if (item.state === 'stale') entry.stale += 1;
    else if (item.state === 'ignored') entry.ignored += 1;
    speakers.set(item.speaker, entry);
  }
  const speakerSummary = [...speakers.values()].sort((a, b) =>
    (b.stale + b.duplicate + b.pending) - (a.stale + a.duplicate + a.pending) || b.revisions - a.revisions);

  const previousUsage = new Map((previous?.rules ?? []).map((rule) => [rule.ruleId, rule.usageCount]));
  const ruleUsage: HandoverRuleUsage[] = model.rules.map((rule) => {
    const matcher = ruleMatcher(rule);
    const pendingHits = rule.enabled
      ? openSegments.filter((item) => (!rule.speaker || rule.speaker === item.speaker) && matcher.test(item.corrected)).length
      : 0;
    return {
      ruleId: rule.id,
      source: rule.source,
      replacement: rule.replacement,
      speaker: rule.speaker,
      enabled: rule.enabled,
      usageCount: rule.usageCount,
      delta: previous ? rule.usageCount - (previousUsage.get(rule.id) ?? 0) : 0,
      pendingHits,
    };
  });

  const openItems: HandoverOpenItem[] = [...openSegments]
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => ({
      segmentId: item.id,
      sequence: item.sequence,
      speaker: item.speaker,
      state: item.state,
      reason: item.staleReason ?? (item.state === 'pending' ? '等待校对确认' : item.state === 'duplicate' ? '检测到重复片段' : '等待处理'),
      waitSeconds: Math.max(0, Math.round((now - item.receivedAt) / 1000)),
      text: item.corrected || item.original,
    }));

  const resolved: HandoverResolvedItem[] = (previous?.openItems ?? []).flatMap((item): HandoverResolvedItem[] => {
    const current = model.segments.find((segment) => segment.id === item.segmentId);
    const base = { segmentId: item.segmentId, sequence: item.sequence, speaker: item.speaker, previousState: item.state };
    if (!current) return [{ ...base, resolvedAs: 'removed' as const, note: '片段已不在当前队列中' }];
    if (HANDOVER_OPEN_STATES.includes(current.state)) return [];
    if (current.state === 'confirmed') return [{ ...base, resolvedAs: 'confirmed' as const, note: '已确认并进入直播区' }];
    if (current.state === 'ignored') return [{ ...base, resolvedAs: 'ignored' as const, note: '已人工忽略' }];
    return [];
  });

  const windowStart = now - HANDOVER_RISK_WINDOW_MS;
  const recentRisks: HandoverRisk[] = [];
  for (const item of model.segments) {
    const arrivedSeconds = Math.max(0, Math.round((now - item.receivedAt) / 1000));
    if (item.state === 'stale' && item.receivedAt + 90_000 >= windowStart) {
      recentRisks.push({ kind: 'new-stale', label: `片段 #${item.sequence} 刚转为过期`, detail: `${item.speaker} · ${item.staleReason ?? '等待超过 90 秒'}` });
    }
    if (item.state === 'duplicate' && item.receivedAt >= windowStart) {
      recentRisks.push({ kind: 'new-duplicate', label: `片段 #${item.sequence} 疑似重复`, detail: `${item.speaker} · ${item.staleReason ?? '与已有片段高度相似'}` });
    }
    if (item.state === 'pending' && item.receivedAt >= windowStart) {
      recentRisks.push({ kind: 'new-pending', label: `片段 #${item.sequence} 到达后未处理`, detail: `${item.speaker} · 已等待 ${arrivedSeconds} 秒` });
    }
  }
  const offlineOutbox = model.segments.filter((item) => item.source === 'offline' && item.state === 'confirmed');
  if (offlineOutbox.length) {
    recentRisks.push({ kind: 'offline-outbox', label: `离线发件箱积压 ${offlineOutbox.length} 段`, detail: '恢复连接后需按时间顺序合并，合并前不要重复确认' });
  }
  const stats = queueStats(model);
  if (stats.backlog > 8) {
    recentRisks.push({ kind: 'backlog', label: `队列积压 ${stats.backlog} 段`, detail: `最长等待 ${stats.oldestWaitSeconds} 秒，建议优先处理过期片段` });
  }
  if (model.connection !== 'connected') {
    recentRisks.push({ kind: 'connection', label: model.connection === 'offline' ? '当前处于离线校正' : '连接延迟波动', detail: model.connection === 'offline' ? '确认内容暂存离线发件箱' : `模拟延迟 ${model.simulatedDelay.toFixed(1)} 秒` });
  }
  const riskOrder: HandoverRiskKind[] = ['new-stale', 'new-duplicate', 'offline-outbox', 'backlog', 'connection', 'new-pending'];
  recentRisks.sort((a, b) => riskOrder.indexOf(a.kind) - riskOrder.indexOf(b.kind));

  return {
    id: `handover-${now.toString(36)}-${model.handovers.length + 1}`,
    index: model.handovers.length + 1,
    createdAt: now,
    connection: model.connection,
    stats,
    speakers: speakerSummary,
    rules: ruleUsage,
    openItems,
    recentRisks,
    resolved,
    previousId: previous?.id,
  };
}
