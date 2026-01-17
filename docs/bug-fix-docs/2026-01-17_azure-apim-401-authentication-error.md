# Bug Fix: Azure APIM 401 认证失败

## 基本信息

| 项目 | 内容 |
|------|------|
| **发现时间** | 2026-01-17 (UTC+8) |
| **解决时间** | 2026-01-17 (UTC+8) |
| **修复耗时** | 约 60 分钟 |
| **影响范围** | 使用 Azure APIM 代理访问 GPT-5.2-Chat 的所有 AI 功能 |
| **严重程度** | 高 |

---

## Bug 描述

### 现象

当用户配置 `azure_apim` 类型的 LLM Provider 后，调用 `/ai/test-connection` 或任何 AI 功能时，返回 401 Unauthorized 错误：

```json
{
  "success": false,
  "provider": "Azure APIM (gpt-5.2-chat)",
  "error": "Error code: 401 - {'statusCode': 401, 'message': 'Access denied due to missing subscription key'}"
}
```

### 复现步骤

1. 在前端 LLM 设置中添加 Azure APIM 配置：
   - Provider: `Azure APIM`
   - API Key: `4ce434a6dc054e71a4ae21db1b364d39`
   - Model: `gpt-5.2-chat`
   - Base URL: `https://linguamaster-openai-proxy.azure-api.net/linguamaster/openai/v1`
2. 点击"测试连接"按钮
3. 观察到 401 错误

---

## 根本原因分析

此 bug 涉及 **两个独立问题**，需要同时解决：

### 问题 1: `default_headers` 参数不可靠

最初尝试使用 LangChain `ChatOpenAI` 的 `default_headers` 参数添加 `api-key` 认证头：

```python
ChatOpenAI(
    api_key=self.api_key,
    model=self.model_name,
    base_url=base_url,
    default_headers={"api-key": self.api_key},  # 不可靠！
)
```

经调试发现，`default_headers` 有时不会正确传递到底层 HTTP 请求。

### 问题 2: 缺少 `api-version` 查询参数

Azure APIM 要求所有请求必须包含 `?api-version=2023-05-15` 查询参数。没有这个参数，即使认证头正确也会失败。

最初尝试将 `api-version` 放在 `base_url` 中：

```python
base_url_with_version = f"{base_url}?api-version=2023-05-15"
ChatOpenAI(base_url=base_url_with_version, ...)
```

但 ChatOpenAI 会在 base_url 后拼接 `/chat/completions`，导致 URL 格式错误：

```
❌ 错误: .../v1?api-version=2023-05-15/chat/completions
✅ 正确: .../v1/chat/completions?api-version=2023-05-15
```

### 错误演进

| 阶段 | 方案 | 结果 |
|------|------|------|
| 1 | `default_headers` | 401 - 头未传递 |
| 2 | `httpx.Client(headers=...)` | 401 - 缺少 api-version |
| 3 | `AzureChatOpenAI` | 404 - URL 含 `/deployments/` |
| 4 | `base_url` 含 `?api-version` | 404 - URL 格式错误 |
| 5 | httpx `event_hooks` | ✅ 成功 |

---

## 修复方案

### 核心修复: 使用 httpx event_hooks 动态注入请求参数

**文件**: `backend/ai/providers/llm.py`

使用 httpx 的 `event_hooks` 机制，在每个 HTTP 请求发送前动态添加认证头和查询参数：

```python
def get_chat_model(self, temperature: float = 0.7) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    import httpx

    # ... 省略 temperature 检测逻辑 ...

    # 确保 base_url 以 /v1 结尾
    base_url = self.base_url.rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = base_url + "/v1"

    # 创建自定义 httpx 客户端:
    # 1. 添加 api-key 认证头
    # 2. 动态添加 api-version 查询参数
    def add_api_version(request: httpx.Request) -> httpx.Request:
        url = request.url
        if "api-version" not in str(url):
            new_params = dict(url.params)
            new_params["api-version"] = self.DEFAULT_API_VERSION
            request.url = url.copy_with(params=new_params)
        return request

    http_client = httpx.Client(
        headers={"api-key": self.api_key},
        event_hooks={"request": [add_api_version]},
    )

    llm = ChatOpenAI(
        api_key=self.api_key,
        model=self.model_name,
        base_url=base_url,
        temperature=temperature,  # 或省略（推理模型）
        http_client=http_client,
    )

    return llm
```

### 关键点解释

1. **httpx.Client(headers=...)**: 确保 `api-key` 头被添加到每个请求
2. **event_hooks["request"]**: 在请求发送前修改 URL，添加 `api-version` 查询参数
3. **url.copy_with(params=...)**: httpx 的不可变 URL 设计，需要创建新 URL 对象

---

## 技术要点

### Azure APIM 认证机制

Azure APIM 支持三种认证头（按推荐顺序）：

| Header | 示例 |
|--------|------|
| `api-key` | `api-key: 4ce434a6dc054e71a4ae21db1b364d39` |
| `Ocp-Apim-Subscription-Key` | `Ocp-Apim-Subscription-Key: ...` |
| `Authorization` | `Authorization: Bearer ...` |

### ChatOpenAI vs AzureChatOpenAI

| 类 | URL 模式 | 适用场景 |
|----|----------|----------|
| `ChatOpenAI` | `/v1/chat/completions` | OpenAI 原生、APIM 代理 |
| `AzureChatOpenAI` | `/deployments/{name}/chat/completions` | Azure OpenAI 直连 |

本案例中 APIM 配置为 OpenAI 兼容模式，因此必须使用 `ChatOpenAI`。

### httpx event_hooks

httpx 提供了请求生命周期钩子，允许在请求发送前/后执行自定义逻辑：

```python
httpx.Client(
    event_hooks={
        "request": [func1, func2],   # 请求发送前
        "response": [func3, func4],  # 响应接收后
    }
)
```

---

## 验证步骤

1. 启动后端服务器
2. 使用以下 PowerShell 命令测试：

```powershell
$config = @{
    provider = 'azure_apim'
    apiKey = '4ce434a6dc054e71a4ae21db1b364d39'
    modelName = 'gpt-5.2-chat'
    baseUrl = 'https://linguamaster-openai-proxy.azure-api.net/linguamaster/openai/v1'
} | ConvertTo-Json -Compress
$base64Config = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($config))
Invoke-RestMethod -Uri 'http://localhost:8000/ai/test-connection' -Method POST -ContentType 'application/json' -Body '{}' -Headers @{'X-LLM-Config'=$base64Config}
```

3. 预期结果：

```
success provider                  test_response
------- --------                  -------------
   True Azure APIM (gpt-5.2-chat) Hello
```

---

## 相关文件

| 文件 | 修改类型 |
|------|----------|
| `backend/ai/providers/llm.py` | 修改 - 重写 `AzureAPIMProvider.get_chat_model()` |

---

## 后续优化建议

1. **错误信息增强**: 当 APIM 返回 401 时，提示用户检查 API Key 和 api-version 配置
2. **连接预检**: 在 provider 初始化时进行轻量级连接测试
3. **配置验证**: 前端添加 Base URL 格式验证，确保路径正确
4. **日志记录**: 添加请求 URL 和响应状态的日志，便于调试

---

## 参考文档

- 用户 APIM 集成指南: `C:\Users\hancao\application-integration-guide.md`
- httpx 官方文档: https://www.python-httpx.org/advanced/
