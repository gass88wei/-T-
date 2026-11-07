// ===== 持仓成本核算（做T / 加仓 / 减仓）=====
//
// 约定：
//  - 做T（低买高卖，日内回转）：利润直接冲减持仓总市值，股数不变 → 成本摊薄
//  - 加仓：总市值 + 新增买入额，股数增加 → 成本重算
//  - 减仓：股数减少，成本不变（简单平均法），收益计入已实现盈亏

import { num, round } from './util.js';
import { tNetProfit } from './fees.js';

/**
 * 应用一次操作到持仓，返回新的成本与股数
 * @param {object} stock 持仓对象
 * @param {object} op { buy, sell, qty }
 * @param {object} settings 费用设置
 */
export function applyOperation(stock, op, settings) {
  const buyPrice = num(op.buy);
  const sellPrice = num(op.sell);
  const qty = num(op.qty);

  let currCost = num(stock.currCost);
  let currQty = num(stock.currQty);
  let netProfit = 0;
  let changePct = 0;
  let actionType = '';
  let remainQty = currQty;

  if (qty <= 0) {
    return { ok: false, msg: '请输入交易数量' };
  }
  if (buyPrice <= 0 && sellPrice <= 0) {
    return { ok: false, msg: '请至少填写买入价或卖出价' };
  }

  if (buyPrice > 0 && sellPrice > 0) {
    // ---- 做T ----
    if (currQty <= 0) return { ok: false, msg: '当前持仓为 0，无法做T' };
    const r = tNetProfit(buyPrice, sellPrice, qty, settings);
    netProfit = r.net;

    const oldTotalVal = currQty * currCost;
    const newTotalVal = oldTotalVal - netProfit;
    let newCost = currQty > 0 ? newTotalVal / currQty : 0;
    if (newCost < 0) newCost = 0;

    changePct = currCost > 0 ? ((currCost - newCost) / currCost) * 100 : 0;
    currCost = newCost;
    actionType = '做T';
  } else if (buyPrice > 0) {
    // ---- 加仓 ----
    netProfit = 0;
    const oldTotalVal = currQty * currCost;
    const addedVal = qty * buyPrice;
    const newQty = currQty + qty;
    currCost = newQty > 0 ? (oldTotalVal + addedVal) / newQty : 0;
    currQty = newQty;
    changePct = num(stock.currCost) > 0 ? ((num(stock.currCost) - currCost) / num(stock.currCost)) * 100 : 0;

    // 加仓的实际费用（从现金角度是支出，不计入持仓成本，这里仅记录）
    actionType = '加仓';
  } else {
    // ---- 减仓 ----
    if (qty > currQty) return { ok: false, msg: `卖出数量（${qty}）大于持有数量（${currQty}）` };
    const oldTotalVal = currQty * currCost;
    const soldCostBase = qty * currCost;
    const soldRealVal = qty * sellPrice;
    const buyAmount = 0;
    const sellAmount = soldRealVal;
    const f = tNetProfit(0, sellPrice, qty, settings); // 仅卖出侧费用
    const fee = f.fee;
    netProfit = soldRealVal - soldCostBase - fee;
    currQty = currQty - qty;
    // 成本不变
    changePct = 0;
    actionType = '减仓';
  }

  remainQty = currQty;

  return {
    ok: true,
    currCost,
    currQty,
    netProfit,
    changePct,
    actionType,
    remainQty,
    record: {
      buy: buyPrice,
      sell: sellPrice,
      qty,
      netProfit: round(netProfit, 2),
      drop: round(changePct, 3),
      remainQty,
      type: actionType,
    },
  };
}

/**
 * 删除某条历史记录后，从头重算整个持仓
 */
export function rebuildStock(stock, settings) {
  let cost = num(stock.baseCost);
  let qty = num(stock.baseQty);

  // history 是 unshift 进的（新的在前），重算要从旧到新
  const ordered = [...stock.history].reverse();

  const recomputed = [];
  for (const op of ordered) {
    const buy = num(op.buy);
    const sell = num(op.sell);
    const q = num(op.qty);
    let netProfit = 0;
    let drop = 0;

    if (buy > 0 && sell > 0) {
      const r = tNetProfit(buy, sell, q, settings);
      netProfit = r.net;
      const oldTotalVal = qty * cost;
      const newTotalVal = oldTotalVal - netProfit;
      const newCost = qty > 0 ? newTotalVal / qty : 0;
      drop = cost > 0 ? ((cost - newCost) / cost) * 100 : 0;
      cost = Math.max(newCost, 0);
    } else if (buy > 0) {
      const oldTotalVal = qty * cost;
      const addedVal = q * buy;
      qty += q;
      cost = qty > 0 ? (oldTotalVal + addedVal) / qty : 0;
    } else if (sell > 0) {
      const soldCostBase = q * cost;
      const soldRealVal = q * sell;
      const f = tNetProfit(0, sell, q, settings);
      netProfit = soldRealVal - soldCostBase - f.fee;
      qty -= q;
    }

    recomputed.push({
      ...op,
      netProfit: round(netProfit, 2),
      drop: round(drop, 3),
      remainQty: qty,
    });
  }

  stock.currCost = round(Math.max(cost, 0), 4);
  stock.currQty = qty;
  stock.history = recomputed.reverse();
  return stock;
}

/**
 * 汇总所有持仓的做T收益统计
 */
export function stockStats(stocks) {
  let winCount = 0;
  let lossCount = 0;
  let totalWin = 0;
  let totalLoss = 0;

  for (const s of stocks) {
    for (const h of s.history || []) {
      const p = num(h.netProfit);
      if (p > 0) {
        winCount += 1;
        totalWin += p;
      } else if (p < 0) {
        lossCount += 1;
        totalLoss += Math.abs(p);
      }
    }
  }

  const totalCount = winCount + lossCount;
  return {
    winCount,
    lossCount,
    totalWin,
    totalLoss,
    netProfit: totalWin - totalLoss,
    winRate: totalCount > 0 ? (winCount / totalCount) * 100 : 0,
    totalCount,
  };
}

/**
 * 摊薄进度：相对初始成本降低了多少
 */
export function dilutionPct(stock) {
  const base = num(stock.baseCost);
  const curr = num(stock.currCost);
  if (base <= 0) return 0;
  return ((base - curr) / base) * 100;
}
