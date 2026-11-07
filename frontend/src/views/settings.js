// ===== 设置：手续费参数 / 数据管理 =====

import { money, num, esc } from '../lib/util.js';
import { commit, getDataPath, getSettings, flushSave, exportJSON, replaceState } from '../lib/store.js';
import { sideFee } from '../lib/fees.js';

const PRESETS = [
  { name: '万 2.5（常见）', rate: 0.00025, min: 5 },
  { name: '万 2', rate: 0.0002, min: 5 },
  { name: '万 1.5', rate: 0.00015, min: 5 },
  { name: '万 1', rate: 0.0001, min: 1 },
  { name: '万 0.85（低佣）', rate: 0.000085, min: 0.1 },
];

export function render(root, ctx) {
  const { state, settings } = ctx;

  // ---- 手续费 ----
  const feeCard = document.createElement('div');
  feeCard.className = 'card';
  feeCard.innerHTML = `
    <div class="card-head">
      <div class="card-title">⚙️ 交易费用参数<span class="sub">改动后全应用立即生效</span></div>
    </div>
    <div class="card-body">
      <div class="grid g2" style="margin-bottom:12px">
        <div class="field">
          <label>佣金率（如 0.00025 = 万 2.5）</label>
          <input type="number" id="s-comm" step="0.000001" value="${settings.commissionRate}" class="mono">
        </div>
        <div class="field">
          <label>最低佣金（元）</label>
          <input type="number" id="s-min" step="0.01" value="${settings.minCommission}" class="mono">
        </div>
        <div class="field">
          <label>印花税（仅卖出，0.001 = 千 1）</label>
          <input type="number" id="s-stamp" step="0.0001" value="${settings.stampDuty}" class="mono">
        </div>
        <div class="field">
          <label>过户费（双边，0.00001 = 十万分之一）</label>
          <input type="number" id="s-trans" step="0.000001" value="${settings.transferFee}" class="mono">
        </div>
      </div>

      <div class="tiny muted" style="margin-bottom:6px">快速预设</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${PRESETS.map(
          (p, i) => `<button class="btn btn-sm" data-preset="${i}">${p.name}</button>`
        ).join('')}
      </div>

      <div class="card-title" style="margin-bottom:8px">试算对照<span class="sub">按 1 万元成交额</span></div>
      <div id="s-preview"></div>

      <div class="flex-end" style="margin-top:14px">
        <button class="btn btn-primary" id="s-save">保存设置</button>
        <button class="btn" id="s-reset">恢复默认</button>
      </div>
    </div>
  `;
  root.appendChild(feeCard);

  const fComm = feeCard.querySelector('#s-comm');
  const fMin = feeCard.querySelector('#s-min');
  const fStamp = feeCard.querySelector('#s-stamp');
  const fTrans = feeCard.querySelector('#s-trans');
  const preview = feeCard.querySelector('#s-preview');

  const readForm = () => ({
    commissionRate: num(fComm.value, 0.00025),
    minCommission: num(fMin.value, 5),
    stampDuty: num(fStamp.value, 0.001),
    transferFee: num(fTrans.value, 0.00001),
  });

  const drawPreview = () => {
    const s = readForm();
    const buy = sideFee(10000, 'buy', s);
    const sell = sideFee(10000, 'sell', s);
    preview.innerHTML = `
      <div class="grid g2">
        <div class="stat">
          <div class="stat-label">买入 1 万元</div>
          <div class="stat-value sm">${money(buy.total)} 元</div>
          <div class="tiny muted" style="margin-top:3px">
            佣金 ${money(buy.commission)} + 过户 ${money(buy.transfer)}
          </div>
        </div>
        <div class="stat">
          <div class="stat-label">卖出 1 万元</div>
          <div class="stat-value sm">${money(sell.total)} 元</div>
          <div class="tiny muted" style="margin-top:3px">
            佣金 ${money(sell.commission)} + 印花 ${money(sell.stamp)} + 过户 ${money(sell.transfer)}
          </div>
        </div>
      </div>
      <div class="hint" style="margin-top:8px">
        一买一卖总成本约 <strong>${money(buy.total + sell.total)}</strong> 元，
        相当于成交额的 <strong>${((buy.total + sell.total) / 100).toFixed(3)}%</strong>。
        做T的差价至少要覆盖这个比例才不亏。
      </div>
    `;
  };

  [fComm, fMin, fStamp, fTrans].forEach((i) => i.addEventListener('input', drawPreview));
  drawPreview();

  feeCard.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[Number(btn.dataset.preset)];
      fComm.value = p.rate;
      fMin.value = p.min;
      drawPreview();
    });
  });

  feeCard.querySelector('#s-save').addEventListener('click', () => {
    const s = readForm();
    if (s.commissionRate < 0 || s.commissionRate > 0.01) return window.__toast('佣金率超出合理范围', 'err');
    if (s.minCommission < 0) return window.__toast('最低佣金不能为负', 'err');
    if (s.stampDuty < 0 || s.stampDuty > 0.01) return window.__toast('印花税超出合理范围', 'err');
    state.settings = { ...settings, ...s };
    commit();
    window.__toast('设置已保存并生效', 'ok');
  });

  feeCard.querySelector('#s-reset').addEventListener('click', () => {
    if (!confirm('恢复为默认费率（万 2.5 / 最低 5 元 / 印花千 1）？')) return;
    state.settings = {
      commissionRate: 0.00025,
      minCommission: 5,
      stampDuty: 0.001,
      transferFee: 0.00001,
    };
    commit();
    window.__toast('已恢复默认', 'ok');
  });

  // ---- 数据管理 ----
  const dataCard = document.createElement('div');
  dataCard.className = 'card';
  dataCard.innerHTML = `
    <div class="card-head"><div class="card-title">💾 数据管理</div></div>
    <div class="card-body">
      <div class="tiny muted" style="margin-bottom:4px">数据文件位置</div>
      <div class="copy-path" id="s-path">${esc(getDataPath() || '（未连接后端）')}</div>
      <div class="hint" style="margin-top:8px">
        每次保存会自动保留上一版为 <span class="mono">data.json.bak</span>；
        若主文件损坏，下次启动会自动从备份恢复。
      </div>

      <div class="hr"></div>

      <div class="grid g3" style="margin-bottom:12px">
        <div class="stat"><div class="stat-label">持仓标的</div><div class="stat-value sm">${state.stocks.length}</div></div>
        <div class="stat"><div class="stat-label">操作记录</div><div class="stat-value sm">${state.stocks.reduce((a, s) => a + s.history.length, 0)}</div></div>
        <div class="stat"><div class="stat-label">计算历史</div><div class="stat-value sm">${state.calcHistory.length}</div></div>
        <div class="stat"><div class="stat-label">常用代码</div><div class="stat-value sm">${state.savedCodes.length}</div></div>
        <div class="stat"><div class="stat-label">记账条目</div><div class="stat-value sm">${state.finance.transactions.length}</div></div>
        <div class="stat"><div class="stat-label">目标数量</div><div class="stat-value sm">${state.finance.goals.length}</div></div>
      </div>

      <div class="flex-end">
        <button class="btn" id="s-export" style="flex:1">导出全部数据</button>
        <button class="btn" id="s-import" style="flex:1">从文件导入</button>
        <button class="btn btn-danger" id="s-wipe">清空全部数据</button>
      </div>
    </div>
  `;
  root.appendChild(dataCard);

  dataCard.querySelector('#s-export').addEventListener('click', async () => {
    try {
      await flushSave();
      const path = await window.go.main.App.ExportData(exportJSON());
      if (path) window.__toast('已导出到 ' + path.split('/').pop(), 'ok', 3000);
    } catch (e) {
      window.__toast('导出失败：' + (e?.message || e), 'err');
    }
  });

  dataCard.querySelector('#s-import').addEventListener('click', async () => {
    try {
      const text = await window.go.main.App.ImportData();
      if (!text) return;
      if (!confirm('导入将覆盖当前全部数据，确定继续吗？')) return;
      await replaceState(JSON.parse(text));
      window.__toast('导入成功', 'ok');
    } catch (e) {
      window.__toast('导入失败：' + (e?.message || e), 'err', 3500);
    }
  });

  dataCard.querySelector('#s-wipe').addEventListener('click', () => {
    const total =
      state.stocks.length +
      state.stocks.reduce((a, s) => a + s.history.length, 0) +
      state.calcHistory.length +
      state.finance.transactions.length +
      state.finance.goals.length;
    if (total === 0) return window.__toast('当前没有数据', 'warn');
    if (!confirm(`确定清空全部数据吗？共 ${total} 条记录，此操作不可恢复。\n建议先导出备份。`)) return;
    if (!confirm('再次确认：真的要清空所有数据吗？')) return;
    state.stocks = [];
    state.calcHistory = [];
    state.savedCodes = [];
    state.finance = {
      transactions: [],
      goals: [],
      settings: { yieldRate: 4, targetExpense: 5000 },
    };
    commit();
    window.__toast('已清空全部数据', 'ok');
  });

  // ---- 关于 ----
  const aboutCard = document.createElement('div');
  aboutCard.className = 'card';
  aboutCard.innerHTML = `
    <div class="card-head"><div class="card-title">关于</div></div>
    <div class="card-body">
      <div class="hint">
        <strong>做T全能终端 v1.1.1</strong><br>
        本地离线运行，所有数据保存在你自己的电脑上，不上传任何服务器。<br>
        做T成本核算：净值盈亏冲减持仓成本（摊薄）；加仓按加权平均重算；减仓成本不变。<br>
        手续费按 A 股规则计算：佣金双边（含最低值）、印花税仅卖出、过户费双边。<br><br>
        <span class="muted">技术：Go + Wails v2 + 原生 JS（无框架、无网络依赖）</span>
      </div>
    </div>
  `;
  root.appendChild(aboutCard);
}
