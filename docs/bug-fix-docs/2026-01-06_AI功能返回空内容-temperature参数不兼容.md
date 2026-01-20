# Bug Fix: AI 功能返回空内容 - Azure OpenAI 推理模型不支持 temperature 参数

## 基本信息

| 项目 | 内容 |
|------|------|
| **发现时间** | 2026-01-06 12:19 (UTC+8) |
| **解决时间** | 2026-01-06 12:37 (UTC+8) |
| **修复耗时** | 约 18 分钟 |
| **影响范围** | 所有 AI 功能（单词查询、AI Tutor、批量翻译） |
| **严重程度** | 高 |

---

## Bug 描述

### 现象

用户在 Interactive Subtitles 界面中：
1. 点击任意单词时，弹出的词汇卡片中 **definition、translation、example** 字段全部为空
2. 点击 ✨ 按钮进入 AI Tutor 时，没有显示任何翻译内容
3. 翻译按钮 (🌐) 点击后没有效果

### 复现步骤

1. 启动应用并加载一个已转录的视频
2. 在 Interactive Subtitles 面板中点击任意英文单词
3. 观察弹出的 WordPopover 卡片
4. 预期：显示单词的定义、翻译、例句
5. 实际：所有字段为空，控制台可见 API 返回 `{"error": "..."}`

---

## 根本原因分析

问题根源在于 **Azure OpenAI 的推理模型（如 gpt-5.2-chat、o1-preview 等）不支持自定义 temperature 参数**。

当代码尝试向这些模型发送请求时：

```python
# ai/chains.py
llm = get_llm(temperature=0.3)  # 传递 temperature=0.3
```

Azure API 返回错误：

```json
{
  "error": {
    "message": "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported.",
    "type": "invalid_request_error",
    "param": "temperature",
    "code": "unsupported_value"
  }
}
```

由于 AI Service 捕获异常后返回 `{"error": "..."}` 而不是抛出异常，前端收到的是空数据结构，导致 UI 显示为空。

---

## 修复方案

### 修复: 为 Azure 推理模型跳过 temperature 参数

**文件**: `backend/ai/providers/llm.py`

```python
class AzureLLMProvider(LLMProvider):
    """Azure OpenAI LLM provider."""

    # Models that only support temperature=1 (reasoning models)
    FIXED_TEMPERATURE_MODELS = {"o1-preview", "o1-mini", "o1", "gpt-5.2-chat", "o3-mini"}

    def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
        from langchain_openai import AzureChatOpenAI

        # Check if this model supports temperature parameter
        deployment = self.config.chat_deployment.lower()
        supports_temperature = not any(
            model in deployment for model in self.FIXED_TEMPERATURE_MODELS
        )

        if supports_temperature:
            return AzureChatOpenAI(
                azure_endpoint=self.config.endpoint,
                api_key=self.config.api_key,
                azure_deployment=self.config.chat_deployment,
                api_version=self.config.api_version,
                temperature=temperature,
            )
        else:
            # Reasoning models don't support temperature - omit it
            return AzureChatOpenAI(
                azure_endpoint=self.config.endpoint,
                api_key=self.config.api_key,
                azure_deployment=self.config.chat_deployment,
                api_version=self.config.api_version,
            )
```

**修复逻辑说明**：

1. 定义 `FIXED_TEMPERATURE_MODELS` 集合，包含所有已知不支持 temperature 的推理模型
2. 在创建 ChatModel 时，检查当前 deployment 名称是否包含这些模型名
3. 如果是推理模型，完全省略 temperature 参数，让 Azure 使用默认值
4. 如果是普通模型（如 gpt-4、gpt-4o），正常传递 temperature 参数

---

## 技术要点

### Azure OpenAI 推理模型的特殊限制

Azure OpenAI 的 o1 系列和 gpt-5.2 系列属于"推理模型"(Reasoning Models)，它们有以下限制：

| 参数 | 普通模型 (GPT-4) | 推理模型 (o1/gpt-5.2) |
|------|-----------------|---------------------|
| temperature | 0.0 - 2.0 | 仅支持默认值 1 |
| top_p | 支持 | 不支持 |
| max_tokens | 支持 | 使用 max_completion_tokens |
| system message | 支持 | 部分模型不支持 |

### 为什么之前没发现这个问题？

这个 bug 是在切换 Azure 部署模型后出现的。之前可能使用的是 gpt-4 或 gpt-4o 等支持 temperature 的模型，切换到 gpt-5.2-chat 后才暴露问题。

---

## 验证步骤

1. 重启后端服务
2. 在应用中点击任意单词
3. 确认 WordPopover 卡片显示完整的：
   - definition（定义）
   - pronunciation（发音）
   - translation（翻译）
   - example_sentence（例句）
4. 点击 ✨ 进入 AI Tutor，确认显示语法和文化解释
5. 检查后端日志确认无 400 错误

**API 测试命令**：

```powershell
$body = @{
    word = 'warning'
    context = 'Donald Trump has issued a warning to the new leader'
    target_language = 'Chinese'
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:8000/ai/lookup-word' -Method POST -Body $body -ContentType 'application/json'
```

预期返回包含所有字段的 JSON 对象。

---

## 相关文件

| 文件 | 修改类型 |
|------|----------|
| `backend/ai/providers/llm.py` | 修改 |

---

## 后续优化建议

1. **动态检测模型能力**：考虑调用 Azure API 的模型信息接口，动态判断支持的参数，而不是硬编码模型列表

2. **错误处理改进**：当 AI API 调用失败时，前端应显示友好的错误提示，而不是空白卡片

3. **配置文件增强**：在 `.env` 配置中添加 `AZURE_MODEL_TYPE=reasoning|standard` 选项，让用户明确指定模型类型

4. **更新模型列表**：随着 Azure OpenAI 推出新模型，需要定期更新 `FIXED_TEMPERATURE_MODELS` 列表
