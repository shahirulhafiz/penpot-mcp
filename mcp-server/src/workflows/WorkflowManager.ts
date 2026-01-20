import { WorkflowManifest, LoadedWorkflow, WorkflowConfiguration, WorkflowDiscoveryResult } from "@penpot-mcp/common";
import { createLogger } from "../logger";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import yaml from "js-yaml";
import { Tool } from "../Tool";
import { ToolRegistry } from "../registry/ToolRegistry";
import type { PenpotMcpServer } from "../PenpotMcpServer";

/**
 * Manages workflow discovery, loading, and orchestration.
 *
 * The WorkflowManager is responsible for:
 * - Discovering workflows from the filesystem and npm packages
 * - Loading and validating workflow manifests
 * - Managing workflow enabled/disabled state
 * - Aggregating prompts from enabled workflows
 * - Providing tools and handlers from enabled workflows
 */
export class WorkflowManager {
    private readonly logger = createLogger("WorkflowManager");
    private readonly workflows: Map<string, LoadedWorkflow> = new Map();
    private readonly toolRegistry: ToolRegistry;
    private configuration: WorkflowConfiguration | null = null;

    constructor(
        private readonly mcpServer: PenpotMcpServer,
        private readonly baseDir: string
    ) {
        this.toolRegistry = ToolRegistry.getInstance();
    }

    /**
     * Loads workflow configuration from workflows.yml file.
     *
     * @param configPath - Path to the workflows.yml configuration file
     */
    public async loadConfiguration(configPath: string): Promise<void> {
        try {
            if (!existsSync(configPath)) {
                this.logger.warn(`Workflow configuration not found at ${configPath}, using defaults`);
                this.configuration = this.getDefaultConfiguration();
                return;
            }

            const fileContent = await readFile(configPath, "utf8");
            this.configuration = yaml.load(fileContent) as WorkflowConfiguration;
            this.logger.info(`Loaded workflow configuration from ${configPath}`);
        } catch (error) {
            this.logger.error(`Failed to load workflow configuration: ${error}`);
            this.configuration = this.getDefaultConfiguration();
        }
    }

    /**
     * Gets default workflow configuration.
     */
    private getDefaultConfiguration(): WorkflowConfiguration {
        return {
            settings: {
                auto_discover: true,
                workflows_dir: "./workflows",
                load_external_workflows: false,
            },
            workflows: {
                core: {
                    enabled: true,
                },
            },
        };
    }

    /**
     * Discovers workflows from the workflows directory.
     *
     * @param baseDir - Base directory to search for workflows (optional, uses configured directory)
     * @returns Discovery result with loaded workflows and errors
     */
    public async discoverWorkflows(baseDir?: string): Promise<WorkflowDiscoveryResult> {
        const config = this.configuration || this.getDefaultConfiguration();
        const workflowsDir = baseDir || join(this.baseDir, config.settings.workflows_dir);

        const result: WorkflowDiscoveryResult = {
            discovered: [],
            failed: [],
            total: 0,
        };

        try {
            if (!existsSync(workflowsDir)) {
                this.logger.warn(`Workflows directory not found: ${workflowsDir}`);
                return result;
            }

            const entries = await readdir(workflowsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const workflowPath = join(workflowsDir, entry.name);
                    result.total++;

                    try {
                        const workflow = await this.loadWorkflow(workflowPath);
                        result.discovered.push(workflow);
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        result.failed.push({
                            path: workflowPath,
                            error: errorMessage,
                        });
                        this.logger.error(`Failed to load workflow from ${workflowPath}: ${errorMessage}`);
                    }
                }
            }

            this.logger.info(
                `Workflow discovery complete: ${result.discovered.length} loaded, ${result.failed.length} failed, ${result.total} total`
            );
        } catch (error) {
            this.logger.error(`Failed to discover workflows: ${error}`);
        }

