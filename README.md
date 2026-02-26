# live_manosaba - 魔法少女表情生成器

本项目相关素材来源于游戏《魔法少女的魔女裁判》（ManoSaba）。

这是一个基于 **React + PixiJS** 的 2D 角色组件拼装/表情生成器，可以通过切换不同的面部组件（眼睛、嘴巴、腮红、手臂等）来生成各种角色表情，并支持导出为图片。

## ✨ 功能特性

- 🎭 **多角色支持**：支持 13 个角色（Ema、Alisa、Hiro、Nanoka、Miria、AnAn、Coco、Margo、Hanna、Sherry、Noah、Leia、Meruru）
- 🎨 **组件自由组合**：可以自由切换眼睛、嘴巴、腮红、手臂等部件
- 🌈 **背景切换**：提供多种背景选项（蓝天渐变、暖色渐变等）
- 🎲 **随机表情**：一键生成随机表情组合（支持部分角色）
- 💾 **导出图片**：将生成的表情导出为 PNG 图片
- 🖼️ **实时预览**：使用 PixiJS 实现流畅的实时渲染

## 📋 环境要求

### 前端应用（必需）

- **Node.js**：建议 v18.0.0 或更高版本
- **npm**：v9.0.0 或更高版本（通常随 Node.js 安装）
- **操作系统**：Windows、macOS 或 Linux
- **浏览器**：现代浏览器（Chrome、Firefox、Safari、Edge 等）

### 资源处理（可选）

如果需要从 PSD 文件重新提取资源，需要：

- **Python**：3.8 或更高版本
- **Python 依赖**：
  - `psd-tools`：用于解析 PSD 文件
  - `Pillow`：用于图像处理

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/ReinerBRO/live_manosaba.git
cd live_manosaba
```

### 2. 安装依赖

进入 `web_app` 目录并安装 npm 依赖：

```bash
cd web_app
npm install
```

安装过程可能需要几分钟，请耐心等待。

### 3. 创建资源符号链接

为了让 Vite 能够访问项目根目录的 `resources/` 资源文件，需要创建一个符号链接：

**Linux / macOS：**
```bash
ln -sfn ../../resources web_app/public/resources
```

**Windows（需要管理员权限）：**
```cmd
mklink /D web_app\public\resources ..\..\resources
```

或者直接复制资源文件夹（不推荐，会占用更多空间）：
```cmd
xcopy /E /I ..\..\resources web_app\public\resources
```

### 4. 启动开发服务器

```bash
npm run dev
```

启动成功后，终端会显示类似以下信息：

```
  VITE v7.2.5  ready in 1234 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 5. 访问应用

在浏览器中打开 `http://localhost:5173/`，即可看到表情生成器界面。

## 📖 使用说明

### 界面布局

- **左侧控制面板**：
  - 角色选择下拉菜单
  - 各个部件的切换选项（眼睛、嘴巴、手臂等）
  - 背景选择
  - 随机表情按钮（部分角色支持）
  - 导出图片按钮

- **右侧画布区域**：
  - 实时显示当前角色和表情
  - 使用 PixiJS 渲染，支持流畅的动画效果

### 基本操作

1. **选择角色**：在顶部下拉菜单中选择想要的角色
2. **切换部件**：在左侧面板中点击不同的选项来切换眼睛、嘴巴、手臂等部件
3. **更换背景**：选择不同的背景颜色或渐变效果
4. **随机表情**：点击"随机表情"按钮（仅支持 Ema、Hiro、Sherry、Hanna、AnAn、Nanoka）
5. **导出图片**：点击"导出图片"按钮，将当前表情保存为 PNG 文件

### 随机表情规则

随机表情功能会智能地组合各个部件，遵循以下规则：

- `Arm`、`Mouth`、`Eyes` 不会随机到 `None`（确保角色完整）
- `Arms` 与 `ArmL/ArmR` 互斥（避免出现多臂或无臂情况）
- `Option_Arms`、`Option_ArmR` 会根据当前手臂类型自动匹配
- `FacialLine`、`HeadBase` 作为基础层永远开启，并会跟随 Head 01/02 自动匹配

## 🏗️ 项目结构

```
live_manosaba/
├── web_app/                    # 前端应用
│   ├── src/                    # 源代码
│   │   ├── App.jsx            # 主应用组件
│   │   ├── CharacterViewer.jsx # 角色渲染组件
│   │   ├── ControlPanel.jsx   # 控制面板组件
│   │   └── main.jsx           # 入口文件
│   ├── public/                # 静态资源
│   │   └── resources/         # 符号链接到 ../../resources
│   ├── package.json           # 依赖配置
│   └── vite.config.js         # Vite 配置
├── resources/                  # 角色资源文件（会被 git 跟踪）
│   ├── characters.json        # 角色列表配置
│   └── characters/            # 各角色的资源
│       └── <角色名>/
│           └── PSD/
│               ├── model.json # 角色模型配置
│               └── parts/     # 部件图片
├── script/                     # 辅助脚本
│   ├── configs/               # 角色配置文件
│   └── *.py                   # Python 工具脚本
├── extract_psd.py             # PSD 提取脚本
├── inspect_psd.py             # PSD 检查脚本
├── gen_char_list.py           # 角色列表生成脚本
└── README.md                  # 本文档
```

### 关键文件说明

- **`resources/characters.json`**：定义了所有可用的角色列表
- **`resources/characters/<角色名>/PSD/model.json`**：每个角色的模型配置，包含图层结构、部件位置等信息
- **`resources/characters/<角色名>/PSD/parts/*.png`**：角色的各个部件图片
- **`web_app/src/App.jsx`**：主应用逻辑，处理角色切换和状态管理
- **`web_app/src/CharacterViewer.jsx`**：使用 PixiJS 渲染角色的核心组件
- **`web_app/src/ControlPanel.jsx`**：控制面板 UI 组件

