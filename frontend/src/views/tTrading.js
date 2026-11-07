// ===== 做T管理：持仓 · 简单流水 · 点位助手 =====

import { $, money, signed, pct, num, round, esc, trendClass, today, nowStamp, uid } from '../lib/util.js';
import {
  applyOperation,
  rebuildStock,
  stockStats,
  dilutionPct,
} from '../lib/positions.js';
import { tNetProfit, breakEvenSellPrice } from '../lib/fees.js';
import { commit, getState, getSettings, flushSave } from '../lib/store.js';

const SUBTABS = [
  { id: 'position', label: '📊 持仓成本' },
  { id: 'log', label: '📅 简单流水' },
  { id: 'point', label: '🎯 点位助手' },
];

export function render(root, ctx) {
  const st = ctx.viewState;
  if (!st.subtab) st.subtab = 'position';
  if (!st.selectedId) st.selectedId = null;

  const wrap = document.createElement('div');

  // 子标签
  const tabs = document.createElement('div');
  tabs.className = 'subtabs';
  tabs.style.marginBottom = '14px';
  tabs.style.maxWidth = '520px';
  SUBTABS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'subtab' + (st.subtab === t.id ? ' active' : '');
    b.textContent = t.label;
    b.addEventListener('click', () => {
      st.subtab = t.id;
      ctx.rerender();
    });
    tabs.appendChild(b);
  });
  wrap.appendChild(tabs);

  const body = document.createElement('div');
  wrap.appendChild(body);
  root.appendChild(wrap);

  if (st.subtab === 'position') renderPosition(body, ctx);
  else if (st.subtab === 'log') renderLog(body, ctx);
  else renderPoint(body, ctx);
}

