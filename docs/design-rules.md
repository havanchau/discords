# Discord UI Design Rules
> Tài liệu tham chiếu thiết kế UI theo chuẩn Discord (2025). AI phải tuân thủ 100% các quy tắc này khi tạo giao diện Discord-like.

---

## 1. TRIẾT LÝ THIẾT KẾ

Discord UI được xây dựng trên các nguyên tắc cốt lõi:

- **Dark-first**: Mặc định là dark theme. Light theme là ngoại lệ.
- **Warm dark, not cold black**: Màu tối dùng warm gray (#313338), không dùng pure black (#000000).
- **Layered depth**: Các panel có độ tối khác nhau, tạo chiều sâu bằng màu sắc, không phải shadow.
- **Compact density**: Thông tin dày đặc nhưng có hệ thống, không lãng phí không gian.
- **Rounded corners everywhere**: Border radius nhất quán trên toàn bộ UI.
- **Gaming roots, mainstream reach**: Vừa đủ playful cho gamer, vừa đủ clean cho dân văn phòng.

---

## 2. LAYOUT ARCHITECTURE

### 2.1 Layout 4 cột (Desktop)

```
┌──────┬──────────────┬─────────────────────────┬──────────────┐
│ Rail │ Channel List │     Chat Area            │ Member List  │
│  72px│    240px     │      flex: 1             │   240px      │
└──────┴──────────────┴─────────────────────────┴──────────────┘
```

| Panel | Width | Background |
|---|---|---|
| Server Rail (icon bar) | `72px` | `#1E1F22` |
| Channel Sidebar | `240px` | `#2B2D31` |
| Chat Area | `flex: 1` (min `460px`) | `#313338` |
| Member List | `240px` | `#2B2D31` |

### 2.2 Chiều cao các thanh cố định

| Element | Height |
|---|---|
| Title Bar (header) | `48px` |
| Chat Input Box | `44px` min, tự co giãn |
| Channel Item row | `34px` (Default density) |
| Member row | `42px` |
| Message toolbar hover | `32px` |

### 2.3 UI Density Settings

Discord hỗ trợ 3 mức density (Settings → Appearance → Message Display):

| Mode | Message spacing | Font size |
|---|---|---|
| Compact | `0px` giữa các message | `15px` |
| Default (Cozy) | `17px` giữa các message | `16px` |
| Spacious | `24px` giữa các message | `16px` |

---

## 3. COLOR SYSTEM

### 3.1 Brand Colors

| Token | Hex | Dùng ở đâu |
|---|---|---|
| **Blurple** | `#5865F2` | Nút primary, link active, selected state, brand identity |
| **Green** | `#57F287` | Online status, success, voice connected |
| **Yellow** | `#FEE75C` | Idle status, warning |
| **Red** | `#ED4245` | Do Not Disturb, error, danger button, delete |
| **Fuchsia** | `#EB459E` | Partner/special badge |
| **White** | `#FFFFFF` | Text trên màu nền tối |

### 3.2 Dark Theme — Background Layers

Discord dùng hệ thống background layering theo độ tối tăng dần:

```css
/* Từ sáng nhất đến tối nhất trong Dark theme */
--background-floating:      #18191C; /* Tooltip, dropdown nổi trên cùng */
--background-tertiary:      #1E1F22; /* Server rail */
--background-secondary-alt: #232428; /* Các section sidebar đặc biệt */
--background-secondary:     #2B2D31; /* Channel sidebar, member list */
--background-primary:       #313338; /* Chat area - màu chính */
--background-accent:        #4E5058; /* Scrollbar, divider */
```

### 3.3 Dark Theme — Text Colors

```css
--text-normal:    #DBDEE1; /* Text thông thường trong chat */
--text-muted:     #80848E; /* Placeholder, timestamp, muted */
--text-link:      #00A8FC; /* Link trong chat */
--header-primary: #F2F3F5; /* Header, title, username đậm */
--header-secondary: #B5BAC1; /* Subheader, channel name */
--interactive-normal:  #B5BAC1; /* Icon/text idle state */
--interactive-hover:   #DBDEE1; /* Icon/text khi hover */
--interactive-active:  #FFFFFF; /* Icon/text khi selected */
--interactive-muted:   #4E5058; /* Disabled state */
```

### 3.4 Dark Theme — Status Colors

```css
--status-online:  #23A55A; /* Chấm xanh lá */
--status-idle:    #F0B232; /* Chấm vàng */
--status-dnd:     #F23F43; /* Chấm đỏ */
--status-offline: #80848E; /* Chấm xám */
--status-streaming: #593695; /* Chấm tím khi stream */
```

### 3.5 Dark Theme — Semantic Colors

```css
--background-message-hover:    rgba(2, 2, 2, 0.06);  /* Row highlight khi hover message */
--background-modifier-selected: rgba(79, 84, 92, 0.32); /* Selected channel/item */
--background-modifier-hover:    rgba(79, 84, 92, 0.16); /* Hover channel/item */
--background-modifier-active:   rgba(79, 84, 92, 0.24); /* Click state */

--mention-foreground: #C9CDFB;      /* Text trong mention */
--mention-background: rgba(88, 101, 242, 0.30); /* Background mention highlight */

--input-background:   #1E1F22;  /* Textbox, search field background */
--input-placeholder:  #87898C;  /* Placeholder text */
--input-border:       transparent; /* Thường không có border */
```

### 3.6 Onyx & Ash Theme (2025)

| Theme | Primary BG | Secondary BG | Rail |
|---|---|---|---|
| Dark | `#313338` | `#2B2D31` | `#1E1F22` |
| Ash | `#383A40` | `#313338` | `#232428` |
| Onyx | `#1A1A1D` | `#111214` | `#0D0D0F` |
| Light | `#FFFFFF` | `#F2F3F5` | `#E3E5E8` |

---

## 4. TYPOGRAPHY

### 4.1 Font Stack

```css
/* UI Font - gg sans (custom, giả lập bằng font gần nhất) */
font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;

/* Code / Monospace */
font-family: "gg mono", "Consolas", "Andale Mono WT", "Andale Mono",
             "Lucida Console", monospace;
```

> **Lưu ý**: `gg sans` là font độc quyền của Discord, không public. Khi không có, dùng **Noto Sans** hoặc **Manrope** làm fallback gần nhất về style.

### 4.2 Type Scale (3-tier system, 2025)

| Role | Size | Weight | Line Height | Dùng ở đâu |
|---|---|---|---|---|
| `display-xxl` | `40px` | 700 | `1.25` | Hero marketing |
| `display-xl` | `32px` | 700 | `1.25` | Modal title lớn |
| `display-lg` | `24px` | 700 | `1.25` | Section header |
| `display-md` | `20px` | 600 | `1.3` | Panel title |
| `display-sm` | `16px` | 600 | `1.375` | Channel name, card title |
| `text-lg` | `16px` | 400 | `1.375` | Message body (cozy mode) |
| `text-md` | `14px` | 400 | `1.357` | UI label, tooltip |
| `text-sm` | `12px` | 400 | `1.333` | Timestamp, category label |
| `text-xs` | `10px` | 400 | `1.3` | Badge, status text tiny |
| `code` | `14.4px` (0.875em) | 400 | `1.375` | Inline code |

### 4.3 Typography Rules

- **Username trong chat**: `font-weight: 500`, màu role color hoặc `--header-primary`.
- **Timestamp**: `font-size: 11px`, `color: --text-muted`, xuất hiện khi hover hoặc góc phải.
- **Channel category (section header)**: `font-size: 11px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.02em`.
- **Channel name**: `font-size: 15px` (Default), `font-weight: 500`.
- **Markdown bold**: `font-weight: 700`.
- **Markdown italic**: `font-style: italic`.
- **Inline code**: background `rgba(30,31,34,0.48)`, padding `0 4px`, border-radius `3px`.

---

## 5. SPACING SYSTEM

Discord dùng base-4 spacing system:

```
4px  — Micro: padding icon, gap nhỏ nhất
8px  — XS: padding text element, gap compact
12px — SM: padding bên trong button nhỏ, list item inner gap
16px — MD: padding panel, khoảng cách giữa element quan trọng
20px — LG: section margin
24px — XL: block spacing lớn
32px — 2XL: section separator
40px — 3XL: modal padding
```

### 5.1 Spacing cụ thể

| Element | Spacing |
|---|---|
| Channel item padding | `0 8px` |
| Channel item inner padding | `0 8px` (text trong item) |
| Message padding (cozy) | `2px 16px 2px 72px` |
| Message first-in-group | `16px 16px 0 72px` |
| Chat input padding | `0 16px` |
| Sidebar padding top | `8px` |
| Server icon margin | `8px auto` |
| Modal padding | `16px 0` (header), `16px 20px` (body) |
| Tooltip padding | `8px 12px` |

---

## 6. BORDER RADIUS

Discord 2025 dùng rounded corners nhất quán:

```css
--radius-xs:  2px;   /* Tag, badge nhỏ */
--radius-sm:  4px;   /* Code block, input border, notification dot */
--radius-md:  8px;   /* Button, card nhỏ, context menu item */
--radius-lg:  16px;  /* Modal, panel nổi, attachment preview */
--radius-xl:  24px;  /* Chip, pill button */
--radius-full: 50%;  /* Avatar, status dot, server icon */
--radius-round: 9999px; /* Pill shape buttons, toggle */
```

### 6.1 Component border-radius cụ thể

| Component | Radius |
|---|---|
| Server icon (idle) | `16px` (squircle effect) |
| Server icon (hover/active) | `50%` |
| Channel item hover | `4px` |
| Avatar | `50%` |
| Button primary | `3px` |
| Input / Textbox | `8px` |
| Context Menu | `4px` |
| Modal | `8px` |
| Embed | `4px` |
| Code block | `4px` |
| Attachment image | `4px` |
| Tooltip | `5px` |
| Badge (notification) | `8px` (pill) |

---

## 7. COMPONENTS

### 7.1 Buttons

Discord có 5 kiểu button:

```css
/* PRIMARY — Blurple, action chính */
.btn-primary {
  background: #5865F2;
  color: #FFFFFF;
  border: none;
  border-radius: 3px;
  padding: 2px 16px;
  height: 38px;
  font-size: 14px;
  font-weight: 500;
}
.btn-primary:hover { background: #4752C4; }
.btn-primary:active { background: #3C45A5; }

/* SECONDARY — Background modifier, action phụ */
.btn-secondary {
  background: #4E5058;
  color: #FFFFFF;
  border-radius: 3px;
  height: 38px;
}
.btn-secondary:hover { background: #6D6F78; }

/* DANGER — Đỏ, hành động nguy hiểm */
.btn-danger {
  background: #DA373C;
  color: #FFFFFF;
  border-radius: 3px;
  height: 38px;
}
.btn-danger:hover { background: #A12828; }

/* GHOST / LINK — Không có background */
.btn-ghost {
  background: transparent;
  color: #DBDEE1;
  border-radius: 3px;
  height: 38px;
}
.btn-ghost:hover {
  background: rgba(79,84,92,0.16);
  color: #FFFFFF;
}

/* OUTLINE */
.btn-outline {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.16);
  color: #DBDEE1;
  border-radius: 3px;
  height: 38px;
}
```

### 7.2 Input / Text Field

```css
.input {
  background: #1E1F22;
  border: none;
  border-radius: 4px;
  color: #DBDEE1;
  font-size: 16px;
  padding: 10px;
  height: 40px;
  width: 100%;
  outline: none;
}
.input::placeholder { color: #87898C; }
.input:focus {
  outline: 2px solid #5865F2;
  outline-offset: -2px;
}
```

### 7.3 Chat Input Box

```css
.chat-input {
  background: #383A40;
  border-radius: 8px;
  margin: 0 16px 24px;
  padding: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
}
.chat-input-text {
  flex: 1;
  padding: 11px 16px;
  color: #DBDEE1;
  font-size: 16px;
  line-height: 22px;
  max-height: 50vh;
  overflow-y: auto;
}
.chat-input-text[data-empty]:before {
  content: attr(placeholder);
  color: #87898C;
  pointer-events: none;
}
```

### 7.4 Channel Item

```css
.channel-item {
  display: flex;
  align-items: center;
  height: 34px;
  margin: 1px 8px;
  padding: 0 8px;
  border-radius: 4px;
  cursor: pointer;
  gap: 6px;
  color: #80848E; /* muted default */
}
.channel-item:hover {
  background: rgba(79,84,92,0.16);
  color: #DBDEE1;
}
.channel-item.active {
  background: rgba(79,84,92,0.32);
  color: #F2F3F5;
}
.channel-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  opacity: 0.75;
}
```

### 7.5 Server Icon

```css
.server-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px; /* squircle shape idle */
  margin: 4px auto;
  cursor: pointer;
  background: #2B2D31;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-radius 0.15s ease;
}
.server-icon:hover,
.server-icon.active {
  border-radius: 50%;
}
/* Pill indicator bên trái khi active */
.server-icon.active::before {
  content: '';
  position: absolute;
  left: 0;
  width: 4px;
  height: 40px;
  background: #FFFFFF;
  border-radius: 0 4px 4px 0;
}
```

### 7.6 Avatar

```css
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Avatar nhỏ trong message */
.avatar-sm { width: 32px; height: 32px; }
/* Avatar lớn profile */
.avatar-xl { width: 80px; height: 80px; }

/* Status dot */
.avatar-wrapper {
  position: relative;
  display: inline-block;
}
.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--background-panel); /* cắt bằng border cùng màu nền */
}
.status-online  { background: #23A55A; }
.status-idle    { background: #F0B232; }
.status-dnd     { background: #F23F43; }
.status-offline { background: #80848E; }
```

### 7.7 Message Layout

```css
/* Grouped message (cùng user, <5 phút) */
.message {
  padding: 2px 16px 2px 72px; /* 72px = 16px margin + 40px avatar + 16px gap */
  min-height: 22px;
  position: relative;
}
/* First message in group (có avatar + username) */
.message.first-in-group {
  margin-top: 17px; /* cozy spacing */
  padding-top: 2px;
}
.message-avatar {
  position: absolute;
  left: 16px;
  top: 2px;
}
.message-username {
  font-weight: 500;
  color: var(--header-primary);
  font-size: 16px;
  cursor: pointer;
}
.message-username:hover { text-decoration: underline; }
.message-timestamp {
  font-size: 11px;
  color: #80848E;
  margin-left: 8px;
  font-weight: 400;
}
/* Timestamp khi hover grouped message (bên trái) */
.message:hover .hover-timestamp {
  display: block;
  position: absolute;
  left: 0;
  width: 56px;
  text-align: right;
  font-size: 10px;
  color: #80848E;
}
.message:hover { background: rgba(2,2,2,0.06); }
```

### 7.8 Embed

```css
.embed {
  background: #2B2D31;
  border-left: 4px solid #5865F2; /* màu thay đổi theo bot/content */
  border-radius: 0 4px 4px 0;
  padding: 12px 12px 12px 8px;
  margin: 4px 0;
  max-width: 520px;
}
.embed-title {
  color: #F2F3F5;
  font-size: 15px;
  font-weight: 600;
}
.embed-description {
  color: #DBDEE1;
  font-size: 14px;
  margin-top: 8px;
}
```

### 7.9 Context Menu

```css
.context-menu {
  background: #111214;
  border-radius: 4px;
  padding: 6px 8px;
  min-width: 188px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.24);
  border: 1px solid rgba(255,255,255,0.06);
}
.context-menu-item {
  border-radius: 2px;
  padding: 6px 8px;
  font-size: 14px;
  color: #DBDEE1;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
.context-menu-item:hover {
  background: #5865F2;
  color: #FFFFFF;
}
.context-menu-item.danger { color: #ED4245; }
.context-menu-item.danger:hover {
  background: #ED4245;
  color: #FFFFFF;
}
.context-menu-separator {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 4px 0;
}
```

### 7.10 Modal

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #313338;
  border-radius: 8px;
  min-width: 440px;
  max-width: 560px;
  width: 100%;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,0.54);
}
.modal-header {
  padding: 16px 16px 0;
  font-size: 20px;
  font-weight: 700;
  color: #F2F3F5;
}
.modal-body {
  padding: 16px;
  color: #DBDEE1;
  font-size: 16px;
  line-height: 1.5;
}
.modal-footer {
  background: #2B2D31;
  padding: 16px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
```

### 7.11 Tooltip

```css
.tooltip {
  background: #0D0D0F;
  color: #DBDEE1;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 5px;
  pointer-events: none;
  max-width: 200px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}
```

### 7.12 Badge / Notification Pill

```css
.badge {
  background: #ED4245;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 700;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--background-panel);
}
```

### 7.13 Toggle / Switch

```css
.toggle {
  width: 40px;
  height: 24px;
  border-radius: 9999px;
  background: #4E5058; /* off state */
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
}
.toggle.on { background: #23A55A; }
.toggle-knob {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #FFFFFF;
  top: 3px;
  left: 3px;
  transition: transform 0.15s ease;
}
.toggle.on .toggle-knob { transform: translateX(16px); }
```

### 7.14 Scrollbar

```css
/* Discord custom scrollbar */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb {
  background: #1A1B1E;
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
  min-height: 40px;
}
::-webkit-scrollbar-thumb:hover { background: #232428; }
```

---

## 8. ICONOGRAPHY

### 8.1 Nguồn Icon

Discord dùng icon custom, nhưng style rất gần với:
- **Phosphor Icons** (bold/fill variant) — khuyến nghị dùng khi code clone
- **Feather Icons** — fallback nhẹ
- **Tabler Icons** — gần nhất về stroke weight

### 8.2 Kích thước Icon

| Context | Size |
|---|---|
| Inline message icon | `16px` |
| Channel list icon | `20px` |
| Toolbar icon (header) | `24px` |
| Server rail icon | `24px–28px` |
| Action button icon | `20px` |
| Emoji / Reaction | `24px–32px` |

### 8.3 Icon Color Rules

- **Default**: `--interactive-normal` (`#B5BAC1`)
- **Hover**: `--interactive-hover` (`#DBDEE1`)
- **Active/Selected**: `--interactive-active` (`#FFFFFF`)
- **Danger**: `#ED4245`
- **Blurple action**: `#5865F2`

---

## 9. SHADOWS & ELEVATION

Discord không dùng shadow nhiều trong UI phẳng, chỉ dùng cho **floating elements**:

```css
/* Level 1 - Tooltip, small dropdown */
box-shadow: 0 4px 8px rgba(0,0,0,0.3);

/* Level 2 - Context menu, popout panel */
box-shadow: 0 8px 16px rgba(0,0,0,0.24);

/* Level 3 - Modal, large panel */
box-shadow: 0 24px 64px rgba(0,0,0,0.54);

/* Level 4 - Full overlay modal */
box-shadow: 0 32px 96px rgba(0,0,0,0.7);
```

Separation giữa các panel dùng **màu sắc** (độ tối khác nhau), không phải shadow hay border.

---

## 10. MOTION & ANIMATION

### 10.1 Easing

```css
--ease-discord: cubic-bezier(0.4, 0, 0.2, 1); /* Material-like, Discord dùng phổ biến */
--ease-spring:  cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Server icon pill */
--ease-out:     cubic-bezier(0, 0, 0.2, 1);
```

### 10.2 Duration chuẩn

| Action | Duration |
|---|---|
| Hover color/opacity | `100ms` |
| Border radius transition (server icon) | `150ms` |
| Context menu appear | `100ms` |
| Modal fade-in | `200ms` |
| Sidebar collapse/expand | `300ms` |
| Toast notification slide | `250ms` |

### 10.3 Quy tắc Animation

- **Không dùng animation** cho các state thay đổi nhanh (typing, scroll).
- **Fade + scale** cho modal: `opacity 0→1`, `scale 0.95→1`.
- **Slide up** cho toast notification.
- **Server icon pill**: chiều cao grow từ `8px → 40px`.
- **Tất cả hover transition** phải dưới `200ms`.

---

## 11. MENTIONS & HIGHLIGHTS

```css
/* @user mention */
.mention {
  background: rgba(88, 101, 242, 0.30);
  color: #C9CDFB;
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 500;
  cursor: pointer;
}
.mention:hover {
  background: rgba(88, 101, 242, 0.60);
  color: #FFFFFF;
}

/* Message được mention (highlight cả row) */
.message.mentioned {
  background: rgba(88, 101, 242, 0.08);
  border-left: 2px solid #5865F2;
  padding-left: 70px; /* bù 2px border */
}
.message.mentioned:hover {
  background: rgba(88, 101, 242, 0.12);
}
```

---

## 12. MARKDOWN RENDERING

Discord hỗ trợ markdown subset:

| Syntax | Render |
|---|---|
| `**bold**` | `font-weight: 700` |
| `*italic*` hoặc `_italic_` | `font-style: italic` |
| `__underline__` | `text-decoration: underline` |
| `~~strikethrough~~` | `text-decoration: line-through` |
| `` `code` `` | inline code — mono font, bg tối |
| ` ```code block``` ` | block code — `background: #2B2D31`, full width |
| `> quote` | border-left blurple, padding-left |
| `# Heading` | H1–H3 với font-size tăng dần |
| `[text](url)` | màu `--text-link: #00A8FC` |
| `||spoiler||` | background blur-màu, click to reveal |

---

## 13. ACCESSIBILITY & FOCUS

```css
/* Discord dùng outline focus cho keyboard navigation */
:focus-visible {
  outline: 2px solid #5865F2;
  outline-offset: 2px;
}

/* Không dùng :focus (vì trigger cả click), chỉ dùng :focus-visible */
:focus:not(:focus-visible) { outline: none; }
```

- Minimum touch target: `32px × 32px`
- Contrast ratio text thường ≥ 4.5:1 (WCAG AA)
- Tất cả icon phải có `aria-label` hoặc `title`

---

## 14. Z-INDEX HIERARCHY

```css
--z-message-toolbar:   1;    /* Toolbar hover trên message */
--z-sidebar:          10;    /* Sidebar panel */
--z-header:           20;    /* Top header bar */
--z-dropdown:        100;    /* Channel dropdown, select */
--z-tooltip:         200;    /* Tooltip */
--z-context-menu:    300;    /* Right-click menu */
--z-popout:          400;    /* User profile popout */
--z-modal:           500;    /* Modal dialog */
--z-notification:    600;    /* Toast notification */
--z-overlay:        1000;    /* Full screen overlay */
```

---

## 15. CSS VARIABLES CHEAT SHEET (Dark Theme)

```css
:root {
  /* Backgrounds */
  --background-primary:       #313338;
  --background-secondary:     #2B2D31;
  --background-secondary-alt: #232428;
  --background-tertiary:      #1E1F22;
  --background-floating:      #111214;
  --background-accent:        #4E5058;

  /* Text */
  --text-normal:              #DBDEE1;
  --text-muted:               #80848E;
  --text-link:                #00A8FC;
  --header-primary:           #F2F3F5;
  --header-secondary:         #B5BAC1;

  /* Interactive */
  --interactive-normal:       #B5BAC1;
  --interactive-hover:        #DBDEE1;
  --interactive-active:       #FFFFFF;
  --interactive-muted:        #4E5058;

  /* Brand */
  --brand-color:              #5865F2;
  --brand-hover:              #4752C4;
  --brand-active:             #3C45A5;

  /* Status */
  --status-online:            #23A55A;
  --status-idle:              #F0B232;
  --status-dnd:               #F23F43;
  --status-offline:           #80848E;

  /* Semantic */
  --color-danger:             #ED4245;
  --color-success:            #57F287;
  --color-warning:            #FEE75C;

  /* Modifiers */
  --background-modifier-hover:    rgba(79,84,92,0.16);
  --background-modifier-active:   rgba(79,84,92,0.24);
  --background-modifier-selected: rgba(79,84,92,0.32);

  /* Input */
  --input-background:         #1E1F22;
  --input-placeholder:        #87898C;

  /* Mention */
  --mention-foreground:       #C9CDFB;
  --mention-background:       rgba(88,101,242,0.30);
}
```

---

## 16. ANTI-PATTERNS — TUYỆT ĐỐI KHÔNG LÀM

| ❌ Sai | ✅ Đúng |
|---|---|
| Dùng `#000000` cho background | Dùng `#1E1F22` hoặc `#111214` |
| Dùng `border` để phân chia panel | Dùng màu background khác nhau |
| Box shadow trên channel list | Không shadow, chỉ dùng màu |
| Border radius `0` cho button | Minimum `3px` |
| Font-size dưới `10px` cho UI | Tối thiểu `10px` |
| `cursor: pointer` trên text thường | Chỉ dùng cho element clickable |
| Màu tím `#7289DA` (Blurple cũ) | Dùng `#5865F2` (Blurple 2021+) |
| Animate toàn bộ layout | Chỉ animate floating element |
| Pure white `#FFFFFF` cho background | Dùng `#F2F3F5` cho light theme |
| Đặt element quan trọng cạnh cạnh phải | Sidebar luôn bên trái, panel phụ bên phải |
| Dùng font `Inter`, `Roboto`, `Arial` | Dùng `gg sans` / `Noto Sans` |

---

## 17. CHECKLIST TRƯỚC KHI SHIP

- [ ] Đúng 4 background color layers (rail < sidebar < chat < floating)
- [ ] Blurple `#5865F2` cho tất cả primary action
- [ ] Font stack có `gg sans` làm first choice
- [ ] Server icon dùng squircle → circle transition khi hover
- [ ] Avatar tất cả là hình tròn (`border-radius: 50%`)
- [ ] Status dot dùng đúng màu + border cut technique
- [ ] Channel category UPPERCASE, `11px`, `font-weight: 600`
- [ ] Message spacing đúng theo density setting
- [ ] Context menu có separator, danger item màu đỏ
- [ ] Modal có background overlay `rgba(0,0,0,0.85)`
- [ ] Focus state dùng `outline: 2px solid #5865F2`
- [ ] Hover state dùng `rgba(79,84,92,0.16)` không phải màu solid
- [ ] Scrollbar custom (width 8px, radius 4px, transparent track)
- [ ] Tất cả animation dưới 300ms

---

*Last updated: 2025 — Discord UI v2025 March refresh + Onyx/Ash themes*