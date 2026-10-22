# 方案 B · 轻量 glTF 手办模板 — 云端实现短单

> 2026-10-22 Asia/Shanghai · 负责人拍板方案 B  
> **视觉准绳（唯一）**：`docs/人物造型-稿B-用户锁定原图.png`  
> 辅图：`docs/人物造型-稿B-锁定-体型修正.jpg`（体型：撇干最胖 / 狗粮偏瘦）  
> 不做：场景改动、复杂皮肤权重、贴图 atlas（第一版纯色材质）  
> **id 以现网为准**（短单初稿写错的已改正）：阿鸡 `aji`、狗粮 `gouliang`、撇干 `piegan`。当邓 `dangdeng`、弟必 `dibi`、吊隆 `diaolong` 不变。

---

## 0. 目标

用 **1 份低多边形手办人体 glTF** + **可换件/可缩放**，在游戏里做出锁定图那套「大头切面手办」味道；运行时用现有 `look` 换色与显隐配件。现有 Capsule/Sphere 拼装退役为回退或删除。

---

## 1. 身体模板比例（单位：米，Y-up，脚底原点）

对齐锁定图气质：**头大约 1:2.2～1:2.5 头身**（不是写实 1:7）、短躯干、块状肢、略粗手办感。

| 部位 | 目标尺寸（标准体 girthScale=1） | 备注 |
|---|---|---|
| 总高 | **1.00**（再乘 `look.height`） | 与现 `height` 系数兼容 |
| 头（含下颌） | 高 **0.28～0.32**，宽 **0.26** | 切面低模，五官可烘焙进 mesh 或极简凸块 |
| 颈 | 高 **0.04** | 可并入躯干 |
| 躯干（肩到髋） | 高 **0.28**；肩宽 **0.36**；腰宽 **0.22** | 倒梯形/方肩；胸口预留 **白六边形星标** 挂点或独立 mesh |
| 上臂 / 前臂 | 各长 **0.14 / 0.13**；截面偏方（6～8 边） | 切面，非圆管 |
| 手 | 长 **0.08** | 可合并为手套块 |
| 大腿 / 小腿 | 各长 **0.18 / 0.17** | 同切面 |
| 脚 | 长 **0.12** | 默认拖鞋形（锁定图蓝拖） |
| 面数预算 | 全身模板 **≤ 2500 tri**；单发型 ≤ 400；眼镜 ≤ 120；耳机 ≤ 200 | |

**胖瘦**：不要改拓扑。用根节点或躯干+四肢统一 `girthScale`：  
`scale.x/z = lerp(0.88, 1.22, (girth-0.86)/(1.18-0.86))`，`scale.y` 不跟胖（或仅 0.98～1.02）。撇干 1.18 → 最胖；狗粮 0.90 → 偏瘦。

---

## 2. 资产拆分（一份模板工程导出）

建议目录：`game/public/models/character/`

| 文件 | 内容 |
|---|---|
| `body.glb` | 躯干+颈+（可选默认短裤）；含骨骼或空节点挂点 |
| `head_base.glb` 或并入 body | 无发头壳 |
| `hair_messy.glb` / `hair_short.glb` / `hair_side.glb` / `hair_buzz.glb` | 四发型，原点对齐头顶挂点 |
| `glasses.glb` | 黑框眼镜 |
| `headset.glb` | 头戴耳机+麦（罩可独立材质槽换衫色） |
| `flipflops.glb` | 可选；若脚已是拖鞋形可省略 |
| `badge_hex.glb` | 白色六边胸标（或 body 上独立材质槽） |

共享骨骼名见 §4。所有配件 pivot 对齐对应挂点，Y-up，无多余空场景。

---

## 3. 六人变体清单

| 正式名 | id | height | girth | hair | hairStyle | glasses | headsetIdle | shirt | pants | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 阿鸡 | aji | 1.00 | 1.10 | **`#ff8a2b` 橙** | messy | on | off | `#ff8a2b` | 深灰 | 拖鞋；锁定图橙毛 |
| 当邓 | dangdeng | 0.84 | 0.86 | `#1d1a18` | short | on | off | `#2f8a4a` | 深灰 | 最矮瘦 |
| 狗粮 | gouliang | 0.90 | **0.90** | `#2a2420` | short | on | off | `#4a8ad4` | 深灰 | **偏瘦** |
| 弟必 | dibi | 1.15 | 0.88 | **`#e8d4a0` 浅金** | side | on | **neck optional** | `#f2efe8` | 深灰 | 锁定图金毛；耳机可挂颈后补 |
| 吊隆 | diaolong | 1.02 | 0.98 | `#0e0c0b` | buzz | off | **on 比赛** | `#1e3a6e` | 深灰 | 板寸 |
| 撇干 | piegan | 0.98 | **1.18** | `#2a211c` | short | off | **on 比赛** | `#c43a3a` | 深灰 | **最胖** |

