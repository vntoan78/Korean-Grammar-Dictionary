// ── Tải dữ liệu từ điển ──────────────────────────────────────────────────
// SPA mode: tải file JSON trực tiếp qua fetch() từ thư mục ./data/
// Thay thế cho Tauri IPC (invoke) dùng trong app gốc — giữ nguyên contract:
//   loadDataFile(filename) → Promise<any>
//   filename có thể là 'manifest.json' hoặc 'data_national.json' / 'data_Kim.json'
const DATA_BASE = (() => {
  // Tự động phát hiện base URL — hỗ trợ cả chạy ở root và sub-path
  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const src = scripts[i].src || '';
    const idx = src.lastIndexOf('/');
    if (idx >= 0 && src.substring(idx + 1) === 'main.js') {
      return src.substring(0, idx) + '/data/';
    }
  }
  // Fallback: dùng path tương đối
  return './data/';
})();

async function loadDataFile(filename) {
  // filename có thể là 'manifest.json', 'data_national.json', hoặc 'data_national.json.zst'
  // SPA chỉ hỗ trợ .json (đã giải nén sẵn), nên strip .zst nếu có
  const cleanName = filename.endsWith('.zst')
    ? filename.slice(0, -'.zst'.length)
    : filename;
  const url = DATA_BASE + cleanName;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Không thể tải ${cleanName}: HTTP ${resp.status} ${resp.statusText}`);
  }
  const text = await resp.text();
  return JSON.parse(text);
}

// ── State (Quản lý trạng thái ứng dụng) ───────────────────────────────
let allWords = [];
let navHistory = [];
let navPos = -1;
let isNavigating = false;
// ★ Sidebar/History resize — kept for toolbar buttons (backward compat)
const sidebarWidths = [200, 260, 320, 400];
let sidebarIdx = 1;
const historyWidths = [80, 130, 180, 240, 300];
let historyIdx = 1;

// ★ Category Korean → Vietnamese translation map
const categoryViMap = {
  '표현': 'Biểu hiện',
  '어미(종결)': 'Đuôi từ (kết thúc)',
  '어미(연결)': 'Đuôi từ (liên kết)',
  '조사': 'Trợ từ',
  '어미': 'Đuôi từ',
  '관용구': 'Thành ngữ',
};

function getCategoryVi(categoryKo) {
  if (!categoryKo) return '';
  const trimmed = categoryKo.trim();
  return categoryViMap[trimmed] || '';
}

const fontSizes = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 32, 36, 42, 48, 56, 64, 72];
let fontSizeIdx = 4; // Mặc định hiển thị cỡ chữ 15px

let globalDicts = []; // Lưu trữ danh sách các bộ từ điển đọc từ manifest

// ── Hiển thị lỗi trong UI (thay vì chỉ console) ──────────────────────────
function showErrorInUI(title, detail) {
  const detailEl = document.getElementById("detail");
  if (!detailEl) return;
  detailEl.innerHTML = `
    <div style="padding:24px; color:#d32f2f; background:#fff5f5; border-radius:10px; margin:20px 0; border:2px solid #d32f2f;">
      <h2 style="margin:0 0 10px; font-size:18px;">⚠ ${esc(title)}</h2>
      <pre style="white-space:pre-wrap; word-break:break-word; font-size:13px; line-height:1.5; color:#555; background:#fff; padding:12px; border-radius:6px; overflow:auto; max-height:400px;">${esc(detail)}</pre>
    </div>`;
}

// ── Khởi chạy ứng dụng: Đọc danh sách manifest trước ──────────────────
async function init() {
  try {
    injectTableCSS();
    await loadManifest();
  } catch (e) {
    console.error("Lỗi khởi tạo ứng dụng:", e);
    showErrorInUI("Lỗi khởi tạo ứng dụng", String(e));
  }
}

// ── Hàm nhúng trực tiếp CSS cho cấu trúc Bảng, Phụ chú và Dark Mode ───────────────────
function injectTableCSS() {
  if (document.getElementById("dict-table-style")) return;
  const style = document.createElement("style");
  style.id = "dict-table-style";
  style.textContent = `
    /* ════ BẢNG SO SÁNH (dict-table) ════ */
    .dict-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 0.95em;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .dict-table th {
      background-color: var(--tag-bg);
      color: var(--accent2);
      font-weight: 600;
      padding: 10px 14px;
      text-align: left;
      border: 1px solid var(--border);
    }
    .dict-table td {
      padding: 10px 14px;
      border: 1px solid var(--border);
      color: var(--text);
      line-height: 1.5;
    }
    /* Link tham chiếu trong bảng dict-ref -> clickable */
    .dict-ref {
      color: var(--accent);
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-decoration-style: dotted;
      margin: 0 2px;
      transition: color 0.15s;
    }
    .dict-ref:hover {
      color: var(--accent2);
      text-decoration-style: solid;
    }
    /* Dark Mode cho bảng */
    [data-theme="dark"] .dict-table th {
      background-color: #1e293b;
      color: #93c5fd;
    }
    [data-theme="dark"] .dict-table td {
      color: #cbd5e1;
    }
    [data-theme="dark"] .dict-table {
      border-color: #334155;
    }
    [data-theme="dark"] .dict-table th,
    [data-theme="dark"] .dict-table td {
      border-color: #334155;
    }

    /* ════ KHUNG VIỀN PHỤ CHÚ CŨ (note-box) ════ */
    .note-box {
      border: 2px solid #900000;
      padding: 10px;
      border-radius: 5px;
      margin: 12px 0;
      background-color: #fff5f5;
      color: #900000;
      font-size: 0.95em;
      line-height: 1.5;
    }
    [data-theme="dark"] .note-box {
      background-color: #2a1515 !important;
      border-color: #ff5555 !important;
      color: #ffcccc !important;
    }
    [data-theme="dark"] .note-box p,
    [data-theme="dark"] .note-box .n-txt {
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .note-box .n-ex .ex-ko {
      color: #e2e8f0 !important;
    }
    [data-theme="dark"] .note-box .n-ex .ex-vi {
      color: #94a3b8 !important;
    }

    /* ════ PHỤ CHÚ KHÔNG BẢNG - KHỐI ĐỘC LẬP NỀN XANH DƯƠNG NHẸ ════ */
    .noteblock-container.phu-chu-block {
      border: 2px solid #5b9bd5;
      background-color: #eef5fb;
    }
    .noteblock-container.phu-chu-block .noteblock-header {
      background-color: #5b9bd5;
      color: #fff;
    }
    .noteblock-container.phu-chu-block .noteblock-heading {
      color: #2b5797;
      border-bottom-color: #a8c8e8;
    }
    .noteblock-container.phu-chu-block .noteblock-text {
      color: #1a3a5c;
    }
    .noteblock-container.phu-chu-block .noteblock-text .arrow-prefix {
      color: #2b5797;
    }
    .noteblock-container.phu-chu-block .noteblock-text .note-bullet {
      color: #2b5797;
    }
    [data-theme="dark"] .noteblock-container.phu-chu-block {
      background-color: #1a2744 !important;
      border-color: #5b9bd5 !important;
    }
    [data-theme="dark"] .noteblock-container.phu-chu-block .noteblock-header {
      background-color: #2b4570 !important;
      color: #b8d4f0 !important;
    }
    [data-theme="dark"] .noteblock-container.phu-chu-block .noteblock-heading {
      color: #8bb8e0 !important;
      border-bottom-color: #3a5a80 !important;
    }
    [data-theme="dark"] .noteblock-container.phu-chu-block .noteblock-text {
      color: #c5d8ec !important;
    }
    [data-theme="dark"] .noteblock-container.phu-chu-block .noteblock-example .ex-ko {
      color: #e2e8f0 !important;
    }
    [data-theme="dark"] .noteblock-container.phu-chu-block .noteblock-example .ex-vi {
      color: #94a3b8 !important;
    }

    /* ════ (예) MARKER ════ */
    .ye-marker {
      display: inline-block;
      background: #e8f5e9;
      color: #2e7d32;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
      margin: 4px 0 2px 0;
    }
    [data-theme="dark"] .ye-marker {
      background: #1b3a20;
      color: #81c784;
    }

    /* ════ SUPERScript ════ */
    .example-item sup, .usage-explanation sup, .meta-item sup,
    .noteblock-text sup, .noteblock-example sup {
      color: var(--accent);
      font-weight: 600;
    }

    /* ════ ĐỊNH DẠNG XANH DƯƠNG ĐẬM CHO SECTION/INDEX (NATIONAL) ════ */
    .section-block-national {
      border-left: 3px solid #0070ff;
      padding-left: 12px;
      margin-top: 15px;
    }
    .section-title-national {
      color: #0070ff;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .usage-index-national {
      background: #e6f0ff;
      color: #0070ff;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85em;
      margin-right: 6px;
      font-weight: 500;
    }
    [data-theme="dark"] .section-block-national {
      border-left-color: #60a5fa;
    }
    [data-theme="dark"] .section-title-national {
      color: #60a5fa;
    }
    [data-theme="dark"] .usage-index-national {
      background: #1e3a5f;
      color: #93c5fd;
    }

    /* ════ MORPHOLOGY BOX (Hình thái từ — National) ════ */
    .morphology-box {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      margin: 10px 0;
      background-color: var(--usage-bg);
    }
    .morphology-item {
      margin: 3px 0;
      line-height: 1.5;
      font-size: 0.95em;
    }
    [data-theme="dark"] .morphology-box {
      background-color: #1a2744;
      border-color: #334155;
    }

    /* ════ SECTION CONTENT (National) ════ */
    .section-content-national {
      padding: 6px 10px;
      margin: 6px 0 10px 0;
      background: var(--usage-bg);
      border-radius: 4px;
      font-size: 0.95em;
      line-height: 1.5;
    }

    /* ════ USAGE NOTE (National) ════ */
    .usage-note {
      border-left: 3px solid var(--accent);
      background: var(--usage-bg);
    }
    .usage-note-vi {
      border-left: 3px solid var(--accent2);
      background: var(--usage-bg);
    }
    [data-theme="dark"] .usage-note {
      border-left-color: #60a5fa;
      background: #1e293b;
    }
    [data-theme="dark"] .usage-note-vi {
      border-left-color: #818cf8;
      background: #1e293b;
      color: #94a3b8 !important;
    }

    /* ════ ❛❜ MARKER (Trích dẫn trong National) ════ */
    .quote-marker {
      color: var(--accent);
      font-weight: 600;
    }
    [data-theme="dark"] .quote-marker {
      color: #93c5fd;
    }

    /* ════ ĐỊNH DẠNG NOTE_BLOCKS (KIM) ════ */
    .noteblock-container {
      border: 2px solid #900000;
      border-radius: 6px;
      margin: 15px 0;
      padding: 0;
      overflow: hidden;
      background-color: #fff5f5;
    }
    .noteblock-container + .noteblock-container {
      margin-top: 12px;
    }
    .noteblock-header {
      background-color: #900000;
      color: #fff;
      font-weight: 600;
      padding: 6px 14px;
      font-size: 0.92em;
      letter-spacing: 0.3px;
    }
    .noteblock-body {
      padding: 12px 14px;
    }
    .noteblock-heading {
      color: #900000;
      font-weight: 700;
      font-size: 1em;
      margin: 10px 0 6px 0;
      padding-bottom: 4px;
      border-bottom: 1px dashed #cc0000;
    }
    .noteblock-heading .dict-ref {
      color: inherit;
      text-decoration: underline dotted;
    }
    .noteblock-heading:first-child {
      margin-top: 0;
    }
    .noteblock-text {
      color: #4a0000;
      margin: 4px 0;
      line-height: 1.55;
      padding-left: 8px;
    }
    .noteblock-text .arrow-prefix {
      color: #900000;
      font-weight: 600;
      margin-right: 4px;
    }
    .noteblock-text .note-bullet {
      color: #900000;
      font-weight: 600;
      margin-right: 4px;
    }
    /* Bảng bên trong note_blocks */
    .noteblock-body .dict-table {
      margin: 8px 0;
    }
    .noteblock-example {
      margin: 5px 0;
      padding-left: 10px;
      line-height: 1.45;
    }
    .noteblock-example .ex-ko {
      color: #333;
      margin: 0;
    }
    .noteblock-example .ex-vi {
      color: #666;
      margin: 2px 0 0 12px;
      font-size: 0.93em;
    }
    .dialogue-badge {
      display: inline-block;
      font-size: 0.72em;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
      vertical-align: middle;
      font-weight: 600;
    }
    .noteblock-example .dialogue-badge {
      background: #900000;
      color: #fff;
    }
    .example-item .dialogue-badge {
      background: #2563eb;
      color: #fff;
    }
    /* Dark Mode cho Note Blocks */
    [data-theme="dark"] .noteblock-container {
      background-color: #2a1515 !important;
      border-color: #ff5555 !important;
    }
    [data-theme="dark"] .noteblock-header {
      background-color: #7f1d1d !important;
      color: #fecaca !important;
    }
    [data-theme="dark"] .noteblock-heading {
      color: #fca5a5 !important;
      border-bottom-color: #991b1b !important;
    }
    [data-theme="dark"] .noteblock-text {
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .noteblock-example .ex-ko {
      color: #e2e8f0 !important;
    }
    [data-theme="dark"] .noteblock-example .ex-vi {
      color: #94a3b8 !important;
    }
    [data-theme="dark"] .noteblock-example .dialogue-badge {
      background: #991b1d;
      color: #fecaca;
    }
    [data-theme="dark"] .example-item .dialogue-badge {
      background: #1e40af;
      color: #bfdbfe;
    }

    /* ════ TABLE_BLOCKS (Bảng phụ chú có ngữ cảnh) ════ */
    .tableblock-container {
      margin: 12px 0;
      overflow-x: auto;
    }
    .tableblock-label {
      font-size: 0.85em;
      color: var(--text-muted);
      font-style: italic;
      margin-bottom: 4px;
    }

    /* ════ TÌM KIẾM NÂNG CAO (Advanced Search) ════ */
    .adv-search-toggle-label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.82em;
      color: var(--text-muted);
      cursor: pointer;
      margin-top: 4px;
      user-select: none;
    }
    .adv-search-toggle-label input[type="checkbox"] {
      accent-color: var(--accent);
      cursor: pointer;
    }
    #adv-search-results {
      border-top: 1px dashed var(--border);
      margin-top: 6px;
      padding-top: 4px;
      max-height: 200px;
      overflow-y: auto;
    }
    .adv-search-header {
      font-size: 0.82em;
      color: var(--accent2);
      font-weight: 600;
      padding: 4px 6px;
      margin-bottom: 4px;
    }
    .adv-search-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.88em;
      transition: background 0.12s;
    }
    .adv-search-item:hover {
      background: var(--tag-bg);
    }
    .adv-search-item .adv-word {
      font-weight: 600;
      color: var(--accent);
      margin-right: 8px;
      white-space: nowrap;
    }
    .adv-search-item .adv-meaning {
      color: var(--text-muted);
      font-size: 0.92em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    [data-theme="dark"] .adv-search-item:hover {
      background: #1e293b;
    }
    [data-theme="dark"] .adv-search-header {
      color: #a78bfa;
    }

    /* ════ ❏ MARKER (Đỏ) ════ */
    .usage-explanation-vi .red-marker {
      color: #d32f2f;
      font-weight: 700;
    }
    [data-theme="dark"] .usage-explanation-vi .red-marker {
      color: #ef5350;
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.documentElement.appendChild(style);
  }
}

