# Discord Clone UI/UX Design Specification

## Goal

Mục tiêu KHÔNG phải tạo một giao diện "đẹp theo kiểu AI".

Mục tiêu là tạo cảm giác:

* Giống một sản phẩm thật đang được hàng triệu người sử dụng
* Discord-level quality
* Dark mode first
* Developer friendly
* Gaming community friendly
* Modern nhưng không màu mè
* Functional trước, visual sau

---

# Design Philosophy

## Core Principles

### 1. Density over emptiness

Không sử dụng layout kiểu:

```text
Card
Card
Card
Card
```

với khoảng trắng khổng lồ.

Discord thật có mật độ thông tin cao.

Ưu tiên:

* nhiều thông tin
* dễ scan
* ít phải scroll

---

### 2. Utility First

Mọi thành phần phải có lý do tồn tại.

Không thêm:

* dashboard stats giả
* card KPI
* animation vô nghĩa
* icon trang trí

---

### 3. Real Product Feeling

UI phải giống sản phẩm đã hoạt động 5 năm.

Không giống:

```text
Dribbble Shot
Behance Design
AI Generated Landing Page
```

---

# Visual Direction

## Inspirations

Primary:

* Discord
* Slack
* Linear

Secondary:

* GitHub
* Raycast
* Notion

Avoid:

* Glassmorphism
* Neumorphism
* Excessive gradients
* NFT style design
* Web3 aesthetics

---

# Color System

## Main Background

```css
#1e1f22
```

## Sidebar

```css
#2b2d31
```

## Channel Sidebar

```css
#313338
```

## Chat Area

```css
#313338
```

## Hover

```css
#3f4248
```

## Active

```css
#404249
```

## Accent

```css
#5865f2
```

Use accent color sparingly.

Only for:

* buttons
* mentions
* active states
* unread indicators

---

# Typography

Font:

```text
Inter
```

Fallback:

```text
system-ui
```

Rules:

Message Text

14px–15px

Username

15px
SemiBold

Timestamp

12px

Channel Name

15px
Medium

Never use:

```text
Huge Titles
Fancy Fonts
Gradient Text
```

---

# Layout

## Desktop

```text
+-----------------------------------------------------------+
| Server Rail | Channel List | Chat | Member List           |
+-----------------------------------------------------------+
```

Widths

Server Rail

72px

Channel List

260px

Member List

240px

Chat

flex-grow

---

# Server Rail

Contains:

* Server Icon
* DM Button
* Add Server
* Discover

Behavior:

Hover:

* tooltip

Active:

* left indicator

Unread:

* badge

Voice Active:

* green glow

---

# Channel Sidebar

Sections:

TEXT CHANNELS

* general
* frontend
* backend
* bug-report

VOICE CHANNELS

* Meeting Room
* Gaming Room

Behavior:

Hover:

```css
background: hover-color
```

Active:

```css
background: active-color
```

Unread:

bold

Mention:

badge

---

# Chat Area

## Header

Contains:

* channel icon
* channel name
* topic
* search
* call
* video call

---

## Message List

Requirements:

Virtualized rendering

Support:

* text
* image
* video
* file
* code block

---

## Message Grouping

Bad:

```text
Avatar
Message

Avatar
Message

Avatar
Message
```

Good:

Group consecutive messages.

Discord style.

---

## Mentions

Example:

```text
@Chau
```

Highlighted.

Clickable.

---

## Reactions

Example:

😀 3
🔥 12

Hover:

show users reacted

---

## Threads

Inline thread preview.

Click:

open thread panel.

---

# Composer

Features:

* text input
* emoji picker
* file upload
* markdown
* mentions
* code snippets

Shortcuts:

Enter

Send

Shift + Enter

New line

Ctrl + K

Quick search

---

# Member Sidebar

Sections:

ONLINE

OFFLINE

BOTS

Shows:

* avatar
* status
* activity

Example:

```text
Chau
Playing Valorant
```

```text
Minh
Listening Spotify
```

---

# Presence System

Status:

* Online
* Idle
* DND
* Invisible
* Offline

Indicator:

small circle

Bottom-right avatar

---

# Voice UI

Bottom panel:

```text
Avatar
Username
Mic
Headphone
Settings
```

States:

Mic On
Mic Off

Screen Share

Voice Connected

---

# Video Call UI

Layout:

2 Users

```text
+---------+
| User A  |
+---------+
| User B  |
+---------+
```

Group:

Grid Layout

Features:

* mute
* camera
* screen share
* fullscreen

---

# Empty States

Avoid:

```text
No Messages
```

Use:

```text
Welcome to #frontend

This is the start of the channel.

Share React tips, code reviews and questions.
```

---

# Loading States

Use Skeletons.

Never use:

```text
Loading...
```

---

# Animations

Duration:

150ms–250ms

Use for:

* hover
* dropdown
* modal
* tooltip

Avoid:

* bouncing
* spinning
* fancy page transitions

---

# Mobile

Bottom Navigation:

* Home
* DMs
* Search
* Notifications
* Profile

Channel List:

Slide Drawer

Member List:

Slide Drawer

---

# Accessibility

Keyboard Navigation

Required

Tab Navigation

Required

Focus States

Required

Screen Reader Labels

Required

---

# Common AI UI Mistakes

DO NOT:

* Use giant cards
* Use random gradients
* Use glassmorphism
* Use empty whitespace
* Use fake dashboard statistics
* Use symmetric layouts everywhere
* Use generic illustrations

---

# Success Criteria

When a user opens the app they should think:

"This looks like a real communication platform."

NOT:

"This looks like an AI generated dashboard."
