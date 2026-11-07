// ===== 财务自由：记账 · 目标 · 4%法则 · 图表 =====

import { money, signed, num, esc, uid, today, nowStamp, trendClass } from '../lib/util.js';
import { fireTarget, lifeHours } from '../lib/compound.js';
import { commit } from '../lib/store.js';

const SUBTABS = [
  { id: 'overview', label: '🏠 概览' },
  { id: 'bill', label: '💰 记账' },
  { id: 'goal', label: '🎯 目标' },
  { id: 'stats', label: '📊 统计' },
];

export function render(root, ctx) {
  const st = ctx.viewState;
  if (!st.subtab) st.subtab = 'overview';
  if (!st.form) st.form = { type: 'expense', category: '', amount: '' };
  if (!st.goalForm) st.goalForm = { name: '', target: '' };

  const tabs = document.createElement('div');
  tabs.className = 'subtabs';
  tabs.style.cssText = 'margin-bottom:14px;max-width:560px';
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

  if (st.subtab === 'overview') renderOverview(root, ctx);
  else if (st.subtab === 'bill') renderBill(root, ctx);
  else if (st.subtab === 'goal') renderGoal(root, ctx);
  else renderStats(root, ctx);
}

function fin(ctx) {
  return ctx.state.finance;
}

function totals(transactions) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += num(t.amount);
    else expense += num(t.amount);
  }
  return { income, expense, net: income - expense };
}

