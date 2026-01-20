# Penpot MCP Workflow Improvement Solution

**Date:** January 20, 2026  
**Based on:** penpot-component-design-session-report.md analysis

---

## Executive Summary

This document outlines solutions to address the common issues encountered during design sessions with the Penpot MCP. The solutions are designed to be **general enough to cover all types of designs** while specifically addressing the recurring problems identified in the component design session.

---

## Issues Analysis

From the design session reports, the following recurring issues were identified:

### 1. Container Sizing & Content Clipping
- Text gets cut off (e.g., "your acco" instead of "your account?")
- Elements extend beyond parent bounds
- Preview areas clip content unexpectedly

### 2. Flex Layout Configuration
- Wrong direction (row vs column) for element arrangement
- Items not aligned properly (labels next to circles instead of below)
- Incorrect gap values between elements

### 3. Element Positioning within Containers
- Toggle knobs appearing next to tracks instead of inside
- Connecting lines not aligned with circle centers
- Nested elements in wrong positions

### 4. Z-Order Problems
- Background elements covering content
- Text appearing behind shapes
- Elements not visible after creation

### 5. Structure & Hierarchy Issues
- Flat structures without proper grouping
- Missing intermediate containers for layout control
- Deep nesting beyond recommended levels

---

## Solution Architecture

### New Tools to Add

| Tool | Purpose | Auto-Fix |
|------|---------|----------|
| `fix_clipping` | Automatically fix content clipping issues | Yes |
| `suggest_layout` | Recommend optimal flex/grid configuration | N/A |
| `auto_size_container` | Resize containers to fit content | Yes |
| `verify_alignment` | Check flex alignment consistency | Yes |
| `analyze_structure` | Analyze hierarchy and suggest improvements | N/A |
| `create_component_skeleton` | Generate properly structured component templates | N/A |

### Enhanced Utilities

Add to `PenpotUtils`:
- `calculateContentBounds()` - Get actual bounds of all children
- `suggestFlexConfig()` - Recommend flex settings based on content
- `fitToContent()` - Resize container to fit children
- `verifyFlexAlignment()` - Check if flex items are properly aligned

---

## Detailed Solutions

### Solution 1: Fix Clipping Tool

**Problem:** `detect_clipping` only detects issues but doesn't fix them.

**Solution:** Create `FixClippingTool` that automatically resolves clipping issues.

```typescript
// Fix strategies:
// 1. EXPAND_PARENT - Increase parent size to fit children
// 2. REPOSITION_CHILD - Move child within parent bounds
// 3. RESIZE_CHILD - Shrink child to fit parent
// 4. ADD_FLEX_LAYOUT - Apply flex layout for auto-handling
```

### Solution 2: Layout Suggestion Tool

**Problem:** Users often apply wrong flex direction or alignment settings.

**Solution:** Create `SuggestLayoutTool` that analyzes children and recommends optimal configuration.

```typescript
// Analysis factors:
// 1. Children count and dimensions
// 2. Aspect ratios (horizontal vs vertical orientation)
// 3. Existing alignment patterns
// 4. Content types (text, images, shapes)
```

### Solution 3: Auto-Size Container Tool

**Problem:** Containers are often sized incorrectly, leading to clipping or excess whitespace.

**Solution:** Create `AutoSizeContainerTool` that calculates optimal size based on content.

```typescript
// Sizing modes:
// 1. FIT_CONTENT - Exact fit with optional padding
// 2. FIT_CONTENT_PLUS_MARGIN - Add safety margin
// 3. EXPAND_ONLY - Only increase size, never shrink
```

### Solution 4: Alignment Verification Tool

**Problem:** Flex items sometimes don't align as expected (e.g., labels beside circles instead of below).

**Solution:** Create `VerifyAlignmentTool` that checks alignment consistency.

```typescript
// Checks:
// 1. All flex items have consistent alignment
// 2. Items align to the expected axis
// 3. Nested flex containers have compatible settings
```

### Solution 5: Structure Analysis Tool

**Problem:** Designs often have suboptimal hierarchy or missing intermediate containers.

**Solution:** Create `AnalyzeStructureTool` that suggests hierarchy improvements.

```typescript
// Analysis:
// 1. Identify ungrouped related elements
// 2. Detect missing intermediate containers
// 3. Suggest component extraction for deep nesting
// 4. Recommend Board conversion for layout containers
```

### Solution 6: Component Skeleton Generator

**Problem:** Creating properly structured components from scratch is tedious and error-prone.

**Solution:** Create `CreateComponentSkeletonTool` that generates common component templates.

```typescript
// Templates:
// - card (header, body, footer with column flex)
// - input-field (label, input, error with column flex)
// - button-group (buttons with row flex)
// - stepper (steps with connecting lines)
// - modal (overlay, dialog with header/body/footer)
// - toast (icon, message, close with row flex)
```

---

## Implementation Plan

### Phase 1: Core Utilities (PenpotUtils Enhancements)

Add these utility functions to `PenpotUtils.ts`:

