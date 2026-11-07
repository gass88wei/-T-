// ===== 复利 / 财务计算 =====

import { num } from './util.js';

function round2(v) {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100;
}

/**
 * 复利终值
 * @param {object} p
 * @param {number} p.principal 初始本金
 * @param {number} p.contribution 每年追加（均摊到每期投入）
 * @param {number} p.annualRate 年化利率，百分数（如 7 表示 7%）
 * @param {number} p.years 年数
 * @param {number} p.periodsPerYear 每年复利次数（12=月，4=季，1=年，0=连续复利）
 */
export function compound({ principal, contribution, annualRate, years, periodsPerYear }) {
  const P = num(principal);
  const C = num(contribution);
  const r = num(annualRate) / 100;
  const t = num(years);
  const n = num(periodsPerYear);

  const rows = [];
  let balance = P;
  let totalInvested = P;

  if (t <= 0) {
    return {
      final: round2(P),
      totalInvested: round2(P),
      totalInterest: 0,
      effectiveAnnualRate: n > 0 ? (Math.pow(1 + r / n, n) - 1) * 100 : (Math.exp(r) - 1) * 100,
      multiple: 1,
      rows: [],
    };
  }

  // 统一用「年内子期数」推进。连续复利用 12 个子期模拟。
  const subPeriodsPerYear = n > 0 ? n : 12;
  const totalPeriods = Math.max(1, Math.round(t * subPeriodsPerYear));
  // 每个子期的利率
  const ratePerPeriod = n > 0 ? r / n : Math.exp(r / 12) - 1;
  // 每周期的追加额（每年 C 均摊到子期）
  const perPeriodContribution = C / subPeriodsPerYear;

  let yearStartBalance = P;
  let yearContrib = 0;
  let yearInterest = 0;
  let periodInYear = 0;
  let yearIndex = 0;

  for (let i = 1; i <= totalPeriods; i += 1) {
    const interest = balance * ratePerPeriod;
    balance += interest;
    yearInterest += interest;

    balance += perPeriodContribution;
    totalInvested += perPeriodContribution;
    yearContrib += perPeriodContribution;

    periodInYear += 1;

    // 年末（或最后一次）收尾
    if (periodInYear === subPeriodsPerYear || i === totalPeriods) {
      yearIndex += 1;
      const isPartial = periodInYear < subPeriodsPerYear;
      rows.push({
        period: i / subPeriodsPerYear,
        label: isPartial
          ? `${(i / subPeriodsPerYear).toFixed(2)} 年`
          : `${yearIndex} 年`,
        start: round2(yearStartBalance),
        contribution: round2(yearContrib),
        interest: round2(yearInterest),
        end: round2(balance),
        invested: round2(totalInvested),
      });
      yearStartBalance = balance;
      yearContrib = 0;
      yearInterest = 0;
      periodInYear = 0;
    }
  }

  const effectiveAnnualRate = n > 0
    ? (Math.pow(1 + r / n, n) - 1) * 100
    : (Math.exp(r) - 1) * 100;

  const final = round2(balance);
  const invested = round2(totalInvested);

  return {
    final,
    totalInvested: invested,
    totalInterest: round2(final - invested),
    effectiveAnnualRate,
    multiple: invested > 0 ? final / invested : 0,
    rows,
  };
}

/**
 * 反向：达到目标金额需要多少年
 */
export function yearsToTarget({ principal, contribution, annualRate, target, periodsPerYear }) {
  const T = num(target);
  if (T <= 0) return null;

  const P = num(principal);
  if (P >= T) return 0;

  let lo = 0;
  let hi = 200;
  const hiRes = compound({ principal, contribution, annualRate, years: hi, periodsPerYear });
  if (hiRes.final < T) return null;

  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    const res = compound({ principal, contribution, annualRate, years: mid, periodsPerYear });
    if (res.final >= T) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * 反向：达到目标所需年化利率
 */
export function rateToTarget({ principal, contribution, years, target, periodsPerYear }) {
  const T = num(target);
  if (T <= 0) return null;

  let lo = -99;
  let hi = 500;
  const hiRes = compound({ principal, contribution, annualRate: hi, years, periodsPerYear });
  if (hiRes.final < T) return null;

  for (let i = 0; i < 110; i += 1) {
    const mid = (lo + hi) / 2;
    const res = compound({ principal, contribution, annualRate: mid, years, periodsPerYear });
    if (res.final >= T) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * 反向：达到目标每年需要追加多少
 */
export function contributionToTarget({ principal, annualRate, years, target, periodsPerYear }) {
  const T = num(target);
  if (T <= 0) return null;

  const withoutContrib = compound({ principal, contribution: 0, annualRate, years, periodsPerYear });
  if (withoutContrib.final >= T) return 0;

  let lo = 0;
  let hi = Math.max(T, 1000);
  for (let i = 0; i < 110; i += 1) {
    const mid = (lo + hi) / 2;
    const res = compound({ principal, contribution: mid, annualRate, years, periodsPerYear });
    if (res.final >= T) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * 4% 法则：需要多少本金才能覆盖月支出
 */
export function fireTarget(monthlyExpense, yieldRate = 4) {
  const exp = num(monthlyExpense);
  const rate = num(yieldRate) / 100;
  if (rate <= 0) return 0;
  return (exp * 12) / rate;
}

/**
 * 生命价值：买这件东西要工作多久（小时）
 */
export function lifeHours(monthlySalary, price, hoursPerMonth = 22 * 8) {
  const salary = num(monthlySalary);
  const p = num(price);
  if (salary <= 0) return 0;
  const hourly = salary / hoursPerMonth;
  return p / hourly;
}
