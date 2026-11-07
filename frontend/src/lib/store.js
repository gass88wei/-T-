// ===== 数据仓库：内存态 + Go 侧 JSON 持久化 =====

import { uid } from './util.js';

const DEFAULT_SETTINGS = {
  commissionRate: 0.00025, // 佣金率（双边）
  minCommission: 5,        // 最低佣金
  stampDuty: 0.001,        // 印花税（仅卖出）
  transferFee: 0.00001,    // 过户费（双边，沪深已统一）
};

const DEFAULT_FINANCE = {
  transactions: [],
  goals: [],
  settings: { yieldRate: 4, targetExpense: 5000 },
};

function emptyState() {
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS },
    stocks: [],
    savedCodes: [],
    calcHistory: [],
    finance: JSON.parse(JSON.stringify(DEFAULT_FINANCE)),
  };
}

let state = emptyState();
let dataPath = '';
const listeners = new Set();
let saveTimer = null;
let pendingSave = false;

/** 补齐缺失字段，兼容旧数据 */
export function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.version = 2;
  out.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  out.finance = {
    ...base.finance,
    ...(raw.finance || {}),
    settings: { ...base.finance.settings, ...((raw.finance || {}).settings || {}) },
  };
  // 清掉已废弃的字段（v1 → v2 瘦身）
  delete out.simpleLog;
  delete out.tradeRecords;
  delete out.compoundHistory;

  for (const k of ['stocks', 'savedCodes', 'calcHistory']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (!Array.isArray(out.finance.transactions)) out.finance.transactions = [];
  if (!Array.isArray(out.finance.goals)) out.finance.goals = [];

  // 持仓字段补齐
  out.stocks = out.stocks.map((s) => ({
    id: s.id || uid('st'),
    code: String(s.code || '').toUpperCase(),
    name: s.name || '未命名',
    baseCost: Number(s.baseCost) || 0,
    baseQty: Number(s.baseQty) || 0,
    currCost: Number(s.currCost) || 0,
    currQty: Number(s.currQty) || 0,
    history: Array.isArray(s.history) ? s.history : [],
  }));
  return out;
}

export function getState() {
  return state;
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...state.settings };
}

export function setSettings(patch) {
  state.settings = { ...getSettings(), ...patch };
  emit();
  scheduleSave();
}

export function getDataPath() {
  return dataPath;
}

/** 订阅状态变化 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (e) {
      console.error('订阅回调出错', e);
    }
  }
}

/** 供外部（视图）修改后调用：通知渲染 + 安排落盘 */
export function commit() {
  emit();
  scheduleSave();
}

/** 延迟落盘，避免连续输入时频繁写文件 */
function scheduleSave() {
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 260);
}

/** 立即落盘 */
export async function flushSave() {
  clearTimeout(saveTimer);
  if (!pendingSave) return true;
  pendingSave = false;
  try {
    const text = JSON.stringify(state, null, 2);
    const fn = window.go?.main?.App?.SaveData;
    if (typeof fn !== 'function') return false;
    await fn(text);
    return true;
  } catch (e) {
    console.error('保存失败', e);
    if (window.__toast) window.__toast('保存失败：' + (e?.message || e), 'err');
    pendingSave = true;
    return false;
  }
}

/** 启动时从磁盘载入 */
export async function initStore() {
  try {
    const api = window.go?.main?.App;
    if (!api) {
      console.warn('Go 后端未就绪，使用内存态');
      return false;
    }
    dataPath = await api.DataPath();
    const text = await api.LoadData();
    if (text) {
      state = normalize(JSON.parse(text));
    }
    emit();
    return true;
  } catch (e) {
    console.error('载入数据失败', e);
    if (window.__toast) window.__toast('载入数据失败，已使用空白数据', 'err');
    state = emptyState();
    emit();
    return false;
  }
}

/** 整体替换（用于导入） */
export function replaceState(raw) {
  state = normalize(raw);
  pendingSave = false;
  emit();
  return flushSave();
}

/** 导出为 JSON 字符串 */
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

// ===== 通用增删辅助 =====

export function addItem(key, item) {
  state[key].unshift(item);
  commit();
  return item;
}

export function removeItem(key, predicate) {
  const before = state[key].length;
  state[key] = state[key].filter((it) => !predicate(it));
  if (state[key].length !== before) commit();
  return before - state[key].length;
}