// ── Tải danh sách nguồn từ điển từ manifest.json ──────────────────────
async function loadManifest() {
  let dicts;
  try {
    dicts = await loadDataFile('manifest.json');
  } catch (e) {
    showErrorInUI("Không thể tải manifest.json", String(e));
    throw e;
  }
  globalDicts = dicts;

  const picker = document.getElementById("dict-picker");
  if (!picker) return;
  picker.innerHTML = "";

  if (!dicts || !dicts.length) {
    console.error("manifest.json trống hoặc không tìm thấy dữ liệu cấu hình");
    showErrorInUI("manifest.json trống", "File manifest.json tồn tại nhưng không có dữ liệu từ điển.");
    return;
  }

  dicts.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.file;
    opt.textContent = `${d.lang || ""} ${d.name || ""}`;
    picker.appendChild(opt);
  });

  updateDictInfo(dicts[0]);
  await switchDictionary(dicts[0].file, dicts[0]);
}

// ── Hàm chuyển đổi dữ liệu khi chọn bộ từ điển khác nhau ───────────────
async function switchDictionary(filename, meta) {
  const loadingEl = document.getElementById("dict-loading");
  if (loadingEl) loadingEl.style.display = "flex";

  try {
    const raw = await loadDataFile(filename);
    allWords = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : raw);

    navHistory = [];
    navPos = -1;
    updateNavButtons();

    const histBar = document.getElementById("history-bar");
    if (histBar) histBar.classList.remove("visible");

    const detailEl = document.getElementById("detail");
    if (detailEl) {
      detailEl.innerHTML = `
        <div id="empty-state">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <p>← Chọn một từ để xem chi tiết</p>
        </div>`;
    }

    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";

    renderList(allWords);
    if (meta) updateDictInfo(meta);
  } catch (e) {
    console.error("Lỗi chuyển đổi bộ từ điển:", e);
    showErrorInUI("Lỗi tải từ điển: " + filename, String(e));
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

function updateDictInfo(meta) {
  const info = document.getElementById("dict-info");
  if (info && meta) {
    info.textContent = meta.description || "";
  }
}

// ── Lắng nghe sự kiện thay đổi bộ từ điển trên giao diện ───────────────
const pickerEl = document.getElementById("dict-picker");
if (pickerEl) {
  pickerEl.addEventListener("change", async (e) => {
    const filename = e.target.value;
    const meta = globalDicts.find(d => d.file === filename);
    await switchDictionary(filename, meta);
  });
}

// ── Hàm loại bỏ thẻ HTML, giữ lại text thuần ───────────────────────────
function stripHtml(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, '').trim();
}

