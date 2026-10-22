# 《SSB电竞经理》人物造型定稿 · 稿 B 剪影加强版 v1

> 定稿日期：2026-10-22（Asia/Shanghai）  
> 拍板：用户选定稿 B 视觉锁定图 + 体型「撇干最胖 / 狗粮偏瘦」  
> **2026-10-22 修订：允许并改用 glTF 手办模板。** 废除「不上 glTF / 不引入 glTF」。实现规格以 `docs/人物造型-方案B-glTF手办模板-规格短单.md` 和锁定图为准；下文第 2 节的 Capsule 常数作废。  
> 技术栈：Vite + TypeScript + Three.js + `GLTFLoader`。资产在 `game/public/models/character/`（`body.glb` + 四发型 + 眼镜 + 耳机）。纯色材质，运行时按 `look` 换色。  
> 改文件：`game/src/scene/character.ts`、`game/src/data/roster.ts`（发色 / 短裤 / 蓝拖）、`game/public/models/character/`  
> 参考图：`docs/人物造型-稿B-用户锁定原图.png`（风格准绳）、`docs/人物造型-稿B-锁定-体型修正.jpg`（体型）

---

## 1. 实现目标（给云端编程助手）

1. **glTF 模板**：1 套切面身体 + 发型 / 眼镜 / 耳机变体。`GLTFLoader` 加载，`poseTargets` 写到同名骨骼（`hips/spine/neck/head` 与 `sh/el/hp/kn`）。Capsule / Sphere 拼人退役。
2. **胖瘦不改拓扑**：`girthScale` 只拉躯干和四肢的 x/z。撇干最胖，狗粮偏瘦。
3. **远看能认人**：六人靠 **高矮 + girth + 发型 + 眼镜 + 队服撞色**。阿鸡橙乱发，弟必浅金侧分。
4. **正式名**：阿鸡、当邓、狗粮、弟必、吊隆、撇干。id：`aji/dangdeng/gouliang/dibi/diaolong/piegan`。

视觉气质（锁定）：大头低多边形「手办感」、块状切面四肢、深灰短裤、蓝人字拖、胸口白六边形星标；耳机罩色=shirt，吊隆和撇干比赛时戴上。

模板在 glb 里高 1.00m。运行时 `root.scale = look.height * OFFICE_FIT`（`OFFICE_FIT = 1.72`），好让这套头身比仍站得进现有办公室（门高 2.2，坐下仍用 `SEAT_H`）。

---

## 2. ~~`character.ts` Capsule 常数表~~（已废除）

以下程序几何常数只属于被替换掉的 Capsule 拼装，**不再使用**。现行关节、材质槽和面数预算见方案 B 短单。

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
| 阿鸡 | aji | 1.00 | 1.10 | messy | true | true | `#ff8a2b` | `#243044` | **`#ff8a2b` 橙** | `#f0c8a0` | `#2f7fd1` 蓝拖 |
| 当邓 | dangdeng | 0.84 | 0.86 | short | true | false | `#2f8a4a` | `#243044` | `#1d1a18` | `#eec39c` | `#2f7fd1` |
| 狗粮 | gouliang | 0.90 | **0.90** | short | true | false | `#4a8ad4` | `#243044` | `#2a2420` | `#f2caa6` | `#2f7fd1` |
| 弟必 | dibi | 1.15 | 0.88 | side | true | false | `#f2efe8` | `#243044` | **`#e8d4a0` 浅金** | `#efc7a2` | `#2f7fd1` |
| 吊隆 | diaolong | 1.02 | 0.98 | buzz | false | false | `#1e3a6e` | `#243044` | `#0e0c0b` | `#e8bd95` | `#2f7fd1` |
| 撇干 | piegan | 0.98 | **1.18** | short | false | false | `#c43a3a` | `#243044` | `#2a211c` | `#edc29b` | `#2f7fd1` |

要点：**撇干最胖（1.18，触发微肚皮）**；**狗粮偏瘦（0.90）**；当邓最矮；弟必最高。

### TypeScript（直接贴 `roster.ts` 的 look，并改 name）

