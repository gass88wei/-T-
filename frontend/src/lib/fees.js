// ===== A股交易费用计算 =====
// 佣金：双边收取，不足最低值按最低值收
// 印花税：仅卖出收取
// 过户费：双边收取（沪深已统一）

import { num } from './util.js';

/**
 * 计算单边费用
 * @param {number} amount 成交金额
 * @param {'buy'|'sell'} side 买入或卖出
 * @param {object} s 设置
 */
export function sideFee(amount, side, s) {
  const amt = Math.abs(num(amount));
  if (amt <= 0) return { commission: 0, stamp: 0, transfer: 0, total: 0, rate: 0 };

  const commissionRate = num(s.commissionRate, 0.00025);
  const minCommission = num(s.minCommission, 5);
  const stampDuty = num(s.stampDuty, 0.001);
  const transferFee = num(s.transferFee, 0.00001);

  let commission = amt * commissionRate;
  if (commission < minCommission) commission = minCommission;

  const stamp = side === 'sell' ? amt * stampDuty : 0;
  const transfer = amt * transferFee;
  const total = commission + stamp + transfer;

  return {
    commission,
    stamp,
    transfer,
    total,
    rate: amt > 0 ? total / amt : 0,
  };
}

/**
 * 计算一次买入卖出的双边总费用
 */
export function roundTripFee(buyAmount, sellAmount, s) {
  const b = sideFee(buyAmount, 'buy', s);
  const se = sideFee(sellAmount, 'sell', s);
  return {
    buy: b,
    sell: se,
    total: b.total + se.total,
  };
}

/**
 * 做T真实净利：卖出额 - 买入额 - 双边费用
 */
export function tNetProfit(buyPrice, sellPrice, qty, s) {
  const bp = num(buyPrice);
  const sp = num(sellPrice);
  const q = num(qty);
  if (q <= 0) return { gross: 0, fee: 0, net: 0, detail: null };

  const buyAmount = bp * q;
  const sellAmount = sp * q;
  const gross = sellAmount - buyAmount;
  const f = roundTripFee(buyAmount, sellAmount, s);
  return { gross, fee: f.total, net: gross - f.total, detail: f };
}

/**
 * 毛利率 / 净利率（相对于买入成本）
 */
export function tRate(buyPrice, sellPrice, qty, s) {
  const bp = num(buyPrice);
  const q = num(qty);
  const cost = bp * q;
  if (cost <= 0) return { grossRate: 0, netRate: 0 };
  const r = tNetProfit(buyPrice, sellPrice, q, s);
  return { grossRate: (r.gross / cost) * 100, netRate: (r.net / cost) * 100 };
}

/**
 * 保本卖出价：考虑双边费用，卖出多少才不亏
 * 解方程：sp*q - (sp*q*(commRate+stampRate+transRate) + 佣金最低修正) = bp*q
 * 简化处理：先按费率估算，再修正最低佣金
 */
export function breakEvenSellPrice(buyPrice, qty, s) {
  const bp = num(buyPrice);
  const q = num(qty);
  if (bp <= 0 || q <= 0) return 0;

  const commissionRate = num(s.commissionRate, 0.00025);
  const minCommission = num(s.minCommission, 5);
  const stampDuty = num(s.stampDuty, 0.001);
  const transferFee = num(s.transferFee, 0.00001);

  const buyAmount = bp * q;
  let buyCommission = buyAmount * commissionRate;
  if (buyCommission < minCommission) buyCommission = minCommission;
  const buyFee = buyCommission + buyAmount * transferFee;

  // 卖出侧费率（不含最低佣金修正）
  const sellRate = commissionRate + stampDuty + transferFee;

  // 目标：sp*q - sp*q*sellRate - sellFeeMinAdjust = buyAmount + buyFee
  const target = buyAmount + buyFee;
  let sp = target / (q * (1 - sellRate));

  // 修正最低佣金：若算出的卖出佣金低于最低值，需要加回差额
  const sellAmount = sp * q;
  const sellCommission = sellAmount * commissionRate;
  if (sellCommission < minCommission) {
    const diff = minCommission - sellCommission;
    sp += diff / (q * (1 - sellRate));
  }
  return sp;
}