```typescript
/**
 * Calculates the actual bounding box that encompasses all children.
 */
public static calculateContentBounds(container: Shape): {
    x: number; y: number; width: number; height: number;
    overflow: { left: number; top: number; right: number; bottom: number; };
}

/**
 * Resizes a container to fit its children with optional padding.
 */
public static fitToContent(
    container: Shape, 
    options?: { padding?: number; minWidth?: number; minHeight?: number; }
): { oldSize: {w: number, h: number}; newSize: {w: number, h: number}; }

/**
 * Suggests optimal flex configuration based on children.
 */
public static suggestFlexConfig(container: Shape): {
    direction: 'row' | 'column';
    alignItems: string;
    justifyContent: string;
    gap: number;
    confidence: number;
    reasoning: string;
}

/**
 * Repositions all children to fit within container bounds.
 */
public static fitChildrenInContainer(container: Shape): number // returns count of repositioned children
```

### Phase 2: New Tools

1. **FixClippingTool** - Auto-fix clipping issues
2. **SuggestLayoutTool** - Recommend flex/grid configuration
3. **AutoSizeContainerTool** - Resize containers to fit content
4. **VerifyAlignmentTool** - Check flex alignment consistency

### Phase 3: Enhanced Validation

Update `ValidateDesignTool` to include:
- Auto-fix suggestions for each issue type
- Quick-fix commands that can be copy-pasted
- Integration with new tools

### Phase 4: Workflow Prompts Update

Update `prompts.yml` with:
- Pre-creation checklist
- Post-creation validation workflow
- Component-specific guidelines

---

## Workflow Integration

### Recommended Design Workflow

```
1. PLAN
   - Use `analyze_structure` to understand existing design
   - Use `suggest_layout` to get configuration recommendations

2. CREATE STRUCTURE
   - Use `create_component_skeleton` for common patterns
   - OR create containers with recommended flex settings

3. ADD CONTENT
   - Add backgrounds FIRST (z-order)
   - Add content elements
   - Add text elements LAST

4. VALIDATE & FIX
   - Run `validate_design` to detect all issues
   - Run `fix_z_order` with autoFix if z-order issues found
   - Run `fix_clipping` with autoFix if clipping issues found
   - Run `fix_spacing` with autoFix if spacing issues found

5. REFINE
   - Use `auto_size_container` to optimize container sizes
   - Use `audit_layer_names` to improve naming
   - Run `validate_design` again for final check
```

### Quick Fix Commands

For common issues, provide one-liner fixes:

```javascript
// Fix all z-order issues on page
penpotUtils.findShapes(s => 'children' in s && s.children?.length > 1, penpot.root)
    .forEach(c => penpotUtils.fixZOrder(c));

// Fit all containers to content
penpotUtils.findShapes(s => s.type === 'board', penpot.root)
    .forEach(c => penpotUtils.fitToContent(c, { padding: 16 }));

// Apply standard flex layout to all boards
penpotUtils.findShapes(s => s.type === 'board' && !s.flex && !s.grid, penpot.root)
    .forEach(board => {
        board.addFlexLayout();
        board.flex.dir = 'column';
        board.flex.rowGap = 16;
    });
```

---

## Component-Specific Guidelines

### Stepper Component

Structure:
```
Stepper Preview (row flex, align: center)
├── Step 1 (column flex, align: center)
│   ├── Circle
│   └── Label
├── Line Container (row flex, paddingTop for vertical centering)
│   └── Line
├── Step 2 (column flex, align: center)
│   ├── Circle
│   └── Label
└── ... more steps and lines
```

Key settings:
- Line container `paddingTop` = (circleHeight / 2) - (lineHeight / 2)
- Step container `alignItems = 'center'`
- Main container `alignItems = 'start'` to allow different heights

### Toggle Component

Structure:
```
Toggle Container (row flex, align: center)
├── Track (board with row flex, justify: end, rounded)
│   └── Knob (circle inside track)
└── Label
```

Key settings:
- Track uses `justifyContent = 'end'` for ON state, `'start'` for OFF
- Knob is INSIDE track container, not a sibling
- Track has rounded corners matching its height

### Modal Component

Structure:
```
Modal Dialog (column flex, no gap)
├── Header (row flex, space-between, padding)
│   ├── Title
│   └── Close Button
├── Body (padding, flex-grow)
│   └── Content
└── Footer (row flex, justify: end, gap, padding)
    ├── Cancel Button
    └── Confirm Button
```

Key settings:
- Dialog has `overflow: visible` if content might extend
- Footer uses `justifyContent = 'end'` for right-aligned buttons
- Header/Footer have border-radius matching their position

### Toast Component

Structure:
```
Toast (row flex, align: center, gap: 12, padding: 12-16)
├── Icon Container (centered board with icon)
├── Message Text (flex-grow)
└── Close Button
```

Key settings:
- Icon container is a fixed-size board with centered content
- Message uses `flex-grow` to take available space
- Consistent padding and gap values

---

## Validation Checklist

### Pre-Creation
- [ ] Plan component hierarchy on paper/mentally
- [ ] Identify which containers need flex vs manual positioning
- [ ] Determine flex direction for each container
- [ ] Note z-order requirements (backgrounds first)

