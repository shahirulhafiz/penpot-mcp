# Design Quality Workflow

A comprehensive design quality assurance workflow for Penpot MCP that enforces best practices and automates common design validations.

## Overview

The Design Quality workflow integrates the [Penpot Design Best Practices Guide](../../../../docs/report/penpot-design-best-practices.md) directly into the MCP tooling, providing automated detection and correction of common design issues.

## Features

- **Comprehensive Validation** - Multi-category QA checks
- **Content Clipping Detection** - Find elements outside parent bounds
- **Spacing Standardization** - Enforce consistent spacing scales
- **Layer Name Auditing** - Detect and fix poor naming
- **Spacing Scale Application** - Quick preset application

## Tools

### 1. `validate_design`

Runs comprehensive design quality checks covering all aspects.

**Parameters:**
- `target`: "selection" | "page" | shape ID
- `checks`: Optional array of check types (default: all)

**Check Categories:**
- `visual-consistency` - Same dimensions, consistent colors
- `content-visibility` - Clipping detection, text visibility
- `layer-organization` - Naming, grouping, hierarchy depth
- `layout-integrity` - Flex/grid usage, spacing scale
- `accessibility` - Text size, touch targets, contrast

**Example:**
```typescript
// Validate entire page
validate_design({ target: "page" })

// Validate only clipping and naming
validate_design({ 
  target: "selection",
  checks: ["content-visibility", "layer-organization"]
})
```

### 2. `detect_clipping`

Focused tool for finding content overflow issues.

**Parameters:**
- `target`: "selection" | "page" | shape ID

**Returns:** Detailed information about elements extending beyond parent bounds, grouped by severity (critical, major, moderate, minor).

**Example:**
```typescript
detect_clipping({ target: "page" })
```

### 3. `fix_spacing`

Detects and optionally fixes inconsistent spacing values.

**Parameters:**
- `target`: "selection" | "page" | shape ID
- `spacingScale`: Optional custom scale (default: [4, 8, 12, 16, 24, 32])
- `autoFix`: Boolean - if true, snaps gaps to nearest scale value

**Example:**
```typescript
// Detect only
fix_spacing({ target: "page" })

// Detect and auto-fix
fix_spacing({ target: "page", autoFix: true })
```

### 4. `audit_layer_names`

Checks layer naming against conventions and suggests improvements.

**Parameters:**
- `target`: "selection" | "page" | shape ID
- `autoRename`: Boolean - if true, applies suggested renames

**Example:**
```typescript
// Audit only
audit_layer_names({ target: "page" })

// Audit and auto-rename
audit_layer_names({ target: "page", autoRename: true })
```

### 5. `apply_spacing_scale`

Applies consistent spacing preset to a container.

**Parameters:**
- `target`: Shape ID or "selection"
- `preset`: "compact" | "default" | "spacious"
- `gap`: Custom gap value (alternative to preset)
- `padding`: Custom padding value (alternative to preset)

**Presets:**
- **compact**: 8px gap, 16px padding
- **default**: 16px gap, 24px padding
- **spacious**: 24px gap, 32px padding

**Example:**
```typescript
// Apply default preset
apply_spacing_scale({ 
  target: "selection",
  preset: "default"
})

// Apply custom values
apply_spacing_scale({
  target: "selection",
  gap: 20,
  padding: 28
})
```

## Standard Spacing Scale

The workflow enforces this spacing scale:

| Name | Value | Use Case |
|------|-------|----------|
| xs   | 4px   | Tight spacing (within components) |
| sm   | 8px   | Small spacing (related elements) |
| md   | 12px  | Medium spacing (component internal) |
| lg   | 16px  | Large spacing (between components) |
| xl   | 24px  | Extra large (section spacing) |
| xxl  | 32px  | Maximum (major sections) |

## Recommended Workflow

1. **Plan** - Define hierarchy and spacing before creating
2. **Structure** - Create containers with flex/grid layouts
3. **Content** - Add elements and group immediately
4. **Name** - Use descriptive names as you create
5. **Validate** - Run `validate_design` to catch issues
6. **Refine** - Use `fix_spacing`, `audit_layer_names` as needed
7. **Final Check** - Run `validate_design` one more time

## Common Use Cases

### After Creating a New Component

```typescript
// Validate the new component
validate_design({ target: "selection" })
```

### Cleaning Up an Existing Design

```typescript
// 1. Get overview of issues
validate_design({ target: "page" })

// 2. Fix spacing issues
fix_spacing({ target: "page", autoFix: true })

// 3. Fix naming issues
audit_layer_names({ target: "page", autoRename: true })

// 4. Verify fixes
validate_design({ target: "page" })
```

### Standardizing a Container

```typescript
// Apply spacious preset to a selected container
apply_spacing_scale({
  target: "selection",
  preset: "spacious"
})
```

## Quality Checklist

Before finalizing any design:

- ✅ All elements within parent bounds (no clipping)
- ✅ Spacing uses standard scale values
- ✅ All layers have descriptive names
- ✅ Containers use flex/grid layouts
- ✅ Text is at least 12px
- ✅ Interactive elements are at least 44x44px
- ✅ Hierarchy depth is 5 levels or less

## Integration

This workflow is automatically enabled and integrated with the core workflow. The validation tools will be available as soon as the MCP server starts.

## Configuration

Enable/disable in `mcp-server/data/workflows.yml`:

```yaml
workflows:
  design-quality:
    enabled: true
```

Or via environment variable:

```bash
PENPOT_MCP_WORKFLOW_DESIGN_QUALITY=true
```

## Related Documentation

- [Penpot Design Best Practices Guide](../../../../docs/report/penpot-design-best-practices.md)
- [Creating Custom Workflows Guide](../../../../docs/workflows/Creating-Custom-Workflows-Guide.md)
- [Core Workflow](../core/workflow.yml)

## Version

1.0.0 - Initial release

## License

MPL-2.0
