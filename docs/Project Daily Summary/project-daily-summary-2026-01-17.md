# 项目每日进展总结

> 📅 日期：2026-01-17
> 🕐 记录时间：20:25 (UTC+8)
> 📁 项目：LinguaMaster (fluent-learner-v2)

---

## 📊 今日概览

| 类别 | 数量 |
|------|------|
| 新增功能 | 4 |
| 代码优化 | 1 |
| 架构调整 | 2 |
| Bug 修复 | 2 |

---

## 🚀 新增功能

### 1. 完整 Electron 应用打包与 Python 后端集成

| 项目 | 内容 |
|------|------|
| **开始时间** | 19:35 |
| **完成时间** | 19:49 |
| **耗时** | 约 14 分钟 |

**功能描述：**
实现了完整的桌面应用打包流程，将 React 前端与 Python 后端打包为一体化的 Windows 安装程序。

**实现方式：**
- 技术栈：Electron Builder + NSIS 安装器 + PowerShell 自动化脚本
- 关键实现：
  - 创建 `scripts/prepare-backend.ps1` 脚本自动打包 Python 虚拟环境
  - 配置 `extraResources` 将 backend-dist 目录纳入分发包
  - 使用安全过滤器排除敏感文件（.env、*.db、credentials）

**涉及文件：**
| 文件 | 修改类型 |
|------|----------|
| `scripts/prepare-backend.ps1` | 新增 |
| `package.json` | 修改 |
| `electron-builder.json5` | 修改 |

**打包成果：**
- 安装包大小：163.72 MB（含 334.75 MB 后端依赖）
- 包含：FastAPI 服务、faster-whisper 本地转录、完整 Python 运行时

---

### 2. Whisper 模型目录配置支持

| 项目 | 内容 |
|------|------|
| **时间** | 19:35 |

**功能描述：**
增强后端 AI 配置模块，支持从 Electron 主进程接收 Whisper 模型存储目录。

**实现方式：**
- 新增 `WHISPER_MODELS_DIR` 环境变量支持
- 保持与 `LOCAL_WHISPER_MODELS_DIR` 的向后兼容
- Electron 启动后端时自动传递 userData 目录路径

**涉及文件：**
| 文件 | 修改类型 |
|------|----------|
| `backend/ai/config.py` | 修改 |

---

### 3. Windows NSIS 安装器配置

| 项目 | 内容 |
|------|------|
| **时间** | 19:41 |

**功能描述：**
完善 Windows 安装器配置，支持自定义安装目录和用户级安装。

**实现方式：**
- 配置 `oneClick: false` 允许用户控制安装过程
- 设置 `perMachine: false` 实现用户级安装（无需管理员权限）
- 添加自定义图标支持（installer/uninstaller）

**涉及文件：**
| 文件 | 修改类型 |
|------|----------|
| `package.json` | 修改 |
| `electron-builder.json5` | 修改 |
| `public/icon.ico` | 新增 |

---

### 4. 后端打包自动化脚本

| 项目 | 内容 |
|------|------|
| **时间** | 19:36 - 19:38 |

**功能描述：**
创建 PowerShell 脚本自动化 Python 后端打包流程。

**实现方式：**
- 复制 Python 源文件和目录结构
- 完整复制虚拟环境（Scripts、Lib）
- 清理缓存文件（__pycache__、*.pyc）
- 生成 `.env.example` 配置模板
- 可选：预下载 Whisper 模型

**涉及文件：**
| 文件 | 修改类型 |
|------|----------|
| `scripts/prepare-backend.ps1` | 新增 |

---

## ⚡ 代码优化

### 1. 后端打包脚本路径解析修复

| 项目 | 内容 |
|------|------|
| **时间** | 19:36 |

**优化内容：**
修复脚本路径检测逻辑，使用更可靠的 PowerShell 方法。

**优化效果：**
- 替换弃用的 `$PSScriptRoot` 为 `$MyInvocation.MyCommand.Path`
- 增加路径存在性验证
- 支持从任意工作目录调用脚本

**涉及文件：**
- `scripts/prepare-backend.ps1`

---

## 🏗️ 架构调整

### 1. Electron Builder 配置重构

| 项目 | 内容 |
|------|------|
| **时间** | 19:35 |

**调整内容：**
将 `extraResources` 从原始 backend 目录改为预打包的 backend-dist 目录。

**调整原因：**
- 原方案仅复制源文件，缺少 Python 运行时
- 新方案包含完整虚拟环境，支持离线运行

**影响范围：**
- 构建流程需先运行 `npm run build:prepare`
- 分发包大小从 81.9 MB 增至 163.72 MB

---

### 2. package.json 构建配置整合

| 项目 | 内容 |
|------|------|
| **时间** | 19:41 |

**调整内容：**
解决 package.json 与 electron-builder.json5 配置冲突。

**调整原因：**
发现 electron-builder 优先使用 package.json 中的 build 配置，导致 electron-builder.json5 中的 extraResources 未生效。

**影响范围：**
- 将完整配置迁移至 package.json
- 保留 electron-builder.json5 作为补充配置

---

## 🐛 Bug 修复

### 1. Library 页面加载失败

| 项目 | 内容 |
|------|------|
| **修复时间** | 19:57 - 20:04 |
| **严重程度** | 高 |
| **影响范围** | 应用核心功能 |

**问题概述：**
用户安装打包软件后，Library 页面一直显示 "Loading Library..."，无法加载媒体列表。

**根本原因：**
端口 8000 冲突 - 多个 Python 进程和 WSL 转发服务同时占用该端口。

**解决方案：**
1. 识别冲突进程（Windows Python PID 1684、WSL uvicorn PID 233191/206107）
2. 终止 WSL 中的后端进程：`kill -9 233191 206107`
3. 确认端口释放：`ss -tlnp | grep 8000`

---

### 2. APIM LLM 配置认证失败

| 项目 | 内容 |
|------|------|
| **修复时间** | 20:14 |
| **严重程度** | 中 |
| **影响范围** | Azure APIM LLM 集成 |

**问题概述：**
用户添加 APIM 配置时显示 "resource not found" 错误。

**诊断结果：**
- APIM 端点可达：`https://linguamaster-openai-proxy.azure-api.net/linguamaster/openai/v1/models`
- 返回 HTTP 401 Unauthorized，表明需要有效的 API Key
- 开发环境配置使用 gpt-5.2-chat 模型

---

## 📋 后续待办

### 高优先级
- [ ] 验证安装后的应用功能完整性
- [ ] 测试本地 Whisper 首次下载流程
- [ ] 解决 APIM 认证配置问题

### 中优先级
- [ ] 同步代码到 fluent-learner-v2 主项目
- [ ] 创建 GitHub Actions 工作流支持 M1 Mac 构建

### 低优先级/建议
- [ ] 优化安装包大小（考虑压缩或按需下载依赖）
- [ ] 添加自动更新功能

---

## 📈 相关统计

| 指标 | 数值 |
|------|------|
| 总工作时长 | 约 1 小时 |
| 代码文件变更 | 6 个 |
| 安装包大小 | 163.72 MB |
| 后端依赖大小 | 334.75 MB |

---

*此文档由 Claude Code 自动生成*
