/**
 * Manifest definition for a Penpot MCP workflow.
 *
 * A workflow is a self-contained package of tools, task handlers,
 * prompts, and types that work together to provide specific functionality.
 */
export interface WorkflowManifest {
    /**
     * Unique identifier for the workflow.
     */
    name: string;

    /**
     * Semantic version of the workflow.
     */
    version: string;

    /**
     * Human-readable description of what the workflow provides.
     */
    description: string;

    /**
     * Whether this workflow is enabled by default.
     * Can be overridden by configuration or environment variables.
     */
    enabled: boolean;

    /**
     * Names of tool classes this workflow provides.
     * These will be auto-discovered from the workflow's tools/ directory.
     */
    tools?: string[];

    /**
     * Names of task handler classes this workflow provides.
     * These will be auto-discovered from the workflow's task-handlers/ directory.
     */
    taskHandlers?: string[];

    /**
     * Relative path to the workflow's prompts file.
     * If specified, prompts will be loaded and merged with global prompts.
     */
    prompts?: string;

    /**
     * Relative path to the workflow's types file.
     * If specified, types will be made available to the workflow's tools and handlers.
     */
    types?: string;

    /**
     * Names of other workflows this workflow depends on.
     * Dependencies must be enabled before this workflow can be enabled.
     */
    requires?: string[];

    /**
     * Additional metadata for the workflow.
     */
    metadata?: {
        author?: string;
        repository?: string;
        license?: string;
        tags?: string[];
    };
}

/**
 * A loaded workflow with resolved paths and instantiated components.
 */
export interface LoadedWorkflow {
    /**
     * The workflow manifest.
     */
    manifest: WorkflowManifest;

    /**
     * Absolute path to the workflow directory.
     */
    path: string;

    /**
     * Whether the workflow is currently enabled.
     */
    enabled: boolean;

    /**
     * Loaded prompts content, if any.
     */
    prompts?: string;

    /**
     * Tool instances provided by this workflow.
     */
    tools?: any[];

    /**
     * Task handler instances provided by this workflow.
     */
    taskHandlers?: any[];
}

/**
 * Configuration for workflow discovery and management.
 */
export interface WorkflowConfiguration {
    /**
     * Global workflow settings.
     */
    settings: {
        /**
         * Whether to automatically discover workflows in the workflows directory.
         */
        auto_discover: boolean;

        /**
         * Path to the workflows directory (relative to the server root).
         */
        workflows_dir: string;

        /**
         * Whether to load workflows from node_modules.
         */
        load_external_workflows?: boolean;
    };

    /**
     * Per-workflow configuration overrides.
     */
    workflows: {
        [workflowName: string]: {
            /**
             * Override the enabled state from the workflow manifest.
             */
            enabled?: boolean;

            /**
             * Additional configuration specific to this workflow.
             */
            config?: Record<string, any>;
        };
    };
}

/**
 * Result of workflow discovery operation.
 */
export interface WorkflowDiscoveryResult {
    /**
     * Successfully discovered workflows.
     */
    discovered: LoadedWorkflow[];

    /**
     * Workflows that failed to load.
     */
    failed: Array<{
        path: string;
        error: string;
    }>;

    /**
     * Total number of workflows found.
     */
    total: number;
}