        return result;
    }

    /**
     * Loads a single workflow from the given path.
     *
     * @param workflowPath - Path to the workflow directory
     * @returns The loaded workflow
     * @throws Error if the workflow manifest is invalid or missing
     */
    public async loadWorkflow(workflowPath: string): Promise<LoadedWorkflow> {
        const manifestPath = join(workflowPath, "workflow.yml");

        if (!existsSync(manifestPath)) {
            throw new Error(`Workflow manifest not found at ${manifestPath}`);
        }

        // Load and parse manifest
        const manifestContent = await readFile(manifestPath, "utf8");
        const manifest = yaml.load(manifestContent) as WorkflowManifest;

        // Validate manifest
        this.validateManifest(manifest);

        // Check if workflow is enabled (manifest default + config override + env var)
        const enabled = this.isWorkflowEnabled(manifest);

        // Load prompts if specified
        let prompts: string | undefined;
        if (manifest.prompts) {
            const promptsPath = join(workflowPath, manifest.prompts);
            if (existsSync(promptsPath)) {
                prompts = await readFile(promptsPath, "utf8");
            } else {
                this.logger.warn(`Prompts file not found for workflow ${manifest.name}: ${promptsPath}`);
            }
        }

        // Create loaded workflow
        const loadedWorkflow: LoadedWorkflow = {
            manifest,
            path: workflowPath,
            enabled,
            prompts,
            tools: [],
            taskHandlers: [],
        };

        // Store workflow
        this.workflows.set(manifest.name, loadedWorkflow);

        // Load tools if enabled
        if (enabled) {
            await this.loadWorkflowTools(loadedWorkflow);
        }

        this.logger.info(`Loaded workflow: ${manifest.name} (enabled: ${enabled})`);
        return loadedWorkflow;
    }

    /**
     * Validates a workflow manifest.
     *
     * @param manifest - The manifest to validate
     * @throws Error if the manifest is invalid
     */
    private validateManifest(manifest: WorkflowManifest): void {
        if (!manifest.name) {
            throw new Error("Workflow manifest must have a 'name' field");
        }
        if (!manifest.version) {
            throw new Error(`Workflow ${manifest.name} manifest must have a 'version' field`);
        }
        if (!manifest.description) {
            throw new Error(`Workflow ${manifest.name} manifest must have a 'description' field`);
        }
    }

    /**
     * Checks if a workflow is enabled based on manifest, configuration, and environment.
     *
     * Priority (highest to lowest):
     * 1. Environment variable: PENPOT_MCP_WORKFLOW_<NAME>=true|false
     * 2. Configuration file override
     * 3. Manifest default
     *
     * @param manifest - The workflow manifest
     * @returns True if the workflow should be enabled
     */
    private isWorkflowEnabled(manifest: WorkflowManifest): boolean {
        const workflowName = manifest.name;

        // Check environment variable
        const envVarName = `PENPOT_MCP_WORKFLOW_${workflowName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
        const envValue = process.env[envVarName];
        if (envValue !== undefined) {
            return envValue.toLowerCase() === "true";
        }

        // Check configuration file
        if (this.configuration?.workflows[workflowName]?.enabled !== undefined) {
            return this.configuration.workflows[workflowName].enabled!;
        }

        // Use manifest default
        return manifest.enabled ?? false;
    }

    /**
     * Loads tools from a workflow's tools directory.
     *
     * @param workflow - The workflow to load tools from
     */
    private async loadWorkflowTools(workflow: LoadedWorkflow): Promise<void> {
        const toolsDir = join(workflow.path, "tools");

        if (!existsSync(toolsDir)) {
            this.logger.debug(`No tools directory found for workflow ${workflow.manifest.name}`);
            return;
        }

        try {
            const tools = await this.toolRegistry.discoverTools(toolsDir, this.mcpServer);
            workflow.tools = tools;
            this.logger.info(`Loaded ${tools.length} tools for workflow ${workflow.manifest.name}`);
        } catch (error) {
            this.logger.error(`Failed to load tools for workflow ${workflow.manifest.name}: ${error}`);
        }
    }

    /**
     * Enables a workflow by name.
     *
     * @param name - The name of the workflow to enable
     * @throws Error if the workflow is not found
     */
    public async enableWorkflow(name: string): Promise<void> {
        const workflow = this.workflows.get(name);
        if (!workflow) {
            throw new Error(`Workflow not found: ${name}`);
        }

        if (workflow.enabled) {
            this.logger.info(`Workflow ${name} is already enabled`);
            return;
        }

        workflow.enabled = true;
        await this.loadWorkflowTools(workflow);
        this.logger.info(`Enabled workflow: ${name}`);
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
            this.logger.info(`Workflow ${name} is already disabled`);
            return;
        }

        workflow.enabled = false;
        // Note: We don't unregister tools since they might be used elsewhere
        this.logger.info(`Disabled workflow: ${name}`);
    }

    /**
     * Gets all tools from enabled workflows.
     *
     * @returns Array of tool instances from all enabled workflows
     */
    public getEnabledTools(): Tool<any>[] {
        return this.toolRegistry.getTools();
    }

    /**
     * Gets combined prompts from all enabled workflows.
     *
     * @returns Concatenated prompts from enabled workflows
     */
    public getCombinedPrompts(): string {
        const prompts: string[] = [];

        for (const workflow of this.workflows.values()) {
            if (workflow.enabled && workflow.prompts) {
                prompts.push(`# ${workflow.manifest.name} - ${workflow.manifest.description}\n\n${workflow.prompts}`);
            }
        }

        return prompts.join("\n\n---\n\n");
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
     * Gets all loaded workflows.
     *
     * @returns Array of all loaded workflows
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
}
