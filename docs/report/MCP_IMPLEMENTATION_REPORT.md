# MCP Implementation Report

## Timesheet UI - Penpot Design to Vue 3 Implementation

**Date:** January 20, 2026  
**Project:** Timesheet Application  
**Framework:** Vue 3 + Vite + TailwindCSS v4

---

## 1. Overview

This document details the process of implementing a UI design from Penpot into a Vue 3 application using MCP (Model Context Protocol) tools, including the issues encountered and their resolutions.

---

## 2. MCP Tools Used

### 2.1 Penpot MCP Tools

The following Penpot MCP tools were utilized to extract design specifications:

| Tool | Purpose |
|------|---------|
| `penpot-execute_code` | Execute JavaScript to explore the Penpot design structure |
| `penpot-export_shape` | Export visual preview of design elements as PNG |
| `penpot-extract_design_specs` | Extract CSS properties from design elements |

### 2.2 Browser Extension MCP Tools

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Navigate to localhost development server |
| `browser_resize` | Resize viewport to match mobile design (430x950) |
| `browser_take_screenshot` | Capture screenshots for visual comparison |
| `browser_console_messages` | Check for JavaScript errors |

---

## 3. Issues Encountered

### 3.1 Issue #1: Design Structure Extraction

**Problem:**  
Initially needed to understand the hierarchical structure of the Penpot design to properly map components.

**Details:**  
The Penpot design "Timesheet - Monthly Summary" contained nested elements including:
- Main board (430x950px)
- Calendar Grid with 35+ day cells
- Week cards with status badges
- Navigation bar with flex layout

**Resolution:**  
Used `penpotUtils.shapeStructure()` with depth parameter to get a comprehensive view:

```javascript
const structure = penpotUtils.shapeStructure(penpot.root, 4);
return { currentPage: penpot.currentPage?.name, structure };
```

This provided the complete hierarchy including layout information (flex/grid) for each container.

---

### 3.2 Issue #2: TailwindCSS v4 Theme Configuration

**Problem:**  
After implementing the UI, the browser displayed a blank white page. No styles were being applied.

**Details:**  
- TailwindCSS v4 uses a new `@theme` directive for custom design tokens
- The initial implementation used `@theme` block but styles weren't rendering
- Custom color classes like `bg-primary`, `text-text-primary` were not working

**Initial (Non-working) Configuration:**

```css
@import 'tailwindcss';

@theme {
  --color-primary: #8f4ad9;
  --color-light-purple: #d9c7ff;
  /* ... more variables */
}
```

**Resolution:**  
Added explicit CSS custom property definitions in `:root` selector AND created manual utility classes:

```css
@import 'tailwindcss';

@theme {
  --color-primary: #8f4ad9;
  /* ... theme variables */
}

:root {
  --color-primary: #8f4ad9;
  --color-light-purple: #d9c7ff;
  /* ... duplicate for CSS fallback */
}

/* Manual utility classes */
.bg-primary { background-color: var(--color-primary); }
.bg-light-purple { background-color: var(--color-light-purple); }
.text-primary { color: var(--color-primary); }
/* ... more utilities */
```

**Root Cause:**  
TailwindCSS v4's `@theme` directive generates CSS custom properties, but the utility class generation may not work seamlessly with all custom color names in the current version.

---

### 3.3 Issue #3: PowerShell Command Syntax

**Problem:**  
Shell commands using `&&` operator failed in PowerShell.

**Error Message:**
```
The token '&&' is not a valid statement separator in this version.
```

**Resolution:**  
Used the `working_directory` parameter instead of chaining commands:

```javascript
// Instead of:
cd "path" && npm install

// Used:
Shell({ command: "npm install", working_directory: "E:\\workspace\\playground\\timesheet" })
```

---

### 3.4 Issue #4: Calendar Week Highlighting

**Problem:**  
The selected week (Week 3: days 13-19) needed special highlighting with purple border while the selected day (16) needed filled purple background.

