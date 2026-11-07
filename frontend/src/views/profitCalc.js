// ===== 收益计算器：单笔交易收益 + 常用代码标签 + 统计 =====

import { $, money, signed, num, round, esc, trendClass, today, nowStamp, uid } from '../lib/util.js';
import { roundTripFee, tNetProfit } from '../lib/fees.js';
import { commit } from '../lib/store.js';

export function render(root, ctx) {
  const { state, settings } = ctx;
  const st = ctx.viewState;
  if (!st.form) st.form = { code: '', buy: '', sell: '', qty: '1000' };

  // ---- 计算器 ----
  const calcCard = document.createElement('div');
  calcCard.className = 'card';
  calcCard.innerHTML = `
    <div class="card-head"><div class="card-title">💹 交易收益计算器<span class="sub">已含佣金/印花税/过户费</span></div></div>
    <div class="card-body">
      <div class="grid g2">
        <div>
          <div class="field" style="margin-bottom:10px">
            <label>股票代码</label>
            <input type="text" id="pc-code" placeholder="如 000001" maxlength="8" value="${esc(st.form.code)}">
            <div id="pc-tags" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>
          </div>
          <div class="form-row" style="margin-bottom:10px">
            <div class="field"><label>买入价</label><input type="number" id="pc-buy" step="0.001" value="${st.form.buy}" class="mono up" placeholder="0.00"></div>
            <div class="field"><label>卖出价</label><input type="number" id="pc-sell" step="0.001" value="${st.form.sell}" class="mono down" placeholder="0.00"></div>
          </div>
          <div class="field" style="margin-bottom:12px"><label>交易数量（股）</label><input type="number" id="pc-qty" value="${st.form.qty}" class="mono"></div>
          <div class="flex-end">
            <button class="btn btn-primary" id="pc-save" style="flex:1">💾 保存记录</button>
            <button class="btn" id="pc-reset">清空</button>
          </div>
        </div>
        <div>
          <div id="pc-result"></div>
        </div>
      </div>
    </div>
  `;
  root.appendChild(calcCard);

  const pcCode = calcCard.querySelector('#pc-code');
  const pcBuy = calcCard.querySelector('#pc-buy');
  const pcSell = calcCard.querySelector('#pc-sell');
  const pcQty = calcCard.querySelector('#pc-qty');
  const pcResult = calcCard.querySelector('#pc-result');
  const pcTags = calcCard.querySelector('#pc-tags');

  const drawTags = () => {
    pcTags.innerHTML = '';
    if (!state.savedCodes.length) {
      pcTags.innerHTML = '<span class="tiny muted">保存记录后代码会自动出现在这里</span>';
      return;
    }
    state.savedCodes.forEach((code) => {
      const tag = document.createElement('span');
      tag.className = 'tag tag-info';
      tag.style.cursor = 'pointer';
      tag.style.display = 'inline-flex';
      tag.style.alignItems = 'center';
      tag.style.gap = '5px';
      tag.innerHTML = `${esc(code)}<span style="opacity:.55;font-weight:700">×</span>`;
      tag.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN' && e.target.textContent === '×') {
          state.savedCodes = state.savedCodes.filter((c) => c !== code);
          commit();
          drawTags();
          return;
        }
        pcCode.value = code;
        st.form.code = code;
      });
      pcTags.appendChild(tag);
    });
  };
  drawTags();

  const compute = () => {
    const bp = num(pcBuy.value);
    const sp = num(pcSell.value);
    const q = num(pcQty.value);
    if (bp <= 0 || sp <= 0 || q <= 0) {
      pcResult.innerHTML = '<div class="empty" style="padding:24px">填入买入价、卖出价与数量后自动计算</div>';
      return null;
    }
    const buyAmount = bp * q;
    const sellAmount = sp * q;
    const gross = sellAmount - buyAmount;
    const f = roundTripFee(buyAmount, sellAmount, settings);
    const net = gross - f.total;
    const roi = buyAmount > 0 ? (net / buyAmount) * 100 : 0;
    const grossRoi = buyAmount > 0 ? (gross / buyAmount) * 100 : 0;

    pcResult.innerHTML = `
      <div class="grid g2" style="margin-bottom:10px">
        <div class="stat"><div class="stat-label">买入金额</div><div class="stat-value sm up">${money(buyAmount)}</div></div>
        <div class="stat"><div class="stat-label">卖出金额</div><div class="stat-value sm down">${money(sellAmount)}</div></div>
        <div class="stat"><div class="stat-label">毛收益</div><div class="stat-value sm ${trendClass(gross)}">${signed(gross)}</div></div>
        <div class="stat"><div class="stat-label">费用合计</div><div class="stat-value sm muted">${money(f.total)}</div></div>
      </div>
      <div class="stat" style="background:var(--bg);border-color:var(--line)">
        <div class="stat-label">净收益</div>
        <div class="stat-value ${trendClass(net)}" style="font-size:26px">${signed(net)}</div>
        <div class="tiny muted" style="margin-top:4px">
          净收益率 ${net >= 0 ? '+' : ''}${roi.toFixed(2)}% · 毛收益率 ${grossRoi.toFixed(2)}%
        </div>
      </div>
      <div class="hint" style="margin-top:10px">
        费用明细：买入佣金 ${money(f.buy.commission)}${f.buy.commission <= settings.minCommission + 0.001 ? '（按最低）' : ''}
        + 过户费 ${money(f.buy.transfer)}；卖出佣金 ${money(f.sell.commission)}${f.sell.commission <= settings.minCommission + 0.001 ? '（按最低）' : ''}
        + 印花税 ${money(f.sell.stamp)} + 过户费 ${money(f.sell.transfer)}
      </div>
    `;

    return {
      code: (st.form.code || '').trim() || '-',
      buyPrice: bp,
      salePrice: sp,
      quantity: q,
      gross: round(gross, 2),
      cost: round(f.total, 2),
      netProfit: round(net, 2),
      roi: round(roi, 2),
    };
  };

  let lastCalc = null;
  const refresh = () => {
    st.form.code = pcCode.value;
    st.form.buy = pcBuy.value;
    st.form.sell = pcSell.value;
    st.form.qty = pcQty.value;
    lastCalc = compute();
  };
  [pcCode, pcBuy, pcSell, pcQty].forEach((i) => i.addEventListener('input', refresh));
  refresh();

  calcCard.querySelector('#pc-reset').addEventListener('click', () => {
    pcCode.value = '';
    pcBuy.value = '';
    pcSell.value = '';
    pcQty.value = '1000';
    refresh();
  });

  calcCard.querySelector('#pc-save').addEventListener('click', () => {
    const r = compute();
    if (!r) return window.__toast('请先填写完整的买卖价格与数量', 'err');
    if (!r.code || r.code === '-') return window.__toast('请填写股票代码', 'err');

    state.tradeRecords.unshift({
      id: uid('tr'),
      ...r,
      timestamp: nowStamp(),
      date: today(),
    });

    // 代码进常用列表
    const code = r.code.toUpperCase();
    state.savedCodes = [code, ...state.savedCodes.filter((c) => c !== code)].slice(0, 10);

    commit();
    drawTags();
    window.__toast(`已保存，净收益 ${signed(r.netProfit)}`, 'ok');
  });

  // ---- 统计 ----
  const recs = state.tradeRecords;
  const statCard = document.createElement('div');
  statCard.className = 'card';
  statCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">收益记录统计<span class="sub">${recs.length} 笔</span></div>
      ${recs.length ? '<button class="btn btn-sm btn-danger" id="pc-clear">清空全部</button>' : ''}
    </div>
    <div class="card-body" id="pc-stats"></div>
  `;
  root.appendChild(statCard);

  const statsBox = statCard.querySelector('#pc-stats');
  if (!recs.length) {
    statsBox.innerHTML = '<div class="empty">暂无交易记录</div>';
  } else {
    let win = 0, loss = 0, totalWin = 0, totalLoss = 0;
    const wins = [], losses = [];
    recs.forEach((r) => {
      const p = num(r.netProfit);
      if (p > 0) { win += 1; totalWin += p; wins.push(p); }
      else if (p < 0) { loss += 1; totalLoss += Math.abs(p); losses.push(p); }
    });
    const net = totalWin - totalLoss;
    const winRate = recs.length ? (win / recs.length) * 100 : 0;
    const avgWin = wins.length ? totalWin / wins.length : 0;
    const avgLoss = losses.length ? totalLoss / losses.length : 0;
    const pf = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? Infinity : 0);

    statsBox.innerHTML = `
      <div class="grid g4" style="margin-bottom:14px">
        <div class="stat"><div class="stat-label">正收益次数</div><div class="stat-value up">${win}</div></div>
        <div class="stat"><div class="stat-label">负收益次数</div><div class="stat-value down">${loss}</div></div>
        <div class="stat"><div class="stat-label">总盈利</div><div class="stat-value sm up">+${money(totalWin)}</div></div>
        <div class="stat"><div class="stat-label">总亏损</div><div class="stat-value sm down">-${money(totalLoss)}</div></div>
        <div class="stat"><div class="stat-label">平均盈利</div><div class="stat-value sm up">+${money(avgWin)}</div></div>
        <div class="stat"><div class="stat-label">平均亏损</div><div class="stat-value sm down">-${money(avgLoss)}</div></div>
        <div class="stat"><div class="stat-label">净收益</div><div class="stat-value sm ${trendClass(net)}">${signed(net)}</div></div>
        <div class="stat"><div class="stat-label">胜率</div><div class="stat-value sm">${winRate.toFixed(1)}%</div></div>
      </div>
      <div class="grid g2">
        <div class="stat"><div class="stat-label">盈亏比</div><div class="stat-value sm">${pf === Infinity ? '∞' : pf.toFixed(2)}</div></div>
        <div class="stat"><div class="stat-label">期望值 / 笔</div><div class="stat-value sm ${trendClass(net / recs.length)}">${signed(net / recs.length)}</div></div>
      </div>
    `;

    const clearBtn = statCard.querySelector('#pc-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm(`确定清空全部 ${recs.length} 条记录吗？此操作不可恢复。`)) return;
        state.tradeRecords = [];
        commit();
        window.__toast('已清空全部记录', 'ok');
      });
    }
  }

  // ---- 记录表 ----
  if (recs.length) {
    const listCard = document.createElement('div');
    listCard.className = 'card';
    listCard.innerHTML = '<div class="card-head"><div class="card-title">交易记录明细</div></div>';
    const body = document.createElement('div');
    body.className = 'card-body tight';
    listCard.appendChild(body);

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>时间</th><th>代码</th><th class="num">买 / 卖</th><th class="num">数量</th>
        <th class="num">费用</th><th class="num">净收益</th><th class="num">收益率</th><th class="act">操作</th>
      </tr></thead><tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    recs.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="tiny muted nowrap">${esc((r.timestamp || '').split(' ')[0] || '')}<br>${esc((r.timestamp || '').split(' ')[1] || '')}</td>
        <td><span class="tag tag-mute mono">${esc(r.code)}</span></td>
        <td class="num tiny">${money(r.buyPrice, 3)} / ${money(r.salePrice, 3)}</td>
        <td class="num">${num(r.quantity)}</td>
        <td class="num tiny muted">${money(r.cost)}</td>
        <td class="num ${trendClass(r.netProfit)}">${signed(r.netProfit)}</td>
        <td class="num ${trendClass(r.roi)}" style="font-size:12px">${r.roi >= 0 ? '+' : ''}${num(r.roi).toFixed(2)}%</td>
        <td class="act"><button class="icon-btn" data-rid="${r.id}">删除</button></td>
      `;
      tr.querySelector('[data-rid]').addEventListener('click', () => {
        if (!confirm('确定删除这条记录吗？')) return;
        state.tradeRecords = state.tradeRecords.filter((x) => x.id !== r.id);
        commit();
      });
      tbody.appendChild(tr);
    });
    wrap.appendChild(table);
    body.appendChild(wrap);
    root.appendChild(listCard);
  }
}