### Post-Creation
- [ ] Run `validate_design` - all checks pass
- [ ] No clipping issues (or fixed)
- [ ] Z-order correct (backgrounds behind content)
- [ ] Spacing uses standard scale values
- [ ] All layers have descriptive names
- [ ] Export and visually verify appearance

### Before Handoff
- [ ] Convert reusable elements to Penpot components
- [ ] Document any non-standard patterns
- [ ] Verify on different screen sizes (if responsive)

---

## Implementation Priority

| Priority | Tool/Enhancement | Impact | Effort | Status |
|----------|------------------|--------|--------|--------|
| 1 | FixClippingTool | High | Medium | ✅ DONE |
| 2 | AutoSizeContainerTool | High | Low | ✅ DONE |
| 3 | PenpotUtils enhancements | High | Medium | ✅ DONE |
| 4 | SuggestLayoutTool | Medium | Medium | ✅ DONE |
| 5 | AnalyzeStructureTool | Medium | Medium | ✅ DONE |
| 6 | VerifyAlignmentTool | Medium | Low | Future |
| 7 | CreateComponentSkeletonTool | Medium | High | Future |

---

## Implementation Summary

### New Tools Created

1. **FixClippingTool** (`fix_clipping`)
   - Auto-fixes clipping issues with multiple strategies
   - Supports dry-run mode for previewing changes
   - Strategies: expand-parent, reposition-child, apply-flex, auto

2. **AutoSizeContainerTool** (`auto_size_container`)
   - Resizes containers to fit their content
   - Modes: fit, fit-expand-only, fit-shrink-only
   - Configurable padding and minimum size constraints

3. **SuggestLayoutTool** (`suggest_layout`)
   - Analyzes child positions and dimensions
   - Recommends flex direction, alignment, gap, padding
   - Can auto-apply recommended configuration

4. **AnalyzeStructureTool** (`analyze_structure`)
   - Provides structure health score
   - Detects deep nesting, missing layouts, flat structure
   - Shows hierarchy visualization
   - Gives specific recommendations

### PenpotUtils Enhancements

- `calculateContentBounds()` - Get bounds of all children
- `fitToContent()` - Resize container to fit children
- `nearestSpacing()` - Snap to spacing scale
- `suggestFlexConfig()` - Recommend flex settings

### Updated Files

- `workflow.yml` - Added 4 new tools
- `prompts.yml` - Enhanced workflow documentation
- `PenpotUtils.ts` - Added 4 new utility functions

---

## Conclusion

These improvements address the core issues identified in the design session:

1. **Clipping issues** → `fix_clipping` with auto-fix
2. **Layout misconfigurations** → `suggest_layout` + enhanced validation
3. **Container sizing** → `auto_size_container`
4. **Z-order problems** → Already covered by `fix_z_order`
5. **Structure issues** → `analyze_structure` + component skeletons

The solutions are designed to be:
- **General** - Work for any design type
- **Automated** - Reduce manual intervention
- **Preventive** - Catch issues before they become visible
- **Educational** - Provide guidance through suggestions

By implementing these tools and following the recommended workflow, future design sessions should be more efficient with fewer issues to fix manually.

---

## Quick Start Guide

### Fixing an Existing Design

```
Step 1: Analyze the structure
> Run: analyze_structure with target: "page"
> Review health score and issues

Step 2: Fix z-order if needed
> Run: fix_z_order with target: "page", autoFix: true

Step 3: Fix clipping issues
> Run: fix_clipping with target: "page", strategy: "auto"

Step 4: Optimize container sizes
> Run: auto_size_container with target: "page", mode: "fit", padding: 16

Step 5: Standardize spacing
> Run: fix_spacing with target: "page", autoFix: true

Step 6: Verify
> Run: validate_design with target: "page"
```

### Creating a New Component

```
Step 1: Create container
> Create a board with addFlexLayout()

Step 2: Get layout suggestions
> Run: suggest_layout with target: "selection", autoApply: true

Step 3: Add content (backgrounds first, then content, then text)

Step 4: Validate
> Run: validate_design with target: "selection"

Step 5: Fix any issues
> Run: fix_clipping if clipping detected
> Run: fix_z_order if z-order issues
```

### Example Usage in Code

```javascript
// After creating a complex component programmatically:

// 1. Fix z-order (backgrounds to back, text to front)
penpotUtils.findShapes(s => 'children' in s && s.children?.length > 1, myComponent)
    .forEach(c => penpotUtils.fixZOrder(c));

// 2. Fit containers to content
penpotUtils.fitToContent(myComponent, { padding: 16 });

// 3. Run validation
// Use validate_design tool to check for remaining issues
```

---

## Future Enhancements

1. **VerifyAlignmentTool** - Check flex item alignment consistency
2. **CreateComponentSkeletonTool** - Generate pre-structured templates for common UI patterns
3. **BatchFixTool** - Run all fixes in sequence with a single command
4. **DesignSystemTool** - Extract and enforce design tokens (colors, typography)
5. **ResponsiveCheckTool** - Verify designs work at different sizes
