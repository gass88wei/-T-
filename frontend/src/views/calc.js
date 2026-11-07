// ===== 计算器：普通 + 复利 =====

import { money, signed, num, esc, uid, nowStamp, round } from '../lib/util.js';
import {
  compound,
  yearsToTarget,
  rateToTarget,
  contributionToTarget,
} from '../lib/compound.js';
import { commit } from '../lib/store.js';

const SUBTABS = [
  { id: 'basic', label: '🧮 普通计算器' },
  { id: 'compound', label: '📈 复利计算器' },
];

export function render(root, ctx) {
  const st = ctx.viewState;
  if (!st.subtab) st.subtab = 'basic';

  const tabs = document.createElement('div');
  tabs.className = 'subtabs';
  tabs.style.cssText = 'margin-bottom:14px;max-width:420px';
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

  if (st.subtab === 'basic') renderBasic(root, ctx);
  else renderCompound(root, ctx);
}

// ==================== 普通计算器 ====================
function renderBasic(root, ctx) {
  const { state } = ctx;
  const st = ctx.viewState;
  if (!st.calc) st.calc = { expr: '', result: '0' };

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <div class="card-title">普通计算器<span class="sub">支持键盘输入</span></div>
      <button class="btn btn-sm" id="c-clear-hist">清空历史</button>
    </div>
    <div class="card-body">
      <div class="split-6-6">
        <div>
          <div class="calc-display">
            <div class="calc-expr" id="c-expr">${esc(st.calc.expr || '\u00a0')}</div>
            <div class="calc-result" id="c-result">${esc(st.calc.result)}</div>
          </div>
          <div class="calc-keys" id="c-keys">
            <button class="key fn" data-k="AC">AC</button>
            <button class="key fn" data-k="C">C</button>
            <button class="key fn" data-k="%">%</button>
            <button class="key op" data-k="÷">÷</button>
            <button class="key" data-k="7">7</button>
            <button class="key" data-k="8">8</button>
            <button class="key" data-k="9">9</button>
            <button class="key op" data-k="×">×</button>
            <button class="key" data-k="4">4</button>
            <button class="key" data-k="5">5</button>
            <button class="key" data-k="6">6</button>
            <button class="key op" data-k="−">−</button>
            <button class="key" data-k="1">1</button>
            <button class="key" data-k="2">2</button>
            <button class="key" data-k="3">3</button>
            <button class="key op" data-k="+">+</button>
            <button class="key fn" data-k="±">±</button>
            <button class="key" data-k="0">0</button>
            <button class="key" data-k=".">.</button>
            <button class="key eq" data-k="=">=</button>
            <button class="key fn wide" data-k="⌫">⌫ 退格</button>
            <button class="key fn wide" data-k="( )">( )</button>
          </div>
          <div class="hint" style="margin-top:8px">
            键盘：数字 / + - * / ( ) / Enter 等于 / Backspace 退格 / Esc 清零
          </div>
        </div>
        <div>
          <div class="card-title" style="margin-bottom:8px">计算历史<span class="sub">最近 20 条</span></div>
          <div id="c-hist"></div>
        </div>
      </div>
    </div>
  `;
  root.appendChild(card);

  const exprEl = card.querySelector('#c-expr');
  const resultEl = card.querySelector('#c-result');
  const histEl = card.querySelector('#c-hist');

  const setDisplay = () => {
    exprEl.textContent = st.calc.expr || '\u00a0';
    resultEl.textContent = st.calc.result;
  };

  const drawHistory = () => {
    const list = state.calcHistory.slice(0, 20);
    histEl.className = 'table-wrap';
    histEl.style.maxHeight = '430px';
    if (!list.length) {
      histEl.innerHTML = '<div class="empty" style="padding:24px">还没有计算记录</div>';
      return;
    }
    histEl.innerHTML = '';
    list.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'flex-between';
      row.style.cssText =
        'padding:9px 10px;border-bottom:1px solid var(--line-soft);cursor:pointer;gap:10px';
      row.innerHTML = `
        <div style="min-width:0;flex:1">
          <div class="tiny muted mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.expr)}</div>
          <div class="mono strong" style="font-size:14px">${esc(h.result)}</div>
        </div>
        <button class="icon-btn" data-hid="${h.id}">删除</button>
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-hid]')) return;
        st.calc.result = h.result;
        st.calc.expr = '';
        setDisplay();
      });
      row.querySelector('[data-hid]').addEventListener('click', (e) => {
        e.stopPropagation();
        state.calcHistory = state.calcHistory.filter((x) => x.id !== h.id);
        commit();
        drawHistory();
      });
      histEl.appendChild(row);
    });
  };
  drawHistory();

  // 表达式求值（安全：只允许数字与运算符，自己解析）
  const evaluate = (expr) => {
    const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
    if (!cleaned) return null;
    if (!/^[-+*/().\d%]+$/.test(cleaned)) return null;

    // 把 50% 转成 (50/100) 的处理：仅处理简单的 a% 形式
    const normalized = cleaned.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('"use strict"; return (' + normalized + ');');
      const v = fn();
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      return v;
    } catch {
      return null;
    }
  };

  const append = (k) => {
    const c = st.calc;
    switch (k) {
      case 'AC':
        c.expr = '';
        c.result = '0';
        break;
      case 'C':
        c.expr = '';
        break;
      case '⌫':
        c.expr = c.expr.slice(0, -1);
        break;
      case '±': {
        if (!c.expr) break;
        // 给最后一个数字取反
        const m = c.expr.match(/(\d+(?:\.\d+)?)$/);
        if (m) {
          const start = c.expr.length - m[1].length;
          const before = c.expr.slice(0, start);
          if (before.endsWith('-')) c.expr = before.slice(0, -1) + m[1];
          else c.expr = before + '-' + m[1];
        } else {
          c.expr += '-';
        }
        break;
      }
      case '( )': {
        const opens = (c.expr.match(/\(/g) || []).length;
        const closes = (c.expr.match(/\)/g) || []).length;
        c.expr += opens > closes ? ')' : '(';
        break;
      }
      case '=': {
        const v = evaluate(c.expr);
        if (v === null) {
          window.__toast('表达式有误', 'err');
          break;
        }
        const out = String(round(v, 10));
        if (!/^-?[\d.]+$/.test(out)) {
          window.__toast('结果过长', 'err');
          break;
        }
        state.calcHistory.unshift({
          id: uid('ch'),
          expr: c.expr,
          result: out,
          stamp: nowStamp(),
        });
        state.calcHistory = state.calcHistory.slice(0, 100);
        c.result = out;
        c.expr = '';
        commit();
        drawHistory();
        break;
      }
      default:
        c.expr += k;
        // 实时预览
        {
          const v = evaluate(c.expr);
          if (v !== null) c.result = String(round(v, 10));
        }
    }
    setDisplay();
  };

  card.querySelector('#c-keys').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-k]');
    if (!btn) return;
    append(btn.dataset.k);
  });

  card.querySelector('#c-clear-hist').addEventListener('click', () => {
    if (!state.calcHistory.length) return window.__toast('历史已空', 'warn');
    if (!confirm(`确定清空全部 ${state.calcHistory.length} 条计算历史吗？`)) return;
    state.calcHistory = [];
    commit();
    drawHistory();
  });

  // 键盘绑定（在当前视图激活时）
  const onKey = (e) => {
    if (!document.body.contains(card)) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    // 输入框里不拦截
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    const k = e.key;
    if (/^[0-9.]$/.test(k)) { append(k); e.preventDefault(); }
    else if (k === '+') { append('+'); e.preventDefault(); }
    else if (k === '-') { append('−'); e.preventDefault(); }
    else if (k === '*') { append('×'); e.preventDefault(); }
    else if (k === '/') { append('÷'); e.preventDefault(); }
    else if (k === '(' || k === ')') { append(k); e.preventDefault(); }
    else if (k === '%') { append('%'); e.preventDefault(); }
    else if (k === 'Enter' || k === '=') { append('='); e.preventDefault(); }
    else if (k === 'Backspace') { append('⌫'); e.preventDefault(); }
    else if (k === 'Escape') { append('AC'); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey);

  setDisplay();
}

