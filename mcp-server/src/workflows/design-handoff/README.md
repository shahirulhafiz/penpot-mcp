# Design Handoff Workflow

A complete design-to-code pipeline that extracts design specifications, detects component states, identifies external assets, and generates framework-specific implementation guides.

## Overview

This workflow solves common design-to-code friction points:

| Problem | Solution |
|---------|----------|
| Manual design exploration | `analyze_design_context` provides full hierarchy with semantics |
| Framework-specific token setup | `generate_design_tokens` outputs CSS, Tailwind v3/v4, SCSS, JSON |
| Missed visual states | `detect_component_states` finds selected, hover, disabled variants |
| Wrong icon implementation | `identify_external_assets` detects icon fonts with correct usage |
| Missing implementation context | `generate_implementation_guide` creates complete dev docs |

## Tools

### 1. analyze_design_context

**Purpose:** Understand the design before extraction.

```
analyze_design_context(target: "selection")
```

**Output:**
- Component hierarchy with semantic types (header, card, button)
- Layout patterns (flex, grid, none)
- Interactive elements detection
- Stored context for subsequent tools

### 2. generate_design_tokens

**Purpose:** Extract design tokens in multiple formats.

```
generate_design_tokens(target: "context", format: "all")
```

**Formats:**
- `css` - CSS custom properties
- `tailwind-v3` - Tailwind config object
- `tailwind-v4` - @theme directive with fallbacks
- `scss` - SCSS variables
- `json` - Raw token data
- `all` - All formats

**Features:**
- Color deduplication
- Semantic name inference (primary, success, warning)
- Usage tracking

### 3. detect_component_states

**Purpose:** Find visual variants within designs.

```
detect_component_states(target: "context")
```

**Detects:**
- Selected/active states
- Hover states
- Disabled states
- Status variants (approved, pending, draft)

### 4. identify_external_assets

**Purpose:** Find fonts, icons, and images.

```
identify_external_assets(target: "context")
```

**Output:**
- Web fonts with Google Fonts import URLs
- Icon font detection (Material Symbols, FontAwesome, Lucide)
- Image assets requiring handling
- Ready-to-use HTML imports

### 5. generate_implementation_guide

**Purpose:** Create comprehensive developer documentation.

```
generate_implementation_guide(framework: "vue")
```

**Frameworks:**
- `vue` - Vue 3 + Composition API
- `react` - React + TypeScript
- `angular` - Angular
- `svelte` - Svelte
- `html` - Plain HTML/CSS
- `generic` - Framework-agnostic

## Workflow Usage

### Full Handoff (Recommended)

Run all tools in sequence for complete documentation:

```
1. analyze_design_context(target: "selection")
2. generate_design_tokens(target: "context", format: "all")
3. detect_component_states(target: "context")
4. identify_external_assets(target: "context")
5. generate_implementation_guide(framework: "vue")
```

### Quick Token Extraction

For just design tokens:

```
generate_design_tokens(target: "selection", format: "tailwind-v4")
```

### State-Focused Analysis

For understanding interactive components:

```
analyze_design_context(target: "selection")
detect_component_states(target: "context")
```

## Context Sharing

Tools share data through the plugin's `storage.handoffContext` object:

```javascript
storage.handoffContext = {
    targetId: "...",
    targetName: "...",
    structure: { ... },    // From analyze_design_context
    tokens: { ... },       // From generate_design_tokens
    states: { ... },       // From detect_component_states
    assets: { ... }        // From identify_external_assets
};
```

Use `target: "context"` to reference stored data from previous tools.

## Key Features

### Tailwind v4 Compatibility

The workflow handles Tailwind v4's new `@theme` directive correctly:

```css
@import 'tailwindcss';

@theme {
  --color-primary: #8f4ad9;
}

/* Fallback utility classes */
:root {
  --color-primary: #8f4ad9;
}

.bg-primary { background-color: var(--color-primary); }
.text-primary { color: var(--color-primary); }
```

### Icon Font Detection

Automatically detects icon fonts from text content:

- Material Symbols: `chevron_left`, `home`, `settings`
- Font Awesome: `fa-user`, `fa-check`
- Lucide: `lucide-arrow-left`

### Semantic Type Inference

Infers component types from names:

- `header`, `nav-bar` → header
- `card`, `tile` → card
- `btn`, `button` → button
- `badge`, `status` → badge

## Configuration

Enable/disable in `mcp-server/data/workflows.yml`:

```yaml
workflows:
  design-handoff:
    enabled: true
```

Or via environment variable:

```bash
PENPOT_MCP_WORKFLOW_DESIGN_HANDOFF=true
```

## Example Output

### Design Tokens (CSS)

```css
:root {
  /* Colors */
  --color-primary: #8f4ad9;
  --color-success: #34c759;
  --color-warning: #ffcc00;
  --color-surface: #f8f8f8;
  --color-text: #141217;

  /* Spacing */
  --spacing-8: 8px;
  --spacing-16: 16px;
  --spacing-24: 24px;

  /* Border Radius */
  --radius-10: 10px;
  --radius-16: 16px;
}
```

### Component States

| State | Background | Border | Text |
|-------|------------|--------|------|
| default | #ffffff | none | #141217 |
| selected | #8f4ad9 | none | #ffffff |
| in-week | #ffffff | 2px #8f4ad9 | #8f4ad9 |

### HTML Imports

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
```

## Dependencies

This workflow requires the `core` workflow to be enabled (for `execute_code` functionality).
