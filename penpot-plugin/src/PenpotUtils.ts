import { Fill, FlexLayout, GridLayout, Page, Rectangle, Shape } from "@penpot/plugin-types";

export class PenpotUtils {
    /**
     * Generates an overview structure of the given shape,
     * providing its id, name and type, and recursively its children's attributes.
     * The `type` field indicates the type in the Penpot API.
     * If the shape has a layout system (flex or grid), includes layout information.
     *
     * @param shape - The root shape to generate the structure from
     * @param maxDepth - Optional maximum depth to traverse (leave undefined for unlimited)
     * @returns An object representing the shape structure
     */
    public static shapeStructure(shape: Shape, maxDepth: number | undefined = undefined): object {
        let children = undefined;
        if (maxDepth === undefined || maxDepth > 0) {
            if ("children" in shape && shape.children) {
                children = shape.children.map((child) =>
                    this.shapeStructure(child, maxDepth === undefined ? undefined : maxDepth - 1)
                );
            }
        }

        const result: any = {
            id: shape.id,
            name: shape.name,
            type: shape.type,
            children: children,
        };

        // add layout information if present
        if ("flex" in shape && shape.flex) {
            const flex: FlexLayout = shape.flex;
            result.layout = {
                type: "flex",
                dir: flex.dir,
                rowGap: flex.rowGap,
                columnGap: flex.columnGap,
            };
        } else if ("grid" in shape && shape.grid) {
            const grid: GridLayout = shape.grid;
            result.layout = {
                type: "grid",
                rows: grid.rows,
                columns: grid.columns,
                rowGap: grid.rowGap,
                columnGap: grid.columnGap,
            };
        }

        return result;
    }

    /**
     * Finds all shapes that matches the given predicate in the given shape tree.
     *
     * @param predicate - A function that takes a shape and returns true if it matches the criteria
     * @param root - The root shape to start the search from (defaults to penpot.root)
     */
    public static findShapes(predicate: (shape: Shape) => boolean, root: Shape | null = penpot.root): Shape[] {
        let result = new Array<Shape>();

        let find = function (shape: Shape | null) {
            if (!shape) {
                return;
            }
            if (predicate(shape)) {
                result.push(shape);
            }
            if ("children" in shape && shape.children) {
                for (let child of shape.children) {
                    find(child);
                }
            }
        };

        find(root);
        return result;
    }

    /**
     * Finds the first shape that matches the given predicate in the given shape tree.
     *
     * @param predicate - A function that takes a shape and returns true if it matches the criteria
     * @param root - The root shape to start the search from (if null, searches all pages)
     */
    public static findShape(predicate: (shape: Shape) => boolean, root: Shape | null = null): Shape | null {
        let find = function (shape: Shape | null): Shape | null {
            if (!shape) {
                return null;
            }
            if (predicate(shape)) {
                return shape;
            }
            if ("children" in shape && shape.children) {
                for (let child of shape.children) {
                    let result = find(child);
                    if (result) {
                        return result;
                    }
                }
            }
            return null;
        };

        if (root === null) {
            const pages = penpot.currentFile?.pages;
            if (pages) {
                for (let page of pages) {
                    let result = find(page.root);
                    if (result) {
                        return result;
                    }
                }
            }
            return null;
        } else {
            return find(root);
        }
    }

    /**
     * Finds a shape by its unique ID.
     *
     * @param id - The unique ID of the shape to find
     * @returns The shape with the matching ID, or null if not found
     */
    public static findShapeById(id: string): Shape | null {
        return this.findShape((shape) => shape.id === id);
    }

    public static findPage(predicate: (page: Page) => boolean): Page | null {
        let page = penpot.currentFile!.pages.find(predicate);
        return page || null;
    }

    public static getPages(): { id: string; name: string }[] {
        return penpot.currentFile!.pages.map((page) => ({ id: page.id, name: page.name }));
    }

    public static getPageById(id: string): Page | null {
        return this.findPage((page) => page.id === id);
    }

    public static getPageByName(name: string): Page | null {
        return this.findPage((page) => page.name.toLowerCase() === name.toLowerCase());
    }

    public static getPageForShape(shape: Shape): Page | null {
        for (const page of penpot.currentFile!.pages) {
            if (page.getShapeById(shape.id)) {
                return page;
            }
        }
        return null;
    }

    public static generateCss(shape: Shape): string {
        const page = this.getPageForShape(shape);
        if (!page) {
            throw new Error("Shape is not part of any page");
        }
        penpot.openPage(page);
        return penpot.generateStyle([shape], { type: "css", includeChildren: true });
    }

