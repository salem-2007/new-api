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

- **液态玻璃 UI**：全局玻璃质感面板（侧边栏 / 卡片 / 弹窗 / 输入框），支持日 / 夜双模式
- **自定义壁纸**：日 / 夜壁纸可配置，支持自定义 URL，管理员设置后跨设备同步（普通用户不可见）
- **主题自定义**：圆角 / 字体 / 明暗等设置全链路生效（侧边栏内嵌 / 侧边栏 / 悬浮三种布局模式均跟随主题圆角）
- **桌面客户端（Electron）**：内置 Go 后端，Windows 免装运行；中文菜单栏（文件 / 编辑 / 查看 / 窗口 / 帮助）、右键菜单（复制 / 粘贴等）、托盘最小化、数据独立存储于 `%AppData%\new-api-electron\data\one-api.db`
- **头像同步**：OAuth（GitHub 等）登录时自动同步头像
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

- **Liquid Glass UI**: frosted-glass panels everywhere (sidebar / cards / dialogs / inputs), light & dark modes
- **Custom wallpapers**: day / night wallpaper per mode, custom URL supported; admin-set wallpaper syncs across devices (hidden from regular users)
- **Theme customization**: radius / font / light-dark settings apply everywhere — all three sidebar layout modes (inset / sidebar / floating) follow the theme radius
- **Desktop client (Electron)**: bundles the Go backend, no install needed on Windows; Chinese menu bar (File / Edit / View / Window / Help), right-click context menu, tray minimize; data stored at `%AppData%\new-api-electron\data\one-api.db`
- **Avatar sync**: OAuth (GitHub etc.) login syncs avatar automatically
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