// ============ 概览 ============
function renderOverview(root, ctx) {
  const f = fin(ctx);
  const { income, expense, net } = totals(f.transactions);
  const yieldRate = num(f.settings.yieldRate, 4);
  const targetExpense = num(f.settings.targetExpense, 5000);

  const passiveMonthly = (net * (yieldRate / 100)) / 12;
  const fireGoal = fireTarget(targetExpense, yieldRate);
  const fireProgress = fireGoal > 0 ? Math.min((net / fireGoal) * 100, 100) : 0;

  // 资产卡
  const assetCard = document.createElement('div');
  assetCard.className = 'card';
  assetCard.innerHTML = `
    <div class="card-body">
      <div class="tiny muted">当前净资产（收入 - 支出累计）</div>
      <div class="hero-value ${trendClass(net)}" style="font-size:34px;margin:4px 0">¥${money(net)}</div>
      <div class="tiny muted">累计收入 ¥${money(income)} · 累计支出 ¥${money(expense)}</div>
    </div>
  `;
  root.appendChild(assetCard);

  // 两条核心指标
  const grid = document.createElement('div');
  grid.className = 'grid g2';
  grid.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="flex-between" style="margin-bottom:8px">
          <div class="tiny muted">你的钱正在为你工作</div>
          <button class="btn btn-sm btn-ghost" id="edit-yield">修改</button>
        </div>
        <div class="hero-value down" style="font-size:26px">¥${money(passiveMonthly)}<span class="tiny muted" style="font-size:12px;font-weight:400"> / 月</span></div>
        <div class="tiny muted" style="margin-top:6px">按年化 ${yieldRate}% 计算 · 年化约 ¥${money(passiveMonthly * 12, 0)}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="flex-between" style="margin-bottom:8px">
          <div class="tiny muted">财务自由进度</div>
          <button class="btn btn-sm btn-ghost" id="edit-expense">修改</button>
        </div>
        <div class="flex-between" style="align-items:flex-end;margin-bottom:6px">
          <div class="hero-value" style="font-size:26px">${fireProgress.toFixed(1)}%</div>
          <div class="tiny muted" style="text-align:right">目标本金<br>¥${money(fireGoal, 0)}</div>
        </div>
        <div class="bar"><div class="bar-fill ${fireProgress >= 100 ? 'done' : ''}" style="width:${fireProgress}%"></div></div>
        <div class="tiny muted" style="margin-top:6px">维持 ¥${money(targetExpense, 0)}/月 需本金 ¥${money(fireGoal, 0)}</div>
      </div>
    </div>
  `;
  root.appendChild(grid);

  grid.querySelector('#edit-yield').addEventListener('click', () => {
    const v = prompt('请输入预估年化收益率（%）:', yieldRate);
    if (v === null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return window.__toast('请输入有效数字', 'err');
    f.settings.yieldRate = n;
    commit();
  });
  grid.querySelector('#edit-expense').addEventListener('click', () => {
    const v = prompt('请输入你想维持的每月支出（元）:', targetExpense);
    if (v === null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return window.__toast('请输入有效数字', 'err');
    f.settings.targetExpense = n;
    commit();
  });

  // 进行中的目标
  const goalCard = document.createElement('div');
  goalCard.className = 'card';
  goalCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">⚡ 进行中的目标</div>
      <button class="btn btn-sm" id="go-goal">管理目标 +</button>
    </div>
    <div class="card-body" id="goal-body"></div>
  `;
  root.appendChild(goalCard);
  goalCard.querySelector('#go-goal').addEventListener('click', () => {
    ctx.viewState.subtab = 'goal';
    ctx.rerender();
  });

  const goalBody = goalCard.querySelector('#goal-body');
  const active = f.goals
    .map((g) => {
      const cur = (g.records || []).reduce((a, r) => a + num(r.amount), 0);
      const pct = num(g.target) > 0 ? Math.min((cur / num(g.target)) * 100, 100) : 0;
      return { g, cur, pct };
    })
    .filter((x) => x.pct < 100);

  if (!active.length) {
    goalBody.innerHTML = '<div class="empty">暂无进行中的目标<br><span class="tiny">在「目标」页面添加，如买车、旅游基金</span></div>';
  } else {
    goalBody.innerHTML = `<div class="grid g2">${active
      .map(
        ({ g, cur, pct }) => `
      <div class="stat">
        <div class="flex-between" style="margin-bottom:6px">
          <span class="strong">${esc(g.name)}</span>
          <span class="strong down">${pct.toFixed(0)}%</span>
        </div>
        <div class="bar" style="margin-bottom:6px"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="flex-between tiny muted">
          <span>已存 ¥${money(cur, 0)}</span>
          <span>还需 ¥${money(Math.max(num(g.target) - cur, 0), 0)}</span>
        </div>
      </div>`
      )
      .join('')}</div>`;
  }

  // 快速记账
  const quickCard = document.createElement('div');
  quickCard.className = 'card';
  quickCard.innerHTML = `
    <div class="card-head"><div class="card-title">✍️ 快速记一笔</div></div>
    <div class="card-body">
      <div class="form-row" style="margin-bottom:10px">
        <div class="field"><label>类型</label>
          <select id="qk-type"><option value="expense">支出</option><option value="income">收入</option></select>
        </div>
        <div class="field"><label>分类</label><input type="text" id="qk-cat" placeholder="吃饭 / 工资 / 买菜"></div>
        <div class="field"><label>金额（元）</label><input type="number" id="qk-amt" placeholder="0.00" class="mono"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-block" id="qk-add">记一笔</button></div>
      </div>
    </div>
  `;
  root.appendChild(quickCard);

  quickCard.querySelector('#qk-add').addEventListener('click', () => {
    const type = quickCard.querySelector('#qk-type').value;
    const category = quickCard.querySelector('#qk-cat').value.trim();
    const amount = num(quickCard.querySelector('#qk-amt').value);
    if (!category) return window.__toast('请填写分类', 'err');
    if (amount <= 0) return window.__toast('金额必须大于 0', 'err');
    f.transactions.unshift({
      id: uid('tx'),
      type,
      category,
      amount,
      date: today(),
      stamp: nowStamp(),
    });
    commit();
    window.__toast('已记账', 'ok');
  });

  // 生命价值计算
  const lifeCard = document.createElement('div');
  lifeCard.className = 'card';
  lifeCard.innerHTML = `
    <div class="card-head"><div class="card-title">⏳ 这件东西值我多少小时</div></div>
    <div class="card-body">
      <div class="form-row" style="margin-bottom:10px">
        <div class="field"><label>月薪（元）</label><input type="number" id="lf-salary" placeholder="8000" class="mono"></div>
        <div class="field"><label>商品价格（元）</label><input type="number" id="lf-price" placeholder="3000" class="mono"></div>
      </div>
      <div id="lf-out"><div class="empty" style="padding:16px">填入后自动计算</div></div>
    </div>
  `;
  root.appendChild(lifeCard);

  const lfOut = lifeCard.querySelector('#lf-out');
  const drawLife = () => {
    const salary = num(lifeCard.querySelector('#lf-salary').value);
    const price = num(lifeCard.querySelector('#lf-price').value);
    if (salary <= 0 || price <= 0) {
      lfOut.innerHTML = '<div class="empty" style="padding:16px">填入后自动计算</div>';
      return;
    }
    const h = lifeHours(salary, price);
    lfOut.innerHTML = `
      <div class="grid g3">
        <div class="stat" style="text-align:center">
          <div class="stat-label">需要工作</div>
          <div class="stat-value down">${h.toFixed(1)} 小时</div>
        </div>
        <div class="stat" style="text-align:center">
          <div class="stat-label">折合工作日</div>
          <div class="stat-value sm">${(h / 8).toFixed(1)} 天</div>
        </div>
        <div class="stat" style="text-align:center">
          <div class="stat-label">折合周</div>
          <div class="stat-value sm">${(h / 8 / 5).toFixed(1)} 周</div>
        </div>
      </div>
    `;
  };
  lifeCard.querySelector('#lf-salary').addEventListener('input', drawLife);
  lifeCard.querySelector('#lf-price').addEventListener('input', drawLife);
}