    /**
     * Checks if a child shape is fully contained within its parent's bounds.
     * Visual containment means all edges of the child are within the parent's bounding box.
     *
     * @param child - The child shape to check
     * @param parent - The parent shape to check against
     * @returns true if child is fully contained within parent bounds, false otherwise
     */
    public static isContainedIn(child: Shape, parent: Shape): boolean {
        return (
            child.x >= parent.x &&
            child.y >= parent.y &&
            child.x + child.width <= parent.x + parent.width &&
            child.y + child.height <= parent.y + parent.height
        );
    }

    /**
     * Sets the position of a shape relative to its parent's position.
     * This is a convenience method since parentX and parentY are read-only properties.
     *
     * @param shape - The shape to position
     * @param parentX - The desired X position relative to the parent
     * @param parentY - The desired Y position relative to the parent
     * @throws Error if the shape has no parent
     */
    public static setParentXY(shape: Shape, parentX: number, parentY: number): void {
        if (!shape.parent) {
            throw new Error("Shape has no parent - cannot set parent-relative position");
        }
        shape.x = shape.parent.x + parentX;
        shape.y = shape.parent.y + parentY;
    }

    /**
     * Analyzes all descendants of a shape by applying an evaluator function to each.
     * Only descendants for which the evaluator returns a non-null/non-undefined value are included in the result.
     * This is a general-purpose utility for validation, analysis, or collecting corrector functions.
     *
     * @param root - The root shape whose descendants to analyze
     * @param evaluator - Function called for each descendant with (root, descendant); return null/undefined to skip
     * @param maxDepth - Optional maximum depth to traverse (undefined for unlimited)
     * @returns Array of objects containing the shape and the evaluator's result
     */
    public static analyzeDescendants<T>(
        root: Shape,
        evaluator: (root: Shape, descendant: Shape) => T | null | undefined,
        maxDepth: number | undefined = undefined
    ): Array<{ shape: Shape; result: NonNullable<T> }> {
        const results: Array<{ shape: Shape; result: NonNullable<T> }> = [];

        const traverse = (shape: Shape, currentDepth: number): void => {
            const result = evaluator(root, shape);
            if (result !== null && result !== undefined) {
                results.push({ shape, result: result as NonNullable<T> });
            }

            if (maxDepth === undefined || currentDepth < maxDepth) {
                if ("children" in shape && shape.children) {
                    for (const child of shape.children) {
                        traverse(child, currentDepth + 1);
                    }
                }
            }
        };

        // Start traversal with root's children (not root itself)
        if ("children" in root && root.children) {
            for (const child of root.children) {
                traverse(child, 1);
            }
        }

        return results;
    }

    /**
     * Determines the z-order priority for a shape based on its type and name.
     * Lower priority = should be at back (rendered first)
     * Higher priority = should be at front (rendered last)
     *
     * Priority levels:
     *   0: Background elements (name contains 'BG', 'Background', 'Panel')
     *   1: Regular rectangles/shapes (content containers)
     *   2: Other shapes (ellipses, paths, cards, buttons, etc.)
     *   3: Text elements (should always be on top)
     *
     * @param shape - The shape to determine priority for
     * @returns A priority number (0-3), lower = back, higher = front
     */
    public static getZOrderPriority(shape: Shape): number {
        const name = shape.name.toLowerCase();

        // Background elements - should be at back
        if (
            name.includes("bg") ||
            name.includes("background") ||
            name.includes("panel") ||
            name.includes("backdrop") ||
            name.includes("overlay")
        ) {
            return 0;
        }

        // Text elements - should be at front
        if (shape.type === "text") {
            return 3;
        }

        // Regular rectangles (likely content containers, cards, etc.)
        if (shape.type === "rectangle") {
            // Check if it looks like a card or container
            if (
                name.includes("card") ||
                name.includes("container") ||
                name.includes("box") ||
                name.includes("badge") ||
                name.includes("button") ||
                name.includes("progress")
            ) {
                return 2;
            }
            return 1;
        }

        // Other shapes (ellipses, paths, images, etc.)
        return 2;
    }

    /**
     * Fixes the z-order of children in a container by sorting them by priority.
     * Background elements are moved to the back (index 0), text to the front.
     *
     * Z-order in Penpot:
     * - Index 0 = BACK (rendered first, appears behind)
     * - Last index = FRONT (rendered last, appears on top)
     *
     * This is essential when creating designs programmatically because appendChild()
     * adds elements to the END (front), which can cause backgrounds added later
     * to cover content.
     *
     * @param container - The container shape whose children should be reordered
     * @returns true if the order was changed, false if already correct
     */
    public static fixZOrder(container: Shape): boolean {
        if (!("children" in container) || !container.children || container.children.length < 2) {
            return false;
        }

        const children = [...container.children];

        // Sort by priority (lower priority = lower index = back)
        const sorted = children.sort((a, b) => {
            return this.getZOrderPriority(a) - this.getZOrderPriority(b);
        });

        // Check if order changed
        const orderChanged = children.some((child, i) => child.id !== sorted[i].id);

        if (!orderChanged) {
            return false;
        }

        // Apply new order using setParentIndex
        // Note: setParentIndex is available on all shapes but TypeScript types may not reflect this
        sorted.forEach((child, newIndex) => {
            (child as any).setParentIndex(newIndex);
        });

        return true;
    }

