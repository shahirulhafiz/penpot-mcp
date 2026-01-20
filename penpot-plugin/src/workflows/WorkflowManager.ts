import { WorkflowManifest, LoadedWorkflow } from "@penpot-mcp/common";
import { TaskHandler } from "../TaskHandler";
import { TaskHandlerRegistry } from "../registry/TaskHandlerRegistry";

/**
 * Manages workflow loading and task handler registration in the plugin.
 *
 * Unlike the server-side WorkflowManager, this version operates in a browser
 * environment and relies on explicit registration rather than filesystem discovery.
 */
export class WorkflowManager {
    private static instance: WorkflowManager;
    private readonly registry: TaskHandlerRegistry;
    private readonly workflows: Map<string, LoadedWorkflow> = new Map();

    private constructor() {
        this.registry = TaskHandlerRegistry.getInstance();
    }

    /**
     * Gets the singleton instance of the WorkflowManager.
     */
    public static getInstance(): WorkflowManager {
        if (!WorkflowManager.instance) {
            WorkflowManager.instance = new WorkflowManager();
        }
        return WorkflowManager.instance;
    }

    /**
     * Registers a workflow with its manifest and handlers.
     *
     * Since we're in a browser environment, workflows must be explicitly
     * registered rather than auto-discovered.
     *
     * @param manifest - The workflow manifest
     * @param handlers - Task handlers provided by this workflow
     * @param path - Optional path identifier for the workflow
     */
    public registerWorkflow(
        manifest: WorkflowManifest,
        handlers: TaskHandler<any>[] = [],
        path?: string
    ): void {
        const workflow: LoadedWorkflow = {
            manifest,
            path: path || `workflows/${manifest.name}`,
            enabled: this.isWorkflowEnabled(manifest),
            taskHandlers: handlers,
        };

        this.workflows.set(manifest.name, workflow);

        // Register handlers if workflow is enabled
        if (workflow.enabled) {
            this.registry.registerAll(handlers);
            console.log(`[WorkflowManager] Registered workflow: ${manifest.name} with ${handlers.length} handlers`);
        } else {
            console.log(`[WorkflowManager] Workflow ${manifest.name} is disabled, skipping handler registration`);
        }
    }

    /**
     * Registers multiple workflows at once.
     *
     * @param workflows - Array of workflow definitions
     */
    public registerWorkflows(
        workflows: Array<{
            manifest: WorkflowManifest;
            handlers: TaskHandler<any>[];
            path?: string;
        }>
    ): void {
        for (const workflow of workflows) {
            this.registerWorkflow(workflow.manifest, workflow.handlers, workflow.path);
        }
    }

    /**
     * Checks if a workflow is enabled based on manifest and environment.
     *
     * Priority (highest to lowest):
     * 1. Build-time configuration
     * 2. Manifest default
     *
     * @param manifest - The workflow manifest
     * @returns True if the workflow should be enabled
     */
    private isWorkflowEnabled(manifest: WorkflowManifest): boolean {
        // In browser environment, we can't access process.env directly
        // Build tools would need to inject enabled state via defines or similar
        return manifest.enabled ?? false;
    }

    /**
     * Gets all task handlers from enabled workflows.
     *
     * @returns Array of task handler instances
     */
    public getEnabledHandlers(): TaskHandler<any>[] {
        return this.registry.getHandlers();
    }

    /**
     * Gets a workflow by name.
     *
     * @param name - The workflow name
     * @returns The loaded workflow, or undefined if not found
     */
    public getWorkflow(name: string): LoadedWorkflow | undefined {
        return this.workflows.get(name);
    }

    /**
     * Gets all registered workflows.
     *
     * @returns Array of all workflows
     */
    public getWorkflows(): LoadedWorkflow[] {
        return Array.from(this.workflows.values());
    }

    /**
     * Gets all enabled workflows.
     *
     * @returns Array of enabled workflows
     */
    public getEnabledWorkflows(): LoadedWorkflow[] {
        return Array.from(this.workflows.values()).filter((w) => w.enabled);
    }

    /**
     * Enables a workflow by name.
     *
     * @param name - The name of the workflow to enable
     * @throws Error if the workflow is not found
     */
    public enableWorkflow(name: string): void {
        const workflow = this.workflows.get(name);
        if (!workflow) {
            throw new Error(`Workflow not found: ${name}`);
        }

        if (workflow.enabled) {
            console.log(`[WorkflowManager] Workflow ${name} is already enabled`);
            return;
        }

        workflow.enabled = true;

        // Register handlers
        if (workflow.taskHandlers) {
            this.registry.registerAll(workflow.taskHandlers);
        }

        console.log(`[WorkflowManager] Enabled workflow: ${name}`);
    }

    /**
     * Disables a workflow by name.
     *
     * @param name - The name of the workflow to disable
     * @throws Error if the workflow is not found
     */
    public disableWorkflow(name: string): void {
        const workflow = this.workflows.get(name);
        if (!workflow) {
            throw new Error(`Workflow not found: ${name}`);
        }

        if (!workflow.enabled) {
            console.log(`[WorkflowManager] Workflow ${name} is already disabled`);
            return;
        }

        workflow.enabled = false;
        // Note: We don't unregister handlers since they might be used elsewhere

        console.log(`[WorkflowManager] Disabled workflow: ${name}`);
    }

    /**
     * Gets the task handler registry.
     *
     * @returns The TaskHandlerRegistry instance
     */
    public getRegistry(): TaskHandlerRegistry {
        return this.registry;
    }
}
