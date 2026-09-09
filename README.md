<div align="center">

![new-api](/web/public/logo.png)

# New API — Liquid Glass Edition

基于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) `v1.0.0-rc.36` 的个人定制版。

[简体中文](#中文) | [English](#english)

</div>

---

## 中文

**这是什么版本**

上游官方 `v1.0.0-rc.36` 全量合并后的个人定制分支，包含官方全部功能（模型网关、渠道管理、计费、用户体系等），在此基础上做了界面与桌面端增强。

**做了什么修改**

- **液态玻璃 UI**：全局玻璃质感面板，支持日 / 夜双模式
- **自定义壁纸**：自定义配置日夜模式壁纸
- **桌面客户端（Electron）**：内置 Go 后端，Windows 免装运行
- **鼠标特效**：可选粒子拖尾 / 点击烟花 / 滑动爱心 / 文字特效

**构建产物**

| 文件 | 说明 |
|---|---|
| `new-api-windows-amd64.exe` | Windows 后端单文件（amd64，CGO off） |
| `New API.exe` | Windows 安装版（NSIS） |
| `New API-Portable.exe` | Windows 便携版（免安装） |

**构建方式**

```bash
# 前端（pnpm）
cd web && pnpm install && pnpm run build

# 后端交叉编译（Docker）
docker build --network host \
  --build-arg http_proxy=http://127.0.0.1:7897 \
  --build-arg GOPROXY=https://goproxy.cn,direct \
  --build-arg APP_VERSION=rc36 \
  --output type=local,dest=/tmp/out \
  -f /path/to/go-only.Dockerfile .

# 桌面端打包（需 wine）
cd electron && npm install && npm run build:win
```

---

## English

**What is this**

A personal fork of [QuantumNous/new-api](https://github.com/QuantumNous/new-api) based on upstream `v1.0.0-rc.36`, fully merged. All official features (LLM gateway, channel management, billing, user system) are preserved, with UI and desktop enhancements on top.

**What was changed**

- **Liquid Glass UI**: frosted-glass panels everywhere, light & dark modes
- **Custom wallpapers**: configurable day / night mode wallpapers
- **Desktop client (Electron)**: bundles the Go backend, no install needed on Windows
- **Mouse effects**: particle trail / click fireworks / heart trail / text effects

**Build artifacts**

| File | Description |
|---|---|
| `new-api-windows-amd64.exe` | Windows backend single binary (amd64, CGO off) |
| `New API.exe` | Windows installer (NSIS) |
| `New API-Portable.exe` | Windows portable (no install) |

**How to build**

```bash
# Frontend (pnpm)
cd web && pnpm install && pnpm run build

# Backend cross-compile (Docker)
docker build --network host \
  --build-arg http_proxy=http://127.0.0.1:7897 \
  --build-arg GOPROXY=https://goproxy.cn,direct \
  --build-arg APP_VERSION=rc36 \
  --output type=local,dest=/tmp/out \
  -f /path/to/go-only.Dockerfile .

# Desktop packaging (requires wine)
cd electron && npm install && npm run build:win
```

---

## License

Based on [New API](https://github.com/QuantumNous/new-api), licensed under AGPL-3.0. See [LICENSE](./LICENSE) and [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md).
