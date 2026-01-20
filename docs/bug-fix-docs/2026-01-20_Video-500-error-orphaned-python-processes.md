# Bug Fix: 视频播放 500 错误 - 孤儿 Python 进程导致端口冲突

## 基本信息

| 项目 | 内容 |
|------|------|
| **发现时间** | 2026-01-20 (UTC+8) |
| **解决时间** | 2026-01-20 (UTC+8) |
| **修复耗时** | 约 20 分钟 |
| **影响范围** | 视频播放功能完全不可用（关闭重开应用后） |
| **严重程度** | 高 |

---

## Bug 描述

### 现象
用户在 LinguaMaster v0.0.6 中：
- 第一次打开应用时，视频可以正常播放
- 关闭应用后再次打开，点击视频显示 **"Server Error 500"**
- 必须重启电脑才能恢复

### 复现步骤
1. 安装 LinguaMaster v0.0.6
2. 打开应用，播放视频 - 正常
3. 关闭应用
4. 再次打开应用
5. 尝试播放视频 - 显示 500 错误

---

## 根本原因分析

### 问题根源

应用关闭时，Python 后端进程**未被正确终止**，成为孤儿进程继续占用端口 8000。

当再次启动应用时：
1. 新的 Python 后端尝试绑定端口 8000
2. 由于端口已被孤儿进程占用，新进程启动失败或行为异常
3. 前端请求 `/media/stream-url` 等接口时返回 500 错误

### 进程状态验证

调查时发现有 **8 个 Python 进程**同时运行：

```
netstat -ano | Select-String ':8000'
TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    1234
TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    5678
...
```

### 技术原因

Electron 使用 `child_process.spawn()` 启动 Python 后端时设置了 `shell: true`。在 Windows 上：

1. `shell: true` 会创建一个 cmd.exe 子进程
2. 调用 `pyProcess.kill()` 只终止了 cmd.exe
3. 实际的 python.exe 进程变成孤儿进程继续运行

```javascript
// 问题代码
pyProcess = spawn(pythonExe, [mainPy], {
  shell: true,  // 这导致 kill() 无法终止 python.exe
  ...
})

// pyProcess.kill() 只杀死 shell，不杀死 python
```

---

## 修复方案

### 修复 1: 添加启动时清理孤儿进程

**文件**: `electron/main.ts`

新增 `killExistingBackend()` 函数，在启动新后端前清理残留进程：

```typescript
async function killExistingBackend(): Promise<void> {
  if (process.platform !== 'win32') return

  console.log('Checking for orphaned backend processes...')
  try {
    const { execSync } = require('child_process')
    // 查找所有运行 backend-dist/main.py 的 Python 进程
    const output = execSync(
      'wmic process where "CommandLine like \'%backend-dist%main.py%\'" get ProcessId 2>nul',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    )

    const pids = output.split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => /^\d+$/.test(line))

    for (const pid of pids) {
      console.log('Killing orphaned backend process:', pid)
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
      } catch { }
    }
  } catch { }
}
```

### 修复 2: 改进应用退出时的进程终止

**文件**: `electron/main.ts`

修改 `will-quit` 事件处理，使用 `taskkill /T /F` 强制终止进程树：

```typescript
app.on('will-quit', () => {
  if (pyProcess && pyProcess.pid) {
    console.log('Terminating Python backend (PID:', pyProcess.pid, ')...')

    if (process.platform === 'win32') {
      try {
        // /T = 终止进程树, /F = 强制终止
        require('child_process').execSync(
          `taskkill /PID ${pyProcess.pid} /T /F`,
          { stdio: 'ignore' }
        )
        console.log('Python backend terminated via taskkill')
      } catch (e) {
        console.warn('taskkill failed, trying kill():', e)
        pyProcess.kill('SIGKILL')
      }
    } else {
      pyProcess.kill('SIGKILL')
    }
  }
})
```

### 修复 3: 启动流程改为异步

**文件**: `electron/main.ts`

修改 `startPythonBackend()` 为 async 函数，确保清理完成后再启动：

```typescript
async function startPythonBackend() {
  // 先清理可能存在的孤儿进程
  await killExistingBackend()

  // 然后启动新的后端
  // ...
}
```

---

## 技术要点

### Windows 进程终止

| 方法 | 效果 |
|------|------|
| `process.kill()` | 只发送信号，不保证终止子进程 |
| `taskkill /PID xxx` | 终止单个进程 |
| `taskkill /PID xxx /T` | 终止进程及其所有子进程 |
| `taskkill /PID xxx /T /F` | 强制终止进程树 |

### WMIC 查询进程

```cmd
wmic process where "CommandLine like '%keyword%'" get ProcessId
```

这个命令可以根据命令行参数查找进程，比 `tasklist` 更精确。

---

## 验证步骤

1. 打开应用，播放视频确认正常
2. 关闭应用
3. 检查是否有残留 Python 进程：
   ```powershell
   Get-Process python -ErrorAction SilentlyContinue |
     Where-Object { $_.Path -like '*LinguaMaster*' }
   ```
4. 再次打开应用，播放视频确认正常
5. 重复步骤 2-4 多次，确保问题不再出现

---

## 相关文件

| 文件 | 修改类型 |
|------|----------|
| `electron/main.ts` | 修改 - 添加进程清理逻辑 |
| `package.json` | 修改 - 版本号更新为 0.0.7 |

---

## 后续优化建议

1. **使用命名管道或 IPC**: 考虑使用更可靠的进程间通信方式，而非依赖端口

2. **健康检查机制**: 在启动后端前先检查端口是否可用，如果不可用则主动清理

3. **移除 shell: true**: 如果可能，移除 `shell: true` 选项，这样 `kill()` 可以直接终止 Python 进程

4. **日志记录**: 添加更详细的进程生命周期日志，便于调试类似问题
