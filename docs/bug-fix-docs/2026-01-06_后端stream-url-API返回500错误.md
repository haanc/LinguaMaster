# Bug Fix: 后端 stream-url API 返回 500 错误

## 基本信息

| 项目 | 内容 |
|------|------|
| **发现时间** | 2026-01-06 17:05 (UTC+8) |
| **解决时间** | 2026-01-06 17:30 (UTC+8) |
| **修复耗时** | 约 25 分钟 |
| **影响范围** | YouTube 视频流播放功能 |
| **严重程度** | 高 |

---

## Bug 描述

### 现象
1. 前端显示错误信息: "Error: Unexpected token 'I', 'Internal S'... is not valid JSON"
2. 后端 `/media/stream-url` 端点返回 500 Internal Server Error
3. YouTube 视频无法正常播放

### 复现步骤
1. 在 Library 页面选择一个 YouTube 视频
2. 点击播放
3. 观察到错误提示 "Unexpected token" JSON 解析错误

---

## 根本原因分析

### 问题 1: 空值检查缺失
在 `media_service.py` 第 31 行，代码尝试对可能为 `None` 的 `stream_url` 进行字符串切片操作：

```python
print(f"DEBUG: Final Stream URL: {stream_url[:100]}...")
```

当 `stream_url` 为 `None` 时，`stream_url[:100]` 会抛出 `TypeError`，导致整个函数崩溃。

### 问题 2: 无效的 yt-dlp 配置
配置中包含了 `javascript_runtime: 'node'`，但最新版本的 yt-dlp 默认只支持 `deno` 作为 JavaScript 运行时，这个配置会产生警告。

### 问题 3: 前端错误处理不完善
前端的 fetch 调用没有检查响应状态码，直接尝试解析 JSON，导致在收到 500 错误时出现 JSON 解析错误。

---

## 修复方案

### 修复 1: 添加空值检查

**文件**: `backend/media_service.py`

```python
# 修改前
print(f"DEBUG: Final Stream URL: {stream_url[:100]}...")

# 修改后
print(f"DEBUG: Final Stream URL: {stream_url[:100] if stream_url else 'None'}...")
```

### 修复 2: 移除无效的 javascript_runtime 配置

**文件**: `backend/media_service.py`

```python
# 修改前
ydl_opts = {
    'quiet': True,
    'no_warnings': False,
    'format': 'best[protocol^=http][protocol!*=m3u8][protocol!*=dash][ext=mp4]/best[ext=mp4]',
    'nocheckcertificate': True,
    'javascript_runtime': 'node',  # 移除此行
    'socket_timeout': 15,
    'retries': 10,
    'fragment_retries': 10,
}

# 修改后
ydl_opts = {
    'quiet': True,
    'no_warnings': False,
    'format': 'best[protocol^=http][protocol!*=m3u8][protocol!*=dash][ext=mp4]/best[ext=mp4]',
    'nocheckcertificate': True,
    'socket_timeout': 15,
    'retries': 10,
    'fragment_retries': 10,
}
```

### 修复 3: 改进前端错误处理

**文件**: `src/App.tsx`

```typescript
// 修改前
fetch(`http://localhost:8000/media/stream-url?url=${encodeURIComponent(media.source_url)}`)
  .then(res => res.json())
  .then(data => { /* ... */ })
  .catch(err => { /* ... */ });

// 修改后
fetch(`http://localhost:8000/media/stream-url?url=${encodeURIComponent(media.source_url)}`)
  .then(res => {
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }
    return res.json();
  })
  .then(data => { /* ... */ })
  .catch(err => {
    console.error('Failed to get stream URL:', err);
    setMessage(`Error: ${err.message}`);
  });
```

---

## 技术要点

1. **防御性编程**: 对于可能为空的值，在使用前应该进行检查，尤其是在日志输出中。

2. **HTTP 错误处理**: 使用 fetch API 时，非 2xx 响应不会触发 catch，需要手动检查 `response.ok`。

3. **依赖库配置**: 保持对依赖库版本更新的关注，移除不再支持的配置选项。

---

## 验证步骤

1. 重启后端服务
2. 在浏览器中测试 `http://localhost:8000/media/stream-url?url=<youtube_url>`
3. 确认返回有效的 JSON 响应
4. 在前端播放 YouTube 视频，确认可以正常播放

---

## 相关文件

| 文件 | 修改类型 |
|------|----------|
| `backend/media_service.py` | 修改 - 添加空值检查，移除无效配置 |
| `src/App.tsx` | 修改 - 改进错误处理 |

---

## 后续优化建议

1. 为后端 API 添加统一的错误响应格式
2. 前端添加更友好的错误提示 UI
3. 考虑添加重试机制处理临时性网络错误
