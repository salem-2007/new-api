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

**Docker 部署**

镜像已发布到 GHCR（public）：

```bash
docker pull ghcr.io/salem-2007/new-api:latest
```

```bash
docker run -d --name new-api \
  --network host \
  -v /your/data:/data \
  -e PORT=3000 \
  -e TZ=Asia/Shanghai \
  ghcr.io/salem-2007/new-api:latest
```

启动后访问 `http://localhost:3000`。数据（SQLite：`one-api.db`）存放在挂载的 `/data` 目录，升级镜像不丢数据。

其他可用 tag：`ghcr.io/salem-2007/new-api:liquid-glass`

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

**Docker deployment**

Image published to GHCR (public):

```bash
docker pull ghcr.io/salem-2007/new-api:latest
```

```bash
docker run -d --name new-api \
  --network host \
  -v /your/data:/data \
  -e PORT=3000 \
  -e TZ=Asia/Shanghai \
  ghcr.io/salem-2007/new-api:latest
```

Visit `http://localhost:3000` after start. Data (SQLite: `one-api.db`) lives in the mounted `/data` directory — upgrading the image keeps your data.

Other tags: `ghcr.io/salem-2007/new-api:liquid-glass`

---

## License

Based on [New API](https://github.com/QuantumNous/new-api), licensed under AGPL-3.0. See [LICENSE](./LICENSE) and [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md).
