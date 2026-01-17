/**
 * LLM Configuration Storage Service
 *
 * Manages user LLM configurations in browser localStorage.
 * API keys are stored locally and never sent to the backend database.
 *
 * SECURITY CONSIDERATIONS:
 * - API keys are stored in plain text in localStorage (browser standard practice)
 * - When transmitted to backend, keys are base64-encoded (NOT encrypted)
 * - This is acceptable for localhost-only connections (Electron app with local backend)
 * - NEVER use this mechanism over non-localhost connections
 * - The api.ts interceptor includes a runtime warning for non-localhost usage
 */

export type LLMProviderType =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "azure_apim"
  | "custom";

export interface LLMProviderConfig {
  apiKey: string;
  modelName?: string;
  baseUrl?: string;
}

export interface LLMConfig {
  id: string;
  name: string;
  provider: LLMProviderType;
  isActive: boolean;
  config: LLMProviderConfig;
  createdAt: number;
  updatedAt: number;
}

// Default model names for each provider
export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: "gpt-4o-mini",
  claude: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  qwen: "qwen-plus",
  azure_apim: "gpt-4o",
  custom: "",
};

// Default base URLs (only needed for some providers)
export const DEFAULT_BASE_URLS: Partial<Record<LLMProviderType, string>> = {
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  azure_apim: "",
};

// Provider display names
export const PROVIDER_NAMES: Record<LLMProviderType, string> = {
  openai: "OpenAI",
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  deepseek: "DeepSeek",
  qwen: "Qwen (Alibaba)",
  azure_apim: "Azure APIM",
  custom: "Custom Endpoint",
};

const STORAGE_KEY = "llm_configs";

/**
 * Generate a unique ID for new configs
 */
function generateId(): string {
  return `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * LLM Configuration Storage Manager
 */
export const llmConfigStorage = {
  /**
   * Get all saved LLM configurations
   */
  getAll(): LLMConfig[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored) as LLMConfig[];
    } catch (e) {
      console.error("Failed to load LLM configs:", e);
      return [];
    }
  },

  /**
   * Get the currently active LLM configuration
   * Returns null if "Use Server Default" is selected
   */
  getActive(): LLMConfig | null {
    const configs = this.getAll();
    return configs.find((c) => c.isActive) || null;
  },

  /**
   * Add a new LLM configuration
   */
  add(config: Omit<LLMConfig, "id" | "createdAt" | "updatedAt">): LLMConfig {
    const configs = this.getAll();
    const now = Date.now();

    const newConfig: LLMConfig = {
      ...config,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };

    // If this is set as active, deactivate others
    if (newConfig.isActive) {
      configs.forEach((c) => (c.isActive = false));
    }

    configs.push(newConfig);
    this.save(configs);

    return newConfig;
  },

  /**
   * Update an existing configuration
   */
  update(
    id: string,
    updates: Partial<Omit<LLMConfig, "id" | "createdAt">>
  ): LLMConfig | null {
    const configs = this.getAll();
    const index = configs.findIndex((c) => c.id === id);

    if (index === -1) return null;

    // If setting this as active, deactivate others
    if (updates.isActive) {
      configs.forEach((c) => (c.isActive = false));
    }

    configs[index] = {
      ...configs[index],
      ...updates,
      updatedAt: Date.now(),
    };

    this.save(configs);
    return configs[index];
  },

  /**
   * Delete a configuration by ID
   */
  delete(id: string): boolean {
    const configs = this.getAll();
    const filtered = configs.filter((c) => c.id !== id);

    if (filtered.length === configs.length) return false;

    this.save(filtered);
    return true;
  },

  /**
   * Set a configuration as active (or deactivate all for server default)
   * @param id Config ID to activate, or null to use server default
   */
  setActive(id: string | null): void {
    const configs = this.getAll();
    configs.forEach((c) => {
      c.isActive = c.id === id;
    });
    this.save(configs);
  },

  /**
   * Check if using server default (no active user config)
   */
  isUsingServerDefault(): boolean {
    return this.getActive() === null;
  },

  /**
   * Get the header value for API requests
   * Returns null if using server default
   */
  getRequestHeader(): string | null {
    const active = this.getActive();
    if (!active) return null;

    const payload = {
      provider: active.provider,
      apiKey: active.config.apiKey,
      modelName: active.config.modelName || DEFAULT_MODELS[active.provider],
      baseUrl: active.config.baseUrl || DEFAULT_BASE_URLS[active.provider],
    };

    return btoa(JSON.stringify(payload));
  },

  /**
   * Save configs to localStorage
   */
  save(configs: LLMConfig[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch (e) {
      console.error("Failed to save LLM configs:", e);
    }
  },

  /**
   * Clear all configurations
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