// ── Lấy nghĩa ngắn gọn CHO SIDEBAR (chỉ text thuần, không HTML) ────────
function getShortMeaning(w) {
  // ★ Ưu tiên meaning_vi (National) — bỏ qua phần HTML prefix, chỉ lấy phần Việt
  if (w.meaning_vi) {
    const clean = stripHtml(w.meaning_vi);
    // meaning_vi thường có dạng "-가 | Trợ từ chủ ngữ" — bỏ phần đầu (từ Hàn), lấy phần Việt sau "|"
    const pipeIdx = clean.indexOf('|');
    const viText = pipeIdx >= 0 ? clean.substring(pipeIdx + 1).trim() : clean;
    if (viText) return viText.length > 80 ? viText.substring(0, 80) + "…" : viText;
  }
  if (w.meaning) return w.meaning;
  if (w.metadata && typeof w.metadata === "object") {
    if (w.metadata.tiếng_việt_đương_tương) return w.metadata.tiếng_việt_đương_tương;
    if (w.metadata.ý_nghĩa) {
      const txt = stripHtml(w.metadata.ý_nghĩa);
      return txt.length > 80 ? txt.substring(0, 80) + "…" : txt;
    }
  }
  return "";
}

// ── Lấy text thuần cho tìm kiếm (strip HTML tags) ──────────────────────
function getSearchableText(str) {
  if (!str || typeof str !== "string") return "";
  return stripHtml(str);
}

// ── Vẽ danh sách mục từ lên Sidebar ───────────────────────────────────
function renderList(words) {
  const list = document.getElementById("word-list");
  if (!list) return;

  const countEl = document.getElementById("word-count");
  if (countEl) countEl.textContent = `${words.length} mục từ`;

  list.innerHTML = "";
  words.forEach((w) => {
    const div = document.createElement("div");
    div.className = "word-item";
    div.dataset.word = w.word;
    div.innerHTML = `<span class="w-word">${esc(w.word)}</span>
                     <span class="w-meaning">${esc(getShortMeaning(w))}</span>`;
    div.addEventListener("click", () => selectWord(w));
    list.appendChild(div);
  });
}

// ── Hàm loại bỏ dấu Tiếng Việt để tìm kiếm không dấu ──────────────────
function removeVietnameseTones(str) {
  if (!str || typeof str !== "string") return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

// ── Xử lý Tìm kiếm ───────────────────────────────────────────────────────
// ★ Chế độ tìm kiếm:
//   - Mặc định (sidebar): Chỉ tìm theo word + meaning/meaning_vi (tiếng Việt)
//   - Nâng cao (checkbox "Tìm sâu"): Tìm trong definitions, sections, examples...
//     Kết quả tìm sâu được highlight riêng, không thêm vào danh sách từ sidebar
const searchInput = document.getElementById("search-input");
let advancedSearchEnabled = false;

// ★ Nút toggle tìm kiếm nâng cao
const advSearchToggle = document.getElementById("adv-search-toggle");
if (advSearchToggle) {
  advSearchToggle.addEventListener("change", (e) => {
    advancedSearchEnabled = e.target.checked;
    // Re-trigger search if there's a query
    if (searchInput && searchInput.value.trim()) {
      searchInput.dispatchEvent(new Event("input"));
    }
  });
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const rawQuery = e.target.value.trim().toLowerCase();
    if (!rawQuery) {
      renderList(allWords);
      const advResults = document.getElementById("adv-search-results");
      if (advResults) advResults.innerHTML = "";
      return;
    }
    const cleanQuery = removeVietnameseTones(rawQuery);

    // ★ Hàm kiểm tra match (luôn strip HTML trước khi so sánh)
    const checkMatch = (targetStr) => {
      if (!targetStr || typeof targetStr !== "string") return false;
      const clean = stripHtml(targetStr).toLowerCase();
      return clean.includes(rawQuery) || removeVietnameseTones(clean).includes(cleanQuery);
    };

    // ════════════════════════════════════════════════════════════════
    // ★ TÌM KIẾM CƠ BẢN (sidebar danh sách từ)
    //   Tìm theo: word, word_variants, meaning, meaning_vi
    //   + metadata.tiếng_việt_đương_tương (Kim: nghĩa tương đương)
    //   + metadata.ý_nghĩa (Kim: nghĩa giải thích dài)
    //   + metadata.phạm_trù (Kim: phạm trù ngữ pháp)
    //   Nếu không có meaning → để trống, vẫn hiển thị từ
    // ════════════════════════════════════════════════════════════════
    const sidebarWords = allWords.filter((w) => {
      if (!w) return false;
      const matchWord = checkMatch(w.word);
      const vars = w.word_variants || w.variants || [];
      const matchVariants = Array.isArray(vars) && vars.some((v) => checkMatch(v));
      const matchMeaning = checkMatch(w.meaning) || checkMatch(getSearchableText(w.meaning_vi));
      // ★ Kim: cũng tìm trong metadata tiếng Việt (nghĩa tương đương + nghĩa dài + phạm trù)
      let matchKimMeta = false;
      if (w.metadata && typeof w.metadata === "object") {
        matchKimMeta = checkMatch(w.metadata.tiếng_việt_đương_tương)
          || checkMatch(w.metadata.ý_nghĩa)
          || checkMatch(w.metadata.phạm_trù);
      }
      return !!(matchWord || matchVariants || matchMeaning || matchKimMeta);
    });
    renderList(sidebarWords);

    // ════════════════════════════════════════════════════════════════
    // ★ TÌM KIẾM NÂNG CAO (tìm sâu trong definitions, sections...)
    //   Chỉ chạy khi bật checkbox "Tìm sâu"
    //   Kết quả hiển thị riêng, KHÔNG thêm vào danh sách từ sidebar
    // ════════════════════════════════════════════════════════════════
    const advResults = document.getElementById("adv-search-results");
    if (advResultsEnabled() && advResults) {
      const deepMatches = allWords.filter((w) => {
        if (!w) return false;
        // Bỏ qua nếu đã match ở sidebar (tránh trùng)
        if (sidebarWords.includes(w)) return false;

        const matchDefinition = checkMatch(w.definition) || checkMatch(getSearchableText(w.definition_vi));
        const matchMorphology = checkMatch(w.morphology) || checkMatch(getSearchableText(w.morphology_vi));

        let matchMetadata = false;
        if (w.metadata && typeof w.metadata === "object") {
          for (const val of Object.values(w.metadata)) {
            if (checkMatch(String(val))) { matchMetadata = true; break; }
          }
        }

        let matchSections = false;
        if (w.sections && Array.isArray(w.sections)) {
          matchSections = w.sections.some(sec => {
            if (!sec) return false;
            if (checkMatch(sec.content)) return true;
            return Array.isArray(sec.usages) && sec.usages.some(use => {
              if (!use) return false;
              return checkMatch(use.explanation_vi) || checkMatch(use.explanation)
                || checkMatch(use.note) || checkMatch(use.note_vi);
            });
          });
        }

        let matchMeaningGroups = false;
        if (w.meaning_groups && Array.isArray(w.meaning_groups)) {
          matchMeaningGroups = w.meaning_groups.some(grp => {
            if (!grp) return false;
            if (checkMatch(stripHtml(grp.title))) return true;
            if (grp.subs && grp.subs.some(s => checkMatch(stripHtml(s)))) return true;
            if (grp.examples && grp.examples.some(ex => checkMatch(stripHtml(ex.ko)) || checkMatch(stripHtml(ex.vi)))) return true;
            return false;
          });
        }

        let matchNoteBlocks = false;
        if (w.note_blocks && Array.isArray(w.note_blocks)) {
          matchNoteBlocks = w.note_blocks.some(nb => {
            if (!nb || !nb.sections) return false;
            return nb.sections.some(sec => {
              if (!sec) return false;
              if (checkMatch(stripHtml(sec.heading))) return true;
              if (sec.texts && sec.texts.some(t => checkMatch(stripHtml(t).replace(/__TABLE__/g, '')))) return true;
              if (sec.examples && sec.examples.some(ex => checkMatch(stripHtml(ex.ko)) || checkMatch(stripHtml(ex.vi)))) return true;
              return false;
            });
          });
        }

        let matchTableHtml = false;
        if (w.table_html && checkMatch(w.table_html.replace(/<[^>]*>/g, ''))) {
          matchTableHtml = true;
        }

        let matchTableBlocks = false;
        if (w.table_blocks && Array.isArray(w.table_blocks)) {
          matchTableBlocks = w.table_blocks.some(tb => {
            if (!tb) return false;
            return checkMatch(tb.html.replace(/<[^>]*>/g, ''));
          });
        }

        return !!(matchDefinition || matchMorphology || matchMetadata || matchSections || matchMeaningGroups || matchNoteBlocks || matchTableHtml || matchTableBlocks);
      });

      // ★ Hiển thị kết quả tìm sâu riêng (không nằm trong danh sách từ)
      if (deepMatches.length > 0) {
        advResults.innerHTML = `<div class="adv-search-header">🔍 Tìm thấy trong định nghĩa: ${deepMatches.length} kết quả</div>` +
          deepMatches.map(w =>
            `<div class="adv-search-item" data-word="${esc(w.word)}">
               <span class="adv-word">${esc(w.word)}</span>
               <span class="adv-meaning">${esc(getShortMeaning(w))}</span>
             </div>`
          ).join('');
        // Gắn sự kiện click cho kết quả tìm sâu
        advResults.querySelectorAll('.adv-search-item').forEach(el => {
          el.addEventListener('click', () => {
            const target = allWords.find(w => w.word === el.dataset.word);
            if (target) selectWord(target);
          });
        });
      } else {
        advResults.innerHTML = '';
      }
    } else if (advResults) {
      advResults.innerHTML = '';
    }
  });
}

