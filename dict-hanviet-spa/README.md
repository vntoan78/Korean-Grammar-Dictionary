# Từ Điển Ngữ Pháp Tiếng Hàn — HTML5 SPA

Bản chuyển đổi từ app Tauri (Rust + macOS) sang **HTML5 Single Page Application** thuần — chạy được trên bất kỳ trình duyệt modern nào, không cần Rust, không cần cài đặt.

## Cấu trúc thư mục

```
dict-hanviet-spa/
├── index.html              # Cấu trúc UI (giữ nguyên từ app gốc)
├── main.js                 # Logic app (chỉ thay Tauri IPC → fetch())
├── data/
│   ├── manifest.json       # Danh sách 2 bộ từ điển
│   ├── data_national.json  # 879 mục từ — Quốc립국어원 (5.2 MB)
│   └── data_Kim.json       # 507 mục từ — 김종식 (2.0 MB)
├── preview-desktop-light.png
├── preview-desktop-dark.png
├── preview-kim-dict.png
└── preview-mobile.png
```

## Cách chạy

SPA cần được phục vụ qua HTTP (vì dùng `fetch()` để tải data JSON). **Không thể mở `index.html` trực tiếp bằng `file://`** — trình duyệt sẽ chặn CORS.

### Tuỳ chọn 1: Python (có sẵn trên hầu hết hệ thống)
```bash
cd dict-hanviet-spa
python3 -m http.server 8000
# Mở http://localhost:8000 trong trình duyệt
```

### Tuỳ chọn 2: Node.js
```bash
npx serve dict-hanviet-spa
# hoặc
npx http-server dict-hanviet-spa -p 8000
```

### Tuỳ chọn 3: VS Code Live Server
Cài extension "Live Server" → right-click `index.html` → "Open with Live Server".

### Tuỳ chọn 4: Deploy static hosting
Upload toàn bộ thư mục `dict-hanviet-spa/` lên GitHub Pages / Netlify / Vercel / Cloudflare Pages / nginx / Apache — đều hoạt động bình thường vì là SPA tĩnh thuần.

## Tính năng (giữ 100% từ app gốc)

| # | Tính năng | Mô tả |
|---|-----------|-------|
| 1 | **2 bộ từ điển** | Quốc lập quốc ngữ viện (879) + 김종식 (507) — chuyển đổi qua dropdown |
| 2 | **Tìm kiếm không dấu** | Tìm theo từ Hàn, biến thể, nghĩa Việt — bỏ dấu tiếng Việt OK |
| 3 | **Tìm kiếm nâng cao** | (Xem checkbox "Tìm sâu" trong sidebar) — tìm trong definitions, sections, examples |
| 4 | **Lịch sử tra cứu** | Back/Forward như browser, có panel lịch sử bên phải |
| 5 | **Lưu ký (annotation)** | Ghi chú per-từ, lưu trong `localStorage` — có nút Sửa / Ghi thêm / Hủy |
| 6 | **Dark mode** | Toggle nút ◑ Dark |
| 7 | **Điều chỉnh font** | Cỡ chữ (11–72px) + family (Serif/Sans/Mono) |
| 8 | **Resize panels** | Kéo thanh ngăn giữa Sidebar/Detail/History để thay đổi rộng — hoặc dùng nút ◂▸ |
| 9 | **Cross-reference link** | Click từ liên quan (ref-link / dict-ref) để nhảy tới từ đó |
| 10 | **Mobile responsive** | ≤768px → sidebar thành overlay, có nút quay lại ☰ |
| 11 | **Phím tắt** | `Ctrl/Cmd+[` lùi, `Ctrl/Cmd+]` tiến, `Ctrl/Cmd+F` focus search, `Ctrl/Cmd +/-` zoom |
| 12 | **Markers đặc biệt** | `«...»` in đậm, `⟦...⟧` link, `❛...❜` trích dẫn, `〔예:〕` badge ví dụ, auto superscript số |
| 13 | **Định dạng National** | def-block (xanh đậm), content-block (xanh nhạt), usage-explanation, note-block, morphology-box |
| 14 | **Định dạng Kim** | metadata-box, table_html, meaning_groups, note_blocks (phụ chú), table_blocks |

## Khác biệt so với app Tauri gốc

| Khía cạnh | App Tauri gốc | SPA bản này |
|-----------|---------------|-------------|
| Dữ liệu | `.json.zst` nén, đọc qua Rust IPC | `.json` đã giải nén, đọc qua `fetch()` |
| Backend | Rust (main.rs + zstd crate) | Không có — pure JS |
| Platform | macOS only (DMG / .app) | Cross-platform (mọi trình duyệt) |
| Bảo vệ dữ liệu | ❌ DevTools tắt, CSP chặt, data ẩn | ⚠️ Data accessible trong DevTools Network tab |
| Offline | ✅ Hoàn toàn | ✅ Hoàn toàn (sau khi load lần đầu, có thể cache) |
| Kích thước | ~1.8 MB (nén) | ~7.2 MB (giải nén) |

> Lưu ý bảo mật: vì là SPA web, dữ liệu từ điển visible trong DevTools. Đây là đánh đổi cần thiết để chạy trên trình duyệt. Nếu cần giấu data, dùng app Tauri gốc.

## Phục hồi từ mã nguồn gốc

- `index.html`: giữ nguyên 100% từ `www/index.html` (không thay đổi)
- `main.js`: giữ nguyên 100%, chỉ thay hàm `loadDataFile()` ở đầu file (dùng `fetch()` thay cho `window.__TAURI__.core.invoke()`)
- `data/*.json`: giải nén từ `resources/*.json.zst` bằng `zstd -d`
