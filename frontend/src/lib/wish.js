// ===== 想要清单：真实代价 / 折合工时 / 每日成本 =====

import { num } from './util.js';

/** 月薪换算时薪，按国家统计局口径月均 21.75 个工作日、每日 8 小时 */
export const HOURS_PER_MONTH = 21.75 * 8;

export function hourlyWage(monthlySalary) {
  const s = num(monthlySalary);
  if (s <= 0) return 0;
  return s / HOURS_PER_MONTH;
}

/**
 * 一件东西的真实代价。
 * @param {number} price       标价
 * @param {number} years       持有年数
 * @param {number} annualHold  每年持有成本（保养/保险/订阅/耗材）
 * @param {number} oppRate     机会成本年化（%）
 */
export function realCost(price, years, annualHold, oppRate) {
  const p = num(price);
  const y = Math.max(num(years), 0);
  const hold = num(annualHold);
  const r = num(oppRate) / 100;

  const holdTotal = hold * y;
  // 标价占用的钱，如果没花掉、按 r 复利 y 年，会长出多少
  const oppCost = r > 0 ? p * (Math.pow(1 + r, y) - 1) : 0;
  const total = p + holdTotal;

  return {
    price: p,
    years: y,
    annualHold: hold,
    holdTotal,
    oppCost,
    total,               // 现金总支出
    real: total + oppCost, // 含机会成本的真实代价
    perYear: y > 0 ? total / y : 0,
    perMonth: y > 0 ? total / y / 12 : 0,
    perDay: y > 0 ? total / y / 365 : 0,
  };
}

/**
 * 折合工时（按真实代价，不是标价）
 */
export function costInTime(real, monthlySalary) {
  const h = hourlyWage(monthlySalary);
  if (h <= 0) return null;
  const hours = real / h;
  return {
    hours,
    days: hours / 8,
    weeks: hours / 40,
    months: hours / HOURS_PER_MONTH,
    hourly: h,
  };
}

/** 决策分档：按折合工时 */
export function verdict(hours) {
  if (hours === null || !Number.isFinite(hours)) return { text: '待填月薪', tone: 'muted' };
  if (hours < 8) return { text: '一顿饭的事', tone: 'down' };
  if (hours < 40) return { text: '一周之内', tone: 'down' };
  if (hours < 160) return { text: '值得想想', tone: 'warn' };
  if (hours < 480) return { text: '多久才回本', tone: 'warn' };
  return { text: '再想想', tone: 'up' };
}

/** 一条清单项的全套数字 */
export function analyze(item, monthlySalary, oppRate) {
  const c = realCost(item.price ?? item.target, item.years, item.annualHold, oppRate);
  const t = costInTime(c.real, monthlySalary);
  return { cost: c, time: t, verdict: verdict(t ? t.hours : null) };
}
