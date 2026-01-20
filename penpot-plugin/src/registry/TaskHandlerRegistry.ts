import { TaskHandler } from "../TaskHandler";

/**
 * Central registry for managing task handlers in the Penpot plugin.
 *
 * Provides singleton pattern for global task handler registration and discovery.
 * Supports both manual registration and auto-discovery from filesystem.
 */
export class TaskHandlerRegistry {
    private static instance: TaskHandlerRegistry;
    private readonly handlers: Map<string, TaskHandler<any>> = new Map();

    private constructor() {}

    /**
     * Gets the singleton instance of the TaskHandlerRegistry.
     */
    public static getInstance(): TaskHandlerRegistry {
        if (!TaskHandlerRegistry.instance) {
            TaskHandlerRegistry.instance = new TaskHandlerRegistry();
        }
        return TaskHandlerRegistry.instance;
    }

    /**
     * Registers a single task handler.
     *
     * @param handler - The task handler instance to register
     * @throws Error if a handler for the same task type is already registered
     */
    public register(handler: TaskHandler<any>): void {
        const taskType = handler.taskType;

        if (this.handlers.has(taskType)) {
            throw new Error(`Task handler for '${taskType}' is already registered`);
        }

        this.handlers.set(taskType, handler);
        console.log(`[TaskHandlerRegistry] Registered handler: ${taskType}`);
    }

    /**
     * Registers multiple task handlers in batch.
     *
     * @param handlers - Array of task handler instances to register
     */
    public registerAll(handlers: TaskHandler<any>[]): void {
        for (const handler of handlers) {
            this.register(handler);
        }
    }

    /**
     * Finds a handler for the given task type.
     *
     * @param taskType - The task type to find a handler for
     * @returns The task handler instance, or undefined if not found
     */
    public findHandler(taskType: string): TaskHandler<any> | undefined {
        return this.handlers.get(taskType);
    }

    /**
     * Gets all registered task handlers.
     *
     * @returns Array of all registered task handler instances
     */
    public getHandlers(): TaskHandler<any>[] {
        return Array.from(this.handlers.values());
    }

    /**
     * Checks if a handler is registered for the given task type.
     *
     * @param taskType - The task type to check
     * @returns True if a handler is registered
     */
    public hasHandler(taskType: string): boolean {
        return this.handlers.has(taskType);
    }

    /**
     * Auto-discovers and registers task handlers from a directory.
     *
     * Scans the directory for files matching the pattern *TaskHandler.ts and attempts
     * to import and instantiate handler classes.
     *
     * @param directory - The directory path to scan for task handlers
     * @returns Array of discovered and registered handlers
     */
    public async discoverHandlers(directory: string): Promise<TaskHandler<any>[]> {
        const discoveredHandlers: TaskHandler<any>[] = [];

        try {
            // Note: In browser environment, we can't use fs/promises
            // This method would need to be called with explicit handler imports
            // or use a build-time plugin to generate imports
            console.warn(
                "[TaskHandlerRegistry] Auto-discovery not implemented in browser environment. " +
                "Use manual registration or build-time generation."
            );
        } catch (error) {
            console.error(`[TaskHandlerRegistry] Failed to discover handlers in directory ${directory}:`, error);
        }

        return discoveredHandlers;
    }

    /**
     * Clears all registered task handlers.
     *
     * Useful for testing or reloading workflows.
     */
    public clear(): void {
        const count = this.handlers.size;
        this.handlers.clear();
        console.log(`[TaskHandlerRegistry] Cleared ${count} handlers from registry`);
    }

    /**
     * Gets the number of registered handlers.
     */
    public size(): number {
        return this.handlers.size;
    }
}
