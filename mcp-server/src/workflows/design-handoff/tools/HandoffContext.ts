/**
 * Shared context for design handoff workflow.
 * This module defines the types and utilities for sharing data between tools.
 * 
 * The context is stored in the plugin's `storage` object (via execute_code),
 * allowing data to persist across tool calls within a session.
 */

/**
 * Extracted design token with usage tracking
 */
export interface DesignToken {
    name: string;
    value: string;
    category: 'color' | 'spacing' | 'typography' | 'borderRadius' | 'shadow' | 'dimension';
    usedIn: string[];          // Shape names where this token is used
    count: number;             // How many times it appears
    semanticName?: string;     // Inferred semantic name (e.g., "primary", "success")
}

/**
 * Component state/variant information
 */
export interface ComponentState {
    name: string;              // State name (e.g., "selected", "hover", "disabled")
    exampleShape: string;      // Shape ID demonstrating this state
    styles: Record<string, string>; // CSS-like properties
    trigger?: string;          // What triggers this state
}

/**
 * Component structure with semantic information
 */
export interface ComponentInfo {
    id: string;
    name: string;
    type: string;
    semanticType?: string;     // Inferred type (header, card, button, etc.)
    dimensions: { width: number; height: number };
    layout?: {
        type: 'flex' | 'grid' | 'none';
        direction?: string;
        gap?: number;
        padding?: { top: number; right: number; bottom: number; left: number };
    };
    children: ComponentInfo[];
    states?: ComponentState[];
}

/**
 * External asset dependency
 */
export interface ExternalAsset {
    type: 'font' | 'iconFont' | 'image';
    name: string;
    source?: string;           // e.g., "Google Fonts", "local"
    importUrl?: string;
    usagePattern?: string;     // How to use it in code
    details?: Record<string, any>;
}

/**
 * The full handoff context shared across tools
 */
export interface HandoffContext {
    // Metadata
    targetId: string;
    targetName: string;
    timestamp: number;
    
    // Phase 1: Structure analysis
    structure?: ComponentInfo;
    
    // Phase 2: Design tokens
    tokens?: {
        colors: DesignToken[];
        spacing: DesignToken[];
        typography: DesignToken[];
        borderRadius: DesignToken[];
        shadows: DesignToken[];
    };
    
    // Phase 3: Component states
    states?: {
        components: Array<{
            componentName: string;
            pattern: string;           // Pattern that groups variants
            variants: ComponentState[];
            implementationHint?: string;
        }>;
    };
    
    // Phase 4: External assets
    assets?: {
        fonts: ExternalAsset[];
        iconFonts: ExternalAsset[];
        images: ExternalAsset[];
    };
}

/**
 * Code to initialize/get handoff context in plugin storage
 */
export const INIT_CONTEXT_CODE = `
if (!storage.handoffContext) {
    storage.handoffContext = {};
}
`;

/**
 * Code to save handoff context to plugin storage
 */
export function getSaveContextCode(context: Partial<HandoffContext>): string {
    return `
storage.handoffContext = {
    ...storage.handoffContext,
    ...${JSON.stringify(context)},
    timestamp: Date.now()
};
return { saved: true, keys: Object.keys(storage.handoffContext) };
`;
}

/**
 * Code to get current handoff context from plugin storage
 */
export const GET_CONTEXT_CODE = `
return storage.handoffContext || null;
`;

/**
 * Semantic type patterns for inferring component types
 */
export const SEMANTIC_PATTERNS: Record<string, RegExp[]> = {
    header: [/header/i, /nav.*bar/i, /top.*bar/i, /app.*bar/i],
    footer: [/footer/i, /bottom.*bar/i, /tab.*bar/i],
    sidebar: [/sidebar/i, /side.*nav/i, /drawer/i],
    card: [/card/i, /tile/i, /item/i, /cell/i],
    button: [/button/i, /btn/i, /action/i, /cta/i],
    input: [/input/i, /field/i, /text.*box/i, /search/i],
    badge: [/badge/i, /tag/i, /chip/i, /label/i, /status/i],
    modal: [/modal/i, /dialog/i, /popup/i, /overlay/i],
    avatar: [/avatar/i, /profile.*pic/i, /user.*image/i],
    icon: [/icon/i, /symbol/i],
    list: [/list/i, /menu/i, /items/i],
    grid: [/grid/i, /gallery/i, /collection/i],
    calendar: [/calendar/i, /date/i, /day/i, /month/i],
    form: [/form/i, /login/i, /signup/i, /register/i],
    navigation: [/nav/i, /menu/i, /breadcrumb/i],
};

/**
 * Icon font detection patterns
 */
