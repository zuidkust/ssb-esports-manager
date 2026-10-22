# 《SSB电竞经理》人物造型定稿 · 稿 B 剪影加强版 v1

> **2026-10-22 修订，取代下文的发色和体型。**  
> 六名选手全部黑发，谁也不单独换发色（保持现在的黑发，不改成金棕或其他颜色）。  
> 体型收成同一个标准体型：`height` / `girth` 已从每人 `look` 删掉，只留 `game/src/scene/body.ts` 的 `STANDARD_BODY`。不许再按人写高矮胖瘦。  
> 六人只靠颜色（衣服、底座）和配饰区分：眼镜、耳机的颜色，以及戴在头上还是挂在脖子上。  
> 人物按 `FIG` 整体等比缩小（不是只缩头），路人和外卖员同一比例。坐下髋高仍是 `SEAT_H`，对齐椅子。  
> 下文第 2、3 节里的高矮、胖瘦、分人发色作废，只作当时的记录。

> 定稿日期：2026-10-22（Asia/Shanghai）  
> 拍板：用户选定稿 B 视觉锁定图 + 体型「撇干最胖 / 狗粮偏瘦」；负责人方向「1+2 精修包」、**不引入 glTF**  
> 技术栈：Vite + TypeScript + Three.js 程序几何（Capsule / Sphere / Lathe / Cone / Torus / Box / Cylinder）+ MeshStandardMaterial 纯色  
> 改文件：`game/src/data/roster.ts`（look + 正式名）、`game/src/scene/character.ts`（常数/小分支）  
> 参考图：`docs/人物造型-稿B-用户锁定原图.png`（风格准绳）、`docs/人物造型-稿B-锁定-体型修正.jpg`（体型）

---

## 1. 实现目标（给云端编程助手）

1. **不换管线**：不引入 glTF / 贴图 atlas；保持现有关节 Group 与姿态系统。
2. **消米其林**：细肢、收腰、压厚度；胖靠 `girth` 拉开，不是全身等比例膨胀。
3. **远看能认人**：六人靠 **高矮 + girth + 发型 + 眼镜/人字拖 + 队服撞色**。
4. **正式名**：阿鸡、当邓、狗粮、弟必、吊隆、撇干。id 跟人设改名后的现网一致：`aji/dangdeng/gouliang/dibi/diaolong/piegan`（旧 id `shidian/dishu/piju` 由存档迁移处理）。

视觉气质（锁定）：大头低多边形「手办感」、块状四肢、深灰短裤、衫色撞开；耳机打比赛时显示且罩色=shirt。

---

## 2. `character.ts` 常数表（替换对应字面量）

```ts
const HEAD_R = 0.155; // 原 0.15

// 臂
const armR = 0.038 * Math.sqrt(g); // 原 0.05*sqrt(g)
// 短袖增量：+0.008（原 +0.012）
// 手球半径：0.038（原 0.045）

// 腿
const thighR = 0.052 * Math.sqrt(g); // 原 0.074*sqrt(g)
const shinR  = 0.042 * Math.sqrt(g); // 原 0.06*sqrt(g)
// 髋间距：sx * 0.080 * g（原 0.085*g）

// 肩距
sh.position.set(sx * (0.15 * g + 0.055), shoulderY, 0); // 原 0.17*g+0.035

// 骨盆
capsule(0.11 * g, 0.12 * g, pants); // 原 0.14*g

// 躯干 Lathe：腰点统一 R * 0.86（取消 g>1.12 时鼓到 1.08R）
// 躯干厚度
torso.scale.set(1, 1, 0.74); // 原 0.8

// 头宽
const headW = Math.min(1.02, 0.95 + (g - 1) * 0.10); // 原 (g-1)*0.22

// 肚皮：仅够胖才出
if (g > 1.15) {
  // sphere(0.11 * g)，z = 0.03*g  （原 g>1.12 且 0.16*g）
}

// 发型微调（仍原几何类型）
// buzz: capPhi = 0.38（原 0.42）
// messy: Cone 高度 0.12（原 0.1），数量仍 9

// 人字拖颜色：sole/strap 用 L.shoes ?? 0x2f7fd1（阿鸡 shoes 为橙，呼应衫）
// 耳机罩：已跟 shirt，保持
```

面数：不增加分段数（头 28×20、Lathe 24 等维持）。

---

## 3. 六人 look（定稿）

| 正式名 | id | height | girth | hairStyle | glasses | flipflops | shirt | pants | hair | skin | shoes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 阿鸡 | aji | 1.00 | 1.10 | messy | true | true | `#ff8a2b` | `#3d4f66` | `#2b2420` | `#f0c8a0` | `#e8833a`（拖色） |
| 当邓 | dangdeng | 0.84 | 0.86 | short | true | false | `#2f8a4a` | `#1e2430` | `#1d1a18` | `#eec39c` | `#1a1a1e` |
| 狗粮 | gouliang | 0.90 | **0.90** | short | true | false | `#4a8ad4` | `#2a2e3a` | `#2a2420` | `#f2caa6` | `#f0f0ee` |
| 弟必 | dibi | 1.15 | 0.88 | side | true | false | `#f2efe8` | `#2c3f5c` | `#231e1c` | `#efc7a2` | `#2e2e34` |
| 吊隆 | diaolong | 1.02 | 0.98 | buzz | false | false | `#1e3a6e` | `#4a453f` | `#0e0c0b` | `#e8bd95` | `#d4d4d0` |
| 撇干 | piegan | 0.98 | **1.18** | short | false | false | `#c43a3a` | `#22252c` | `#2a211c` | `#edc29b` | `#e9e9e9` |

