# Bug Fix: Import URL 失败 - yt-dlp Broken Pipe 错误

## 基本信息

| 项目 | 内容 |
|------|------|
| **发现时间** | 2026-01-17 15:00 (UTC+8) |
| **解决时间** | 2026-01-17 15:15 (UTC+8) |
| **修复耗时** | 约 15 分钟 |
| **影响范围** | 视频导入功能 - 所有 YouTube/Bilibili URL 导入均失败 |
| **严重程度** | 高 |

---

## Bug 描述

### 现象

用户在前端点击 Import 按钮导入 YouTube 或 Bilibili 视频 URL 时，显示错误：

```
Error: Server error: 500
```

后端数据库中该条目的状态变为 `error`，错误信息为：

```
Download Failed: [Errno 32] Broken pipe
```

### 复现步骤

1. 启动后端服务 (`uvicorn main:app --reload`)
2. 启动前端服务 (`npm run dev`)
3. 在前端输入框中粘贴任意 YouTube URL
4. 点击 "Import" 按钮
5. 等待几秒后，状态栏显示 `Error: Server error: 500`
6. 检查后端数据库，发现 `error_message` 为 `[Errno 32] Broken pipe`

---

## 根本原因分析

### 问题定位

`[Errno 32] Broken pipe` 错误发生在 Python 程序尝试向已关闭的管道（pipe）写入数据时。

在本项目中，问题出在 `media_service.py` 的 `download_audio()` 方法。当这个方法被 FastAPI 的 `BackgroundTasks` 调用时：

1. **yt-dlp 默认输出进度信息** - yt-dlp 会向 stdout 输出下载进度条
2. **后台任务没有正确的 stdout** - FastAPI BackgroundTasks 在后台线程中运行，没有连接到有效的终端
3. **管道断开** - 当 yt-dlp 尝试写入进度信息时，stdout 管道已关闭或不可用
4. **异常抛出** - 系统抛出 `[Errno 32] Broken pipe` 错误

### 为什么命令行直接运行没问题？

- 直接运行 `yt-dlp` 命令时，有完整的终端环境和 stdout 连接
- 直接运行 Python 脚本时，也有正常的 stdout
- 只有在 FastAPI BackgroundTasks 环境下，stdout 可能处于断开状态

---

## 修复方案

### 修复: 禁用 yt-dlp 的进度输出

**文件**: `backend/media_service.py`

**修改前**:
```python
def download_audio(self, url: str) -> str:
    """Download AUDIO ONLY using yt-dlp to local cache."""
    ydl_opts = {
        'outtmpl': f'{self.download_dir}/%(id)s.%(ext)s',
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'force_overwrites': True,
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
    }
```

**修改后**:
```python
def download_audio(self, url: str) -> str:
    """Download AUDIO ONLY using yt-dlp to local cache."""
    ydl_opts = {
        'outtmpl': f'{self.download_dir}/%(id)s.%(ext)s',
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'force_overwrites': True,
        'socket_timeout': 30,
        'retries': 10,
        'fragment_retries': 10,
        # IMPORTANT: Suppress output to prevent Broken pipe errors in background tasks
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
    }
```

**新增参数说明**:

| 参数 | 作用 |
|------|------|
| `quiet: True` | 禁用所有非错误输出 |
| `no_warnings: True` | 禁用警告信息输出 |
| `noprogress: True` | 禁用进度条输出 |

---

## 技术要点

### FastAPI BackgroundTasks 的特性

1. BackgroundTasks 在请求处理完成后异步执行
2. 运行在独立的线程或协程中
3. 不保证有有效的 stdout/stderr 连接
4. 长时间运行的任务应避免依赖终端输出

### yt-dlp 输出控制选项

yt-dlp 提供多个控制输出的选项：

```python
{
    'quiet': True,        # 只输出错误
    'no_warnings': True,  # 不输出警告
    'noprogress': True,   # 不显示进度条
    'verbose': False,     # 不显示调试信息
    'logger': my_logger,  # 自定义日志处理器（可选）
}
```

### 注意事项

- `fetch_metadata()` 方法已经有 `'quiet': True`，所以没有这个问题
- 如果需要记录下载进度，应使用 yt-dlp 的 `progress_hooks` 回调而非标准输出

---

## 验证步骤

1. 重启后端服务
2. 打开前端页面
3. 在输入框中粘贴 YouTube URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
4. 点击 "Import" 按钮
5. 验证：
   - 状态显示 "Importing..." 或 "downloading"
   - 等待完成后状态变为 "ready"
   - 不再显示 "Server error: 500"

---

## 相关文件

| 文件 | 修改类型 |
|------|----------|
| `backend/media_service.py` | 修改 |

---

## 后续优化建议

1. **添加日志记录**: 使用 Python logging 模块记录下载进度，而非依赖 stdout

   ```python
   import logging

   logger = logging.getLogger(__name__)

   ydl_opts = {
       'logger': logger,
       # ...
   }
   ```

2. **添加进度回调**: 如需追踪下载进度，使用 progress_hooks

   ```python
   def progress_hook(d):
       if d['status'] == 'downloading':
           percent = d.get('_percent_str', 'N/A')
           logger.info(f"Download progress: {percent}")

   ydl_opts = {
       'progress_hooks': [progress_hook],
       # ...
   }
   ```

3. **统一静默配置**: 考虑将所有 yt-dlp 调用的配置统一为一个常量，避免配置不一致

4. **添加单元测试**: 为 `download_audio()` 方法添加测试用例，包括后台任务环境的模拟测试