function advResultsEnabled() {
  return advancedSearchEnabled;
}

// ── Chọn từ và Xem chi tiết nội dung ──────────────────────────────────
function selectWord(w, pushHistory = true) {
  document.querySelectorAll(".word-item").forEach((e) => e.classList.remove("active"));
  const el = document.querySelector(`.word-item[data-word="${CSS.escape(w.word)}"]`);
  if (el) {
    el.classList.add("active");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  if (pushHistory && !isNavigating) {
    navHistory = navHistory.slice(0, navPos + 1);
    navHistory.push(w.word);
    navPos = navHistory.length - 1;
    updateHistoryBar();
    updateNavButtons();
  }
  showDetail(w);
}

// ── Nhảy đến từ liên quan khi nhấn vào liên kết ────────────────────────
function jumpToWord(wordStr) {
  const target = allWords.find((w) => w.word === wordStr || (w.word_variants || w.variants || []).includes(wordStr));
  if (!target) {
    const input = document.getElementById("search-input");
    if (input) {
      input.value = wordStr;
      input.dispatchEvent(new Event("input"));
    }
    return;
  }
  if (!document.querySelector(`.word-item[data-word="${CSS.escape(target.word)}"]`)) {
    const input = document.getElementById("search-input");
    if (input) input.value = "";
    renderList(allWords);
  }
  selectWord(target);
}

// ── Cập nhật Thanh lịch sử tra cứu (Vertical List) ────────────────────
function updateHistoryBar() {
  const bar = document.getElementById("history-bar");
  if (!bar) return;
  if (navHistory.length === 0) {
    bar.classList.remove("visible");
    bar.innerHTML = '<div class="history-empty">Chưa có lịch sử.</div>';
    return;
  }
  bar.classList.add("visible");
  bar.innerHTML = navHistory.map((wrd, i) => {
    const cls = "hist-item" + (i === navPos ? " current" : "");
    const wordObj = allWords.find(w => w.word === wrd);
    const meaning = wordObj ? getShortMeaning(wordObj) : "";
    return `<div class="${cls}" data-idx="${i}"><span class="hist-num">${i + 1}.</span> <span class="hist-word">${esc(wrd)}</span>${meaning ? `<span class="hist-meaning">${esc(meaning.length > 30 ? meaning.substring(0,30)+'\u2026' : meaning)}</span>` : ''}</div>`;
  }).join('');

  bar.querySelectorAll(".hist-item:not(.current)").forEach((el) => {
    el.addEventListener("click", () => navigateTo(parseInt(el.dataset.idx)));
  });
}

// ── Bật/Tắt trạng thái nút bấm Back/Forward trên Toolbar ──────────────
function updateNavButtons() {
  const btnBack = document.getElementById("nav-back");
  const btnForward = document.getElementById("nav-forward");
  if (btnBack) btnBack.disabled = navPos <= 0;
  if (btnForward) btnForward.disabled = navPos >= navHistory.length - 1;
}

// ── Hàm thực hiện quay lại / tiến lên trong lịch sử ───────────────────
function navigateTo(idx) {
  if (idx < 0 || idx >= navHistory.length) return;
  navPos = idx;
  isNavigating = true;
  const target = allWords.find((w) => w.word === navHistory[navPos]);
  if (target) selectWord(target, false);
  isNavigating = false;
  updateHistoryBar();
  updateNavButtons();
}

const btnBack = document.getElementById("nav-back");
if (btnBack) btnBack.addEventListener("click", () => navigateTo(navPos - 1));
const btnForward = document.getElementById("nav-forward");
if (btnForward) btnForward.addEventListener("click", () => navigateTo(navPos + 1));

// ── History Panel Buttons: Ẩn/Hiện & Xóa ────────────────────────────────
const historyToggle = document.getElementById("history-toggle");
if (historyToggle) {
  historyToggle.addEventListener("click", () => {
    const bar = document.getElementById("history-bar");
    if (!bar) return;
    const isHidden = bar.classList.contains("history-hidden");
    if (isHidden) {
      bar.classList.remove("history-hidden");
      historyToggle.textContent = "\u1EA8n";
    } else {
      bar.classList.add("history-hidden");
      historyToggle.textContent = "Hi\u1EC7n";
    }
  });
}
const historyClear = document.getElementById("history-clear");
if (historyClear) {
  historyClear.addEventListener("click", () => {
    navHistory = [];
    navPos = -1;
    updateHistoryBar();
    updateNavButtons();
    // Also clear the edit box word field
    const editWord = document.getElementById("edit-word");
    if (editWord) editWord.value = "";
    const editContent = document.getElementById("edit-content");
    if (editContent) editContent.value = "";
    currentAnnotWord = "";
  });
}

// ── Lưu ký (Annotation/Notes) ────────────────────────────────────────────
let currentAnnotWord = "";

function updateEditBox(word) {
  currentAnnotWord = word || "";
  const editWord = document.getElementById("edit-word");
  const editContent = document.getElementById("edit-content");
  const editStatus = document.getElementById("edit-status");
  if (editWord) editWord.value = word || "";
  if (editContent) {
    // Priority: entry.luu_ky > localStorage
    const entry = word ? allWords.find(w => w.word === word) : null;
    const saved = (entry && entry.luu_ky) ? entry.luu_ky : (word ? localStorage.getItem(`dict_annotation_${word}`) : "");
    editContent.value = saved || "";
  }
  if (editStatus) editStatus.textContent = "";
}

const editSave = document.getElementById("edit-save");
if (editSave) {
  editSave.addEventListener("click", () => {
    const editWord = document.getElementById("edit-word");
    const editContent = document.getElementById("edit-content");
    const editStatus = document.getElementById("edit-status");
    const word = editWord ? editWord.value.trim() : "";
    const content = editContent ? editContent.value.trim() : "";
    if (!word) {
      if (editStatus) editStatus.textContent = "⚠ Chưa nhập từ!";
      return;
    }
    // Update allWords entry directly
    const entry = allWords.find(w => w.word === word);
    if (content) {
      if (entry) entry.luu_ky = content;
      localStorage.setItem(`dict_annotation_${word}`, content);
      if (editStatus) editStatus.textContent = `✓ Đã lưu ký cho "${word}"`;
    } else {
      if (entry) delete entry.luu_ky;
      localStorage.removeItem(`dict_annotation_${word}`);
      if (editStatus) editStatus.textContent = `✓ Đã xóa lưu ký cho "${word}"`;
    }
    // Refresh detail view if this word is currently displayed
    if (entry && currentAnnotWord === word) showDetail(entry);
  });
}

const editClearBtn = document.getElementById("edit-clear");
if (editClearBtn) {
  editClearBtn.addEventListener("click", () => {
    const editContent = document.getElementById("edit-content");
    const editStatus = document.getElementById("edit-status");
    if (editContent) editContent.value = "";
    if (editStatus) editStatus.textContent = "";
  });
}

// ══════════════════════════════════════════════════════════════════════
//  HIỂN THỊ CHI TIẾT NỘI DUNG TỪ
//  Hỗ trợ ĐỒNG THỜI cả cấu trúc National và Kim
// ══════════════════════════════════════════════════════════════════════
function showDetail(w) {
  const detail = document.getElementById("detail");
  if (!detail) return;

  // ★ TỰ ĐỘNG CUỘN LÊN ĐẦU TRANG khi chuyển từ mới
  // Dùng requestAnimationFrame + scrollTo để đảm bảo hoạt động trên Android WebView
  const scrollDetailToTop = () => {
    detail.scrollTop = 0;
    detail.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // Fallback: cũng cuộn document (một số WebView cuộn ở body)
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  };
  scrollDetailToTop();
  requestAnimationFrame(scrollDetailToTop);

  // XỬ LÝ REDIRECT: Nếu là mục từ alias
  if (w.is_alias && w.variants && w.variants.length > 0) {
    const mainWordStr = w.variants[0];
    const mainEntry = allWords.find(m => m.word === mainWordStr);
    if (mainEntry) { showDetail(mainEntry); return; }
  }

  // ★ Phát hiện loại từ điển dựa trên cấu trúc dữ liệu ★
  const isKimFormat = !!(w.meaning_groups || w.note_blocks || w.table_html || w.table_blocks);
  const isNationalFormat = !!(w.sections || w.usages || w.definition_vi || (w.meaning && !isKimFormat));

  let html = "";
  html += `<div class="d-word">${esc(w.word)}</div>`;

  const variants = w.variants || w.word_variants || [];
  if (variants.length > 0) {
    html += `<div class="d-variants">Biến thể: ${variants.map(esc).join(" · ")}</div>`;
  }

  // ════ CẤU HÌNH LOẠI A: HIỂN THỊ FILE DATA_NATIONAL.JSON ════
  if (isNationalFormat) {
    // ── 1. METADATA BOX: Phạm trù + Ý nghĩa chính + Nghĩa tiếng Việt ──
    if (w.meaning || w.category || w.meaning_vi) {
      html += `<div class="metadata-box">`;
      if (w.category) {
        const catVi = w.category_vi || getCategoryVi(w.category);
        html += `<div class="meta-item"><strong>PHẠM TRÙ:</strong> ${renderMarkers(w.category)}${catVi ? ' / ' + esc(catVi) : ''}</div>`;
      }
      if (w.meaning) html += `<div class="meta-item"><strong>Ý NGHĨA CHÍNH:</strong> <span style="color:var(--accent); font-weight:600;">${renderMarkers(w.meaning)}</span></div>`;
      if (w.meaning_vi) html += `<div class="meta-item"><strong>NGHĨA TIẾNG VIỆT:</strong> <span style="color:var(--accent2); font-weight:600;">${renderMarkers(w.meaning_vi)}</span></div>`;
      html += `</div>`;
    }

    // ── LƯU KÝ (Inline editable block) ──
    const luuKy = w.luu_ky || localStorage.getItem(`dict_annotation_${w.word}`) || "";
    html += buildLuuKyInline(w.word, luuKy);

    // ── 2. ĐỊNH NGHĨA: Hàn + Việt (dark green block) ──
    if (w.definition || w.definition_vi) {
      html += `<div class="def-block">`;
      if (w.definition) html += `<div class="def-ko">${renderMarkers(w.definition)}</div>`;
      if (w.definition_vi) html += `<div class="def-vi">${renderMarkers(w.definition_vi)}</div>`;
      html += `</div>`;
    }

    // ── 3. HÌNH THÁI TỪ (Morphology): Hàn + Việt ──
    if (w.morphology || w.morphology_vi) {
      html += `<div class="morphology-box">`;
      if (w.morphology) html += `<div class="morphology-item"><strong>형태:</strong> ${renderMarkers(w.morphology)}</div>`;
      if (w.morphology_vi) html += `<div class="morphology-item"><strong>HÌNH THÁI TỪ:</strong> ${renderMarkers(w.morphology_vi)}</div>`;
      html += `</div>`;
    }

    // ── 4. TỪ LIÊN QUAN ──
    const related = w.related || [];
    if (related.length > 0) {
      html += `<div class="metadata-box" style="margin-top:5px; margin-bottom:15px;">
                <div class="meta-item"><strong>TỪ LIÊN QUAN:</strong>
                  ${related.map(r => `<span class="ref-link" data-jump="${r}" style="margin-right:8px; text-decoration:underline; cursor:pointer;">${esc(r)}</span>`).join("")}
                </div>
              </div>`;
    }

    // ── 5. SECTIONS: 〔용법〕〔결합 정보〕〔보충·심화〕──
    const sections = w.sections || [];
    sections.forEach((sec) => {
      html += `<div class="section-block-national">`;
      if (sec.section) html += `<div class="section-title-national">${esc(sec.section)}</div>`;

      // ★ Section content + content_vi (light green block)
      if (sec.content || sec.content_vi) {
        html += `<div class="content-block">`;
        if (sec.content) html += `<div class="content-ko">${renderMarkersPreserveNewline(sec.content)}</div>`;
        if (sec.content_vi) html += `<div class="content-vi">${renderMarkersPreserveNewline(sec.content_vi)}</div>`;
        html += `</div>`;
      }

      const usages = sec.usages || [];
      usages.forEach((use) => {
        html += `<div style="margin-bottom: 15px; padding-left: 5px;">`;
        // ★ Giải thích cách dùng (Hàn)
        if (use.index || use.explanation) {
          html += `<div class="usage-explanation" style="font-weight: 500; margin-bottom: 6px;">
                    <span class="usage-index-national">${esc(use.index || "•")}</span>
                    ${renderMarkers(use.explanation || "")}
                  </div>`;
        }
        // ★ Giải thích cách dùng (Việt)
        if (use.explanation_vi) {
          html += `<div class="usage-explanation-vi" style="color: var(--text-muted); font-size: 0.95em; margin-left: 28px; margin-bottom: 8px; background: var(--usage-bg); padding: 4px 8px; border-radius: 4px;"><span style="color:#d32f2f; font-weight:700;">❏</span> ${renderMarkers(use.explanation_vi)}</div>`;
        }

        // ★ Ví dụ
        const examples = use.examples || [];
        if (examples.length > 0) {
          html += `<div class="examples-list" style="margin-left: 28px;">`;
          examples.forEach((ex) => {
            html += `<div class="example-item" style="margin-bottom: 4px;"><p class="ex-ko" style="color: var(--text); margin:0; line-height: 1.6;">${renderMarkersPreserveNewline(ex)}</p></div>`;
          });
          html += `</div>`;
        }

        // ★ Ghi chú (note + note_vi) — 1473/2442 usages có field này!
        if (use.note) {
          html += `<div class="usage-note" style="margin: 8px 0 4px 28px; padding: 6px 10px; border-left: 3px solid var(--accent); background: var(--usage-bg); border-radius: 0 4px 4px 0; font-size: 0.93em; line-height: 1.6;">${renderMarkersPreserveNewline(use.note)}</div>`;
        }
        if (use.note_vi) {
          // ★ note_vi thường chứa "Hàn → Việt" — chỉ hiển thị phần Việt sau →
          let viPart = use.note_vi;
          const arrowIdx = viPart.indexOf('→');
          if (arrowIdx >= 0 && arrowIdx < viPart.length - 2) {
            viPart = viPart.substring(arrowIdx + 1).trim();
          }
          html += `<div class="usage-note-vi" style="margin: 2px 0 8px 28px; padding: 6px 10px; border-left: 3px solid var(--accent2); background: var(--usage-bg); border-radius: 0 4px 4px 0; font-size: 0.92em; color: var(--text-muted); line-height: 1.6;">→ ${renderMarkersNoNewline(viPart)}</div>`;
        }

        html += `</div>`;
      });
      html += `</div>`;
    });
  }

  // ════ CẤU HÌNH LOẠI B: HIỂN THỊ FILE DATA_KIM.JSON (TỪ ĐIỂN 2) ════
  if (isKimFormat) {

    // 0. MEANING — Nghĩa tiếng Việt tương đương (nằm ngoài metadata, cấp cao nhất)
    if (w.meaning) {
      html += `<div class="metadata-box">
        <div class="meta-item"><strong>NGHĨA TIẾNG VIỆT:</strong> <span style="color:var(--accent2); font-weight:600;">${renderMarkers(w.meaning)}</span></div>
      </div>`;
    }

    // 1. METADATA
    if (w.metadata && Object.keys(w.metadata).length > 0) {
      html += `<div class="metadata-box">`;
      for (const [key, value] of Object.entries(w.metadata)) {
        const label = key.replace(/_/g, ' ').toUpperCase();
        html += `<div class="meta-item"><strong>${esc(label)}:</strong> ${renderMarkers(value)}</div>`;
      }
      html += `</div>`;
    }

    // 2. TABLE_HTML — Bảng so sánh chính (nằm ngoài note_blocks)
    if (w.table_html) {
      html += `<div class="table-container" style="margin: 15px 0; overflow-x: auto;">${processTableHtml(w.table_html)}</div>`;
    }

    // 3. TABLE_BLOCKS — Bảng phụ chú có ngữ cảnh (nằm ngoài note_blocks)
    const tableBlocks = w.table_blocks || [];
    if (tableBlocks.length > 0) {
      tableBlocks.forEach((tb) => {
        if (!tb || !tb.html) return;
        html += `<div class="tableblock-container">`;
        if (tb.context) {
          html += `<div class="tableblock-label">📊 ${esc(tb.context === 'note' ? 'Bảng so sánh trong phụ chú' : tb.context)}</div>`;
        }
        html += processTableHtml(tb.html);
        html += `</div>`;
      });
    }

    // 4. MEANING_GROUPS — Nhóm nghĩa & Ví dụ
    const groups = w.meaning_groups || [];
    if (groups.length > 0) {
      groups.forEach((group) => {
        const hasContent = group.title || (group.subs && group.subs.length > 0) || (group.examples && group.examples.length > 0);
        if (!hasContent) return;

        html += `<div class="section-block" style="margin-top: 15px;">`;
        if (group.title) {
          html += `<div class="section-title">✪ ${renderMarkers(group.title)}</div>`;
        }

        if (group.subs && group.subs.length > 0) {
          group.subs.forEach((sub) => {
            // ★ (예) marker → hiển thị dạng badge đặc biệt
            if (sub === '(예)') {
              html += `<div class="ye-marker">(예)</div>`;
            } else {
              html += `<div class="usage-explanation" style="margin-bottom: 5px;">✧ ${renderMarkers(sub)}</div>`;
            }
          });
        }

        if (group.examples && group.examples.length > 0) {
          html += `<div class="examples-list" style="margin-top: 8px;">`;
          group.examples.forEach((ex) => {
            html += `<div class="example-item" style="margin-bottom: 8px; line-height: 1.4;">
                       <p class="ex-ko" style="margin: 0; color: var(--text);">${renderMarkersPreserveNewline(ex.ko)}${ex.is_dialogue ? '<span class="dialogue-badge">Hội thoại</span>' : ''}</p>
                       ${ex.vi ? `<p class="ex-vi" style="margin: 2px 0 0 12px; color: var(--text-muted); font-size: 0.93em;">${renderMarkersPreserveNewline(ex.vi)}</p>` : ''}
                     </div>`;
          });
          html += `</div>`;
        }
        html += `</div>`;
      });
    }

    // ════════════════════════════════════════════════════════════════
    // 5. NOTE_BLOCKS — Khối Phụ chú
    //    Hỗ trợ __TABLE__ prefix trong texts → render bảng HTML
    // ════════════════════════════════════════════════════════════════
    const noteBlocks = w.note_blocks || [];
    if (noteBlocks.length > 0) {
      noteBlocks.forEach((nb, nbIdx) => {
        const sections = nb.sections || [];
        // Lọc bỏ các section rỗng hoàn toàn
        const nonEmptySections = sections.filter(sec =>
          sec.heading || (sec.texts && sec.texts.length > 0) || (sec.examples && sec.examples.length > 0)
        );
        if (nonEmptySections.length === 0) return;

        // ★ Phụ chú không bảng → nền xanh dương nhẹ ★
        const isPhuChu = nb.type === 'phụ_chú';
        const containerClass = isPhuChu ? 'noteblock-container phu-chu-block' : 'noteblock-container';
        const headerText = isPhuChu ? '📝 Phụ chú' : `📝 Phụ chú${noteBlocks.length > 1 ? ` ${nbIdx + 1}` : ''}`;

        html += `<div class="${containerClass}">`;
        html += `<div class="noteblock-header">${headerText}</div>`;
        html += `<div class="noteblock-body">`;

        nonEmptySections.forEach((sec) => {
          // Tiêu đề phần
          if (sec.heading) {
            html += `<div class="noteblock-heading">${renderMarkers(sec.heading)}</div>`;
          }

          // ★ Các đoạn văn giải thích — XỬ LÝ ĐẶC BIỆT __TABLE__ ★
          if (sec.texts && sec.texts.length > 0) {
            sec.texts.forEach((txt) => {
              if (!txt) return;

              // ★ PHÁT HIỆN __TABLE__ PREFIX → RENDER BẢNG HTML ★
              if (txt.startsWith('__TABLE__')) {
                const tableHtml = txt.substring('__TABLE__'.length);
                html += `<div style="margin: 8px 0; overflow-x: auto;">${processTableHtml(tableHtml)}</div>`;
                return;
              }

              // ★ (예) marker → badge đặc biệt
              if (txt === '(예)') {
                html += `<div class="ye-marker">(예)</div>`;
                return;
              }

              // Phát hiện dấu → ở đầu
              const isArrow = txt.startsWith('→');
              // Phát hiện bullet • ở đầu
              const isBullet = txt.startsWith('•');

              html += `<div class="noteblock-text">`;
              if (isArrow) {
                html += `<span class="arrow-prefix">→</span>${renderMarkers(txt.substring(1).trim())}`;
              } else if (isBullet) {
                html += `<span class="note-bullet">•</span>${renderMarkers(txt.substring(1).trim())}`;
              } else {
                html += renderMarkers(txt);
              }
              html += `</div>`;
            });
          }

          // Các ví dụ trong phụ chú
          if (sec.examples && sec.examples.length > 0) {
            sec.examples.forEach((ex) => {
              html += `<div class="noteblock-example">
                         <p class="ex-ko">${renderMarkersPreserveNewline(ex.ko || '')}${ex.is_dialogue ? '<span class="dialogue-badge">Hội thoại</span>' : ''}</p>
                         ${ex.vi ? `<p class="ex-vi">${renderMarkersPreserveNewline(ex.vi)}</p>` : ''}
                       </div>`;
            });
          }
        });

        html += `</div></div>`;
      });
    }

    // 6. NOTE_BOX (Hỗ trợ ngược — dạng chuỗi cũ)
    if (w.note_box) {
      let noteContent = w.note_box.replace('[note_box]', '').replace('[/note_box]', '');
      html += `<div class="note-box">${noteContent}</div>`;
    }
  }

  // ★ LUU KÝ: Hiển thị ghi chú nếu có (Kim format — National format shows it above)
  if (!isNationalFormat) {
    const luuKy = w.luu_ky || localStorage.getItem(`dict_annotation_${w.word}`) || "";
    html += buildLuuKyInline(w.word, luuKy);
  }

  detail.innerHTML = html;

  // ★ ĐẢM BẢO CUỘN LÊN ĐẦU sau khi innerHTML đã set (quan trọng cho Android WebView)
  requestAnimationFrame(() => {
    detail.scrollTop = 0;
    detail.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });

  // ★ GẮN SỰ KIỆN CHO CÁC LINK THAM CHIẾU ★
  bindRefLinks(detail);

  // ★ GẮN SỰ KIỆN CHO LUU KÝ INLINE ★
  bindLuuKyInline(detail);

  // ★ LUU KÝ: Cập nhật ô nhập khi chọn từ mới
  updateEditBox(w.word);
}

// ══════════════════════════════════════════════════════════════════════
//  LUU KÝ INLINE — Hiển thị & chỉnh sửa ghi chú trực tiếp trong chi tiết từ
// ══════════════════════════════════════════════════════════════════════
function buildLuuKyInline(word, luuKy) {
  const hasContent = luuKy && luuKy.trim().length > 0;
  if (hasContent) {
    // Có nội dung → hiển thị body + nút Sửa
    return `<div class="luu-ky-inline" data-luu-word="${esc(word)}">
      <div class="luu-ky-inline-header">
        <span>📝 Lưu ký</span>
        <button class="luu-ky-btn-edit" data-action="edit">Sửa</button>
      </div>
      <div class="luu-ky-inline-body">${esc(luuKy)}</div>
    </div>`;
  } else {
    // Chưa có nội dung → hiển thị form nhập ngay
    return `<div class="luu-ky-inline" data-luu-word="${esc(word)}">
      <div class="luu-ky-inline-header">
        <span>📝 Lưu ký</span>
      </div>
      <div class="luu-ky-inline-edit">
        <textarea placeholder="Nhập ghi chú cho từ này...">${esc(luuKy)}</textarea>
      </div>
      <div class="luu-ky-inline-actions">
        <button class="luu-ky-btn-save" data-action="save">Lưu</button>
        <button class="luu-ky-btn-cancel" data-action="cancel">Hủy</button>
      </div>
    </div>`;
  }
}

function bindLuuKyInline(container) {
  // Nút "Sửa" → chuyển sang chế độ chỉnh sửa
  container.querySelectorAll(".luu-ky-btn-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const inline = btn.closest(".luu-ky-inline");
      if (!inline) return;
      const word = inline.dataset.luuWord;
      // Lấy nội dung hiện tại từ body
      const body = inline.querySelector(".luu-ky-inline-body");
      const currentText = body ? body.textContent : "";
      // Chuyển sang chế độ edit
      inline.innerHTML = `
        <div class="luu-ky-inline-header">
          <span>📝 Lưu ký</span>
        </div>
        <div class="luu-ky-inline-edit">
          <textarea>${esc(currentText)}</textarea>
        </div>
        <div class="luu-ky-inline-actions">
          <button class="luu-ky-btn-save" data-action="save">Lưu</button>
          <button class="luu-ky-btn-append" data-action="append">Ghi thêm</button>
          <button class="luu-ky-btn-cancel" data-action="cancel">Hủy</button>
        </div>`;
      // Focus vào textarea
      const ta = inline.querySelector("textarea");
      if (ta) ta.focus();
      // Re-bind events cho các nút mới
      bindLuuKyInline(inline);
    });
  });

  // Nút "Lưu" → lưu nội dung (thay thế toàn bộ)
  container.querySelectorAll(".luu-ky-btn-save").forEach(btn => {
    btn.addEventListener("click", () => {
      const inline = btn.closest(".luu-ky-inline");
      if (!inline) return;
      const word = inline.dataset.luuWord;
      const textarea = inline.querySelector("textarea");
      const content = textarea ? textarea.value.trim() : "";
      // Lưu vào allWords và localStorage
      const entry = allWords.find(w => w.word === word);
      if (content) {
        if (entry) entry.luu_ky = content;
        localStorage.setItem(`dict_annotation_${word}`, content);
      } else {
        if (entry) delete entry.luu_ky;
        localStorage.removeItem(`dict_annotation_${word}`);
      }
      // Cập nhật sidebar edit box
      updateEditBox(word);
      // Refresh detail
      if (entry) showDetail(entry);
    });
  });

  // Nút "Ghi thêm" → thêm nội dung vào cuối (không thay thế)
  container.querySelectorAll(".luu-ky-btn-append").forEach(btn => {
    btn.addEventListener("click", () => {
      const inline = btn.closest(".luu-ky-inline");
      if (!inline) return;
      const word = inline.dataset.luuWord;
      const textarea = inline.querySelector("textarea");
      const newContent = textarea ? textarea.value.trim() : "";
      if (!newContent) return;
      // Lấy nội dung cũ
      const entry = allWords.find(w => w.word === word);
      const oldContent = (entry && entry.luu_ky) ? entry.luu_ky :
        (word ? localStorage.getItem(`dict_annotation_${word}`) || "" : "");
      // Ghép nối nội dung mới
      const separator = oldContent ? "\n" : "";
      const combined = oldContent + separator + newContent;
      if (entry) entry.luu_ky = combined;
      localStorage.setItem(`dict_annotation_${word}`, combined);
      // Cập nhật sidebar edit box
      updateEditBox(word);
      // Refresh detail
      if (entry) showDetail(entry);
    });
  });

  // Nút "Hủy" → quay lại hiển thị
  container.querySelectorAll(".luu-ky-btn-cancel").forEach(btn => {
    btn.addEventListener("click", () => {
      const inline = btn.closest(".luu-ky-inline");
      if (!inline) return;
      const word = inline.dataset.luuWord;
      const entry = allWords.find(w => w.word === word);
      const luuKy = (entry && entry.luu_ky) ? entry.luu_ky :
        (word ? localStorage.getItem(`dict_annotation_${word}`) || "" : "");
      // Render lại khối lưu ký
      inline.outerHTML = buildLuuKyInline(word, luuKy);
      // Re-bind events
      const detail = document.getElementById("detail");
      if (detail) bindLuuKyInline(detail);
    });
  });
}