// ============ 记账 ============
function renderBill(root, ctx) {
  const f = fin(ctx);

  const addCard = document.createElement('div');
  addCard.className = 'card';
  addCard.innerHTML = `
    <div class="card-head"><div class="card-title">💰 记一笔</div></div>
    <div class="card-body">
      <div class="form-row" style="margin-bottom:10px">
        <div class="field"><label>类型</label>
          <select id="b-type"><option value="expense">支出</option><option value="income">收入</option></select>
        </div>
        <div class="field"><label>分类</label><input type="text" id="b-cat" placeholder="分类"></div>
        <div class="field"><label>金额</label><input type="number" id="b-amt" placeholder="0.00" class="mono"></div>
        <div class="field"><label>日期</label><input type="text" id="b-date" value="${today()}" class="mono"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-block" id="b-add">添加</button></div>
      </div>
    </div>
  `;
  root.appendChild(addCard);

  addCard.querySelector('#b-add').addEventListener('click', () => {
    const type = addCard.querySelector('#b-type').value;
    const category = addCard.querySelector('#b-cat').value.trim();
    const amount = num(addCard.querySelector('#b-amt').value);
    const date = addCard.querySelector('#b-date').value.trim() || today();
    if (!category) return window.__toast('请填写分类', 'err');
    if (amount <= 0) return window.__toast('金额必须大于 0', 'err');
    f.transactions.unshift({ id: uid('tx'), type, category, amount, date, stamp: nowStamp() });
    commit();
  });

  const list = [...f.transactions].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const { income, expense } = totals(list);

  const listCard = document.createElement('div');
  listCard.className = 'card';
  listCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">明细<span class="sub">收入 ¥${money(income)} · 支出 ¥${money(expense)} · 净 ¥${money(income - expense)}</span></div>
      ${list.length ? '<button class="btn btn-sm btn-danger" id="b-clear">清空全部</button>' : ''}
    </div>
  `;
  const body = document.createElement('div');
  body.className = 'card-body tight';
  listCard.appendChild(body);
  root.appendChild(listCard);

  if (!list.length) {
    body.innerHTML = '<div class="empty">暂无记账记录</div>';
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr><th>日期</th><th>分类</th><th>类型</th><th class="num">金额</th><th class="act">操作</th></tr></thead>
      <tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    list.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="tiny muted mono nowrap">${esc(t.date || '未知')}</td>
        <td>${esc(t.category || '未分类')}</td>
        <td><span class="tag ${t.type === 'income' ? 'tag-down' : 'tag-up'}">${t.type === 'income' ? '收入' : '支出'}</span></td>
        <td class="num ${t.type === 'income' ? 'down' : 'up'}">${t.type === 'income' ? '+' : '-'}${money(t.amount)}</td>
        <td class="act"><button class="icon-btn" data-tid="${t.id}">删除</button></td>
      `;
      tr.querySelector('[data-tid]').addEventListener('click', () => {
        if (!confirm('确定删除这条记账吗？')) return;
        f.transactions = f.transactions.filter((x) => x.id !== t.id);
        commit();
      });
      tbody.appendChild(tr);
    });
    wrap.appendChild(table);
    body.appendChild(wrap);

    const clearBtn = listCard.querySelector('#b-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm(`确定清空全部 ${list.length} 条记账吗？此操作不可恢复。`)) return;
        f.transactions = [];
        commit();
      });
    }
  }
}