要点：**撇干最胖（1.18，触发微肚皮）**；**狗粮偏瘦（0.90）**；当邓最矮；弟必最高。

### TypeScript（直接贴 `roster.ts` 的 look，并改 name）

```ts
// 阿鸡
name: '阿鸡',
look: { height: 1.0, girth: 1.10, glasses: true, flipflops: true, shirt: 0xff8a2b, pants: 0x3d4f66, hair: 0x2b2420, skin: 0xf0c8a0, shoes: 0xe8833a, hairStyle: 'messy' },
// 当邓
name: '当邓',
look: { height: 0.84, girth: 0.86, glasses: true, shirt: 0x2f8a4a, pants: 0x1e2430, hair: 0x1d1a18, skin: 0xeec39c, shoes: 0x1a1a1e, hairStyle: 'short' },
// 狗粮（偏瘦）
name: '狗粮',
look: { height: 0.9, girth: 0.90, glasses: true, shirt: 0x4a8ad4, pants: 0x2a2e3a, hair: 0x2a2420, skin: 0xf2caa6, shoes: 0xf0f0ee, hairStyle: 'short' },
// 弟必
name: '弟必',
look: { height: 1.15, girth: 0.88, glasses: true, shirt: 0xf2efe8, pants: 0x2c3f5c, hair: 0x231e1c, skin: 0xefc7a2, shoes: 0x2e2e34, hairStyle: 'side' },
// 吊隆
name: '吊隆',
look: { height: 1.02, girth: 0.98, glasses: false, shirt: 0x1e3a6e, pants: 0x4a453f, hair: 0x0e0c0b, skin: 0xe8bd95, shoes: 0xd4d4d0, hairStyle: 'buzz' },
// 撇干（最胖）
name: '撇干',
look: { height: 0.98, girth: 1.18, glasses: false, shirt: 0xc43a3a, pants: 0x22252c, hair: 0x2a211c, skin: 0xedc29b, shoes: 0xe9e9e9, hairStyle: 'short' },
```

### JSON（十进制色值，与上表 hex 一致）

```json
[
  {"id":"aji","name":"阿鸡","look":{"height":1.0,"girth":1.10,"glasses":true,"flipflops":true,"shirt":16747051,"pants":4018022,"hair":2827296,"skin":15780000,"shoes":15237946,"hairStyle":"messy"}},
  {"id":"dangdeng","name":"当邓","look":{"height":0.84,"girth":0.86,"glasses":true,"shirt":3115594,"pants":1975344,"hair":1907224,"skin":15647644,"shoes":1710622,"hairStyle":"short"}},
  {"id":"gouliang","name":"狗粮","look":{"height":0.9,"girth":0.90,"glasses":true,"shirt":4885204,"pants":2764346,"hair":2761760,"skin":15911590,"shoes":15790318,"hairStyle":"short"}},
  {"id":"dibi","name":"弟必","look":{"height":1.15,"girth":0.88,"glasses":true,"shirt":15921128,"pants":2899804,"hair":2301468,"skin":15714210,"shoes":3026484,"hairStyle":"side"}},
  {"id":"diaolong","name":"吊隆","look":{"height":1.02,"girth":0.98,"glasses":false,"shirt":1981038,"pants":4867391,"hair":920587,"skin":15252885,"shoes":13948112,"hairStyle":"buzz"}},
  {"id":"piegan","name":"撇干","look":{"height":0.98,"girth":1.18,"glasses":false,"shirt":12859962,"pants":2237740,"hair":2760988,"skin":15581851,"shoes":15329769,"hairStyle":"short"}}
]
```

---

## 4. 验收清单

- [ ] 开局六人名字为正式名
- [ ] 撇干视觉最胖；狗粮明显偏瘦
- [ ] 四肢不再呈「香肠米其林」；腰线可见
- [ ] 阿鸡：乱发 + 眼镜 + 人字拖（橙）+ 橙衫
- [ ] 当邓最矮 + 绿衫 + 眼镜
- [ ] 弟必最高 + 侧分 + 米白衫 + 眼镜
- [ ] 吊隆板寸 + 深蓝 + 无镜；比赛戴耳机罩色=衫
- [ ] 撇干红衫 + 无镜 + 最胖
- [ ] 场景（网吧/办公室）未改；姿态/走路仍工作

---

## 5. 非目标

- 不上 glTF、不重做贴图管线  
- 不改场景美术  
- 不在本任务改能力值/人设文案（仅 name + look + character 比例）

*本文件为实现唯一造型规格源；风格以用户锁定原图为准。*