// ── Gắn sự kiện click cho tất cả link tham chiếu ──────────────────────
function bindRefLinks(container) {
  // ref-link (link nhảy đến từ liên quan — từ ⟦...⟧)
  container.querySelectorAll(".ref-link").forEach((el) => {
    el.addEventListener("click", () => jumpToWord(el.dataset.jump));
  });
  // dict-ref (link trong bảng HTML — từ <a class="dict-ref">)
  container.querySelectorAll(".dict-ref").forEach((el) => {
    // Ưu tiên data-jump, rồi data-word, rồi textContent
    const refWord = el.dataset.jump || el.dataset.word || el.textContent.trim();
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToWord(refWord);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
//  XỬ LÝ TABLE HTML
//  - Biến dict-ref thành link click được
//  - Bảo vệ HTML gốc không bị escape
// ══════════════════════════════════════════════════════════════════════
function processTableHtml(html) {
  if (!html) return "";
  // Thêm data-jump cho dict-ref nếu chưa có
  let processed = html.replace(
    /<a class="dict-ref"(?!\s+data-jump)[^>]*>([^<]+)<\/a>/g,
    (match, text) => {
      // Nếu đã có data-word, dùng nó làm data-jump
      const dwMatch = match.match(/data-word="([^"]+)"/);
      const jumpWord = dwMatch ? dwMatch[1] : text;
      return `<a class="dict-ref" data-jump="${jumpWord}">${text}</a>`;
    }
  );
  // Xử lý dict-ref đã có data-word nhưng chưa có data-jump
  processed = processed.replace(
    /<a class="dict-ref" data-word="([^"]+)">([^<]+)<\/a>/g,
    '<a class="dict-ref" data-word="$1" data-jump="$1">$2</a>'
  );
  return processed;
}

