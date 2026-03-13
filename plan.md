# UI Redesign Plan — Professional Dark Theme with Gradient Accents

## Overview
Transform the entire UI from basic Ant Design dark mode into a polished, visually rich dark theme with gradient accents, glowing effects, colored backgrounds per tab section, and consistent professional styling.

## Design System — Color Palette

### Core Colors
- **Background (deepest):** `#06090f` (near-black blue)
- **Surface:** `#0c1121` (dark navy)
- **Card surface:** `#111827` (slightly lighter navy)
- **Card hover:** `#1a2332` (subtle lift)
- **Border:** `#1e293b` (slate border)
- **Text primary:** `#f1f5f9`
- **Text secondary:** `#94a3b8`
- **Text muted:** `#64748b`

### Accent Gradient
- **Primary gradient:** `linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)` (indigo → violet → purple)
- **Success gradient:** `linear-gradient(135deg, #10b981, #34d399)` (emerald)
- **Danger gradient:** `linear-gradient(135deg, #ef4444, #f87171)` (red)
- **Info gradient:** `linear-gradient(135deg, #3b82f6, #60a5fa)` (blue)
- **Warning:** `#f59e0b` (amber)

### Status Colors
- Passed: `#10b981`
- Failed: `#ef4444`
- Running: `#6366f1`
- Queued: `#f59e0b`
- Error: `#f87171`

## Files to Modify

### 1. `src/theme.ts` (NEW FILE)
Create a centralized theme tokens file with all colors, gradients, and shared styles.

### 2. `src/index.css` (NEW FILE)
Global CSS for:
- Body/HTML background
- Custom scrollbar styling (dark)
- Ant Design overrides (tab bar glow, card borders, table rows)
- Gradient text utility class
- Card glow/hover effects
- Smooth transitions

### 3. `src/main.tsx`
- Import `index.css`

### 4. `src/App.tsx`
- Use custom theme tokens in ConfigProvider
- Gradient header bar with logo glow
- Styled tab bar with colored active indicators
- Subtle background pattern/gradient on main content area
- Version badge styled as a pill

### 5. `src/components/Dashboard.tsx`
- Stat cards with gradient top border + icon glow
- Pie chart with improved colors from new palette
- Execution history table with row status stripe (left colored border per status)
- Better card headers with subtle gradients

### 6. `src/components/AIPhaseTab.tsx`
- LLM provider toggle with gradient active state
- Upload card with dashed border hover effect
- Test case table with selection highlight color
- Monaco editor with themed border glow when generating
- Progress bar with gradient from design system
- Batch results with colored status dots

### 7. `src/components/RunTab.tsx`
- Spec file selector with icon accents
- Execution params cards with subtle section backgrounds
- Live logs terminal with improved styling (gradient top border, glow on active)
- Run button with gradient background
- Execution history with status stripe

## Visual Changes Summary

| Element | Before | After |
|---------|--------|-------|
| Background | Flat `#0d0d0d` | Deep navy gradient `#06090f` → `#0c1121` |
| Header | Flat `#141414` | Glass effect with gradient accent line |
| Tab bar | Default Ant Design | Glowing active tab indicator |
| Cards | Default dark cards | Navy cards with `#1e293b` borders + subtle hover lift |
| Stat cards | Plain numbers | Gradient top stripe + glowing icons |
| Buttons | Default Ant primary blue | Gradient purple primary button |
| Tables | Default dark table | Row hover effect + status left-border stripe |
| Log terminal | `#0d1117` flat | Gradient header + subtle glow when active |
| Run button | Default primary | Purple-indigo gradient with glow on hover |
| Status tags | Basic colors | Matching new palette colors |

## Implementation Order
1. Create `theme.ts` with all tokens
2. Create `index.css` with global styles
3. Update `main.tsx` to import CSS
4. Restyle `App.tsx` (header + tabs + layout)
5. Restyle `Dashboard.tsx`
6. Restyle `AIPhaseTab.tsx`
7. Restyle `RunTab.tsx`