// ============ 目标 ============
function renderGoal(root, ctx) {
  const f = fin(ctx);
  const st = ctx.viewState;

  const addCard = document.createElement('div');
  addCard.className = 'card';
  addCard.innerHTML = `
    <div class="card-head"><div class="card-title">🎯 添加目标</div></div>
    <div class="card-body">
      <div class="form-row">
        <div class="field"><label>目标名称</label><input type="text" id="go-name" placeholder="如 新电脑" value="${esc(st.goalForm.name)}"></div>
        <div class="field"><label>目标金额</label><input type="number" id="go-target" placeholder="0.00" class="mono" value="${esc(st.goalForm.target)}"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-block" id="go-add">添加</button></div>
      </div>
    </div>
  `;
  root.appendChild(addCard);

  addCard.querySelector('#go-add').addEventListener('click', () => {
    const name = addCard.querySelector('#go-name').value.trim();
    const target = num(addCard.querySelector('#go-target').value);
    if (!name) return window.__toast('请填写目标名称', 'err');
    if (target <= 0) return window.__toast('目标金额必须大于 0', 'err');
    f.goals.push({ id: uid('gl'), name, target, records: [] });
    st.goalForm = { name: '', target: '' };
    commit();
    window.__toast('已添加目标', 'ok');
  });

  if (!f.goals.length) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'card';
    emptyCard.innerHTML = '<div class="empty">还没有目标，在上面添加一个吧</div>';
    root.appendChild(emptyCard);
    return;
  }

  f.goals.forEach((g) => {
    const cur = (g.records || []).reduce((a, r) => a + num(r.amount), 0);
    const pct = num(g.target) > 0 ? Math.min((cur / num(g.target)) * 100, 100) : 0;
    const done = pct >= 100;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.borderLeft = '3px solid ' + (done ? 'var(--down)' : 'var(--primary)');
    card.innerHTML = `
      <div class="card-body">
        <div class="flex-between" style="align-items:flex-start;margin-bottom:10px">
          <div>
            <div class="flex-between" style="gap:8px;justify-content:flex-start">
              <span class="strong" style="font-size:16px">${esc(g.name)}</span>
              ${done ? '<span class="tag tag-down">已达成</span>' : ''}
            </div>
            <div class="tiny muted" style="margin-top:3px">¥${money(cur, 0)} / ¥${money(num(g.target), 0)}</div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm" data-edit>编辑</button>
            <button class="btn btn-sm btn-danger" data-del>删除</button>
          </div>
        </div>
        <div class="bar" style="margin-bottom:10px"><div class="bar-fill ${done ? 'done' : ''}" style="width:${pct}%"></div></div>
        <div class="flex-end" style="margin-bottom:8px">
          <button class="btn btn-primary btn-sm" data-deposit>+ 存入</button>
          <span class="tiny muted">${(g.records || []).length} 笔记录</span>
        </div>
        <div class="tiny muted" style="margin-bottom:4px">记录明细（点击可撤销）</div>
        <div class="stat" style="max-height:120px;overflow-y:auto;padding:8px 10px">
          ${
            (g.records || []).length
              ? [...g.records]
                  .reverse()
                  .map(
                    (r) => `<div class="flex-between tiny" style="padding:3px 0;cursor:pointer" data-rev="${esc(r.id)}">
                      <span class="muted">${esc(r.date || '')}</span>
                      <span class="down">+¥${money(r.amount, 0)}</span>
                      <span class="muted">撤销</span>
                    </div>`
                  )
                  .join('')
              : '<span class="tiny muted">暂无记录</span>'
          }
        </div>
      </div>
    `;
    root.appendChild(card);

    card.querySelector('[data-deposit]').addEventListener('click', () => {
      const v = prompt('存入金额:', '');
      if (v === null) return;
      const amount = Number(v);
      if (!Number.isFinite(amount) || amount <= 0) return window.__toast('金额必须大于 0', 'err');
      g.records = g.records || [];
      g.records.push({ id: uid('gr'), date: today(), amount, note: '存入' });
      commit();
      window.__toast('已存入', 'ok');
    });

    card.querySelector('[data-edit]').addEventListener('click', () => {
      const name = prompt('修改目标名称:', g.name);
      if (name === null) return;
      const target = prompt('修改目标金额:', g.target);
      if (target === null) return;
      const t = Number(target);
      if (!Number.isFinite(t) || t <= 0) return window.__toast('目标金额无效', 'err');
      g.name = name.trim() || g.name;
      g.target = t;
      commit();
    });

    card.querySelector('[data-del]').addEventListener('click', () => {
      if (!confirm(`确定删除目标「${g.name}」吗？`)) return;
      f.goals = f.goals.filter((x) => x.id !== g.id);
      commit();
    });

    card.querySelectorAll('[data-rev]').forEach((node) => {
      node.addEventListener('click', () => {
        if (!confirm('撤销这笔存入吗？')) return;
        g.records = (g.records || []).filter((r) => r.id !== node.dataset.rev);
        commit();
      });
    });
  });
}