皮肤统一浅色约 `#f0c8a0`（可每人 ±5%）。短裤/鞋锁定图为深灰短裤 + 蓝拖：第一版可用 `pants` 深灰 + 脚材质 `#2f7fd1`。

**材质纯色字段（MeshStandardMaterial，无贴图）**

| 槽名 | 对应 look / 固定色 |
|---|---|
| `matSkin` | `look.skin` |
| `matHair` | `look.hair` |
| `matShirt` | `look.shirt` |
| `matPants` | `look.pants` |
| `matShoes` | `look.shoes ?? 0x2f7fd1` |
| `matBadge` | `#ffffff` |
| `matGlasses` | `#111114` |
| `matHeadsetBand` | `#1b1b1f` |
| `matHeadsetCup` | `look.shirt`（跟队服） |

glb 内用 **材质名** 或 `mesh.name` 前缀匹配上述槽；加载后遍历赋值 `color.setHex(...)`。

---

## 4. 与现有关节 / 姿态如何接（推荐路径）

现系统是 **空 Group 层级 + 欧拉角插值**（`hips → spine → neck → head`；臂 `sh→el`；腿 `hp→kn`），见 `character.ts` 的 `poseTargets`。

### 推荐：极简骨骼，名称对齐现关节（工作量可控）

在 `body.glb` 做 **与现 Group 同名的 Bone/Object3D 链**（不必真正蒙皮复杂，可用分段刚体蒙皮或「每骨一段 mesh」）：

```
Root
 └─ hips
     ├─ (legL_hp → legL_kn → footL)
     ├─ (legR_hp → legR_kn → footR)
     └─ spine
         ├─ armL_sh → armL_el → handL
         ├─ armR_sh → armR_el → handR
         └─ neck → head
              ├─ socket_hair
              ├─ socket_glasses
              └─ socket_headset
```

运行时：

1. `GLTFLoader` 加载 body + 按 look 加载发型/眼镜；挂到 socket。  
2. **删除或绕过** 旧 Capsule 拼装；保留 `Character` 类的 `poseTargets` / `walkTo` / 标签逻辑。  
3. 每帧把现有 `Pose` 角度写到同名 bone：`bone.rotation.x/y/z = ...`（与现在写 Group 相同）。  
4. `hips.position.y`、坐姿 `SEAT_H` 逻辑保留。  
5. `look.height`：`root.scale.setScalar(height * OFFICE_FIT)`。glb 本身高 1.00m；`OFFICE_FIT = 1.72` 让标准体站进现有办公室（门 2.2m），坐下的世界髋高仍是 `SEAT_H`。胖瘦：`girthScale` 打在躯干和四肢 mesh 的 xz，不在会旋转的骨骼上做非均匀缩放。

### 备选（若首周做不出骨骼）

导出 **T-pose 静态手办** 六人各一（或一底多重材质），**只站/坐两个固定 pose 用两个 glb**——会砍掉走路摆臂，仅作展示；**不推荐**，因现玩法依赖 walk/sit_play 等。

---

## 5. 实现步骤（给云端）

1. 按锁定图建/生成 `body.glb` + 四发型 + glasses + headset + badge（面数见上）。  
2. 在 `character.ts` 增加加载路径；`look` 驱动材质与配件显隐。  
3. 骨骼名对齐后，把 `poseTargets` 输出接到 bone，而不是 Capsule Group。  
4. 验收：办公室站位六人对照锁定图——橙毛阿鸡、金毛弟必、白六边胸标、切面肢、撇干最胖狗粮偏瘦；走路/坐下不穿模。  
5. 旧程序几何代码可 `#ifdef` 或删除。

---

## 6. 非目标 / 可后补

- 脚下六角彩色底座（锁定图展示用）  
- 弟必颈挂耳机、表情 Morph  
- 法线贴图、PBR 贴图  
- 与场景同风格的复杂布料

*本短单为方案 B 唯一实现规格；与「定稿-稿B-v1」程序几何常数冲突时，以本文件 + 锁定图为准。*
