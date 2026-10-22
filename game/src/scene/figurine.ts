// 手办模板比例。glb 本身脚底到头顶 1.00m（见 public/models/character）。
// 办公室门高 2.2、椅面约 0.48，运行时再乘 OFFICE_FIT，标准身高才站得进现有场景。
// look.height 仍是乘数：root.scale = height * OFFICE_FIT。

export const TEMPLATE_HEIGHT = 1;
export const OFFICE_FIT = 1.72;
export const SEAT_H = 0.5;

/** 短单：scale.xz = lerp(0.88, 1.22, (girth-0.86)/(1.18-0.86))，y 不跟胖。 */
export function girthScale(girth: number): number {
  const t = Math.min(1, Math.max(0, (girth - 0.86) / (1.18 - 0.86)));
  return 0.88 + (1.22 - 0.88) * t;
}