// ── Render Helpers (Làm sạch chuỗi ký tự & xử lý Thẻ đặc biệt) ──────────
function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkers(str) {
  if (!str) return "";

  // ★ BƯỚC 1: Bảo vệ <a class="dict-ref" data-word="...">...</a> trước khi escape ★
  const refPlaceholders = [];
  let s = str.replace(
    /<a\s+class="dict-ref"\s+data-word="([^"]+)">([^<]*)<\/a>/g,
    (_, word, text) => {
      const idx = refPlaceholders.length;
      refPlaceholders.push(`<a class="dict-ref" data-jump="${word}">${text}</a>`);
      return `\x00REF${idx}\x00`;
    }
  );

  // ★ BƯỚC 2: Bảo vệ các thẻ HTML khác (strong, sub, sup) ★
  const htmlPlaceholders = [];
  s = s.replace(
    /<(strong|sub|sup)(\s[^>]*)?>[\s\S]*?<\/\1>/g,
    (match) => {
      const idx = htmlPlaceholders.length;
      htmlPlaceholders.push(match);
      return `\x00HTML${idx}\x00`;
    }
  );

  // ★ BƯỰC 3: Escape phần text thuần ★
  s = esc(s);

  // ★ BƯỚC 4: Khôi phục các thẻ HTML đã bảo vệ ★
  htmlPlaceholders.forEach((html, idx) => {
    s = s.replace(`\x00HTML${idx}\x00`, html);
  });
  refPlaceholders.forEach((html, idx) => {
    s = s.replace(`\x00REF${idx}\x00`, html);
  });

  // ★ BƯỚC 5: Xử lý markers ★
  // «...» → in đậm (từ khóa trọng tâm)
  s = s.replace(/«([^»]+)»/g, (_, w) => `<strong class="bold-term">${w}</strong>`);
  // ⟦...⟧ → link tham chiếu nội bộ
  s = s.replace(/⟦([^⟧]+)⟧/g, (_, w) => `<span class="ref-link" data-jump="${w}">${w}</span>`);
  // ❛...❜ → trích dẫn nổi bật (dùng nhiều trong National)
  s = s.replace(/❛([^❜]+)❜/g, (_, w) => `<span class="quote-marker">${w}</span>`);
  // 〔예:〕 → badge ví dụ
  s = s.replace(/〔예:〕/g, '<span class="ye-marker" style="margin:0 2px;">예</span>');
  // ◈ → bullet phân cách
  s = s.replace(/◈/g, '<span style="color:var(--accent); font-weight:600; margin-right:4px;">◈</span>');

  // ★ TỰ ĐỘNG TẠO SUPERSCRIPT CHO SỐ TỰ NHIÊN DÍNH SAT TỪ ★
  // Nhưng không tạo superscript cho số ①②③ (circled numbers)
  s = s.replace(/([^\d\s\[/&①-⑳㉑-㉟㊱-㊿])(\d+)/g, '$1<sup>$2</sup>');

  return s;
}