// ============ 持仓成本 ============
function renderPosition(root, ctx) {
  const { state, settings } = ctx;
  const st = ctx.viewState;
  const stocks = state.stocks;
  const stats = stockStats(stocks);

  // ---- 收益统计 ----
  const statsCard = document.createElement('div');
  statsCard.className = 'card';
  statsCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">📊 收益统计概览<span class="sub">全库实时联动 · 已扣双边手续费</span></div>
      <button class="btn btn-sm btn-danger" id="clear-stocks">清空全部持仓</button>
    </div>
    <div class="card-body">
      <div class="grid g4">
        <div class="stat">
          <div class="stat-label">正收益次数</div>
          <div class="stat-value up">${stats.winCount}</div>
        </div>
        <div class="stat">
          <div class="stat-label">负收益次数</div>
          <div class="stat-value down">${stats.lossCount}</div>
        </div>
        <div class="stat">
          <div class="stat-label">总盈利</div>
          <div class="stat-value sm up">+${money(stats.totalWin)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">总亏损</div>
          <div class="stat-value sm down">-${money(stats.totalLoss)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">净收益</div>
          <div class="stat-value sm ${trendClass(stats.netProfit)}">${signed(stats.netProfit)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">胜率</div>
          <div class="stat-value sm">${stats.winRate.toFixed(1)}%</div>
        </div>
        <div class="stat">
          <div class="stat-label">操做笔数</div>
          <div class="stat-value sm">${stats.totalCount}</div>
        </div>
        <div class="stat">
          <div class="stat-label">在库标的</div>
          <div class="stat-value sm">${stocks.length}</div>
        </div>
      </div>
    </div>
  `;
  root.appendChild(statsCard);
  statsCard.querySelector('#clear-stocks').addEventListener('click', () => {
    if (!stocks.length) return window.__toast('当前没有持仓', 'warn');
    if (!confirm(`确定清空全部 ${stocks.length} 个持仓及其历史记录吗？此操作不可恢复。`)) return;
    state.stocks = [];
    st.selectedId = null;
    commit();
  });

  // ---- 左右布局 ----
  const split = document.createElement('div');
  split.className = 'split-4-8';
  root.appendChild(split);

  // 左：持仓列表 + 新增
  const left = document.createElement('div');
  left.className = 'card';
  left.innerHTML = `
    <div class="card-head"><div class="card-title">我的持仓库</div></div>
    <div class="card-body">
      <div class="field" style="margin-bottom:10px">
        <label>添加新标的</label>
        <div class="form-row" style="margin-bottom:6px">
          <input type="text" id="n-code" placeholder="代码" style="max-width:88px">
          <input type="text" id="n-name" placeholder="名称">
        </div>
        <div class="form-row">
          <input type="number" id="n-cost" step="0.001" placeholder="初始成本价">
          <input type="number" id="n-qty" placeholder="总股数">
        </div>
        <div class="flex-between tiny muted" style="margin-top:6px">
          <span>估算市值</span>
          <span class="mono" id="n-est">¥0.00</span>
        </div>
        <button class="btn btn-primary btn-block" id="n-add" style="margin-top:8px">+ 加入库</button>
      </div>
      <div class="hr"></div>
      <div class="stock-list" id="stock-list"></div>
    </div>
  `;
  split.appendChild(left);

  const listEl = left.querySelector('#stock-list');
  if (!stocks.length) {
    listEl.innerHTML = '<div class="empty" style="padding:20px">还没有持仓，先在上面添加一只</div>';
  } else {
    stocks.forEach((s) => {
      const dil = dilutionPct(s);
      const isZero = num(s.currCost) <= 0.001;
      const costCls = isZero ? 'strong' : dil > 0 ? 'down' : dil < 0 ? 'up' : 'dim';
      const dilText = isZero
        ? '<span class="tag tag-warn">零成本</span>'
        : dil > 0
        ? `摊薄 -${dil.toFixed(2)}%`
        : dil < 0
        ? `摊高 +${Math.abs(dil).toFixed(2)}%`
        : '持平';

      const card = document.createElement('div');
      card.className = 'stock-card' + (st.selectedId === s.id ? ' selected' : '');
      card.innerHTML = `
        <div class="stock-top">
          <div>
            <div class="stock-name">${esc(s.name)}</div>
            <div class="stock-code">${esc(s.code)}</div>
          </div>
          <button class="icon-btn" data-del="${s.id}" title="删除该标的及全部记录">删除</button>
        </div>
        <div class="stock-bottom">
          <div>
            <div class="stock-metric-label">当前成本</div>
            <div class="stock-metric ${costCls}">${num(s.currCost).toFixed(3)}</div>
          </div>
          <div style="text-align:right">
            <div class="stock-metric-label">持有 / 摊薄</div>
            <div class="stock-metric sm">${num(s.currQty)} 股</div>
            <div class="tiny ${
              isZero ? 'muted' : dil > 0 ? 'down' : dil < 0 ? 'up' : 'muted'
            }">${dilText}</div>
          </div>
        </div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-del]')) return;
        st.selectedId = s.id;
        ctx.rerender();
      });
      card.querySelector('[data-del]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`确定删除「${s.name}」及其全部 ${s.history.length} 条操作记录吗？`)) return;
        state.stocks = state.stocks.filter((x) => x.id !== s.id);
        if (st.selectedId === s.id) st.selectedId = null;
        commit();
      });
      listEl.appendChild(card);
    });
  }

  // 新增标的
  const nCost = left.querySelector('#n-cost');
  const nQty = left.querySelector('#n-qty');
  const nEst = left.querySelector('#n-est');
  const updateEst = () => {
    nEst.textContent = '¥' + money(num(nCost.value) * num(nQty.value));
  };
  nCost.addEventListener('input', updateEst);
  nQty.addEventListener('input', updateEst);

  left.querySelector('#n-add').addEventListener('click', () => {
    const code = left.querySelector('#n-code').value.trim().toUpperCase();
    const name = left.querySelector('#n-name').value.trim();
    const cost = num(nCost.value);
    const qty = num(nQty.value);
    if (!code) return window.__toast('请填写代码', 'err');
    if (cost <= 0) return window.__toast('成本价必须大于 0', 'err');
    if (qty <= 0) return window.__toast('股数必须大于 0', 'err');
    if (stocks.some((x) => x.code === code)) return window.__toast('该代码已存在', 'err');

    const item = {
      id: uid('st'),
      code,
      name: name || code,
      baseCost: cost,
      baseQty: qty,
      currCost: cost,
      currQty: qty,
      history: [],
    };
    state.stocks.unshift(item);
    st.selectedId = item.id;
    commit();
    window.__toast('已加入 ' + (name || code), 'ok');
  });

  // 右：操作面板 + 历史
  const right = document.createElement('div');
  split.appendChild(right);

  const active = stocks.find((x) => x.id === st.selectedId);
  if (!active) {
    right.innerHTML = `
      <div class="card"><div class="empty">
        请在左侧选择一只标的查看详情与操作
      </div></div>
    `;
    return;
  }

  // 当前标的概览
  const dil = dilutionPct(active);
  const info = document.createElement('div');
  info.className = 'card';
  info.innerHTML = `
    <div class="card-body">
      <div class="flex-between" style="align-items:flex-start">
        <div>
          <div style="font-size:19px;font-weight:700">${esc(active.name)}</div>
          <div class="tiny muted mono">${esc(active.code)}</div>
          <div class="tiny muted" style="margin-top:6px">
            初始成本 ${num(active.baseCost).toFixed(3)} · 初始股数 ${num(active.baseQty)}
          </div>
        </div>
        <div style="text-align:right">
          <div class="tiny muted">当前持仓成本</div>
          <div class="hero-value ${
            num(active.currCost) <= 0.001 ? 'strong' : dil > 0 ? 'down' : dil < 0 ? 'up' : ''
          }">${num(active.currCost).toFixed(3)}</div>
          <div class="tiny muted">${num(active.currQty)} 股 · 市值 ¥${money(num(active.currCost) * num(active.currQty), 0)}</div>
        </div>
      </div>
      <div class="hr"></div>
      <div class="grid g3">
        <div class="stat">
          <div class="stat-label">摊薄幅度</div>
          <div class="stat-value sm ${dil > 0 ? 'down' : dil < 0 ? 'up' : 'muted'}">
            ${dil > 0 ? '-' : dil < 0 ? '+' : ''}${Math.abs(dil).toFixed(2)}%
          </div>
        </div>
        <div class="stat">
          <div class="stat-label">保本卖出价</div>
          <div class="stat-value sm">${breakEvenSellPrice(active.currCost, Math.max(num(active.currQty), 100), settings).toFixed(3)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">操作笔数</div>
          <div class="stat-value sm">${active.history.length}</div>
        </div>
      </div>
    </div>
  `;
  right.appendChild(info);

  // 操作面板
  const panel = document.createElement('div');
  panel.className = 'card';
  panel.innerHTML = `
    <div class="card-head">
      <div class="card-title">操作面板
        <span class="sub">填买卖两项=做T · 只填买=加仓 · 只填卖=减仓</span>
      </div>
    </div>
    <div class="card-body">
      <div class="grid g3" style="margin-bottom:12px">
        <div class="field">
          <label>买入价（留空=不买）</label>
          <input type="number" id="op-buy" step="0.001" placeholder="买入价" class="mono up">
        </div>
        <div class="field">
          <label>卖出价（留空=不卖）</label>
          <input type="number" id="op-sell" step="0.001" placeholder="卖出价" class="mono down">
        </div>
        <div class="field">
          <label>数量（股）</label>
          <input type="number" id="op-qty" placeholder="数量" class="mono">
        </div>
      </div>

      <div class="grid g4" style="margin-bottom:12px">
        <div class="stat">
          <div class="stat-label">买入总额</div>
          <div class="stat-value sm up" id="pv-buy">0.00</div>
        </div>
        <div class="stat">
          <div class="stat-label">卖出总额</div>
          <div class="stat-value sm down" id="pv-sell">0.00</div>
        </div>
        <div class="stat">
          <div class="stat-label">双边费用</div>
          <div class="stat-value sm muted" id="pv-fee">0.00</div>
        </div>
        <div class="stat">
          <div class="stat-label">净利（扣费后）</div>
          <div class="stat-value sm" id="pv-net">0.00</div>
        </div>
      </div>

      <div class="hint" id="pv-tip" style="margin-bottom:10px">
        提示：做T 会自动把净利冲减持仓成本；减仓不影响剩余成本。
      </div>

      <div class="flex-end">
        <button class="btn btn-primary" id="op-save" style="flex:1">💾 记录本次操作</button>
        <button class="btn" id="op-reset">清空</button>
      </div>
    </div>
  `;
  right.appendChild(panel);

  const opBuy = panel.querySelector('#op-buy');
  const opSell = panel.querySelector('#op-sell');
  const opQty = panel.querySelector('#op-qty');
  const pvBuy = panel.querySelector('#pv-buy');
  const pvSell = panel.querySelector('#pv-sell');
  const pvFee = panel.querySelector('#pv-fee');
  const pvNet = panel.querySelector('#pv-net');
  const pvTip = panel.querySelector('#pv-tip');

  const refreshPreview = () => {
    const bp = num(opBuy.value);
    const sp = num(opSell.value);
    const q = num(opQty.value);
    const buyTotal = bp * q;
    const sellTotal = sp * q;
    pvBuy.textContent = money(buyTotal);
    pvSell.textContent = money(sellTotal);

    if (bp > 0 && sp > 0 && q > 0) {
      const r = tNetProfit(bp, sp, q, settings);
      pvFee.textContent = money(r.fee);
      pvNet.textContent = signed(r.net);
      pvNet.className = 'stat-value sm ' + trendClass(r.net);
      pvTip.innerHTML =
        r.net >= 0
          ? `毛利 <span class="up">+${money(r.gross)}</span> · 扣费 <span class="muted">${money(r.fee)}</span> · 净利 <span class="up">+${money(r.net)}</span>，将冲减持仓成本。`
          : `毛利 ${money(r.gross)} · 费用 ${money(r.fee)} · 净利 <span class="down">${money(r.net)}</span>，成本会被摊高。`;
    } else if (bp > 0 && q > 0) {
      const r = tNetProfit(bp, 0, q, settings);
      pvFee.textContent = money(r.fee);
      pvNet.textContent = '—';
      pvNet.className = 'stat-value sm muted';
      const newCost = active.currQty + q > 0
        ? (num(active.currQty) * num(active.currCost) + q * bp) / (num(active.currQty) + q)
        : 0;
      pvTip.innerHTML = `加仓后成本将变为 <span class="mono">${newCost.toFixed(3)}</span>，持仓 ${num(active.currQty) + q} 股。`;
    } else if (sp > 0 && q > 0) {
      if (q > num(active.currQty)) {
        pvTip.innerHTML = `<span class="up">卖出数量超过持仓（${num(active.currQty)} 股）</span>`;
      } else {
        const r = tNetProfit(0, sp, q, settings);
        const profit = sp * q - num(active.currCost) * q - r.fee;
        pvFee.textContent = money(r.fee);
        pvNet.textContent = signed(profit);
        pvNet.className = 'stat-value sm ' + trendClass(profit);
        pvTip.innerHTML = `减仓 ${q} 股，剩余 ${num(active.currQty) - q} 股，成本不变；本次实现盈亏 <span class="${trendClass(profit)}">${signed(profit)}</span>。`;
      }
    } else {
      pvFee.textContent = '0.00';
      pvNet.textContent = '0.00';
      pvNet.className = 'stat-value sm muted';
      pvTip.textContent = '提示：做T 会自动把净利冲减持仓成本；减仓不影响剩余成本。';
    }
  };

  [opBuy, opSell, opQty].forEach((i) => i.addEventListener('input', refreshPreview));

  panel.querySelector('#op-reset').addEventListener('click', () => {
    opBuy.value = '';
    opSell.value = '';
    opQty.value = '';
    refreshPreview();
  });

  panel.querySelector('#op-save').addEventListener('click', () => {
    const res = applyOperation(active, { buy: opBuy.value, sell: opSell.value, qty: opQty.value }, settings);
    if (!res.ok) return window.__toast(res.msg, 'err');

    active.currCost = round(res.currCost, 4);
    active.currQty = res.currQty;
    active.history.unshift({
      id: uid('h'),
      date: nowStamp(),
      ...res.record,
    });
    commit();

    if (res.actionType === '做T') {
      window.__toast(
        res.netProfit >= 0
          ? `做T成功，净利 +${money(res.netProfit)}，成本降至 ${res.currCost.toFixed(3)}`
          : `做T亏损 ${money(res.netProfit)}，成本升至 ${res.currCost.toFixed(3)}`,
        res.netProfit >= 0 ? 'ok' : 'warn',
        3200
      );
    } else if (res.actionType === '加仓') {
      window.__toast(`加仓完成，${res.currQty} 股，成本 ${res.currCost.toFixed(3)}`, 'ok');
    } else {
      window.__toast(`减仓完成，剩 ${res.currQty} 股，实现盈亏 ${signed(res.netProfit)}`, 'ok');
    }
  });

  refreshPreview();

  // 历史记录
  const hist = document.createElement('div');
  hist.className = 'card';
  hist.innerHTML = `
    <div class="card-head">
      <div class="card-title">该标的操作历史<span class="sub">${active.history.length} 条</span></div>
      ${
        active.history.length
          ? '<button class="btn btn-sm btn-danger" id="clear-hist">清空历史</button>'
          : ''
      }
    </div>
  `;
  const histBody = document.createElement('div');
  histBody.className = 'card-body tight';
  hist.appendChild(histBody);

  if (!active.history.length) {
    histBody.innerHTML = '<div class="empty">暂无操作记录</div>';
  } else {
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>时间</th><th>类型</th><th class="num">买 / 卖</th><th class="num">数量</th>
        <th class="num">净利</th><th class="num">成本变化</th><th class="num">剩余</th><th class="act">操作</th>
      </tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    active.history.forEach((h) => {
      const typeLabel =
        h.buy > 0 && h.sell > 0 ? '做T' : h.buy > 0 ? '加仓' : '减仓';
      const typeTag =
        typeLabel === '做T' ? 'tag-info' : typeLabel === '加仓' ? 'tag-up' : 'tag-down';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="tiny muted nowrap">${esc(h.date || '')}</td>
        <td><span class="tag ${typeTag}">${typeLabel}</span></td>
        <td class="num tiny">${h.buy > 0 ? num(h.buy).toFixed(3) : '—'} / ${h.sell > 0 ? num(h.sell).toFixed(3) : '—'}</td>
        <td class="num">${num(h.qty)}</td>
        <td class="num ${trendClass(h.netProfit)}">${signed(h.netProfit)}</td>
        <td class="num tiny ${h.drop > 0 ? 'down' : h.drop < 0 ? 'up' : 'muted'}">
          ${h.drop > 0 ? '-' + Math.abs(h.drop).toFixed(3) + '%' : h.drop < 0 ? '+' + Math.abs(h.drop).toFixed(3) + '%' : '—'}
        </td>
        <td class="num tiny">${num(h.remainQty)}</td>
        <td class="act"><button class="icon-btn" data-hid="${h.id}">删除</button></td>
      `;
      tr.querySelector('[data-hid]').addEventListener('click', () => {
        if (!confirm('确定删除这条记录吗？\n后续所有成本与股数将自动回滚重算。')) return;
        active.history = active.history.filter((x) => x.id !== h.id);
        rebuildStock(active, settings);
        commit();
        window.__toast('已删除并重算', 'ok');
      });
      tbody.appendChild(tr);
    });
    tableWrap.appendChild(table);
    histBody.appendChild(tableWrap);

    const clearBtn = hist.querySelector('#clear-hist');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm(`确定清空「${active.name}」的 ${active.history.length} 条操作历史吗？\n成本和股数将恢复为初始值。`)) return;
        active.history = [];
        rebuildStock(active, settings);
        commit();
        window.__toast('历史已清空，成本已恢复初始值', 'ok');
      });
    }
  }
  right.appendChild(hist);
}

// ============ 简单流水 ============
function renderLog(root, ctx) {
  const { state } = ctx;
  const logs = state.simpleLog;

  const addCard = document.createElement('div');
  addCard.className = 'card';
  addCard.innerHTML = `
    <div class="card-head"><div class="card-title">📝 添加流水记录</div></div>
    <div class="card-body">
      <div class="grid g4" style="margin-bottom:12px">
        <div class="field"><label>名称</label><input type="text" id="lg-name" placeholder="股票名称"></div>
        <div class="field"><label>方向</label>
          <select id="lg-type"><option value="buy">买入</option><option value="sell">卖出</option></select>
        </div>
        <div class="field"><label>价格</label><input type="number" id="lg-price" step="0.001" placeholder="价格" class="mono"></div>
        <div class="field"><label>数量</label><input type="number" id="lg-qty" placeholder="数量" class="mono"></div>
      </div>
      <div class="flex-between" style="margin-bottom:12px">
        <span class="tiny muted">预计成交额</span>
        <span class="mono strong" id="lg-total" style="font-size:20px">0.00</span>
      </div>
      <button class="btn btn-primary btn-block" id="lg-add">保存记录</button>
    </div>
  `;
  root.appendChild(addCard);

  const lgName = addCard.querySelector('#lg-name');
  const lgType = addCard.querySelector('#lg-type');
  const lgPrice = addCard.querySelector('#lg-price');
  const lgQty = addCard.querySelector('#lg-qty');
  const lgTotal = addCard.querySelector('#lg-total');

  const refreshTotal = () => {
    const t = num(lgPrice.value) * num(lgQty.value);
    lgTotal.textContent = money(t);
    lgTotal.className = 'mono strong ' + (t > 0 ? (lgType.value === 'buy' ? 'up' : 'down') : 'muted');
  };
  [lgPrice, lgQty].forEach((i) => i.addEventListener('input', refreshTotal));
  lgType.addEventListener('change', refreshTotal);

  addCard.querySelector('#lg-add').addEventListener('click', () => {
    const price = num(lgPrice.value);
    const qty = num(lgQty.value);
    if (price <= 0) return window.__toast('请填写价格', 'err');
    if (qty <= 0) return window.__toast('请填写数量', 'err');

    state.simpleLog.unshift({
      id: uid('lg'),
      date: today(),
      stamp: nowStamp(),
      name: lgName.value.trim() || '未命名',
      type: lgType.value,
      price,
      qty,
      total: round(price * qty, 2),
    });
    commit();
    lgName.value = '';
    lgPrice.value = '';
    lgQty.value = '';
    refreshTotal();
    window.__toast('已保存', 'ok');
  });

  // 流水表
  const listCard = document.createElement('div');
  listCard.className = 'card';
  listCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">历史流水<span class="sub">${logs.length} 条</span></div>
      ${
        logs.length
          ? '<button class="btn btn-sm btn-danger" id="lg-clear">清空全部</button>'
          : ''
      }
    </div>
  `;
  const body = document.createElement('div');
  body.className = 'card-body tight';
  listCard.appendChild(body);
  root.appendChild(listCard);

  if (!logs.length) {
    body.innerHTML = '<div class="empty">暂无流水记录</div>';
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>日期</th><th>名称</th><th>方向</th><th class="num">价格</th>
        <th class="num">数量</th><th class="num">成交额</th><th class="act">操作</th>
      </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    logs.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="tiny muted nowrap">${esc(l.date || '')}</td>
        <td>${esc(l.name)}</td>
        <td><span class="tag ${l.type === 'buy' ? 'tag-up' : 'tag-down'}">${l.type === 'buy' ? '买入' : '卖出'}</span></td>
        <td class="num">${money(l.price, 3)}</td>
        <td class="num">${num(l.qty)}</td>
        <td class="num ${l.type === 'buy' ? 'up' : 'down'}">${money(l.total)}</td>
        <td class="act"><button class="icon-btn" data-lid="${l.id}">删除</button></td>
      `;
      tr.querySelector('[data-lid]').addEventListener('click', () => {
        if (!confirm('确定删除这条流水记录吗？')) return;
        state.simpleLog = state.simpleLog.filter((x) => x.id !== l.id);
        commit();
      });
      tbody.appendChild(tr);
    });
    wrap.appendChild(table);
    body.appendChild(wrap);

    listCard.querySelector('#lg-clear').addEventListener('click', () => {
      if (!confirm(`确定清空全部 ${logs.length} 条流水记录吗？此操作不可恢复。`)) return;
      state.simpleLog = [];
      commit();
    });
  }
}

// ============ 点位助手 ============
function renderPoint(root, ctx) {
  const st = ctx.viewState;
  if (!st.gridInput) st.gridInput = { price: '', qty: '', start: 0.5, inc: 0.5, count: 12 };
  if (!st.backInput) st.backInput = { sell: '', pct: 1.5 };

  const gi = st.gridInput;
  const bi = st.backInput;

  // 瞄点矩阵
  const gridCard = document.createElement('div');
  gridCard.className = 'card';
  gridCard.innerHTML = `
    <div class="card-head"><div class="card-title">🎯 卖出瞄点矩阵<span class="sub">按递增涨幅生成阶梯卖出价</span></div></div>
    <div class="card-body">
      <div class="grid g3" style="margin-bottom:12px">
        <div class="field"><label>基准价格</label><input type="number" id="g-price" step="0.001" placeholder="10.00" class="mono" value="${gi.price}"></div>
        <div class="field"><label>持仓数量</label><input type="number" id="g-qty" placeholder="1000" class="mono" value="${gi.qty}"></div>
        <div class="field"><label>生成行数</label><input type="number" id="g-count" min="1" max="50" class="mono" value="${gi.count}"></div>
        <div class="field"><label>初始涨幅(%)</label><input type="number" id="g-start" step="0.1" class="mono" value="${gi.start}"></div>
        <div class="field"><label>递增幅度(%)</label><input type="number" id="g-inc" step="0.1" class="mono" value="${gi.inc}"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-block" id="g-gen">生成表格</button></div>
      </div>
      <div id="g-result"></div>
    </div>
  `;
  root.appendChild(gridCard);

  const gResult = gridCard.querySelector('#g-result');

  const drawGrid = () => {
    const price = num(gi.price);
    const qty = num(gi.qty);
    const start = num(gi.start);
    const inc = num(gi.inc);
    const count = Math.min(Math.max(1, Math.round(num(gi.count))), 50);

    if (price <= 0) {
      gResult.innerHTML = '<div class="empty" style="padding:16px">请输入基准价格</div>';
      return;
    }
    if (qty <= 0) {
      gResult.innerHTML = '<div class="empty" style="padding:16px">请输入持仓数量</div>';
      return;
    }

    const cells = [];
    for (let i = 0; i < count; i += 1) {
      const rate = start + i * inc;
      const target = price * (1 + rate / 100);
      const profit = (target - price) * qty;
      cells.push(`
        <div class="stat" style="text-align:center;padding:10px">
          <div class="up strong tiny">+${rate.toFixed(2)}%</div>
          <div class="mono strong" style="font-size:17px;margin:3px 0">${target.toFixed(3)}</div>
          <div class="tiny down">+${money(profit, 0)} 元</div>
        </div>
      `);
    }
    gResult.innerHTML = `<div class="grid g4">${cells.join('')}</div>`;
  };

  ['g-price', 'g-qty', 'g-count', 'g-start', 'g-inc'].forEach((id) => {
    gridCard.querySelector('#' + id).addEventListener('input', (e) => {
      const keyMap = { 'g-price': 'price', 'g-qty': 'qty', 'g-count': 'count', 'g-start': 'start', 'g-inc': 'inc' };
      gi[keyMap[id]] = e.target.value;
      drawGrid();
    });
  });
  gridCard.querySelector('#g-gen').addEventListener('click', drawGrid);
  drawGrid();

  // 接回点位
  const backCard = document.createElement('div');
  backCard.className = 'card';
  backCard.innerHTML = `
    <div class="card-head"><div class="card-title">⏬ 接回点位计算<span class="sub">高抛后回落到多少再接回</span></div></div>
    <div class="card-body">
      <div class="form-row" style="margin-bottom:12px">
        <div class="field"><label>卖出价</label><input type="number" id="b-sell" step="0.001" placeholder="卖出价" class="mono" value="${bi.sell}"></div>
        <div class="field"><label>目标回调(%)</label><input type="number" id="b-pct" step="0.1" placeholder="1.5" class="mono" value="${bi.pct}"></div>
      </div>
      <div id="b-result"></div>
    </div>
  `;
  root.appendChild(backCard);

  const bResult = backCard.querySelector('#b-result');
  const drawBack = () => {
    const p = num(bi.sell);
    const pctv = num(bi.pct);
    if (p <= 0 || pctv <= 0) {
      bResult.innerHTML = '<div class="empty" style="padding:16px">填写卖出价与回调幅度后自动计算</div>';
      return;
    }
    const back = p * (1 - pctv / 100);
    const qty = num(gi.qty) || 1000;
    const save = (p - back) * qty;
    bResult.innerHTML = `
      <div class="grid g2">
        <div class="stat" style="text-align:center">
          <div class="stat-label">建议接回价</div>
          <div class="stat-value down">${back.toFixed(3)}</div>
        </div>
        <div class="stat" style="text-align:center">
          <div class="stat-label">按 ${qty} 股接回可省</div>
          <div class="stat-value sm down">${money(save, 0)} 元</div>
        </div>
      </div>
    `;
  };
  backCard.querySelector('#b-sell').addEventListener('input', (e) => {
    bi.sell = e.target.value;
    drawBack();
  });
  backCard.querySelector('#b-pct').addEventListener('input', (e) => {
    bi.pct = e.target.value;
    drawBack();
  });
  drawBack();

  // 网格交易的简易说明
  const tip = document.createElement('div');
  tip.className = 'card';
  tip.innerHTML = `
    <div class="card-body">
      <div class="hint">
        <strong>怎么用：</strong><br>
        · 瞄点矩阵：输入你的成本或现价作为基准，按递增涨幅生成阶梯卖出价，每一档对应固定股数，涨到哪一档就卖哪一档。<br>
        · 接回点位：高抛之后，按目标回调百分比算回踩价，到位再接回，一次完整做T就闭环了。<br>
        · 数量填你的实际持仓，显示的"可省"金额是按整仓平摊估算，不是精确到股的费用后数字。
      </div>
    </div>
  `;
  root.appendChild(tip);
}
