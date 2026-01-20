# Penpot Design-to-Code Synchronization Solution

**Date:** January 20, 2026  
**Based on:** penpot-stepper-fix-report.md analysis

---

## Executive Summary

This document outlines solutions to address design-to-code synchronization issues - ensuring that code implementations accurately match Penpot design specifications. The solutions are designed to automate the extraction, comparison, and generation of design specs.

---

## Issues Analysis

From the stepper fix report, the following discrepancy patterns were identified:

### 1. Property Value Mismatches
- Line height: 4px (code) vs 2px (design)
- Colors: #e5e7eb (code) vs #d4d4d4 (design)
- Padding/margins: 18px (code) vs 19px (design)

### 2. Structural Differences
- Code used `margin-top` on line element
- Design used container with `padding-top` for alignment
- Missing intermediate containers in code

### 3. State Styling Mismatches
- Current circle: light green bg (code) vs white bg (design)
- Label colors: different states had wrong colors

### 4. Manual Extraction Problems
- Time-consuming to extract specs from Penpot
- Easy to miss subtle differences
- No automated way to compare

---

## Solution Architecture

### New Tools to Add

| Tool | Purpose | Output |
|------|---------|--------|
| `extract_design_specs` | Extract detailed specs from any shape | JSON/YAML/CSS |
| `generate_css_variables` | Generate CSS custom properties | CSS file |
| `generate_component_spec` | Generate component specification | Markdown/JSON |
| `compare_styles` | Compare two shapes for differences | Diff report |
| `export_design_tokens` | Export colors, typography, spacing | Design tokens JSON |

---

## Detailed Solutions

### Solution 1: Extract Design Specs Tool

**Problem:** Manually inspecting design properties is tedious and error-prone.

**Solution:** Create `ExtractDesignSpecsTool` that outputs structured specs.

```typescript
// Output formats:
// 1. JSON - For programmatic use
// 2. CSS - For direct styling
// 3. YAML - For documentation
// 4. Markdown - For handoff documents
```

### Solution 2: Generate CSS Variables Tool

**Problem:** Translating Penpot values to CSS manually leads to errors.

**Solution:** Create `GenerateCssVariablesTool` that auto-generates CSS.

```css
/* Example output */
:root {
  /* Stepper - Line */
  --stepper-line-height: 2px;
  --stepper-line-color-completed: #22c55e;
  --stepper-line-color-incomplete: #d4d4d4;
  
  /* Stepper - Circle */
  --stepper-circle-size: 40px;
  --stepper-circle-completed-bg: #22c55e;
  --stepper-circle-current-bg: #ffffff;
  --stepper-circle-current-border: 2px solid #22c55e;
}
```

### Solution 3: Generate Component Spec Tool

**Problem:** No standardized way to document component specs from designs.

**Solution:** Create `GenerateComponentSpecTool` for handoff documentation.

### Solution 4: Compare Styles Tool

**Problem:** No way to detect differences between design and implementation.

**Solution:** Create `CompareStylesTool` that compares two shapes or specs.

### Solution 5: Export Design Tokens Tool

**Problem:** Design systems need centralized tokens for colors, spacing, typography.

**Solution:** Create `ExportDesignTokensTool` that extracts all tokens.

---

## Implementation Plan

### Phase 1: Core Extraction Tools

1. **ExtractDesignSpecsTool** - Extract detailed specs
2. **GenerateCssVariablesTool** - Generate CSS custom properties

### Phase 2: Documentation Tools

3. **GenerateComponentSpecTool** - Generate component documentation
4. **CompareStylesTool** - Compare design vs implementation

### Phase 3: Design System Tools

5. **ExportDesignTokensTool** - Export centralized design tokens

---

## Implementation Priority

| Priority | Tool/Enhancement | Impact | Effort | Status |
|----------|------------------|--------|--------|--------|
| 1 | ExtractDesignSpecsTool | High | Medium | ✅ DONE |
| 2 | GenerateCssVariablesTool | High | Low | ✅ DONE |
| 3 | GenerateComponentSpecTool | Medium | Medium | ✅ DONE |
| 4 | CompareStylesTool | Medium | Medium | Future |
| 5 | ExportDesignTokensTool | Medium | High | Future |

---

## Implementation Summary

### New Tools Created

1. **ExtractDesignSpecsTool** (`extract_design_specs`)
   - Extracts detailed specs from any shape
   - Outputs: JSON, CSS, or Markdown format
   - Includes dimensions, colors, typography, layout
   - Recursive child extraction option

2. **GenerateCssVariablesTool** (`generate_css_variables`)
   - Generates CSS custom properties from design
   - Semantic variable naming with prefix
   - Groups by element or property type
   - Includes usage examples

3. **GenerateComponentSpecTool** (`generate_component_spec`)
   - Creates comprehensive handoff documentation
   - Structure tree visualization
   - Color palette extraction
   - Typography catalog
   - State detection (hover, active, disabled, etc.)
   - Implementation recommendations

### Updated Files

- `workflow.yml` - Added 3 new design-to-code tools
- `prompts.yml` - Added design-to-code documentation section

---

## Quick Start Guide

### Extracting Specs from a Design

```
Step 1: Select the component in Penpot
> Click on the component (e.g., BaseStepper Preview)

Step 2: Extract specs
> Run: extract_design_specs with target: "selection", format: "json"

Step 3: Review the output
> JSON with all dimensions, colors, spacing, typography
```

### Generating CSS for a Component

```
Step 1: Select the component
> Click on the component

Step 2: Generate CSS variables
> Run: generate_css_variables with target: "selection", prefix: "stepper"

Step 3: Copy to your CSS file
> Use the generated :root variables in your styles
```

### Creating Component Documentation

```
Step 1: Select the component
> Click on the component

Step 2: Generate spec document
> Run: generate_component_spec with target: "selection"

Step 3: Use for developer handoff
> Markdown document with all specs and structure
```

---

## Future Enhancements

1. **CompareStylesTool** - Compare Penpot design vs browser screenshot
2. **ExportDesignTokensTool** - Generate design-tokens.json
3. **SyncWatcherTool** - Watch for design changes and alert on differences
4. **CodeGenTool** - Generate component boilerplate from design
