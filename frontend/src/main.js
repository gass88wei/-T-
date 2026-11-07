import './style.css';
import { initStore, subscribe, getState, getSettings, commit, flushSave, exportJSON, replaceState, getDataPath } from './lib/store.js';
import { $, esc } from './lib/util.js';
import * as tTrading from './views/tTrading.js';
import * as profitCalc from './views/profitCalc.js';
import * as calc from './views/calc.js';
import * as finance from './views/finance.js';
import * as settingsView from './views/settings.js';

// ===== 轻提示 =====
const toastLayer = document.createElement('div');
toastLayer.className = 'toast-layer';
document.body.appendChild(toastLayer);

window.__toast = function (msg, kind = 'ok', ms = 2200) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  toastLayer.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .25s';
    setTimeout(() => t.remove(), 260);
  }, ms);
};

// ===== 路由 =====
const VIEWS = [
  { id: 'trading', icon: '📉', label: '做T管理', mod: tTrading },
  { id: 'profit', icon: '💹', label: '收益计算器', mod: profitCalc },
  { id: 'calc', icon: '🧮', label: '计算器', mod: calc },
  { id: 'finance', icon: '💰', label: '财务自由', mod: finance },
  { id: 'settings', icon: '⚙️', label: '设置', mod: settingsView },
];

let currentView = 'trading';
const viewState = {}; // 每个视图的内部状态

function renderShell() {
  const app = $('#app');
  app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <span class="brand-mark">◈</span>
        <span>做T全能终端</span>
        <span class="brand-ver" id="ver">v1.0.0</span>
      </div>
      <nav class="nav" id="nav">
        ${VIEWS.map(
          (v) => `<button class="nav-item" data-view="${v.id}">
            <span class="nav-ico">${v.icon}</span><span>${v.label}</span>
          </button>`
        ).join('')}
      </nav>
      <div class="topbar-actions">
        <button class="btn btn-sm" id="btn-import" title="从 JSON 文件导入数据">导入</button>
        <button class="btn btn-sm" id="btn-export" title="把全部数据导出为 JSON 文件">导出</button>
      </div>
    </div>
    <div class="scroll"><div class="page" id="view-root"></div></div>
  `;

  $('#nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    switchView(btn.dataset.view);
  });

  $('#btn-export').addEventListener('click', doExport);
  $('#btn-import').addEventListener('click', doImport);
}

function updateNav() {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === currentView);
  });
}

function switchView(id) {
  if (!VIEWS.find((v) => v.id === id)) return;
  currentView = id;
  updateNav();
  renderCurrentView();
}

let renderScheduled = false;
function renderCurrentView() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    const root = $('#view-root');
    if (!root) return;
    const view = VIEWS.find((v) => v.id === currentView);
    if (!view) return;
    root.innerHTML = '';
    const st = viewState[currentView] || (viewState[currentView] = {});
    view.mod.render(root, { state: getState(), settings: getSettings(), viewState: st, rerender: renderCurrentView });
  });
}

// ===== 导入导出 =====
async function doExport() {
  try {
    await flushSave();
    const api = window.go?.main?.App;
    if (!api?.ExportData) return window.__toast('导出功能不可用', 'err');
    const text = exportJSON();
    const path = await api.ExportData(text);
    if (path) window.__toast('已导出到 ' + path.split('/').pop(), 'ok', 3000);
  } catch (e) {
    window.__toast('导出失败：' + (e?.message || e), 'err', 3500);
  }
}

async function doImport() {
  try {
    const api = window.go?.main?.App;
    if (!api?.ImportData) return window.__toast('导入功能不可用', 'err');
    const text = await api.ImportData();
    if (!text) return; // 取消
    const raw = JSON.parse(text);
    if (!confirm('导入将覆盖当前全部数据，确定继续吗？\n（当前数据会先自动备份为 .bak）')) return;
    const ok = await replaceState(raw);
    if (ok !== false) {
      window.__toast('导入成功', 'ok');
      renderCurrentView();
    }
  } catch (e) {
    window.__toast('导入失败：' + (e?.message || e), 'err', 4000);
  }
}

// ===== 启动 =====
async function boot() {
  renderShell();
  await initStore();

  try {
    const api = window.go?.main?.App;
    if (api?.AppVersion) {
      const v = await api.AppVersion();
      const vEl = $('#ver');
      if (vEl && v) vEl.textContent = 'v' + v;
    }
  } catch {}

  subscribe(() => renderCurrentView());
  switchView('trading');

  // 关闭前保存
  window.addEventListener('beforeunload', () => {
    flushSave();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave();
  });
}

boot();