function renderMarkersPreserveNewline(str) {
  if (!str) return "";
  // Strip leading newlines to avoid extra spacing at top
  const trimmed = str.replace(/^\n+/, '');
  return trimmed.split("\n").map((line) => renderMarkers(line)).join("<br>");
}

// ★ renderMarkersNoNewline: Dùng cho note_vi — KHÔNG ngắt dòng mới trước circle number
// Circle numbers (①②③...) trong note_vi viết liền trên cùng một dòng,
// chỉ dùng khoảng trắng thay vì <br> trước số thứ tự hình tròn
function renderMarkersNoNewline(str) {
  if (!str) return "";
  // Strip leading newlines
  let trimmed = str.replace(/^\n+/, '');
  // Replace \n before circle numbers with space (không ngắt dòng)
  trimmed = trimmed.replace(/\n([①-⑳㉑-㉟㊱-㊿])/g, ' $1');
  // Remaining newlines → <br> (for non-circle-number line breaks)
  return trimmed.split("\n").map((line) => renderMarkers(line)).join("<br>");
}

// ── Điều chỉnh cỡ chữ (Font-size zoom) ─────────────────────────────────
function applyFontSize() {
  const size = fontSizes[fontSizeIdx];
  document.documentElement.style.setProperty("--font-size", size + "px");
  const display = document.getElementById("font-size-display");
  if (display) display.textContent = size + "px";
  const slider = document.getElementById("font-size-slider");
  if (slider) slider.value = fontSizeIdx;

  const zOut = document.getElementById("zoom-out");
  const zIn = document.getElementById("zoom-in");
  if (zOut) zOut.disabled = fontSizeIdx <= 0;
  if (zIn) zIn.disabled = fontSizeIdx >= fontSizes.length - 1;
}

