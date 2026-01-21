import React, { useState, useEffect } from "react";
import {
  llmConfigStorage,
  LLMConfig,
  LLMProviderType,
  PROVIDER_NAMES,
  DEFAULT_MODELS,
  DEFAULT_BASE_URLS,
} from "../../services/llmConfigStorage";
import { api } from "../../services/api";
import { useToast } from "../../contexts/ToastContext";
import "./LLMSettingsModal.css";

interface LLMSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LLMSettingsModal: React.FC<LLMSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, "testing" | "success" | "error">>({});

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState<LLMProviderType>("openai");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModelName, setFormModelName] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");

  useEffect(() => {
    if (isOpen) {
      setConfigs(llmConfigStorage.getAll());
    }
  }, [isOpen]);

  const resetForm = () => {
    setFormName("");
    setFormProvider("openai");
    setFormApiKey("");
    setFormModelName("");
    setFormBaseUrl("");
    setIsAdding(false);
    setEditingId(null);
  };

  const handleProviderChange = (provider: LLMProviderType) => {
    setFormProvider(provider);
    setFormModelName(DEFAULT_MODELS[provider]);
    setFormBaseUrl(DEFAULT_BASE_URLS[provider] || "");
  };

  const handleSave = () => {
    if (!formName || !formApiKey) {
      showToast("请填写配置名称和 API Key", "warning");
      return;
    }

    const currentConfigs = llmConfigStorage.getAll();
    const isFirstConfig = currentConfigs.length === 0;

    const configData = {
      name: formName,
      provider: formProvider,
      isActive: isFirstConfig, // 第一个配置自动激活
      config: {
        apiKey: formApiKey,
        modelName: formModelName || undefined,
        baseUrl: formBaseUrl || undefined,
      },
    };

    if (editingId) {
      llmConfigStorage.update(editingId, configData);
    } else {
      const newConfig = llmConfigStorage.add(configData);
      // 如果是第一个配置，确保它被激活
      if (isFirstConfig) {
        llmConfigStorage.setActive(newConfig.id);
      }
    }

    setConfigs(llmConfigStorage.getAll());
    resetForm();
  };

  const handleEdit = (config: LLMConfig) => {
    setEditingId(config.id);
    setFormName(config.name);
    setFormProvider(config.provider);
    setFormApiKey(config.config.apiKey);
    setFormModelName(config.config.modelName || DEFAULT_MODELS[config.provider]);
    setFormBaseUrl(config.config.baseUrl || DEFAULT_BASE_URLS[config.provider] || "");
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("确定要删除这个配置吗？")) {
      const deletingActive = configs.find(c => c.id === id)?.isActive;
      llmConfigStorage.delete(id);
      const updatedConfigs = llmConfigStorage.getAll();

      // 如果删除的是当前激活的配置，自动激活第一个剩余配置
      if (deletingActive && updatedConfigs.length > 0) {
        llmConfigStorage.setActive(updatedConfigs[0].id);
      }

      setConfigs(llmConfigStorage.getAll());
    }
  };

  const handleSetActive = (id: string) => {
    llmConfigStorage.setActive(id);
    setConfigs(llmConfigStorage.getAll());
  };

  const handleTestConnection = async (config: LLMConfig) => {
    setTestStatus((prev) => ({ ...prev, [config.id]: "testing" }));

    try {
      // Temporarily set this config as active for the test
      const wasActive = config.isActive;
      if (!wasActive) {
        llmConfigStorage.setActive(config.id);
      }

      const response = await api.post("/ai/test-connection", {});

      // Restore previous active state
      if (!wasActive) {
        const previousActive = configs.find((c) => c.isActive);
        if (previousActive) {
          llmConfigStorage.setActive(previousActive.id);
        }
      }

      if (response.data.success) {
        setTestStatus((prev) => ({ ...prev, [config.id]: "success" }));
      } else {
        setTestStatus((prev) => ({ ...prev, [config.id]: "error" }));
        showToast(`连接失败: ${response.data.error}`, "error");
      }
    } catch (e: unknown) {
      setTestStatus((prev) => ({ ...prev, [config.id]: "error" }));
      const message = e instanceof Error ? e.message : "Unknown error";
      showToast(`测试失败: ${message}`, "error");
    }
  };

  if (!isOpen) return null;

  const activeConfig = configs.find((c) => c.isActive);

  return (
    <div className="llm-settings-overlay" onClick={onClose}>
      <div className="llm-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="llm-settings-header">
          <h2>LLM 设置</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="llm-settings-content">
          {/* Current Status */}
          <div className="current-status">
            <span className="status-label">当前使用:</span>
            <span className="status-value">
              {activeConfig
                ? `${activeConfig.name} (${PROVIDER_NAMES[activeConfig.provider]})`
                : "未配置 - 请添加 LLM 配置"}
            </span>
          </div>

          {/* Empty State - Show when no configs */}
          {configs.length === 0 && !isAdding && (
            <div className="empty-state">
              <p>您还没有添加任何 LLM 配置。</p>
              <p>请点击下方按钮添加您的第一个 LLM 配置以使用 AI 功能。</p>
            </div>
          )}

          {/* Saved Configurations */}
          {configs.map((config) => (
            <div key={config.id} className="config-item">
              <div className="config-info">
                <input
                  type="radio"
                  name="activeConfig"
                  checked={config.isActive}
                  onChange={() => handleSetActive(config.id)}
                />
                <div className="config-details">
                  <span className="config-name">{config.name}</span>
                  <span className="config-provider">
                    {PROVIDER_NAMES[config.provider]} - {config.config.modelName || DEFAULT_MODELS[config.provider]}
                  </span>
                </div>
              </div>
              <div className="config-actions">
                <button
                  className={`test-button ${testStatus[config.id] || ""}`}
                  onClick={() => handleTestConnection(config)}
                  disabled={testStatus[config.id] === "testing"}
                >
                  {testStatus[config.id] === "testing"
                    ? "测试中..."
                    : testStatus[config.id] === "success"
                    ? "✓"
                    : testStatus[config.id] === "error"
                    ? "✗"
                    : "测试"}
                </button>
                <button className="edit-button" onClick={() => handleEdit(config)}>
                  编辑
                </button>
                <button className="delete-button" onClick={() => handleDelete(config.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}

          {/* Add/Edit Form */}
          {isAdding ? (
            <div className="config-form">
              <h3>{editingId ? "编辑配置" : "添加新配置"}</h3>

              <div className="form-group">
                <label>配置名称</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如: 我的 OpenAI"
                />
              </div>

              <div className="form-group">
                <label>提供商</label>
                <select
                  value={formProvider}
                  onChange={(e) => handleProviderChange(e.target.value as LLMProviderType)}
                >
                  {Object.entries(PROVIDER_NAMES).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div className="form-group">
                <label>模型名称</label>
                <input
                  type="text"
                  value={formModelName}
                  onChange={(e) => setFormModelName(e.target.value)}
                  placeholder={DEFAULT_MODELS[formProvider]}
                />
              </div>

              {(formProvider === "custom" ||
                formProvider === "deepseek" ||
                formProvider === "qwen" ||
                formProvider === "azure_apim") && (
                <div className="form-group">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={formBaseUrl}
                    onChange={(e) => setFormBaseUrl(e.target.value)}
                    placeholder={DEFAULT_BASE_URLS[formProvider] || "https://api.example.com/v1"}
                  />
                </div>
              )}

              <div className="form-actions">
                <button className="cancel-button" onClick={resetForm}>
                  取消
                </button>
                <button className="save-button" onClick={handleSave}>
                  保存
                </button>
              </div>
            </div>
          ) : (
            <button className="add-button" onClick={() => setIsAdding(true)}>
              + 添加新配置
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