    /**
     * Analyzes the z-order of children in a container and returns any issues found.
     * An issue occurs when a lower-priority element (e.g., background) has a higher
     * index than a higher-priority element (e.g., text), causing it to appear in front.
     *
     * @param container - The container shape to analyze
     * @returns Array of z-order issues found, empty if no issues
     */
    public static analyzeZOrder(
        container: Shape
    ): Array<{
        type: "inversion" | "background-not-at-back";
        details: {
            behind: { id: string; name: string; type: string; priority: number; index: number };
            inFront: { id: string; name: string; type: string; priority: number; index: number };
        };
    }> {
        if (!("children" in container) || !container.children || container.children.length < 2) {
            return [];
        }

        const issues: Array<{
            type: "inversion" | "background-not-at-back";
            details: {
                behind: { id: string; name: string; type: string; priority: number; index: number };
                inFront: { id: string; name: string; type: string; priority: number; index: number };
            };
        }> = [];

        const children = container.children;

        // Map children with their current index and priority
        const childData = children.map((child, index) => ({
            shape: child,
            id: child.id,
            name: child.name,
            type: child.type,
            currentIndex: index,
            priority: this.getZOrderPriority(child),
        }));

        // Check for inversions: lower priority elements should have lower indices
        for (let i = 0; i < childData.length; i++) {
            for (let j = i + 1; j < childData.length; j++) {
                const a = childData[i]; // lower index (back)
                const b = childData[j]; // higher index (front)

                // If a has higher priority than b, but a is behind b, that's an issue
                if (a.priority > b.priority) {
                    issues.push({
                        type: a.priority === 0 || b.priority === 0 ? "background-not-at-back" : "inversion",
                        details: {
                            behind: {
                                id: a.id,
                                name: a.name,
                                type: a.type,
                                priority: a.priority,
                                index: a.currentIndex,
                            },
                            inFront: {
                                id: b.id,
                                name: b.name,
                                type: b.type,
                                priority: b.priority,
                                index: b.currentIndex,
                            },
                        },
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Calculates the bounding box that encompasses all children of a container.
     * Useful for determining if a container needs resizing to fit its content.
     *
     * @param container - The container shape to analyze
     * @returns Bounds information including content dimensions and overflow
     */
    public static calculateContentBounds(container: Shape): {
        contentX: number;
        contentY: number;
        contentWidth: number;
        contentHeight: number;
        overflowLeft: number;
        overflowTop: number;
        overflowRight: number;
        overflowBottom: number;
    } | null {
        if (!("children" in container) || !container.children || container.children.length === 0) {
            return null;
        }

        let minX = Infinity,
            minY = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity;

        container.children.forEach((child) => {
            minX = Math.min(minX, child.x);
            minY = Math.min(minY, child.y);
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        });

        return {
            contentX: minX,
            contentY: minY,
            contentWidth: maxX - minX,
            contentHeight: maxY - minY,
            overflowLeft: Math.max(0, container.x - minX),
            overflowTop: Math.max(0, container.y - minY),
            overflowRight: Math.max(0, maxX - (container.x + container.width)),
            overflowBottom: Math.max(0, maxY - (container.y + container.height)),
        };
    }

    /**
     * Resizes a container to fit its children with optional padding.
     * The container will be repositioned and resized to contain all children.
     *
     * @param container - The container shape to resize
     * @param options - Optional configuration for padding and minimum sizes
     * @returns Object with old and new dimensions, or null if no children
     */
    public static fitToContent(
        container: Shape,
        options?: {
            padding?: number;
            minWidth?: number;
            minHeight?: number;
        }
    ): { oldSize: { w: number; h: number }; newSize: { w: number; h: number } } | null {
        const bounds = this.calculateContentBounds(container);
        if (!bounds) return null;

        const padding = options?.padding ?? 16;
        const minWidth = options?.minWidth ?? 0;
        const minHeight = options?.minHeight ?? 0;

        const oldWidth = container.width;
        const oldHeight = container.height;

        const newWidth = Math.max(minWidth, bounds.contentWidth + padding * 2);
        const newHeight = Math.max(minHeight, bounds.contentHeight + padding * 2);

        container.x = bounds.contentX - padding;
        container.y = bounds.contentY - padding;
        container.resize(newWidth, newHeight);

        return {
            oldSize: { w: oldWidth, h: oldHeight },
            newSize: { w: newWidth, h: newHeight },
        };
    }

    /**
     * Finds the nearest value in a spacing scale.
     *
     * @param value - The value to snap
     * @param scale - The spacing scale array (default: [4, 8, 12, 16, 24, 32])
     * @returns The nearest spacing scale value
     */
    public static nearestSpacing(value: number, scale: number[] = [4, 8, 12, 16, 24, 32]): number {
        return scale.reduce((prev, curr) => (Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev));
    }

    /**
     * Determines if a container would benefit from flex layout based on its children.
     * Analyzes child positions and dimensions to suggest direction and alignment.
     *
     * @param container - The container to analyze
     * @returns Suggested flex configuration with confidence score
     */
    public static suggestFlexConfig(container: Shape): {
        direction: "row" | "column";
        alignItems: "start" | "center" | "end";
        justifyContent: "start" | "center" | "end" | "space-between";
        gap: number;
        confidence: number;
    } | null {
        if (!("children" in container) || !container.children || container.children.length < 2) {
            return null;
        }

        const children = container.children;

        // Calculate center points
        const centers = children.map((child) => ({
            x: child.x + child.width / 2,
            y: child.y + child.height / 2,
        }));

        // Calculate variance to determine direction
        const avgX = centers.reduce((sum, c) => sum + c.x, 0) / centers.length;
        const avgY = centers.reduce((sum, c) => sum + c.y, 0) / centers.length;

        const varianceX = centers.reduce((sum, c) => sum + Math.pow(c.x - avgX, 2), 0) / centers.length;
        const varianceY = centers.reduce((sum, c) => sum + Math.pow(c.y - avgY, 2), 0) / centers.length;

        const direction: "row" | "column" = varianceX > varianceY ? "row" : "column";
        const confidence = Math.abs(varianceX - varianceY) / Math.max(varianceX, varianceY, 1);

        // Calculate suggested gap
        const sorted = [...children].sort((a, b) => (direction === "row" ? a.x - b.x : a.y - b.y));

        let totalGap = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            const gap =
                direction === "row"
                    ? sorted[i + 1].x - (sorted[i].x + sorted[i].width)
                    : sorted[i + 1].y - (sorted[i].y + sorted[i].height);
            totalGap += Math.max(0, gap);
        }
        const avgGap = totalGap / (sorted.length - 1);
        const gap = this.nearestSpacing(avgGap);

        // Determine alignment
        const alignItems: "start" | "center" | "end" =
            confidence > 0.5
                ? "center"
                : direction === "row"
                  ? avgY < container.y + container.height / 2
                      ? "start"
                      : "end"
                  : avgX < container.x + container.width / 2
                    ? "start"
                    : "end";

        return {
            direction,
            alignItems,
            justifyContent: "start",
            gap,
            confidence: Math.min(1, confidence + 0.3),
        };
    }

    /**
     * Checks if a container has any layout system (flex or grid).
     *
     * @param container - The container shape to check
     * @returns Object with layout type information
     */
    public static hasLayout(container: Shape): { hasLayout: boolean; type: "flex" | "grid" | "none" } {
        if ("flex" in container && container.flex) {
            return { hasLayout: true, type: "flex" };
        }
        if ("grid" in container && container.grid) {
            return { hasLayout: true, type: "grid" };
        }
        return { hasLayout: false, type: "none" };
    }

    /**
     * Applies flex layout to a container with the specified configuration.
     * If the container already has flex layout, updates the existing configuration.
     *
     * IMPORTANT: When a container has flex layout, child positions are managed
     * by the layout system. Do not manually set x/y positions on children.
     *
     * @param container - The container shape to apply flex layout to (must be a Board)
     * @param config - Flex layout configuration
     * @returns true if layout was applied/updated successfully
     */
    public static applyFlexLayout(
        container: Shape,
        config: {
            direction?: "row" | "column";
            gap?: number;
            rowGap?: number;
            columnGap?: number;
            alignItems?: "start" | "center" | "end" | "stretch";
            justifyContent?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
            padding?: number;
            verticalPadding?: number;
            horizontalPadding?: number;
            wrap?: boolean;
        }
    ): boolean {
        // Check if container supports flex layout (must have addFlexLayout method)
        if (!("addFlexLayout" in container)) {
            return false;
        }

        const board = container as any;

        // Add flex layout if not present
        if (!board.flex) {
            board.addFlexLayout();
        }

        const flex = board.flex;
        if (!flex) {
            return false;
        }

        // Apply configuration
        if (config.direction !== undefined) {
            flex.dir = config.direction;
        }

        // Handle gap - prefer specific rowGap/columnGap, fallback to general gap
        if (config.rowGap !== undefined) {
            flex.rowGap = config.rowGap;
        } else if (config.gap !== undefined) {
            flex.rowGap = config.gap;
        }

        if (config.columnGap !== undefined) {
            flex.columnGap = config.columnGap;
        } else if (config.gap !== undefined) {
            flex.columnGap = config.gap;
        }

        if (config.alignItems !== undefined) {
            flex.alignItems = config.alignItems;
        }

        if (config.justifyContent !== undefined) {
            flex.justifyContent = config.justifyContent;
        }

        // Handle padding - prefer specific vertical/horizontal, fallback to general padding
        if (config.verticalPadding !== undefined) {
            flex.verticalPadding = config.verticalPadding;
        } else if (config.padding !== undefined) {
            flex.verticalPadding = config.padding;
        }

        if (config.horizontalPadding !== undefined) {
            flex.horizontalPadding = config.horizontalPadding;
        } else if (config.padding !== undefined) {
            flex.horizontalPadding = config.padding;
        }

        if (config.wrap !== undefined) {
            flex.wrap = config.wrap ? "wrap" : "nowrap";
        }

        return true;
    }

    /**
     * Removes layout from a container, converting it back to free-form positioning.
     *
     * @param container - The container to remove layout from
     * @returns true if layout was removed, false if container had no layout
     */
    public static removeLayout(container: Shape): boolean {
        if ("removeFlexLayout" in container && (container as any).flex) {
            (container as any).removeFlexLayout();
            return true;
        }
        if ("removeGridLayout" in container && (container as any).grid) {
            (container as any).removeGridLayout();
            return true;
        }
        return false;
    }

    /**
     * Gets the current layout configuration of a container.
     *
     * @param container - The container to get layout info from
     * @returns Layout configuration or null if no layout
     */
    public static getLayoutConfig(container: Shape): {
        type: "flex" | "grid";
        direction?: string;
        rowGap: number;
        columnGap: number;
        alignItems?: string;
        justifyContent?: string;
        verticalPadding?: number;
        horizontalPadding?: number;
    } | null {
        if ("flex" in container && container.flex) {
            const flex: FlexLayout = container.flex;
            return {
                type: "flex",
                direction: flex.dir as string,
                rowGap: flex.rowGap,
                columnGap: flex.columnGap,
                alignItems: flex.alignItems,
                justifyContent: flex.justifyContent,
                verticalPadding: flex.verticalPadding,
                horizontalPadding: flex.horizontalPadding,
            };
        }
        if ("grid" in container && container.grid) {
            const grid: GridLayout = container.grid;
            return {
                type: "grid",
                rowGap: grid.rowGap,
                columnGap: grid.columnGap,
            };
        }
        return null;
    }

    /**
     * Enables flex-based fit-to-content sizing on a container.
     * This is the PROPER way to auto-size buttons and similar UI elements.
     *
     * Unlike `fitToContent()` which manually calculates bounds and repositions the container,
     * this function uses Penpot's native flex layout sizing which:
     * - Automatically resizes the container to fit its content
     * - Does NOT reposition the container (maintains its position in parent layout)
     * - Properly handles padding via flex layout properties
     *
     * IMPORTANT: Use this for BUTTONS instead of `fitToContent()` to avoid position drift.
     *
     * @param container - The container shape (must be a Board with or without existing flex)
     * @param options - Configuration options
     * @returns Object with success status and configuration applied, or null if failed
     */
    public static enableFitContent(
        container: Shape,
        options?: {
            horizontal?: boolean; // Enable horizontal fit-content (default: true)
            vertical?: boolean; // Enable vertical fit-content (default: true)
            padding?: number; // Uniform padding (default: no change)
            horizontalPadding?: number; // Horizontal padding (overrides padding)
            verticalPadding?: number; // Vertical padding (overrides padding)
            alignItems?: "start" | "center" | "end" | "stretch"; // Child alignment (default: "center")
            justifyContent?: "start" | "center" | "end" | "space-between"; // Content justification (default: "center")
        }
    ): {
        success: boolean;
        wasFlexAdded: boolean;
        sizing: { horizontal: string; vertical: string };
        padding: { horizontal: number; vertical: number };
    } | null {
        // Check if container supports flex layout
        if (!("addFlexLayout" in container)) {
            return null;
        }

        const board = container as any;
        const wasFlexAdded = !board.flex;

        // Add flex layout if not present
        if (!board.flex) {
            board.addFlexLayout();
        }

        const flex = board.flex;
        if (!flex) {
            return null;
        }

        // Set sizing mode
        const enableHorizontal = options?.horizontal !== false;
        const enableVertical = options?.vertical !== false;

        if (enableHorizontal) {
            flex.horizontalSizing = "fit-content";
        }
        if (enableVertical) {
            flex.verticalSizing = "fit-content";
        }

        // Set padding
        if (options?.horizontalPadding !== undefined) {
            flex.horizontalPadding = options.horizontalPadding;
        } else if (options?.padding !== undefined) {
            flex.horizontalPadding = options.padding;
        }

        if (options?.verticalPadding !== undefined) {
            flex.verticalPadding = options.verticalPadding;
        } else if (options?.padding !== undefined) {
            flex.verticalPadding = options.padding;
        }

        // Set alignment (default to center for buttons)
        if (options?.alignItems !== undefined) {
            flex.alignItems = options.alignItems;
        } else if (wasFlexAdded) {
            // Only set default if we just added flex
            flex.alignItems = "center";
        }

        if (options?.justifyContent !== undefined) {
            flex.justifyContent = options.justifyContent;
        } else if (wasFlexAdded) {
            // Only set default if we just added flex
            flex.justifyContent = "center";
        }

        return {
            success: true,
            wasFlexAdded,
            sizing: {
                horizontal: flex.horizontalSizing,
                vertical: flex.verticalSizing,
            },
            padding: {
                horizontal: flex.horizontalPadding || 0,
                vertical: flex.verticalPadding || 0,
            },
        };
    }

    /**
     * Configures a container as a button with proper flex layout settings.
     * This is a convenience function that applies button-appropriate defaults.
     *
     * Button containers should:
     * - Use fit-content sizing (auto-resize to fit text)
     * - Have centered content
     * - Have appropriate padding (default: 8px vertical, 16px horizontal)
     * - Maintain their position in parent layouts
     *
     * @param container - The container shape (must be a Board)
     * @param options - Optional configuration overrides
     * @returns Object with configuration applied, or null if failed
     */
    public static configureAsButton(
        container: Shape,
        options?: {
            verticalPadding?: number; // Vertical padding (default: 8)
            horizontalPadding?: number; // Horizontal padding (default: 16)
            minWidth?: number; // Minimum width constraint
            minHeight?: number; // Minimum height constraint (default: 44 for touch targets)
        }
    ): {
        success: boolean;
        config: {
            sizing: { horizontal: string; vertical: string };
            padding: { horizontal: number; vertical: number };
            minSize: { width?: number; height?: number };
        };
    } | null {
        const vPadding = options?.verticalPadding ?? 8;
        const hPadding = options?.horizontalPadding ?? 16;
        const minHeight = options?.minHeight ?? 44; // Touch target minimum

        const result = this.enableFitContent(container, {
            horizontal: true,
            vertical: true,
            verticalPadding: vPadding,
            horizontalPadding: hPadding,
            alignItems: "center",
            justifyContent: "center",
        });

        if (!result) {
            return null;
        }

        // Apply minimum size constraints if specified
        // Note: minWidth/minHeight are applied via resize if the container is smaller
        if (options?.minWidth !== undefined && container.width < options.minWidth) {
            container.resize(options.minWidth, container.height);
        }
        if (minHeight !== undefined && container.height < minHeight) {
            container.resize(container.width, minHeight);
        }

        return {
            success: true,
            config: {
                sizing: result.sizing,
                padding: { horizontal: hPadding, vertical: vPadding },
                minSize: { width: options?.minWidth, height: minHeight },
            },
        };
    }

    /**
     * Safely adds a child to a container, respecting layout systems.
     * When a container has flex/grid layout, the layout system will position the child.
     * When there's no layout, the child is positioned using the provided coordinates.
     *
     * @param container - The parent container
     * @param child - The child shape to add
     * @param position - Position for containers without layout (ignored if container has layout)
     * @returns true if child was added successfully
     */
    public static addChildToContainer(
        container: Shape,
        child: Shape,
        position?: { x?: number; y?: number }
    ): boolean {
        if (!("appendChild" in container)) {
            return false;
        }

        const layoutInfo = this.hasLayout(container);

        // Add the child to the container
        (container as any).appendChild(child);

        // Only set position if container has no layout
        if (!layoutInfo.hasLayout && position) {
            if (position.x !== undefined) {
                child.x = container.x + position.x;
            }
            if (position.y !== undefined) {
                child.y = container.y + position.y;
            }
        }

        return true;
    }

    /**
     * Auto-applies flex layout to a container based on its current children arrangement.
     * Analyzes the children and applies the most suitable layout configuration.
     *
     * @param container - The container to apply auto-layout to
     * @returns Object with applied configuration or null if couldn't apply
     */
    public static autoApplyFlexLayout(container: Shape): {
        applied: boolean;
        config: {
            direction: "row" | "column";
            gap: number;
            alignItems: string;
            justifyContent: string;
        };
    } | null {
        const suggestion = this.suggestFlexConfig(container);
        if (!suggestion) {
            return null;
        }

        const applied = this.applyFlexLayout(container, {
            direction: suggestion.direction,
            gap: suggestion.gap,
            alignItems: suggestion.alignItems,
            justifyContent: suggestion.justifyContent,
        });

        return {
            applied,
            config: {
                direction: suggestion.direction,
                gap: suggestion.gap,
                alignItems: suggestion.alignItems,
                justifyContent: suggestion.justifyContent,
            },
        };
    }

    /**
     * Checks if a shape with the given name already exists within the specified container.
     * Useful for preventing duplicate element creation.
     *
     * @param name - The name to search for
     * @param container - The container to search within (defaults to penpot.root)
     * @returns The existing shape if found, null otherwise
     */
    public static findShapeByName(name: string, container: Shape | null = penpot.root): Shape | null {
        return this.findShape((shape) => shape.name === name, container);
    }

    /**
     * Checks if a shape with the given name exists within the specified container.
     * Convenience method for checking existence before creation.
     *
     * @param name - The name to check for
     * @param container - The container to search within (defaults to penpot.root)
     * @returns true if a shape with this name exists, false otherwise
     */
    public static shapeExists(name: string, container: Shape | null = penpot.root): boolean {
        return this.findShapeByName(name, container) !== null;
    }

    /**
     * Finds all shapes that have duplicate names within a container.
     * Returns groups of shapes that share the same name.
     *
     * @param container - The container to search within (defaults to penpot.root)
     * @returns Map of shape names to arrays of shapes with that name (only includes names with 2+ shapes)
     */
    public static findDuplicatesByName(container: Shape | null = penpot.root): Map<string, Shape[]> {
        const nameToShapes = new Map<string, Shape[]>();
        
        this.findShapes(() => true, container).forEach((shape) => {
            const shapes = nameToShapes.get(shape.name) || [];
            shapes.push(shape);
            nameToShapes.set(shape.name, shapes);
        });

        // Filter to only include names with duplicates
        const duplicates = new Map<string, Shape[]>();
        nameToShapes.forEach((shapes, name) => {
            if (shapes.length > 1) {
                duplicates.set(name, shapes);
            }
        });

        return duplicates;
    }

    /**
     * Removes duplicate shapes by name, keeping only the first occurrence.
     * Useful for cleaning up accidentally created duplicate elements.
     *
     * @param container - The container to search within (defaults to penpot.root)
     * @param keepStrategy - Strategy for which duplicate to keep: "first" (default) or "last"
     * @returns Object with statistics about the cleanup
     */
    public static removeDuplicates(
        container: Shape | null = penpot.root,
        keepStrategy: "first" | "last" = "first"
    ): { totalRemoved: number; duplicateGroups: number; removedShapes: Array<{ name: string; id: string }> } {
        const duplicates = this.findDuplicatesByName(container);
        const removedShapes: Array<{ name: string; id: string }> = [];

        duplicates.forEach((shapes, _name) => {
            // Determine which shapes to remove based on strategy
            const toRemove = keepStrategy === "first" ? shapes.slice(1) : shapes.slice(0, -1);
            
            toRemove.forEach((shape) => {
                removedShapes.push({ name: shape.name, id: shape.id });
                shape.remove();
            });
        });

        return {
            totalRemoved: removedShapes.length,
            duplicateGroups: duplicates.size,
            removedShapes,
        };
    }

    /**
     * Safely creates a shape only if no shape with the given name exists.
     * Returns the existing shape if found, or creates a new one using the factory function.
     *
     * @param name - The name for the shape
     * @param container - The container to check and create within
     * @param createFn - Factory function to create the shape if it doesn't exist
     * @returns Object with the shape and a boolean indicating if it was newly created
     */
    public static findOrCreate<T extends Shape>(
        name: string,
        container: Shape | null,
        createFn: () => T
    ): { shape: T; created: boolean } {
        const existing = this.findShapeByName(name, container);
        if (existing) {
            return { shape: existing as T, created: false };
        }
        
        const newShape = createFn();
        newShape.name = name;
        return { shape: newShape, created: true };
    }

    /**
     * Decodes a base64 string to a Uint8Array.
     * This is required because the Penpot plugin environment does not provide the atob function.
     *
     * @param base64 - The base64-encoded string to decode
     * @returns The decoded data as a Uint8Array
     */
    public static atob(base64: string): Uint8Array {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        const lookup = new Uint8Array(256);
        for (let i = 0; i < chars.length; i++) {
            lookup[chars.charCodeAt(i)] = i;
        }

        let bufferLength = base64.length * 0.75;
        if (base64[base64.length - 1] === "=") {
            bufferLength--;
            if (base64[base64.length - 2] === "=") {
                bufferLength--;
            }
        }

        const bytes = new Uint8Array(bufferLength);
        let p = 0;
        for (let i = 0; i < base64.length; i += 4) {
            const encoded1 = lookup[base64.charCodeAt(i)];
            const encoded2 = lookup[base64.charCodeAt(i + 1)];
            const encoded3 = lookup[base64.charCodeAt(i + 2)];
            const encoded4 = lookup[base64.charCodeAt(i + 3)];

            bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
            bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
            bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
        }

        return bytes;
    }

    /**
     * Imports an image from base64 data into the Penpot design as a Rectangle shape filled with the image.
     * The rectangle has the image's original proportions by default.
     * Optionally accepts position (x, y) and dimensions (width, height) parameters.
     * If only one dimension is provided, the other is calculated to maintain the image's aspect ratio.
     *
     * This function is used internally by the ImportImageTool in the MCP server.
     *
     * @param base64 - The base64-encoded image data
     * @param mimeType - The MIME type of the image (e.g., "image/png")
     * @param name - The name to assign to the newly created rectangle shape
     * @param x - The x-coordinate for positioning the rectangle (optional)
     * @param y - The y-coordinate for positioning the rectangle (optional)
     * @param width - The desired width of the rectangle (optional)
     * @param height - The desired height of the rectangle (optional)
     */
    public static async importImage(
        base64: string,
        mimeType: string,
        name: string,
        x: number | undefined,
        y: number | undefined,
        width: number | undefined,
        height: number | undefined
    ): Promise<Rectangle> {
        // convert base64 to Uint8Array
        const bytes = PenpotUtils.atob(base64);

        // upload the image data to Penpot
        const imageData = await penpot.uploadMediaData(name, bytes, mimeType);

        // create a rectangle shape
        const rect = penpot.createRectangle();
        rect.name = name;

        // calculate dimensions
        let rectWidth, rectHeight;
        const hasWidth = width !== undefined;
        const hasHeight = height !== undefined;

        if (hasWidth && hasHeight) {
            // both width and height provided - use them directly
            rectWidth = width;
            rectHeight = height;
        } else if (hasWidth) {
            // only width provided - maintain aspect ratio
            rectWidth = width;
            rectHeight = rectWidth * (imageData.height / imageData.width);
        } else if (hasHeight) {
            // only height provided - maintain aspect ratio
            rectHeight = height;
            rectWidth = rectHeight * (imageData.width / imageData.height);
        } else {
            // neither provided - use original dimensions
            rectWidth = imageData.width;
            rectHeight = imageData.height;
        }

        // set rectangle dimensions
        rect.resize(rectWidth, rectHeight);

        // set position if provided
        if (x !== undefined) {
            rect.x = x;
        }
        if (y !== undefined) {
            rect.y = y;
        }

        // apply the image as a fill
        rect.fills = [{ fillOpacity: 1, fillImage: imageData }];

        return rect;
    }

    /**
     * Exports the given shape (or its fill) to BASE64 image data.
     *
     * This function is used internally by the ExportImageTool in the MCP server.
     *
     * @param shape - The shape whose image data to export
     * @param mode - Either "shape" (to export the entire shape, including descendants) or "fill"
     *    to export the shape's raw fill image data
     * @param asSVG - Whether to export as SVG rather than as a pixel image (only supported for mode "shape")
     * @returns A byte array containing the exported image data.
     *   - For mode="shape", it will be PNG or SVG data depending on the value of `asSVG`.
     *   - For mode="fill", it will be whatever format the fill image is stored in.
     */
    public static async exportImage(shape: Shape, mode: "shape" | "fill", asSVG: boolean): Promise<Uint8Array> {
        switch (mode) {
            case "shape":
                return shape.export({ type: asSVG ? "svg" : "png" });
            case "fill":
                if (asSVG) {
                    throw new Error("Image fills cannot be exported as SVG");
                }
                // check whether the shape has the `fills` member
                if (!("fills" in shape)) {
                    throw new Error("Shape with `fills` member is required for fill export mode");
                }
                // find first fill that has fillImage
                const fills: Fill[] = (shape as any).fills;
                for (const fill of fills) {
                    if (fill.fillImage) {
                        const imageData = fill.fillImage;
                        // TODO: fix ts-ignore once Penpot types are updated to include data() method
                        // @ts-ignore
                        return imageData.data();
                    }
                }
                throw new Error("No fill with image data found in the shape");
            default:
                throw new Error(`Unsupported export mode: ${mode}`);
        }
    }
}