const zInBtn = document.getElementById("zoom-in");
if (zInBtn) zInBtn.addEventListener("click", () => { fontSizeIdx = Math.min(fontSizes.length - 1, fontSizeIdx + 1); applyFontSize(); });
const zOutBtn = document.getElementById("zoom-out");
if (zOutBtn) zOutBtn.addEventListener("click", () => { fontSizeIdx = Math.max(0, fontSizeIdx - 1); applyFontSize(); });
const zReset = document.getElementById("zoom-reset");
if (zReset) zReset.addEventListener("click", () => { fontSizeIdx = 4; applyFontSize(); });
const fSlider = document.getElementById("font-size-slider");
if (fSlider) fSlider.addEventListener("input", (e) => { fontSizeIdx = parseInt(e.target.value); applyFontSize(); });

// ── Thay đổi phông chữ (Font family) ──────────────────────────────────
const fPicker = document.getElementById("font-picker");
if (fPicker) {
  fPicker.addEventListener("change", (e) => {
    const fonts = { serif: "'Noto Serif KR', serif", sans: "'Be Vietnam Pro', sans-serif", mono: "'Menlo', monospace" };
    document.documentElement.style.setProperty("--font-korean", fonts[e.target.value]);
    document.documentElement.style.setProperty("--font-body", fonts[e.target.value]);
  });
}

// ── Điều chỉnh độ rộng thanh Sidebar (Narrow / Wide) ─────────────────
// ══════════════════════════════════════════════════════════════════════
//  SIDEBAR & HISTORY PANEL — DRAGGABLE RESIZE
// ══════════════════════════════════════════════════════════════════════
(function initResizeHandles() {
  const sidebar = document.getElementById('sidebar');
  const historyPanel = document.getElementById('history-panel');
  const resizeSidebar = document.getElementById('resize-sidebar');
  const resizeHistory = document.getElementById('resize-history');

  // ── Sidebar resize (drag) ──
  if (resizeSidebar && sidebar) {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizeSidebar.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      resizeSidebar.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    // Touch support
    resizeSidebar.addEventListener('touchstart', (e) => {
      isDragging = true;
      startX = e.touches[0].clientX;
      startWidth = sidebar.offsetWidth;
      resizeSidebar.classList.add('active');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const newWidth = Math.max(140, Math.min(window.innerWidth * 0.5, startWidth + dx));
      sidebar.style.width = newWidth + 'px';
      sidebar.style.minWidth = newWidth + 'px';
      document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - startX;
      const newWidth = Math.max(140, Math.min(window.innerWidth * 0.5, startWidth + dx));
      sidebar.style.width = newWidth + 'px';
      sidebar.style.minWidth = newWidth + 'px';
      document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    }, { passive: false });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        resizeSidebar.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
    document.addEventListener('touchend', () => {
      if (isDragging) {
        isDragging = false;
        resizeSidebar.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // ── History panel resize (drag) ──
  if (resizeHistory && historyPanel) {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizeHistory.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = historyPanel.offsetWidth;
      resizeHistory.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    // Touch support
    resizeHistory.addEventListener('touchstart', (e) => {
      isDragging = true;
      startX = e.touches[0].clientX;
      startWidth = historyPanel.offsetWidth;
      resizeHistory.classList.add('active');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = startX - e.clientX; // Drag left = wider
      const newWidth = Math.max(60, Math.min(window.innerWidth * 0.35, startWidth + dx));
      historyPanel.style.width = newWidth + 'px';
      document.documentElement.style.setProperty('--history-width', newWidth + 'px');
    });
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const dx = startX - e.touches[0].clientX; // Drag left = wider
      const newWidth = Math.max(60, Math.min(window.innerWidth * 0.35, startWidth + dx));
      historyPanel.style.width = newWidth + 'px';
      document.documentElement.style.setProperty('--history-width', newWidth + 'px');
    }, { passive: false });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        resizeHistory.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
    document.addEventListener('touchend', () => {
      if (isDragging) {
        isDragging = false;
        resizeHistory.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
})();

// ── Toolbar sidebar width buttons (backward compat) ──
const sbNarrow = document.getElementById("sidebar-narrow");
if (sbNarrow) {
  sbNarrow.addEventListener("click", () => {
    sidebarIdx = Math.max(0, sidebarIdx - 1);
    document.documentElement.style.setProperty("--sidebar-width", sidebarWidths[sidebarIdx] + "px");
    const sb = document.getElementById('sidebar');
    if (sb) { sb.style.width = sidebarWidths[sidebarIdx] + 'px'; sb.style.minWidth = sidebarWidths[sidebarIdx] + 'px'; }
  });
}
const sbWide = document.getElementById("sidebar-wide");
if (sbWide) {
  sbWide.addEventListener("click", () => {
    sidebarIdx = Math.min(sidebarWidths.length - 1, sidebarIdx + 1);
    document.documentElement.style.setProperty("--sidebar-width", sidebarWidths[sidebarIdx] + "px");
    const sb = document.getElementById('sidebar');
    if (sb) { sb.style.width = sidebarWidths[sidebarIdx] + 'px'; sb.style.minWidth = sidebarWidths[sidebarIdx] + 'px'; }
  });
}

// ── Điều chỉnh độ rộng thanh History Panel (Narrow / Wide) ──────────
const histNarrow = document.getElementById("history-narrow");
if (histNarrow) {
  histNarrow.addEventListener("click", () => {
    historyIdx = Math.max(0, historyIdx - 1);
    document.documentElement.style.setProperty("--history-width", historyWidths[historyIdx] + "px");
    const hp = document.getElementById('history-panel');
    if (hp) hp.style.width = historyWidths[historyIdx] + 'px';
  });
}
const histWide = document.getElementById("history-wide");
if (histWide) {
  histWide.addEventListener("click", () => {
    historyIdx = Math.min(historyWidths.length - 1, historyIdx + 1);
    document.documentElement.style.setProperty("--history-width", historyWidths[historyIdx] + "px");
    const hp = document.getElementById('history-panel');
    if (hp) hp.style.width = historyWidths[historyIdx] + 'px';
  });
}

// ── Giao diện Sáng / Tối (Dark & Light Mode) ──────────────────────────
const tTheme = document.getElementById("toggle-theme");
if (tTheme) {
  tTheme.addEventListener("click", () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "" : "dark";
    tTheme.textContent = isDark ? "◑ Dark" : "◐ Light";
  });
}

// ── Hệ thống phím tắt nhanh (Hotkeys) ──────────────────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "[") { e.preventDefault(); navigateTo(navPos - 1); }
  if ((e.metaKey || e.ctrlKey) && e.key === "]") { e.preventDefault(); navigateTo(navPos + 1); }
  if ((e.metaKey || e.ctrlKey) && e.key === "f") { e.preventDefault(); const i = document.getElementById("search-input"); if (i) { i.focus(); i.select(); } }
  if ((e.metaKey || e.ctrlKey) && e.key === "=") { e.preventDefault(); fontSizeIdx = Math.min(fontSizes.length - 1, fontSizeIdx + 1); applyFontSize(); }
  if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); fontSizeIdx = Math.max(0, fontSizeIdx - 1); applyFontSize(); }
});

// ── Đảm bảo DOM được tải hoàn chỉnh trước khi chạy ứng dụng ───────────
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ── Expose selectWord + Mobile sidebar toggle ─────────────────────────
window.selectWord = selectWord;

(function() {
  var sidebar = document.getElementById('sidebar');
  var mobileBack = document.getElementById('mobile-back');
  var isMobileView = function() { return window.innerWidth <= 768; };

  // Override selectWord để xử lý mobile sidebar
  var origSelectWord = window.selectWord;
  window.selectWord = function(w, pushHistory) {
    origSelectWord(w, pushHistory);
    if (isMobileView() && sidebar && mobileBack) {
      sidebar.classList.add('sidebar-hidden');
      mobileBack.style.display = 'flex';
    }
  };

  // Nút quay lại danh sách trên mobile
  if (mobileBack) {
    mobileBack.addEventListener('click', function() {
      if (sidebar) sidebar.classList.remove('sidebar-hidden');
      mobileBack.style.display = 'none';
    });
  }
})();
