# Modern Glassmorphism UI Redesign Specification

## 1. Goal & Acceptance Criteria

### Objective
Redesign the web client (`apps/web`) with a state-of-the-art, high-end **Modern Glassmorphism & Cyber-Sleek Dark Theme**. This overrides traditional flat gray constraints in favor of rich visual aesthetics, vibrant gradient accents, frosted glass panels, modern typography, and smooth micro-animations.

### Acceptance Criteria
- [ ] Implement a rich design system with CSS custom properties for glassmorphism, ambient background glows, and gradient accents (`#6366f1` Indigo, `#8b5cf6` Violet, `#06b6d4` Cyan).
- [ ] Upgrade Google Fonts typography (Plus Jakarta Sans / Inter).
- [ ] Apply frosted glass panel styling (`backdrop-filter: blur(16px)`) to sidebars, chat shell, modal dialogs, and navigation elements.
- [ ] Add smooth micro-animations for hover states, server icons, message action toolbars, and active channel pills.
- [ ] Capture new desktop and mobile screenshots to `docs/screenshots/ui-redesign/` after implementation.

## 2. Scope & Current State

### Current State
- The UI follows rigid flat gray Discord constraints (`#1e1f22`, `#2b2d31`, `#313338`) which feel plain and muted to the user.

### Proposed Visual Aesthetics
- **Theme**: Premium Glassmorphism Dark Mode.
- **Background**: Deep space charcoal (`#090d16`) with subtle background glow orbs (`radial-gradient(...)`).
- **Panels**: Translucent glass (`background: rgba(15, 23, 42, 0.75)`, `backdrop-filter: blur(16px)`, `border: 1px solid rgba(255, 255, 255, 0.08)`).
- **Accents**: Electric Violet & Cyan gradients (`linear-gradient(135deg, #6366f1 0%, #a855f7 100%)`).
- **Shadows**: Soft ambient glowing shadows (`0 8px 32px rgba(99, 102, 241, 0.2)`).

## 3. Implementation Plan & Files

1. `docs/features/modern-ui-redesign.md`: Feature specification document.
2. `apps/web/src/styles/global.css`: Core design system upgrade (CSS tokens, glassmorphism utilities, fonts, scrollbars).
3. `apps/web/src/styles/shell-navigation.css`: App shell & sidebar glassmorphism styling.
4. `apps/web/src/styles/chat-layout.css`: Modern timeline, composer, and message row styling.
5. `apps/web/src/components/AuthScreen.tsx`: Stunning hero login screen with animated ambient orbs.

## 4. Verification Plan

- `npm run typecheck`: Verify TypeScript code.
- `npm run docs:check`: Verify Markdown link validity.
- `node scripts/capture-ui-screenshots.mjs`: Capture updated screenshots for user review.