// ============ 统计 ============
function renderStats(root, ctx) {
  const f = fin(ctx);
  const now = new Date();

  // 近 6 个月储蓄率
  const months = {};
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[key] = { income: 0, expense: 0, label: `${d.getMonth() + 1}月` };
  }
  f.transactions.forEach((t) => {
    const key = String(t.date || '').slice(0, 7);
    if (months[key]) {
      if (t.type === 'income') months[key].income += num(t.amount);
      else months[key].expense += num(t.amount);
    }
  });

  const bars = Object.values(months).map((m) => {
    const rate = m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : 0;
    return { label: m.label, rate };
  });

  // 本月支出分类
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const catMap = {};
  f.transactions
    .filter((t) => t.type === 'expense' && String(t.date || '').startsWith(curMonth))
    .forEach((t) => {
      const k = t.category || '未分类';
      catMap[k] = (catMap[k] || 0) + num(t.amount);
    });
  const pieItems = Object.entries(catMap)
    .map(([name, val]) => ({ name, val }))
    .sort((a, b) => b.val - a.val);
  const pieTotal = pieItems.reduce((a, b) => a + b.val, 0);

  const COLORS = ['#4c7dff', '#f2454b', '#25b56b', '#f0a92e', '#a855f7', '#06b6d4'];

  const grid = document.createElement('div');
  grid.className = 'grid g2';

  // 柱状图
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.rate)), 10);
  const barCard = document.createElement('div');
  barCard.className = 'card';
  barCard.innerHTML = `
    <div class="card-head"><div class="card-title">最近 6 个月储蓄率</div></div>
    <div class="card-body">
      ${
        bars.every((b) => b.rate === 0)
          ? '<div class="empty">暂无收支数据</div>'
          : `<div style="display:flex;align-items:flex-end;justify-content:space-around;height:180px;gap:8px">
              ${bars
                .map((b) => {
                  const h = Math.max((Math.abs(b.rate) / maxAbs) * 130, 3);
                  const color = b.rate >= 0 ? 'var(--down)' : 'var(--up)';
                  return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:4px">
                    <div class="tiny muted mono">${b.rate.toFixed(0)}%</div>
                    <div style="width:100%;height:${h}px;background:${color};border-radius:4px 4px 0 0"></div>
                    <div class="tiny muted">${b.label}</div>
                  </div>`;
                })
                .join('')}
            </div>`
      }
    </div>
  `;
  grid.appendChild(barCard);

  // 饼图
  const pieCard = document.createElement('div');
  pieCard.className = 'card';

  let conic = '#232b42';
  if (pieTotal > 0) {
    let start = 0;
    const segs = pieItems.map((it, i) => {
      const deg = (it.val / pieTotal) * 360;
      const seg = `${COLORS[i % COLORS.length]} ${start}deg ${start + deg}deg`;
      start += deg;
      return seg;
    });
    conic = `conic-gradient(${segs.join(', ')})`;
  }

  pieCard.innerHTML = `
    <div class="card-head"><div class="card-title">本月支出分类</div></div>
    <div class="card-body" style="display:flex;flex-direction:column;align-items:center;gap:14px">
      <div style="width:150px;height:150px;border-radius:50%;background:${conic}"></div>
      <div style="width:100%;display:flex;flex-direction:column;gap:6px">
        ${
          pieItems.length
            ? pieItems
                .map(
                  (it, i) => `
            <div class="flex-between tiny">
              <span style="display:flex;align-items:center;gap:6px">
                <span style="width:9px;height:9px;border-radius:50%;background:${COLORS[i % COLORS.length]};display:inline-block"></span>
                ${esc(it.name)}
              </span>
              <span class="mono">¥${money(it.val)} · ${((it.val / pieTotal) * 100).toFixed(1)}%</span>
            </div>`
                )
                .join('')
            : '<div class="empty">本月暂无支出</div>'
        }
      </div>
    </div>
  `;
  grid.appendChild(pieCard);

  root.appendChild(grid);
}