## 🔧 高级功能

### 构建生产版本

如果需要部署到生产环境，可以构建静态文件：

```bash
cd web_app
npm run build
```

构建完成后，生成的文件会在 `web_app/dist/` 目录中。可以将这个目录部署到任何静态文件服务器（如 Nginx、Apache、GitHub Pages 等）。

### 预览生产版本

构建后可以本地预览：

```bash
npm run preview
```

### 从 PSD 重新提取资源（可选）

如果你有原始的 PSD 文件并想重新提取资源：

1. 安装 Python 依赖：
```bash
pip install psd-tools Pillow
```

2. 将 PSD 文件放在 `asset/` 目录中（该目录不会被 git 跟踪）

3. 运行提取脚本：
```bash
python extract_psd.py
```

4. 脚本会自动将提取的资源保存到对应角色的 `PSD/` 目录中

### 检查 PSD 文件结构

如果需要查看 PSD 文件的图层结构：

```bash
python inspect_psd.py
```

### 生成角色列表

更新 `resources/characters.json`：

```bash
python gen_char_list.py
```

## ❓ 常见问题

### Q1: 启动后页面空白或资源加载失败

**A:** 请确保已经创建了资源符号链接。检查 `web_app/public/resources` 是否正确指向 `../../resources`。

```bash
# 检查符号链接
ls -la web_app/public/resources

# 如果不存在或错误，重新创建
cd web_app/public
rm -rf resources  # 删除旧的（如果存在）
ln -sfn ../../resources resources
```

### Q2: npm install 失败

**A:** 可能是网络问题或 Node.js 版本不兼容。尝试：

1. 检查 Node.js 版本：`node -v`（建议 v18+）
2. 清除 npm 缓存：`npm cache clean --force`
3. 删除 `node_modules` 和 `package-lock.json`，重新安装：
```bash
rm -rf node_modules package-lock.json
npm install
```
4. 如果在中国大陆，可以使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
```

### Q3: 部分角色显示异常或有光晕

**A:** 这是已知问题。部分 PSD 的混合模式（blending/softlight/overlay）在网页端可能造成显示异常。项目已对部分图层做了屏蔽处理以保证显示稳定。如果遇到新的问题，可以在 `CharacterViewer.jsx` 中调整图层的混合模式或可见性。

### Q4: 随机表情按钮不可用

**A:** 随机表情功能目前只支持以下角色：
- Ema
- Hiro
- Sherry
- Hanna
- AnAn
- Nanoka

其他角色暂不支持随机功能。

### Q5: 导出的图片背景是透明的

**A:** 这是正常行为。导出的 PNG 图片默认使用透明背景，方便后续处理。如果需要带背景的图片，可以在导出前选择一个背景颜色。

### Q6: 如何添加新角色？

**A:** 添加新角色需要：

1. 准备角色的 PSD 文件
2. 将 PSD 文件放在 `asset/<角色名>/` 目录
3. 运行 `python extract_psd.py` 提取资源
4. 将提取的资源移动到 `resources/characters/<角色名>/`
5. 更新 `resources/characters.json`，添加新角色名称
6. 如果需要支持随机表情，需要在 `App.jsx` 中添加相应的配置

### Q7: 在 Windows 上无法创建符号链接

**A:** Windows 创建符号链接需要管理员权限。可以：

1. 以管理员身份运行命令提示符或 PowerShell
2. 或者直接复制资源文件夹（不推荐）：
```cmd
xcopy /E /I ..\..\resources web_app\public\resources
```

## 🛠️ 技术栈

- **前端框架**：React 19.2.0
- **渲染引擎**：PixiJS 8.15.0
- **UI 组件库**：Ant Design 6.2.2
- **构建工具**：Vite (rolldown-vite 7.2.5)
- **图标库**：Ant Design Icons、Lucide React
- **资源处理**：Python 3.x + psd-tools + Pillow

## 📝 开发说明

### 代码规范

项目使用 ESLint 进行代码检查：

```bash
npm run lint
```

### 主要依赖说明

- **@pixi/react**：PixiJS 的 React 封装，用于声明式地使用 PixiJS
- **pixi.js**：高性能的 2D WebGL 渲染引擎
- **antd**：提供丰富的 UI 组件
- **react** / **react-dom**：React 核心库

### 开发建议

1. 修改代码后，Vite 会自动热重载，无需手动刷新浏览器
2. 如果遇到渲染问题，可以在浏览器开发者工具的 Console 中查看错误信息
3. 角色模型配置在 `resources/characters/<角色名>/PSD/model.json` 中，可以手动调整图层顺序、混合模式等
4. 如果需要调整 UI 布局，主要修改 `ControlPanel.jsx` 和 `App.css`

## ⚠️ 版权与免责声明

- 本仓库中的图像/模型数据仅为作者个人**转载与学习研究**用途展示，不代表任何官方立场
- 相关素材版权归原权利人所有；若权利人认为侵权，请联系作者删除
- **禁止将本仓库中的图像/模型数据用于任何商业用途**（包括但不限于售卖、广告、付费内容、营利性服务等）
- 本项目代码仅提供技术实现参考；使用者因使用本仓库内容产生的任何纠纷与损失，与作者无关

## 📧 联系方式

- **GitHub**：[@ReinerBRO](https://github.com/ReinerBRO)
- **项目地址**：[https://github.com/ReinerBRO/live_manosaba](https://github.com/ReinerBRO/live_manosaba)

## 🙏 致谢

感谢《魔法少女的魔女裁判》游戏的制作团队提供了精美的角色素材。

---

**祝你使用愉快！如果觉得这个项目有帮助，欢迎给个 Star ⭐**
