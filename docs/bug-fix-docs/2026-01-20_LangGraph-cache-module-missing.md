# Bug Fix: LangGraph 1.0.6 缺失 cache 模块导致 AI 导师功能不可用

## 基本信息

| 项目 | 内容 |
|------|------|
| **发现时间** | 2026-01-20 (UTC+8) |
| **解决时间** | 2026-01-20 (UTC+8) |
| **修复耗时** | 约 30 分钟 |
| **影响范围** | AI 导师对话功能完全不可用 |
| **严重程度** | 高 |

---

## Bug 描述

### 现象
用户在打包后的 LinguaMaster 应用 (v0.0.6) 中使用 AI 导师功能时，发送消息后收不到任何回复。后端日志显示错误：

```
ModuleNotFoundError: No module named 'langgraph.cache'
```

### 复现步骤
1. 安装 LinguaMaster v0.0.6
2. 配置 LLM 提供商（如 Azure APIM）
3. 打开一个视频，选择字幕文本
4. 点击 AI 导师图标，发送问题
5. 消息发送成功，但无回复显示

---

## 根本原因分析

### 问题根源

打包应用时安装的 `langgraph==1.0.6` 版本有一个**不完整的发布**问题：

1. `langgraph 1.0.6` 的 `graph/state.py` 文件第 26 行引用了 `langgraph.cache.base.BaseCache`
2. 但 `langgraph.cache` 模块并未包含在 PyPI 发布的包中
3. 该模块也不是独立的 PyPI 包（`pip install langgraph-cache` 找不到）

### 版本对比

| 版本 | langgraph.cache | 状态 |
|------|-----------------|------|
| 1.0.5 | 正常包含 | 可用 |
| 1.0.6 | 缺失 | 破损 |

### 相关代码

`langgraph/graph/state.py` (1.0.6 版本):
```python
from langgraph.cache.base import BaseCache  # 第 26 行 - 导入失败
```

---

## 修复方案

### 修复 1: 锁定 langgraph 版本为 1.0.5

**文件**: `backend/requirements.txt`

```diff
- langgraph
+ langgraph==1.0.5  # Pin to 1.0.5 - version 1.0.6 has missing langgraph.cache module
```

这确保后续打包时不会安装有问题的 1.0.6 版本。

### 修复 2: 降级已安装应用中的 langgraph

对于已安装的应用，直接在其 Python 环境中降级：

```bash
# 在应用的 Python 环境中执行
python.exe -m pip install langgraph==1.0.5
```

输出确认：
```
Successfully installed langgraph-1.0.5 langgraph-checkpoint-3.0.1
```

### 修复 3: 恢复使用 LangGraph 的 AI 导师实现

**文件**: `backend/ai_service.py`

之前为绕过问题临时改为直接调用 LangChain，现在恢复使用 LangGraph：

```python
def chat_with_tutor_with_provider(
    self,
    messages: List[Dict[str, str]],
    context_text: Optional[str],
    target_language: str,
    llm_provider: "LLMProvider",
) -> Dict[str, Any]:
    try:
        from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
        from ai.graph import create_tutor_graph_with_llm

        # Get chat model from provider
        llm = llm_provider.get_chat_model(temperature=0.7)

        # Create tutor graph with user's LLM
        tutor_graph = create_tutor_graph_with_llm(llm)

        # Convert message dicts to LangChain message objects
        lc_messages = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
            elif role == "system":
                lc_messages.append(SystemMessage(content=content))

        # Prepare input state for LangGraph
        input_state = {
            "messages": lc_messages,
            "context_text": context_text or "",
            "target_language": target_language,
        }

        # Invoke the graph
        result = tutor_graph.invoke(input_state)
        last_message = result["messages"][-1]

        return {"content": last_message.content, "role": "assistant"}

    except Exception as e:
        print(f"Error in chat_with_tutor_with_provider: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
```

---

## 技术要点

### LangChain vs LangGraph

| | LangChain | LangGraph |
|---|---|---|
| **定位** | LLM 应用开发框架 | 复杂 Agent 工作流引擎 |
| **核心功能** | 链式调用、Prompt 模板 | 状态机、循环、条件分支 |
| **项目用途** | 词典查询、语境解释 | AI 导师对话工作流 |

### 为什么保留 LangGraph

虽然当前 AI 导师功能可以用纯 LangChain 实现（只是简单的多轮对话），但保留 LangGraph 有以下优势：

1. 未来可扩展为更复杂的工作流（工具调用、条件分支）
2. 可使用 `MemorySaver` 实现跨会话记忆
3. 可使用 `trim_messages` 控制 token 使用量

---

## 验证步骤

1. 在打包应用的 Python 环境中验证导入：
   ```bash
   python.exe -c "from langgraph.graph import StateGraph; print('OK')"
   ```

2. 验证 AI 导师功能：
   - 打开应用
   - 选择视频中的字幕
   - 点击 AI 导师发送问题
   - 确认收到回复

3. 检查后端日志无 `langgraph.cache` 相关错误

---

## 相关文件

| 文件 | 修改类型 |
|------|----------|
| `backend/requirements.txt` | 修改 - 锁定 langgraph 版本 |
| `backend/ai_service.py` | 修改 - 恢复使用 LangGraph |
| `backend/ai/graph.py` | 无变更 - 已有 `create_tutor_graph_with_llm` |

---

## 后续优化建议

1. **监控 LangGraph 发布**: 关注 langgraph 1.0.7+ 版本是否修复此问题，确认后可解除版本锁定

2. **添加依赖锁定文件**: 考虑使用 `requirements.lock` 或 `pip-tools` 锁定所有依赖的精确版本，避免类似问题

3. **Token 优化**: 当 LangGraph 稳定后，可实现滑动窗口或消息摘要功能，控制长对话的 token 使用量
