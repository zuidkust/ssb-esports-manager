# SSB 电竞经理 / ssb-esports-manager

以办公室里英雄联盟爱好者为原型的**可交互单机电竞经理**游戏。  
第一亮点是人物互动与事件看板；第二是组队打比赛、升降级经营。

> 正式客户端在 `game/`（网页试玩版 v0.4.0-pre，里程碑到 M4）。另有设计文档、样板原型与灵感素材。发布说明见 [`docs/RELEASE-NOTES-v0.4.0-pre.md`](docs/RELEASE-NOTES-v0.4.0-pre.md)。

## 项目状态

- 平台：当前预发布是 HTML 网页版（单文件，双击 `game/dist/index.html`）。Electron 打包留到 M6，正式发行仍是 Windows 优先（后续 macOS）
- 技术方向：Vite + Three.js + TypeScript，本地存档（网页版支持导出 / 导入），后期 Electron 打包
- 视觉：3D 等距办公室（沿用 Claude Code 样板）
- 最新设计文档：[`docs/SSB电竞经理-设计文档-v0.3.md`](docs/SSB电竞经理-设计文档-v0.3.md)

## 目录结构

```
game/                 正式客户端（网页版，Vite + Three.js + TS）
docs/                 设计文档与调研（以 v0.3 为准）
data/                 事件等数据
tools/                事件生成等工具
ref/                  参考图
claude-v1/            Claude Code 交互样板 + 技术架构方案
claude-v1-review/     样板审查报告与截图
inspiration/电竞经理/ 灵感源《重生之我是SSB职业经理》与比赛引擎
```

## 试玩网页版

```bash
cd game
npm install
npm run build   # 然后双击 game/dist/index.html
```

详见 [`game/README.md`](game/README.md)。

## 快速看样板（旧）

样板 HTML（需已构建或直接打开说明见原型 README）：

- `claude-v1/迷你世界-决策文件包/样板-双击打开.html`
- 原型源码：`claude-v1/迷你世界-决策文件包/prototype/`

```bash
cd "claude-v1/迷你世界-决策文件包/prototype"
npm install
npm run dev   # 以 prototype/README.md 为准
```

## 核心设定摘要（已定）

- 玩家是经理兼老板，上帝视角
- 比赛日忙碌；非比赛日像 QQ 宠物式养成，选手按性格自主行为
- 联赛：网吧 → 城市 → 国内 → 世界赛资格；8 队双循环
- 本体固定 6 人；场地随联赛升级解锁设施（后 6 位朋友以 DLC 形式加入）
- 经济：现金 + 训练心得（开罗式双币）
- 关系：交情只升不降，小心结可化解；赢球解心结

细节与待定项见设计文档 v0.3。

## 协作说明

欢迎一起开发。改设计请先对齐 `docs/SSB电竞经理-设计文档-v0.3.md` 里的【已定】项；数值与人设等【待定】项先讨论再写进文档。

## License

未定。默认仅供本项目协作使用，请勿擅自商用人物素材。