**Details:**  
The Penpot design showed:
- Day 16: Purple background (#8f4ad9), white text
- Days 13-15, 17-19: White background with purple border

**Resolution:**  
Created specific CSS classes and conditional logic:

```typescript
function getDayClasses(day) {
  if (isSelected(day.day, day.isCurrentMonth)) {
    return `${base} selected-day`  // Purple fill
  }
  if (isInSelectedWeek(day.day, day.isCurrentMonth)) {
    return `${base} week-highlight`  // Purple border only
  }
  // ... other conditions
}
```

```css
.selected-day {
  background-color: var(--color-primary);
  color: white;
  box-shadow: 0 4px 6px -1px rgba(143, 74, 217, 0.3);
}

.week-highlight {
  background-color: white;
  border: 2px solid var(--color-primary);
}
```

---

### 3.5 Issue #5: Material Icons Not Rendering as Icons

**Problem:**  
Chevron navigation showed text "chevron_left" instead of the actual icon.

**Initial Implementation:**
```html
<span class="material-symbols-outlined">&lt;</span>
```

**Resolution:**  
Used proper Material Symbols icon names:

```html
<span class="material-symbols-outlined">chevron_left</span>
<span class="material-symbols-outlined">chevron_right</span>
```

Also ensured the Google Fonts link was included in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
```

---

## 4. Design Token Extraction

The following design tokens were extracted from Penpot using `extract_design_specs`:

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#8f4ad9` | Selected day, active card border, History icon |
| Light Purple | `#d9c7ff` | Multi-Day Entry button |
| Status Approved | `#34c759` | Approved badge |
| Status Submitted | `#ffcc00` | Submitted badge |
| Status Draft | `#a2a2a2` | Draft badge |
| Card BG | `#f8f8f8` | Inactive week cards |
| Calendar BG | `#fafafa` | Calendar container |
| Text Primary | `#141217` | Main text |
| Text Secondary | `#6b7280` | Secondary text |
| Text Muted | `#9ca3af` | Muted text, day headers |

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| Card | `16px` | Week cards, buttons |
| Calendar | `24px` | Calendar container |
| Badge | `14px` | Status badges |
| Cell | `10px` | Day cells |

### Typography
| Element | Font | Size | Weight |
|---------|------|------|--------|
| Title | Source Sans 3 | 32px | 700 |
| Month Title | Source Sans 3 | 20px | 700 |
| Section Title | Source Sans 3 | 12px | 700 |
| Day Header | Source Sans 3 | 10px | 700 |
| Day Number | Source Sans 3 | 14px | 400/500 |

---

## 5. Final Component Architecture

```
src/
├── components/
│   ├── StatusBadge.vue      # Reusable status indicator
│   ├── WeekCard.vue         # Weekly summary card
│   ├── CalendarGrid.vue     # Interactive month calendar
│   └── BottomNavBar.vue     # Fixed bottom navigation
├── views/
│   └── MonthlySummaryView.vue
├── router/index.ts
├── style.css
├── main.ts
└── App.vue
```

---

## 6. Lessons Learned

1. **TailwindCSS v4 Migration:** The new `@theme` directive requires careful testing; fallback CSS custom properties and manual utility classes may be needed.

2. **Shell Compatibility:** When working across different operating systems, use tool-specific parameters (like `working_directory`) rather than shell-specific operators.

3. **MCP Tool Efficiency:** Using `penpotUtils` helper functions significantly speeds up design exploration compared to manual traversal.

4. **Visual Verification:** Always use screenshot tools to verify actual rendering, as DOM structure alone doesn't guarantee correct visual output.

5. **Incremental Development:** Build and test components individually before integrating, making it easier to identify styling issues.

---

## 7. Recommendations for Future Projects

1. **Pre-flight Check:** Before starting implementation, run `penpotUtils.shapeStructure()` with appropriate depth to understand the full design hierarchy.

2. **Token Documentation:** Extract and document all design tokens early using `extract_design_specs` to ensure consistency.

3. **CSS Strategy:** For TailwindCSS v4 projects, consider defining both `@theme` variables and explicit utility classes until the framework matures.

4. **Browser Testing:** Use browser MCP tools early and often to catch rendering issues before they compound.

---

## 8. Conclusion

The implementation was successful, with the final UI closely matching the Penpot design. The main challenges were related to TailwindCSS v4's new configuration system and ensuring proper font/icon loading. The MCP tools, particularly the Penpot integration, significantly accelerated the design-to-code process by providing direct access to design specifications and structure.

**Final Result:** A fully functional Vue 3 timesheet application with:
- Interactive calendar with week selection
- Status-coded weekly detail cards
- Responsive bottom navigation
- Design-accurate color scheme and typography
