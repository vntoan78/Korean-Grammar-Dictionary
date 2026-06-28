# Từ Điển Ngữ Pháp Tiếng Hàn — HTML5 SPA

Bản chuyển đổi từ app Tauri (Rust + macOS) sang **HTML5 Single Page Application** thuần — chạy được trên bất kỳ trình duyệt modern nào, không cần Rust, không cần cài đặt.

## Cấu trúc thư mục

```
dict-hanviet-spa/
├── index.html              # Cấu trúc UI + modal Notes Manager
├── main.js                 # Logic app + export/import annotations
├── data/
│   ├── manifest.json       # Danh sách 2 bộ từ điển
│   ├── data_national.json  # 879 mục từ — Quốc립국어원 (5.2 MB)
│   └── data_Kim.json       # 507 mục từ — 김종식 (2.0 MB)
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions auto-deploy
├── .gitignore
├── preview-desktop-light.png
├── preview-desktop-dark.png
├── preview-kim-dict.png
├── preview-mobile.png
├── preview-luu-ky-inline.png      # Khối Lưu ký inline trong chi tiết từ
├── preview-notes-manager.png      # Modal Quản lý ghi chú (light mode)
├── preview-notes-manager-dark.png # Modal Quản lý ghi chú (dark mode)
└── preview-notes-manager-mobile.png # Modal trên mobile
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
| 5 | **Lưu ký (annotation)** | Ghi chú per-từ, lưu trong `localStorage` — có nút Sửa / Ghi thêm / Hủy. **Mỗi ghi chú kèm metadata**: `created_at`, `updated_at`, `dict_source` (file từ điển gốc) |
| 6 | **Dark mode** | Toggle nút ◑ Dark |
| 7 | **Điều chỉnh font** | Cỡ chữ (11–72px) + family (Serif/Sans/Mono) |
| 8 | **Resize panels** | Kéo thanh ngăn giữa Sidebar/Detail/History để thay đổi rộng — hoặc dùng nút ◂▸ |
| 9 | **Cross-reference link** | Click từ liên quan (ref-link / dict-ref) để nhảy tới từ đó |
| 10 | **Mobile responsive** | ≤768px → sidebar thành overlay, có nút quay lại ☰ |
| 11 | **Phím tắt** | `Ctrl/Cmd+[` lùi, `Ctrl/Cmd+]` tiến, `Ctrl/Cmd+F` focus search, `Ctrl/Cmd +/-` zoom |
| 12 | **Markers đặc biệt** | `«...»` in đậm, `⟦...⟧` link, `❛...❜` trích dẫn, `〔예:〕` badge ví dụ, auto superscript số |
| 13 | **Định dạng National** | def-block (xanh đậm), content-block (xanh nhạt), usage-explanation, note-block, morphology-box |
| 14 | **Định dạng Kim** | metadata-box, table_html, meaning_groups, note_blocks (phụ chú), table_blocks |
| 15 | **📝 Quản lý ghi chú** | Modal quản lý: xem tất cả ghi chú, xuất/nhập JSON, xóa. Có badge số đếm trên toolbar |
| 16 | **Xuất ghi chú JSON** | Tải file `dict-annotations-YYYY-MM-DD.json` chứa tất cả ghi chú + metadata — gửi cho maintainer để cải thiện từ điển |
| 17 | **Nhập ghi chú JSON** | Nạp lại ghi chú từ file (chuyển máy, nhận update). Merge với chiến lược newer-wins (timestamp) |

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

- `index.html`: giữ nguyên 100% từ `www/index.html`, **bổ sung** modal Quản lý ghi chú + styles
- `main.js`: giữ nguyên 100%, **thay đổi**:
  - Hàm `loadDataFile()`: dùng `fetch()` thay cho `window.__TAURI__.core.invoke()`
  - **Thêm**: layer annotation storage với metadata (`saveAnnotation`, `getAnnotationMeta`, `getAllAnnotations`)
  - **Thêm**: `exportAnnotations()`, `importAnnotations()`, `clearAllAnnotations()`, `renderNotesList()`, `openNotesModal()`, `showToast()`
  - **Sửa**: `bindLuuKyInline()` gọi `saveAnnotation()` để lưu cả content + metadata
  - **Sửa**: `switchDictionary()` load annotation từ localStorage vào `allWords[].luu_ky` để hiển thị inline
- `data/*.json`: giải nén từ `resources/*.json.zst` bằng `zstd -d`

## 📝 Tính năng Quản lý ghi chú (Lưu ký)

### Mục đích

Cho phép người dùng viết ghi chú trực tiếp vào từng mục từ trong từ điển. Các ghi chú này được lưu trữ kèm metadata đầy đủ (timestamp, nguồn từ điển) để:
1. Người dùng theo dõi học tập / ghi nhớ cá nhân
2. **Maintainer có thể xuất ghi chú từ người dùng để bổ sung/cải thiện nội dung từ điển cho các phiên bản sau**

### Cách dùng

#### 1. Viết ghi chú cho một từ

- Mở một từ trong từ điển (click vào sidebar)
- Trong khung "📝 Lưu ký" (cam) ở đầu nội dung từ:
  - Nếu chưa có ghi chú: ô trống → gõ nội dung → bấm **Lưu**
  - Nếu đã có: bấm **Sửa** → chỉnh textarea → bấm **Lưu** (thay thế) hoặc **Ghi thêm** (nối vào cuối)
- Có nút **Hủy** để hủy chỉnh sửa

#### 2. Quản lý tất cả ghi chú

- Bấm nút **📝 Ghi chú** trên toolbar (có badge hiển thị số lượng)
- Modal mở ra với:
  - **Thống kê**: tổng số, cập nhật cuối, phân bố theo bộ từ điển
  - **3 nút hành động**: Xuất JSON, Nhập JSON, Xóa tất cả
  - **Danh sách ghi chú**: mỗi item hiển thị từ, dict source, thời gian, nội dung preview, 2 nút "→ Mở từ" và "🗑️ Xóa"
  - **Hướng dẫn** ở đáy modal

#### 3. Xuất ghi chú ra file JSON

- Trong modal, bấm **💾 Xuất JSON**
- File `dict-annotations-YYYY-MM-DD.json` sẽ được tải về máy
- **Cấu trúc file**:
  ```json
  {
    "exported_at": "2026-06-18T13:04:07.534Z",
    "source": "dict-hanviet-spa",
    "version": "1.0.0",
    "app_url": "https://vntoan78.github.io/",
    "total_annotations": 3,
    "dictionaries": [
      {"file": "data_national.json", "name": "한국어 문법 - 국립국어원", "lang": "한"},
      {"file": "data_Kim.json", "name": "한국어 문법 - 김종식", "lang": "한"}
    ],
    "annotations": [
      {
        "word": "-가",
        "luu_ky": "Trợ từ chỉ chủ ngữ. Dùng sau danh từ không có batchim...",
        "created_at": "2026-06-18T13:04:06.135Z",
        "updated_at": "2026-06-18T13:04:06.135Z",
        "dict_source": "data_national.json"
      }
    ]
  }
  ```

#### 4. Nhập ghi chú từ file JSON

- Trong modal, bấm **📂 Nhập JSON** → chọn file `dict-annotations-*.json`
- App merge với chiến lược **newer-wins**:
  - Nếu ghi chú trong file có `updated_at` mới hơn ghi chú local → ghi đè
  - Nếu local mới hơn → bỏ qua
- Useful khi: chuyển máy, restore backup, nhận update từ maintainer

#### 5. Dành cho maintainer — merge ghi chú người dùng vào data từ điển

Khi nhận file `dict-annotations-*.json` từ người dùng, maintainer có thể script merge vào data nguồn:

```python
import json

# Load data nguồn
with open('data_national.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Load annotation từ user gửi
with open('dict-annotations-2026-06-18.json', 'r', encoding='utf-8') as f:
    ann_data = json.load(f)

# Tạo lookup theo word
ann_map = {a['word']: a['luu_ky'] for a in ann_data['annotations']
           if a.get('dict_source') == 'data_national.json'}

# Merge vào data
merged = 0
for entry in data:
    if entry['word'] in ann_map:
        entry['luu_ky'] = ann_map[entry['word']]
        merged += 1

# Save
with open('data_national.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'Merged {merged}/{len(ann_map)} annotations')
```

Ghi chú được merge sẽ thành field `luu_ky` trong entry từ điển — app sẽ tự hiển thị ở khối cam "📝 Lưu ký" trong chi tiết từ.

### Storage scheme (localStorage)

- `dict_annotation_<word>` → nội dung ghi chú (string)
- `dict_annotation_meta_<word>` → JSON `{created_at, updated_at, dict_source}`

### Debug API

Mở DevTools Console, dùng object `window.__notes`:
```js
window.__notes.getAll()       // → mảng tất cả ghi chú
window.__notes.export()       // → trigger download JSON
window.__notes.clear()        // → xóa tất cả (hỏi confirm)
window.__notes.showToast('msg', 'success')  // → hiển thị toast
```
