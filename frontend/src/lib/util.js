// ===== 通用工具函数 =====

/** 安全转数字 */
export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 保留 d 位小数的数字 */
export function round(v, d = 2) {
  const p = Math.pow(10, d);
  return Math.round((num(v) + Number.EPSILON) * p) / p;
}

/** 金额格式化：1234.5 → 1,234.50 */
export function money(v, d = 2) {
  return num(v).toLocaleString('zh-CN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** 带正负号的金额 */
export function signed(v, d = 2) {
  const n = num(v);
  return (n > 0 ? '+' : '') + money(n, d);
}

/** 百分比 */
export function pct(v, d = 2) {
  return num(v).toFixed(d) + '%';
}

/** 日期字符串 */
export function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 生成短 ID */
let idSeed = 0;
export function uid(prefix = 'id') {
  idSeed += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeed}`;
}

/** HTML 转义，防注入 */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 按字符串取 DOM 元素 */
export function $(sel, root = document) {
  return root.querySelector(sel);
}
export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/** 创建元素并挂载 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** 涨跌颜色类名 */
export function trendClass(v) {
  const n = num(v);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'muted';
}

/** 防抖 */
export function debounce(fn, ms = 220) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
