# Penpot Design Best Practices Guide

A comprehensive guide for creating maintainable, consistent, and efficient designs using Penpot with AI assistance.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Common Design Issues](#common-design-issues)
3. [Layout Systems](#layout-systems)
4. [Component Organization](#component-organization)
5. [Naming Conventions](#naming-conventions)
6. [Design Workflow](#design-workflow)
7. [Quality Assurance Checklist](#quality-assurance-checklist)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## Introduction

This guide documents best practices for creating designs in Penpot, particularly when using AI-assisted workflows. Following these guidelines will help prevent common issues and create designs that are:

- **Maintainable** - Easy to update and modify
- **Consistent** - Uniform spacing, sizing, and styling
- **Scalable** - Can grow without restructuring
- **Accessible** - Properly organized layer hierarchy

---

## Common Design Issues

### 1. Content Clipping

**Description:** Text or elements get cut off at container boundaries.

**Symptoms:**
- Partial text visible
- Elements disappearing at edges
- Inconsistent display across similar components

**Causes:**
- Child elements positioned outside parent bounds
- Container size not accounting for content
- Missing overflow handling

**Prevention:**
- Use layout systems (flex/grid) instead of absolute positioning
- Size containers based on content + padding buffer
- Test with maximum expected content length
- Add safety margins from container edges

**Resolution:**
```
1. Check parent container dimensions
2. Verify child element positions are within bounds
3. Resize container or reposition children
4. Apply flex layout for automatic handling
```

---

### 2. Inconsistent Spacing

**Description:** Uneven gaps between similar elements.

**Symptoms:**
- Visual misalignment
- Different gaps in repeating patterns
- Unprofessional appearance

**Causes:**
- Manual positioning with estimated values
- Copy-paste without position adjustment
- No spacing system defined

**Prevention:**
- Define spacing scale before starting
- Use flex/grid gap properties
- Create reusable component patterns
- Use consistent measurement units

**Spacing Scale Example:**
```
xs:  4px   - Tight spacing (within components)
sm:  8px   - Small spacing (related elements)
md:  12px  - Medium spacing (component internal)
lg:  16px  - Large spacing (between components)
xl:  24px  - Extra large (section spacing)
xxl: 32px  - Maximum (major sections)
```

---

### 3. Ungrouped Elements

**Description:** Related elements scattered without logical grouping.

**Symptoms:**
- Cluttered layer panel
- Difficult to select related items
- Hard to move/duplicate components
- Inconsistent behavior when editing

**Causes:**
- Creating elements without planning hierarchy
- Forgetting to group after creation
- No naming convention

**Prevention:**
- Plan component hierarchy before building
- Create parent containers first, then children
- Group elements immediately after creation
- Use descriptive layer names

---

### 4. Inconsistent Component Styling

**Description:** Similar elements have different sizes, colors, or styles.

**Symptoms:**
- Visual inconsistency
- Different button sizes
- Varying border radius
- Mismatched colors

**Causes:**
- No design system defined
- Manual value entry for each element
- Copy-paste from different sources

**Prevention:**
- Define style constants before starting
- Use library components when possible
- Create and reuse style patterns
- Document all style decisions

---

### 5. Layout Drift

**Description:** Elements gradually shift out of alignment during editing.

**Symptoms:**
- Misaligned rows/columns
- Uneven margins
- Broken visual rhythm

**Causes:**
- Absolute positioning for flexible content
- Manual adjustments without reference
- No snap-to-grid or guides

**Prevention:**
- Use flex/grid layouts for alignment
- Enable snap-to-grid
- Use ruler guides for reference
- Lock finalized elements

---

## Layout Systems

### When to Use Flex Layout

Flex layout is ideal for:

| Use Case | Direction | Example |
|----------|-----------|---------|
| Navigation bars | Row | Logo + menu items + actions |
| Stats/metrics rows | Row | Multiple stat cards in a row |
| Form fields | Column | Label + input + helper text |
| Card content | Column | Image + title + description |
| Button groups | Row | Cancel + Submit buttons |
| Tag lists | Row | Multiple tags with wrapping |
| Sidebar lists | Column | Menu items stacked vertically |

### Flex Layout Configuration

**Horizontal Lists (Row):**
```
Direction: row
Column Gap: [consistent value]
Align Items: center (vertical alignment)
Justify Content: start | center | space-between | space-around
```

**Vertical Stacks (Column):**
```
Direction: column
Row Gap: [consistent value]
Align Items: start | center | stretch
Justify Content: start | center | space-between
```

### When to Use Grid Layout

Grid layout is ideal for:

- Dashboard layouts
- Card grids (product listings, galleries)
- Complex multi-column forms
- Calendar/table structures
- Magazine-style layouts

### When to Use Manual Positioning

Manual positioning is appropriate for:

- Decorative elements (backgrounds, illustrations)
- Overlapping elements (badges, notifications)
- Absolute positioned items (tooltips, modals)
- Single unique elements

---

## Component Organization

### Hierarchy Planning

Before creating any design, plan the component hierarchy:

```
Page Root
├── Header Section
│   ├── Logo Group
│   ├── Navigation Group
│   └── Actions Group
├── Main Content
│   ├── Sidebar (if applicable)
│   │   ├── Search/Filter
│   │   └── List Items
│   └── Content Area
│       ├── Content Header
│       └── Content Body
└── Footer Section (if applicable)
```

### Grouping Rules

1. **Functional Groups** - Elements that work together
   - Form: label + input + validation message
   - Card: image + title + description + actions

2. **Layout Groups** - Elements sharing layout behavior
   - Row of buttons
   - Column of menu items
   - Grid of cards

3. **Section Groups** - Major page divisions
   - Header
   - Main content
   - Sidebar
   - Footer

### Nesting Depth

Recommended maximum nesting: **4-5 levels**

```
Page
└── Section (Level 1)
    └── Component (Level 2)
        └── Element Group (Level 3)
            └── Individual Element (Level 4)
```

Deeper nesting indicates need for component extraction.

---

## Naming Conventions

### Layer Naming

| Element Type | Convention | Example |
|--------------|------------|---------|
| Containers/Groups | Title Case | `Header`, `Stats Bar`, `Main Content` |
| Components | Title Case | `Search Input`, `User Card`, `Nav Item` |
| Elements | Title Case | `Submit Button`, `Profile Image` |
| Variants | Base + Variant | `Button Primary`, `Button Secondary` |

### Naming Patterns

**Descriptive Names:**
```
Good: "Primary Action Button"
Bad:  "Rectangle 47"

Good: "User Avatar Image"
Bad:  "Ellipse 12"

Good: "Search Input Field"
Bad:  "Frame 234"
```

**Hierarchical Names (for related items):**
```
Stats Bar
├── Total Clauses
├── Impact Clauses
├── Mapped Items
└── Coverage
```

---

## Design Workflow

### Phase 1: Planning

- [ ] Define design requirements
- [ ] Identify repeating patterns
- [ ] Plan component hierarchy
- [ ] Choose layout system (flex/grid/manual)
- [ ] Define spacing scale
- [ ] Define color palette
- [ ] Define typography scale

### Phase 2: Structure

- [ ] Create main frame/artboard
- [ ] Create major section containers
- [ ] Apply layout systems to containers
- [ ] Verify container dimensions

### Phase 3: Content

- [ ] Add content elements (text, images, shapes)
- [ ] Group related elements immediately
- [ ] Name layers as you create them
- [ ] Apply consistent styling

### Phase 4: Refinement

- [ ] Verify all spacing is consistent
- [ ] Check all text is visible (no clipping)
- [ ] Ensure alignment is correct
- [ ] Test with edge case content

### Phase 5: Quality Check

- [ ] Review layer organization
- [ ] Verify naming conventions
- [ ] Check responsive behavior (if applicable)
- [ ] Document any design decisions

---

## Quality Assurance Checklist

### Visual Consistency

- [ ] All similar elements have same dimensions
- [ ] Spacing is consistent throughout
- [ ] Colors match design system
- [ ] Typography is consistent
- [ ] Border radius is uniform
- [ ] Shadows/effects are consistent

### Content Visibility

- [ ] All text is fully visible
- [ ] No elements clipped at edges
- [ ] Icons are properly sized
- [ ] Images maintain aspect ratio

### Layer Organization

- [ ] All layers are named descriptively
- [ ] Related elements are grouped
- [ ] Hierarchy is logical (max 4-5 levels)
- [ ] No orphan elements at root

### Layout Integrity

- [ ] Flex/grid layouts applied where appropriate
- [ ] Spacing uses consistent scale values
- [ ] Alignment is correct (left/center/right)
- [ ] Elements respond correctly to content changes

### Accessibility

- [ ] Sufficient color contrast
- [ ] Text is readable size (min 12px)
- [ ] Interactive areas are adequate size (min 44px)
- [ ] Logical reading order

---

## Troubleshooting Guide

### Issue: Elements Not Aligning

**Check:**
1. Is flex/grid layout enabled on parent?
2. Are alignment settings correct?
3. Are there conflicting manual positions?

**Fix:**
- Enable layout system on parent container
- Set `alignItems` and `justifyContent`
- Remove manual position overrides

---

### Issue: Inconsistent Gaps

**Check:**
1. Is gap property set on layout container?
2. Are there extra margin/padding values?
3. Is the same gap value used consistently?

**Fix:**
- Set `rowGap` and `columnGap` on flex/grid container
- Remove individual margin values
- Use spacing scale values

---

### Issue: Content Overflow

**Check:**
1. Is container sized correctly?
2. Is content within expected length?
3. Is there padding/margin eating space?

**Fix:**
- Resize container to fit content
- Add flex layout for auto-sizing
- Reduce padding if needed

---

### Issue: Elements Disappearing

**Check:**
1. Is element position within parent bounds?
2. Is element visibility toggled off?
3. Is element behind another element (z-order)?

**Fix:**
- Reposition element within container
- Check visibility property
- Adjust z-order (bring to front)

---

### Issue: Layout Breaking on Edit

**Check:**
1. Is layout system properly configured?
2. Are child elements properly contained?
3. Are there locked/fixed size elements?

**Fix:**
- Verify flex/grid settings
- Ensure all children are inside container
- Allow flexible sizing where needed

---

## Summary

### Key Principles

1. **Plan Before Building** - Define hierarchy and patterns first
2. **Use Layout Systems** - Flex for lists, Grid for 2D layouts
3. **Group Immediately** - Organize as you create
4. **Name Everything** - Descriptive names save time later
5. **Be Consistent** - Use spacing/sizing scales
6. **Test Edge Cases** - Long text, empty states, many items

### Quick Reference

| Task | Solution |
|------|----------|
| Horizontal list | Flex row + columnGap |
| Vertical stack | Flex column + rowGap |
| Even spacing | Flex with justify: space-between |
| Centered items | alignItems: center |
| Card grid | Grid layout with columns |
| Text clipping | Increase container width |
| Misalignment | Enable flex layout |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-19 | Initial document |

---

*This guide is maintained as part of the Penpot MCP project documentation.*
