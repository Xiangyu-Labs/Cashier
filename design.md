# Design - Cashier

Locked design system. Future UI work reads this file first and amends it intentionally.

## System

- Genre: modern-minimal
- App macrostructure: Workbench, with a compact navigation rail/header and dense ledger surface
- Tone: restrained, practical, trustworthy
- Audience: people recording and reviewing everyday transactions, often on a phone

## Theme

- Brand accent: `#10a37f`; use it for primary actions and focus, not decoration
- Danger: `#b24c5a`; warning: `#9a6b1f`; info: `#4f6f7a`; success: `#24836e`
- Dark-mode accent: `#69cdb3`; highlights: danger `#f0a5af`, warning `#e2b96f`, info `#a9c6cd`, success `#8cc6b7`
- Dark surfaces use a near-black neutral scale: background `#101112`, surface `#181a1b`, secondary surface `#202223`, raised surface `#2a2d2e`, border `#343839`
- Surfaces stay neutral; semantic colors appear only where state or action requires them, including toast feedback

## Typography

- Display and body: operating-system sans-serif stack, with platform-native Chinese fallbacks
- Mono: locally available JetBrains Mono, Fira Code, SF Mono fallback chain
- Do not bundle or remotely load web fonts
- Letter spacing: `0`; compact panel headings stay at normal UI scale

## Spacing And Shape

- Use the existing 4/8pt named scale in `tokens.css` and `src/app/globals.css`
- Information density: medium; controls remain at least 44px on touch screens
- Cards and desktop dialogs: radius at or below 8px; mobile long flows are square full-screen surfaces

## Motion

- Low motion: opacity and transform only, with 160-280ms state transitions
- No decorative motion; processing uses a CSS spinner
- Respect `prefers-reduced-motion` with near-instant state changes

## Components

- Keep functional Lucide icons for navigation, direction, search, date, visibility and commands
- Status uses text, a semantic dot, or a CSS spinner; empty and explanatory states use no decorative icon
- Filters stay bottom drawers on mobile; date pickers, calculators and confirmations stay compact dialogs
- Long workflows use `100dvh`, safe-area padding, fixed headers/footers and a scrollable body on mobile

## Content Rules

- Filtered ledger results show the amount without a `Filtered total` prefix
- Unfiltered results may show `Total` / `合计`
- Missing bill titles render the localized `Untitled Bill` / `未命名账单`

## Exports

- CSS variables: `tokens.css`
- Tailwind v4 and shadcn mappings: `src/app/globals.css`
- Primary: `#10a37f`; destructive: `#b24c5a`; warning: `#9a6b1f`; info: `#4f6f7a`; success: `#24836e`
