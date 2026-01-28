# live_manosaba

一个基于 **React + PixiJS** 的 2D 角色组件拼装/表情生成器（ManoSaba Generator）。

本项目将 PSD 导出的各个部件（眼/嘴/腮红/手臂等）按分组规则渲染到画布上，并提供：

- 组件开关/切换（Radio 菜单）
- 背景切换（示例：蓝天渐变、暖色渐变）
- 导出图片
- 随机表情（当前支持：Ema / Hiro / Sherry / Hanna / AnAn）

---

## 目录结构（关键）

- `resources/`：实际在网页中使用的资源（**会被 git 跟踪**）
  - `resources/characters.json`
  - `resources/characters/<角色名>/PSD/model.json`
  - `resources/characters/<角色名>/PSD/parts/*.png`
- `asset/`：大资源目录（**被 .gitignore 忽略，不会推送**）
- `web_app/`：前端应用（Vite）
- `extract_psd.py` / `inspect_psd.py` / `gen_char_list.py`：PSD 导出与辅助脚本

---

## 运行（开发模式）

1) 安装依赖

```bash
cd web_app
npm install
```

2) 让 Vite 能通过 `/resources/...` 访问资源

本项目约定：`web_app/public/resources` 是一个指向仓库根目录 `resources/` 的符号链接：

```bash
ln -sfn ../../resources web_app/public/resources
```

3) 启动

```bash
cd web_app
npm run dev
```

浏览器打开 Vite 输出的地址即可。

---

## 随机表情说明

随机按钮只在以下角色出现：`Ema` / `Hiro` / `Sherry` / `Hanna` / `AnAn`。

随机逻辑要点：

- `Arm / Mouth / Eyes` 不会随机到 `None`
- `Arms` 与 `ArmL/ArmR` 互斥（避免多臂/全隐藏）
- `Option_Arms / Option_ArmR` 会根据当前手臂类型自动匹配
- `FacialLine`、`HeadBase` 视为“永远开启”的基础层，并会跟随 Head 01/02 匹配

---

## 注意事项

- 部分 PSD 的 blending/softlight/overlay 层在网页端可能造成诡异光晕，本项目对部分层做了屏蔽以保证显示稳定。
- 若你需要重新导出资源，请优先确保导出的 PNG 不是空图，并更新 `resources/characters.json`。