export const ICON_FONT_PATTERNS: Record<string, { pattern: RegExp; library: string; importUrl: string; usage: string }> = {
    'material-symbols': {
        pattern: /^(add|remove|edit|delete|close|menu|search|home|settings|person|check|arrow_|chevron_|expand_|more_|refresh|share|star|favorite|bookmark|visibility|notifications|mail|chat|phone|location|calendar|schedule|attach|file|folder|cloud|lock|unlock|info|warning|error|help|check_circle|cancel|done|clear|add_circle|remove_circle|trending_|thumb_|play_|pause|stop|skip_|volume_|mic|camera|image|video|music|download|upload|print|save|send|reply|forward|undo|redo|copy|paste|cut|format_|text_|font_|link|code|bug|build|extension|api|terminal|analytics|dashboard|account_|group|public|language|translate|dark_mode|light_mode|battery_|wifi|bluetooth|gps|qr_code|credit_card|shopping_|receipt|local_|restaurant|flight|hotel|directions_|map|layers|grid_|view_|table_|list|sort|filter|tune|speed|timer|event|today|history|update|sync|cached|storage|memory|dns|router|devices|computer|phone_|tablet|watch|tv|headset|keyboard|mouse|monitor|laptop|desktop|cast|gamepad|sports_|fitness|health|medical|eco|forest|water|sunny|nights_stay|ac_unit|whatshot|waves|terrain|landscape|pets|spa|pool|beach|sailing|camping|hiking|snowboarding|skateboarding|surfing|kayaking|nordic_walking|rowing|paragliding|scuba_diving|kitesurfing)/i,
        library: 'Material Symbols',
        importUrl: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
        usage: '<span class="material-symbols-outlined">icon_name</span>'
    },
    'fontawesome': {
        pattern: /^fa-/i,
        library: 'Font Awesome',
        importUrl: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
        usage: '<i class="fa-solid fa-icon-name"></i>'
    },
    'lucide': {
        pattern: /^(lucide-|arrow-|circle-|square-|triangle-|heart-|star-|sun-|moon-|cloud-|lock-|unlock-|eye-|user-|users-|file-|folder-|home-|settings-|search-|menu-|x-|check-|plus-|minus-|edit-|trash-|download-|upload-|share-|link-|mail-|phone-|calendar-|clock-|map-|flag-|bell-|camera-|image-|video-|music-)/i,
        library: 'Lucide Icons',
        importUrl: 'https://unpkg.com/lucide@latest/dist/lucide.min.js',
        usage: '<i data-lucide="icon-name"></i>'
    }
};

/**
 * Color semantic inference based on common patterns
 */
export const COLOR_SEMANTICS: Record<string, { pattern: RegExp; priority: number }> = {
    'primary': { pattern: /^#[89a][0-5][4-9a-d][0-9a-f]{3}$/i, priority: 1 },  // Purple-ish
    'success': { pattern: /^#[23][0-9a-f][c-f][0-9a-f][5-9][0-9a-f]$/i, priority: 2 },  // Green-ish
    'warning': { pattern: /^#[ef][ef][c-f][c-f][0-3][0-3]$/i, priority: 2 },  // Yellow-ish
    'error': { pattern: /^#[de][0-4][2-5][0-9a-f]{3}$/i, priority: 2 },  // Red-ish
    'info': { pattern: /^#[0-3][0-9a-f][89a-f][0-9a-f][ef][0-9a-f]$/i, priority: 2 },  // Blue-ish
};

/**
 * Standard spacing scale values
 */
export const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

/**
 * Infers a semantic name for a color based on its hex value
 */
export function inferColorSemantic(hex: string, usedIn: string[]): string | undefined {
    const normalizedHex = hex.toLowerCase();
    
    // Check context clues from usage
    const usageStr = usedIn.join(' ').toLowerCase();
    
    if (usageStr.includes('primary') || usageStr.includes('brand') || usageStr.includes('main')) {
        return 'primary';
    }
    if (usageStr.includes('success') || usageStr.includes('approved') || usageStr.includes('complete')) {
        return 'success';
    }
    if (usageStr.includes('warning') || usageStr.includes('pending') || usageStr.includes('submitted')) {
        return 'warning';
    }
    if (usageStr.includes('error') || usageStr.includes('danger') || usageStr.includes('reject')) {
        return 'error';
    }
    if (usageStr.includes('muted') || usageStr.includes('disabled') || usageStr.includes('inactive')) {
        return 'muted';
    }
    if (usageStr.includes('bg') || usageStr.includes('background') || usageStr.includes('surface')) {
        return 'surface';
    }
    
    // Check color patterns
    for (const [name, { pattern }] of Object.entries(COLOR_SEMANTICS)) {
        if (pattern.test(normalizedHex)) {
            return name;
        }
    }
    
    // Check for grayscale
    const r = parseInt(normalizedHex.slice(1, 3), 16);
    const g = parseInt(normalizedHex.slice(3, 5), 16);
    const b = parseInt(normalizedHex.slice(5, 7), 16);
    
    if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20) {
        if (r > 240) return 'white';
        if (r < 30) return 'black';
        if (r > 200) return 'gray-light';
        if (r > 100) return 'gray';
        return 'gray-dark';
    }
    
    return undefined;
}
