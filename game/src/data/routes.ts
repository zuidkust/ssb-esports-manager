// 训练路线（设计文档 5.2）。改路线在休赛期花心得；每天属性成长还没接上。
import type { AbilityKey } from './roster';

export interface RouteDef {
  id: string;
  name: string;
  main: AbilityKey | null;
  sub: AbilityKey | null;
  trait: string;
}

export const ROUTES: RouteDef[] = [
  { id: 'lane', name: '对线压制', main: 'lane', sub: 'mech', trait: '对线杀手' },
  { id: 'late', name: '后期发育', main: 'mental', sub: 'fight', trait: '翻盘王' },
  { id: 'roam', name: '游走节奏', main: 'roam', sub: 'sense', trait: '节奏发动机' },
  { id: 'fight', name: '团战核心', main: 'fight', sub: 'mech', trait: '团战收割' },
  { id: 'shot', name: '指挥大局', main: 'sense', sub: 'mental', trait: '指挥官' },
  { id: 'one', name: '绝活专精', main: 'mech', sub: 'lane', trait: '绝活英雄' },
  { id: 'flex', name: '万金油', main: null, sub: null, trait: '哪都能补' },
];

export const ROUTE_BY_ID = Object.fromEntries(ROUTES.map((r) => [r.id, r])) as Record<string, RouteDef>;

/** 改路线花费。磨合期从 7 天缩到 3 天，算在这笔心得里。 */
export const ROUTE_CHANGE_INSIGHT = 150;
export const ROUTE_GRIND_DAYS = 3;

export type FitGrade = 'S' | 'A' | 'B';

function bump(grade: FitGrade): FitGrade {
  if (grade === 'B') return 'A';
  if (grade === 'A') return 'S';
  return 'S';
}

/** 主属性在 7 项里的名次：前 2 是 S，前 4 是 A，其余 B。万金油看平均和离散。 */
export function routeFit(
  ability: Record<AbilityKey, number>,
  persona: { 创新欲: number; 话痨: number },
  route: RouteDef,
): FitGrade {
  let grade: FitGrade;
  if (!route.main) {
    const vals = Object.values(ability);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = Math.max(...vals) - Math.min(...vals);
    grade = spread <= 12 && mean >= 45 ? 'S' : 'A';
  } else {
    const ranked = (Object.entries(ability) as [AbilityKey, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const idx = ranked.findIndex(([k]) => k === route.main);
    grade = idx <= 1 ? 'S' : idx <= 3 ? 'A' : 'B';
  }
  const up = (route.id === 'one' && persona.创新欲 >= 80) || (route.id === 'shot' && persona.话痨 >= 70);
  return up ? bump(grade) : grade;
}