```ts
// 阿鸡
name: '阿鸡',
look: { height: 1.0, girth: 1.10, glasses: true, flipflops: true, shirt: 0xff8a2b, pants: 0x243044, hair: 0xff8a2b, skin: 0xf0c8a0, shoes: 0x2f7fd1, hairStyle: 'messy' },
// 当邓
name: '当邓',
look: { height: 0.84, girth: 0.86, glasses: true, shirt: 0x2f8a4a, pants: 0x243044, hair: 0x1d1a18, skin: 0xeec39c, shoes: 0x2f7fd1, hairStyle: 'short' },
// 狗粮（偏瘦）
name: '狗粮',
look: { height: 0.9, girth: 0.90, glasses: true, shirt: 0x4a8ad4, pants: 0x243044, hair: 0x2a2420, skin: 0xf2caa6, shoes: 0x2f7fd1, hairStyle: 'short' },
// 弟必
name: '弟必',
look: { height: 1.15, girth: 0.88, glasses: true, shirt: 0xf2efe8, pants: 0x243044, hair: 0xe8d4a0, skin: 0xefc7a2, shoes: 0x2f7fd1, hairStyle: 'side' },
// 吊隆
name: '吊隆',
look: { height: 1.02, girth: 0.98, glasses: false, shirt: 0x1e3a6e, pants: 0x243044, hair: 0x0e0c0b, skin: 0xe8bd95, shoes: 0x2f7fd1, hairStyle: 'buzz' },
// 撇干（最胖）
name: '撇干',
look: { height: 0.98, girth: 1.18, glasses: false, shirt: 0xc43a3a, pants: 0x243044, hair: 0x2a211c, skin: 0xedc29b, shoes: 0x2f7fd1, hairStyle: 'short' },
```

### JSON（十进制色值，与上表 hex 一致）

```json
[
  {"id":"aji","name":"阿鸡","look":{"height":1.0,"girth":1.10,"glasses":true,"flipflops":true,"shirt":16747051,"pants":2371652,"hair":16747051,"skin":15780000,"shoes":3112913,"hairStyle":"messy"}},
  {"id":"dangdeng","name":"当邓","look":{"height":0.84,"girth":0.86,"glasses":true,"shirt":3115594,"pants":2371652,"hair":1907224,"skin":15647644,"shoes":3112913,"hairStyle":"short"}},
  {"id":"gouliang","name":"狗粮","look":{"height":0.9,"girth":0.90,"glasses":true,"shirt":4885204,"pants":2371652,"hair":2761760,"skin":15911590,"shoes":3112913,"hairStyle":"short"}},
  {"id":"dibi","name":"弟必","look":{"height":1.15,"girth":0.88,"glasses":true,"shirt":15921128,"pants":2371652,"hair":15258784,"skin":15714210,"shoes":3112913,"hairStyle":"side"}},
  {"id":"diaolong","name":"吊隆","look":{"height":1.02,"girth":0.98,"glasses":false,"shirt":1981038,"pants":2371652,"hair":920587,"skin":15252885,"shoes":3112913,"hairStyle":"buzz"}},
  {"id":"piegan","name":"撇干","look":{"height":0.98,"girth":1.18,"glasses":false,"shirt":12859962,"pants":2371652,"hair":2760988,"skin":15581851,"shoes":3112913,"hairStyle":"short"}}
]
```

---

## 4. 验收清单

- [x] 开局六人名字为正式名
- [x] 撇干视觉最胖；狗粮明显偏瘦
- [x] 切面肢，不再用 Capsule 拼人；胸口白六边形星标
- [x] 阿鸡：橙乱发 + 眼镜 + 蓝人字拖 + 橙衫
- [x] 当邓最矮 + 绿衫 + 眼镜
- [x] 弟必最高 + 浅金侧分 + 米白衫 + 眼镜
- [x] 吊隆板寸 + 深蓝 + 无镜；比赛戴耳机罩色=衫
- [x] 撇干红衫 + 无镜 + 最胖
- [x] 场景（网吧/办公室）未改；站 / 走 / 坐仍走 poseTargets

---

## 5. 非目标

- 允许 glTF 手办模板；不重做贴图 atlas / 法线  
- 不改场景美术  
- 不在本任务改能力值/人设文案（look 的发色、短裤、拖色按锁定图改）
- 脚下六角彩色底座、弟必颈挂耳机仍可后补

*风格以用户锁定原图为准。管线与面数以方案 B 短单为准；与本文件旧的程序几何常数冲突时，以短单 + 锁定图为准。*