// ==================== 复利计算器 ====================
function renderCompound(root, ctx) {
  const { state } = ctx;
  const st = ctx.viewState;
  if (!st.cp) {
    st.cp = {
      principal: '10000',
      contribution: '12000',
      rate: '7',
      years: '20',
      freq: '12',
      target: '',
      reverseMode: 'years',
    };
  }
  const cp = st.cp;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <div class="card-title">📈 复利计算器<span class="sub">定投 + 复利终值，含反向求解</span></div>
    </div>
    <div class="card-body">
      <div class="grid g3" style="margin-bottom:12px">
        <div class="field"><label>初始本金（元）</label><input type="number" id="cp-p" class="mono" value="${esc(cp.principal)}"></div>
        <div class="field"><label>每年追加（元）</label><input type="number" id="cp-c" class="mono" value="${esc(cp.contribution)}"></div>
        <div class="field"><label>年化收益率（%）</label><input type="number" id="cp-r" step="0.1" class="mono" value="${esc(cp.rate)}"></div>
        <div class="field"><label>投资年限（年）</label><input type="number" id="cp-y" step="0.5" class="mono" value="${esc(cp.years)}"></div>
        <div class="field"><label>复利频率</label>
          <select id="cp-f">
            <option value="12">按月</option>
            <option value="4">按季</option>
            <option value="2">按半年</option>
            <option value="1">按年</option>
            <option value="0">连续复利</option>
          </select>
        </div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-block" id="cp-run">计算</button></div>
      </div>
      <div id="cp-out"></div>
    </div>
  `;
  root.appendChild(card);

  const cpF = card.querySelector('#cp-f');
  cpF.value = String(cp.freq);

  const out = card.querySelector('#cp-out');

  const readInputs = () => {
    cp.principal = card.querySelector('#cp-p').value;
    cp.contribution = card.querySelector('#cp-c').value;
    cp.rate = card.querySelector('#cp-r').value;
    cp.years = card.querySelector('#cp-y').value;
    cp.freq = cpF.value;
    return {
      principal: num(cp.principal),
      contribution: num(cp.contribution),
      annualRate: num(cp.rate),
      years: num(cp.years),
      periodsPerYear: num(cp.freq, 12),
    };
  };

  const run = () => {
    const inp = readInputs();
    if (inp.years <= 0) {
      out.innerHTML = '<div class="empty">请输入有效的投资年限</div>';
      return;
    }
    const r = compound(inp);

    const rows = r.rows.slice(0, 60);
    const tableRows = rows
      .map(
        (row) => `
      <tr>
        <td class="tiny nowrap">${esc(row.label)}</td>
        <td class="num">${money(row.start)}</td>
        <td class="num dim">${money(row.contribution)}</td>
        <td class="num down">+${money(row.interest)}</td>
        <td class="num strong">${money(row.end)}</td>
      </tr>`
      )
      .join('');

    out.innerHTML = `
      <div class="grid g4" style="margin-bottom:14px">
        <div class="stat">
          <div class="stat-label">期末总额</div>
          <div class="stat-value down" style="font-size:22px">${money(r.final)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">累计投入</div>
          <div class="stat-value sm">${money(r.totalInvested)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">累计利息</div>
          <div class="stat-value sm up">+${money(r.totalInterest)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">收益倍数</div>
          <div class="stat-value sm">${r.multiple.toFixed(2)}×</div>
        </div>
      </div>
      <div class="grid g2" style="margin-bottom:14px">
        <div class="stat"><div class="stat-label">名义年化</div><div class="stat-value sm">${num(inp.annualRate).toFixed(2)}%</div></div>
        <div class="stat"><div class="stat-label">实际年化 EAR</div><div class="stat-value sm down">${r.effectiveAnnualRate.toFixed(3)}%</div></div>
      </div>
      <div class="card-title" style="margin-bottom:8px">逐年明细<span class="sub">最多显示 60 行</span></div>
      <div class="table-wrap" style="max-height:340px">
        <table>
          <thead><tr>
            <th>年份</th><th class="num">期初</th><th class="num">投入</th>
            <th class="num">利息</th><th class="num">期末</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `;
  };

  card.querySelector('#cp-run').addEventListener('click', () => {
    run();
  });
  [card.querySelector('#cp-p'), card.querySelector('#cp-c'), card.querySelector('#cp-r'), card.querySelector('#cp-y')].forEach((i) =>
    i.addEventListener('input', run)
  );
  cpF.addEventListener('change', run);

  run();

  // ---- 反向求解 ----
  const revCard = document.createElement('div');
  revCard.className = 'card';
  revCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">🎯 反向求解<span class="sub">想达到目标金额，需要什么条件</span></div>
    </div>
    <div class="card-body">
      <div class="subtabs" style="max-width:480px;margin-bottom:12px" id="rev-tabs">
        <button class="subtab" data-mode="years">要多少年</button>
        <button class="subtab" data-mode="rate">要多少年化</button>
        <button class="subtab" data-mode="contrib">每年要投多少</button>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>目标金额（元）</label>
        <input type="number" id="rv-target" class="mono" placeholder="例如 1000000" value="${esc(cp.target)}">
      </div>
      <div id="rv-out"></div>
    </div>
  `;
  root.appendChild(revCard);

  const rvTarget = revCard.querySelector('#rv-target');
  const rvOut = revCard.querySelector('#rv-out');
  const rvTabs = revCard.querySelector('#rev-tabs');

  const drawTabs = () => {
    rvTabs.querySelectorAll('.subtab').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === cp.reverseMode);
    });
  };
  rvTabs.addEventListener('click', (e) => {
    const b = e.target.closest('.subtab');
    if (!b) return;
    cp.reverseMode = b.dataset.mode;
    drawTabs();
    drawReverse();
  });
  drawTabs();

  const drawReverse = () => {
    const inp = readInputs();
    const target = num(rvTarget.value);
    cp.target = rvTarget.value;
    if (target <= 0) {
      rvOut.innerHTML = '<div class="empty" style="padding:16px">填入目标金额后自动求解</div>';
      return;
    }

    if (cp.reverseMode === 'years') {
      const y = yearsToTarget({ ...inp, target });
      if (y === null) {
        rvOut.innerHTML = `<div class="stat"><div class="stat-label">结果</div><div class="stat-value sm up">200 年内无法达到（利率过低或投入过少）</div></div>`;
        return;
      }
      const r2 = compound({ ...inp, years: y });
      rvOut.innerHTML = `
        <div class="grid g2">
          <div class="stat" style="text-align:center">
            <div class="stat-label">需要年数</div>
            <div class="stat-value down">${y.toFixed(1)} 年</div>
          </div>
          <div class="stat" style="text-align:center">
            <div class="stat-label">届时实际金额</div>
            <div class="stat-value sm">${money(r2.final)}</div>
          </div>
        </div>
        <div class="hint" style="margin-top:10px">
          约 ${(y * 12).toFixed(0)} 个月，即 ${new Date().getFullYear() + Math.floor(y)} 年前后达成。
        </div>
      `;
    } else if (cp.reverseMode === 'rate') {
      const rate = rateToTarget({ ...inp, target });
      if (rate === null) {
        rvOut.innerHTML = `<div class="stat"><div class="stat-label">结果</div><div class="stat-value sm up">所需年化超出计算范围（>500%）</div></div>`;
        return;
      }
      const r2 = compound({ ...inp, annualRate: rate });
      rvOut.innerHTML = `
        <div class="grid g2">
          <div class="stat" style="text-align:center">
            <div class="stat-label">需要年化收益率</div>
            <div class="stat-value down">${rate.toFixed(2)}%</div>
          </div>
          <div class="stat" style="text-align:center">
            <div class="stat-label">届时金额</div>
            <div class="stat-value sm">${money(r2.final)}</div>
          </div>
        </div>
        <div class="hint" style="margin-top:10px">
          参考：沪深300 长期年化约 6-8%，偏股基金约 8-12%。超过 15% 需要极强的选股能力。
        </div>
      `;
    } else {
      const c = contributionToTarget({ ...inp, target });
      if (c === null) {
        rvOut.innerHTML = `<div class="stat"><div class="stat-label">结果</div><div class="stat-value sm up">无法求解</div></div>`;
        return;
      }
      if (c === 0) {
        rvOut.innerHTML = `
          <div class="stat" style="text-align:center">
            <div class="stat-label">好消息</div>
            <div class="stat-value down">不需要额外投入</div>
            <div class="tiny muted" style="margin-top:4px">现有本金按当前利率即可达成目标</div>
          </div>
        `;
        return;
      }
      rvOut.innerHTML = `
        <div class="grid g2">
          <div class="stat" style="text-align:center">
            <div class="stat-label">每年需追加</div>
            <div class="stat-value down">${money(c, 0)}</div>
          </div>
          <div class="stat" style="text-align:center">
            <div class="stat-label">折合每月</div>
            <div class="stat-value sm">${money(c / 12, 0)}</div>
          </div>
        </div>
      `;
    }
  };

  rvTarget.addEventListener('input', drawReverse);
  drawReverse();
}
