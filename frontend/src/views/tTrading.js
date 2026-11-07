// ===== 做T管理：持仓成本 · 点位助手 =====

import { num, round, esc, money, signed, trendClass, nowStamp, today, uid } from '../lib/util.js';
import { applyOperation, rebuildStock, stockStats, dilutionPct } from '../lib/positions.js';
import { tNetProfit, breakEvenSellPrice } from '../lib/fees.js';
import { commit } from '../lib/store.js';

const SUBTABS = [
  { id: 'position', label: '📊 持仓成本' },
  { id: 'point', label: '🎯 点位助手' },
];

export function render(root, ctx) {
  const st = ctx.viewState;
  if (!st.subtab) st.subtab = 'position';
  if (st.selectedId === undefined) st.selectedId = null;

  const tabs = document.createElement('div');
  tabs.className = 'subtabs';
  tabs.style.cssText = 'margin-bottom:14px;max-width:360px';
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
  root.appendChild(tabs);

  const body = document.createElement('div');
  root.appendChild(body);

  if (st.subtab === 'position') renderPosition(body, ctx);
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
      <div class="card-title">📊 做T战绩<span class="sub">全库实时联动 · 已扣双边手续费</span></div>
      ${stocks.length ? '<button class="btn btn-sm btn-danger" id="clear-stocks">清空全部持仓</button>' : ''}
    </div>
    <div class="card-body">
      <div class="grid g4">
        <div class="stat"><div class="stat-label">正收益次数</div><div class="stat-value up">${stats.winCount}</div></div>
        <div class="stat"><div class="stat-label">负收益次数</div><div class="stat-value down">${stats.lossCount}</div></div>
        <div class="stat"><div class="stat-label">总盈利</div><div class="stat-value sm up">+${money(stats.totalWin)}</div></div>
        <div class="stat"><div class="stat-label">总亏损</div><div class="stat-value sm down">-${money(stats.totalLoss)}</div></div>
        <div class="stat"><div class="stat-label">净收益</div><div class="stat-value sm ${trendClass(stats.netProfit)}">${signed(stats.netProfit)}</div></div>
        <div class="stat"><div class="stat-label">胜率</div><div class="stat-value sm">${stats.winRate.toFixed(1)}%</div></div>
        <div class="stat"><div class="stat-label">操作笔数</div><div class="stat-value sm">${stats.totalCount}</div></div>
        <div class="stat"><div class="stat-label">在库标的</div><div class="stat-value sm">${stocks.length}</div></div>
      </div>
    </div>
  `;
  root.appendChild(statsCard);

  const clearBtn = statsCard.querySelector('#clear-stocks');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm(`确定清空全部 ${stocks.length} 个持仓及其历史记录吗？此操作不可恢复。`)) return;
      state.stocks = [];
      st.selectedId = null;
      commit();
    });
  }

  const split = document.createElement('div');
  split.className = 'split-4-8';
  root.appendChild(split);

  // ---- 左：新建 + 持仓列表 ----
  const left = document.createElement('div');
  left.className = 'card';
  left.innerHTML = `
    <div class="card-head"><div class="card-title">我的持仓库</div></div>
    <div class="card-body">
      <div class="field" style="margin-bottom:10px">
        <label>添加新标的</label>
        <div class="form-row" style="margin-bottom:8px">
          <div class="field"><input type="text" id="n-code" placeholder="代码" maxlength="8" class="mono"></div>
          <div class="field"><input type="text" id="n-name" placeholder="名称"></div>
        </div>
        <div id="n-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px"></div>
        <div class="form-row">
          <div class="field"><input type="number" id="n-cost" step="0.001" placeholder="初始成本价" class="mono"></div>
          <div class="field"><input type="number" id="n-qty" placeholder="总股数" class="mono"></div>
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

  // 常用代码快捷选择
  const chips = left.querySelector('#n-chips');
  const codeInput = left.querySelector('#n-code');
  const nameInput = left.querySelector('#n-name');
  const drawChips = () => {
    chips.innerHTML = '';
    if (!state.savedCodes.length) {
      chips.innerHTML = '<span class="tiny muted">用过的代码会出现在这里</span>';
      return;
    }
    state.savedCodes.forEach((code) => {
      const tag = document.createElement('span');
      tag.className = 'tag tag-info';
      tag.style.cssText = 'cursor:pointer;display:inline-flex;align-items:center;gap:5px';
      tag.innerHTML = `${esc(code)}<span data-x style="opacity:.55;font-weight:700">×</span>`;
      tag.addEventListener('click', (e) => {
        if (e.target.dataset.x !== undefined) {
          state.savedCodes = state.savedCodes.filter((c) => c !== code);
          commit();
          drawChips();
          return;
        }
        codeInput.value = code;
        // 已有同名持仓则预填其名称
        const exist = state.stocks.find((s) => s.code === code);
        if (exist && !nameInput.value) nameInput.value = exist.name;
        codeInput.focus();
      });
      chips.appendChild(tag);
    });
  };
  drawChips();

  const listEl = left.querySelector('#stock-list');
  const drawList = () => {
    listEl.innerHTML = '';
    if (!stocks.length) {
      listEl.innerHTML = '<div class="empty" style="padding:20px">还没有持仓，先在上面添加一只</div>';
      return;
    }
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
            <div class="tiny ${isZero ? 'muted' : dil > 0 ? 'down' : dil < 0 ? 'up' : 'muted'}">${dilText}</div>
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
  };
  drawList();

  // 新建标的
  const nCost = left.querySelector('#n-cost');
  const nQty = left.querySelector('#n-qty');
  const nEst = left.querySelector('#n-est');
  const updateEst = () => {
    nEst.textContent = '¥' + money(num(nCost.value) * num(nQty.value));
  };
  nCost.addEventListener('input', updateEst);
  nQty.addEventListener('input', updateEst);

  left.querySelector('#n-add').addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();
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
    // 代码进常用列表
    state.savedCodes = [code, ...state.savedCodes.filter((c) => c !== code)].slice(0, 10);
    st.selectedId = item.id;
    commit();
    window.__toast('已加入 ' + (name || code), 'ok');
  });

  // ---- 右：概览 + 操作 + 历史 ----
  const right = document.createElement('div');
  split.appendChild(right);

  const active = stocks.find((x) => x.id === st.selectedId);
  if (!active) {
    right.innerHTML = '<div class="card"><div class="empty">请在左侧选择一只标的查看详情与操作</div></div>';
    return;
  }

  const dil = dilutionPct(active);
  const bePrice = num(active.currQty) > 0
    ? breakEvenSellPrice(active.currCost, active.currQty, settings)
    : 0;

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
          <div class="hero-value ${num(active.currCost) <= 0.001 ? 'strong' : dil > 0 ? 'down' : dil < 0 ? 'up' : ''}">${num(active.currCost).toFixed(3)}</div>
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
          <div class="stat-label">保本卖出价（清仓）</div>
          <div class="stat-value sm">${num(active.currQty) > 0 ? bePrice.toFixed(3) : '—'}</div>
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
      <div class="card-title">操作面板<span class="sub">填买卖两项=做T · 只填买=加仓 · 只填卖=减仓</span></div>
    </div>
    <div class="card-body">
      <div class="grid g3" style="margin-bottom:12px">
        <div class="field"><label>买入价（留空=不买）</label><input type="number" id="op-buy" step="0.001" placeholder="买入价" class="mono up"></div>
        <div class="field"><label>卖出价（留空=不卖）</label><input type="number" id="op-sell" step="0.001" placeholder="卖出价" class="mono down"></div>
        <div class="field"><label>数量（股）</label><input type="number" id="op-qty" placeholder="数量" class="mono"></div>
      </div>

      <div class="grid g4" style="margin-bottom:12px">
        <div class="stat"><div class="stat-label">买入总额</div><div class="stat-value sm up" id="pv-buy">0.00</div></div>
        <div class="stat"><div class="stat-label">卖出总额</div><div class="stat-value sm down" id="pv-sell">0.00</div></div>
        <div class="stat"><div class="stat-label">双边费用</div><div class="stat-value sm muted" id="pv-fee">0.00</div></div>
        <div class="stat"><div class="stat-label">净利（扣费后）</div><div class="stat-value sm" id="pv-net">0.00</div></div>
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
    pvBuy.textContent = money(bp * q);
    pvSell.textContent = money(sp * q);

    if (bp > 0 && sp > 0 && q > 0) {
      const r = tNetProfit(bp, sp, q, settings);
      pvFee.textContent = money(r.fee);
      pvNet.textContent = signed(r.net);
      pvNet.className = 'stat-value sm ' + trendClass(r.net);
      const newCost = num(active.currQty) > 0
        ? Math.max((num(active.currQty) * num(active.currCost) - r.net) / num(active.currQty), 0)
        : 0;
      pvTip.innerHTML = `毛利 <span class="${trendClass(r.gross)}">${signed(r.gross)}</span> · 费用 <span class="muted">${money(r.fee)}</span> · 净利 <span class="${trendClass(r.net)}">${signed(r.net)}</span> → 成本将变为 <span class="mono">${newCost.toFixed(3)}</span>`;
    } else if (bp > 0 && q > 0) {
      const r = tNetProfit(bp, 0, q, settings);
      pvFee.textContent = money(r.fee);
      pvNet.textContent = '—';
      pvNet.className = 'stat-value sm muted';
      const newQty = num(active.currQty) + q;
      const newCost = newQty > 0 ? (num(active.currQty) * num(active.currCost) + q * bp) / newQty : 0;
      pvTip.innerHTML = `加仓后成本变为 <span class="mono">${newCost.toFixed(3)}</span>，持仓 ${newQty} 股。`;
    } else if (sp > 0 && q > 0) {
      if (q > num(active.currQty)) {
        pvTip.innerHTML = `<span class="up">卖出数量超过持仓（${num(active.currQty)} 股）</span>`;
        pvFee.textContent = '0.00';
        pvNet.textContent = '—';
        pvNet.className = 'stat-value sm muted';
      } else {
        const r = tNetProfit(0, sp, q, settings);
        const profit = sp * q - num(active.currCost) * q - r.fee;
        pvFee.textContent = money(r.fee);
        pvNet.textContent = signed(profit);
        pvNet.className = 'stat-value sm ' + trendClass(profit);
        pvTip.innerHTML = `减仓 ${q} 股，剩余 ${num(active.currQty) - q} 股，成本不变；实现盈亏 <span class="${trendClass(profit)}">${signed(profit)}</span>。`;
      }
    } else {
      pvFee.textContent = '0.00';
      pvNet.textContent = '0.00';
      pvNet.className = 'stat-value sm muted';
      pvTip.textContent = '提示：做T 会自动把净利冲减持仓成本；减仓不影响剩余成本。';
    }
  };

  // 从「交易试算」带入
  if (st.prefill) {
    const p = st.prefill;
    if (p.buy) opBuy.value = p.buy;
    if (p.sell) opSell.value = p.sell;
    if (p.qty) opQty.value = p.qty;
    st.prefill = null;
    setTimeout(() => opQty.focus(), 60);
  }

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
    active.history.unshift({ id: uid('h'), date: nowStamp(), ...res.record });
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
      ${active.history.length ? '<button class="btn btn-sm btn-danger" id="clear-hist">清空历史</button>' : ''}
    </div>
  `;
  const histBody = document.createElement('div');
  histBody.className = 'card-body tight';
  hist.appendChild(histBody);

  if (!active.history.length) {
    histBody.innerHTML = '<div class="empty">暂无操作记录</div>';
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>时间</th><th>类型</th><th class="num">买 / 卖</th><th class="num">数量</th>
        <th class="num">净利</th><th class="num">成本变化</th><th class="num">剩余</th><th class="act">操作</th>
      </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    active.history.forEach((h) => {
      const isT = num(h.buy) > 0 && num(h.sell) > 0;
      const isAdd = num(h.buy) > 0 && num(h.sell) <= 0;
      const typeLabel = isT ? '做T' : isAdd ? '加仓' : '减仓';
      const typeTag = isT ? 'tag-info' : isAdd ? 'tag-up' : 'tag-down';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="tiny muted nowrap">${esc(h.date || '')}</td>
        <td><span class="tag ${typeTag}">${typeLabel}</span></td>
        <td class="num tiny">${num(h.buy) > 0 ? num(h.buy).toFixed(3) : '—'} / ${num(h.sell) > 0 ? num(h.sell).toFixed(3) : '—'}</td>
        <td class="num">${num(h.qty)}</td>
        <td class="num ${trendClass(h.netProfit)}">${signed(h.netProfit)}</td>
        <td class="num tiny ${num(h.drop) > 0 ? 'down' : num(h.drop) < 0 ? 'up' : 'muted'}">
          ${num(h.drop) > 0 ? '-' + Math.abs(num(h.drop)).toFixed(3) + '%' : num(h.drop) < 0 ? '+' + Math.abs(num(h.drop)).toFixed(3) + '%' : '—'}
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
    wrap.appendChild(table);
    histBody.appendChild(wrap);

    const clearHistBtn = hist.querySelector('#clear-hist');
    if (clearHistBtn) {
      clearHistBtn.addEventListener('click', () => {
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

// ============ 点位助手 ============
function renderPoint(root, ctx) {
  const st = ctx.viewState;
  const { state } = ctx;
  if (!st.gridInput) st.gridInput = { price: '', qty: '', start: 0.5, inc: 0.5, count: 12 };
  if (!st.backInput) st.backInput = { sell: '', pct: 1.5 };

  const gi = st.gridInput;
  const bi = st.backInput;
  const activeStock = state.stocks.find((s) => s.id === st.selectedId);

  // 瞄点矩阵
  const gridCard = document.createElement('div');
  gridCard.className = 'card';
  gridCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">🎯 卖出瞄点矩阵<span class="sub">按递增涨幅生成阶梯卖出价</span></div>
      ${activeStock ? `<button class="btn btn-sm" id="g-fill">取「${esc(activeStock.name)}」持仓</button>` : ''}
    </div>
    <div class="card-body">
      <div class="grid g3" style="margin-bottom:12px">
        <div class="field"><label>基准价格</label><input type="number" id="g-price" step="0.001" placeholder="10.00" class="mono" value="${esc(gi.price)}"></div>
        <div class="field"><label>持仓数量</label><input type="number" id="g-qty" placeholder="1000" class="mono" value="${esc(gi.qty)}"></div>
        <div class="field"><label>生成行数</label><input type="number" id="g-count" min="1" max="50" class="mono" value="${esc(gi.count)}"></div>
        <div class="field"><label>初始涨幅(%)</label><input type="number" id="g-start" step="0.1" class="mono" value="${esc(gi.start)}"></div>
        <div class="field"><label>递增幅度(%)</label><input type="number" id="g-inc" step="0.1" class="mono" value="${esc(gi.inc)}"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-block" id="g-gen">生成表格</button></div>
      </div>
      ${activeStock ? '' : '<div class="hint" style="margin-bottom:10px">提示：在「持仓成本」里选中一只标的后，这里可以一键带入它的成本价与持仓量。</div>'}
      <div id="g-result"></div>
    </div>
  `;
  root.appendChild(gridCard);

  const gPrice = gridCard.querySelector('#g-price');
  const gQty = gridCard.querySelector('#g-qty');
  const gResult = gridCard.querySelector('#g-result');

  const fillBtn = gridCard.querySelector('#g-fill');
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      gi.price = num(activeStock.currCost).toFixed(3);
      gi.qty = String(num(activeStock.currQty));
      gPrice.value = gi.price;
      gQty.value = gi.qty;
      drawGrid();
      window.__toast('已带入持仓数据', 'ok');
    });
  }

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

  const keyMap = { 'g-price': 'price', 'g-qty': 'qty', 'g-count': 'count', 'g-start': 'start', 'g-inc': 'inc' };
  Object.keys(keyMap).forEach((id) => {
    gridCard.querySelector('#' + id).addEventListener('input', (e) => {
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
        <div class="field"><label>卖出价</label><input type="number" id="b-sell" step="0.001" placeholder="卖出价" class="mono" value="${esc(bi.sell)}"></div>
        <div class="field"><label>目标回调(%)</label><input type="number" id="b-pct" step="0.1" placeholder="1.5" class="mono" value="${esc(bi.pct)}"></div>
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

  // 说明
  const tip = document.createElement('div');
  tip.className = 'card';
  tip.innerHTML = `
    <div class="card-body">
      <div class="hint">
        <strong>怎么用：</strong><br>
        · 瞄点矩阵：基准价填你的持仓成本或现价，按递增涨幅生成阶梯卖出价，涨到哪一档就卖哪一档。<br>
        · 接回点位：高抛之后按目标回调百分比算回踩价，到位再接回，一次完整做T就闭环了。<br>
        · "可省"金额是按整仓平摊估算的净值，未扣手续费；实际以操作面板的净利为准。
      </div>
    </div>
  `;
  root.appendChild(tip);
}
