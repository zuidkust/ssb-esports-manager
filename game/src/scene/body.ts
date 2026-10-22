// 全员共用的体型。六人、路人、外卖员都走这一套，不要在 look 里再写身高或胖瘦。

/** 标准体型。height / girth 留着是为了把「没有个人差异」写死，网格按 1 生成。 */
export const STANDARD_BODY = { height: 1, girth: 1 } as const;

/**
 * 手办单位 → 世界米。
 * 门高 2.2、桌面约 0.75、屏幕中心约 1.16。人整体缩小到站立约 1.45 米，
 * 坐下后眼睛靠近屏幕，肩宽收进 1.25 米的桌子，过道上走路不挤进椅背。
 * 这是等比缩小整个人，不是只缩头。
 */
export const FIG = 1.4;

/** 上一版放进房间的比例。当时按这个比例量过的世界米数，用 fromLegacyScale 跟着人一起缩。 */
export const LEGACY_FIG = 1.72;

export function fromLegacyScale(meters: number): number {
  return meters * (FIG / LEGACY_FIG);
}

/** 坐下时髋关节的世界高度，对齐网吧椅子坐垫，不跟 FIG 走。 */
export const SEAT_H = 0.5;

// 关节（手办单位）。改这些等于改骨架，姿态和坐姿都会变。
export const HIP_Y = 0.4;
export const NECK_Y = 0.268;
export const HEAD_Y = 0.014;
export const HEAD_TOP = 0.335;
/** 头整体再放大一点：锁定图里头宽约等于肩宽。不要单独再放大。 */
export const HEAD_SCALE = 1.06;

const u = FIG * STANDARD_BODY.height;
/** 站立时脚底到发顶（世界米） */
export const STAND_TOP = (HIP_Y + NECK_Y + HEAD_Y + HEAD_TOP * HEAD_SCALE) * u;
/** 头的中部，白底近景把镜头对在这里 */
export const HEAD_MID = (HIP_Y + NECK_Y + HEAD_Y + 0.17 * HEAD_SCALE) * u;

/** 上衣前后半深（手办单位）。过道净空用它，不算挥动手臂。 */
export const TORSO_HALF_DEPTH = 0.111;
/** 肩关节再加一截袖子（手办单位）。左右加起来要小于桌宽。 */
export const SHOULDER_REACH = 0.28;
