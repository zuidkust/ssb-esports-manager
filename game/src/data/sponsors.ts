// 赞助商链（设计文档第 11 章）。同时最多挂 2 个。完成上一档的目标才解锁下一档。
import type { Tier } from './leagues';

export type SponsorTier = Tier | 'world';

export interface SponsorDef {
  id: string;
  name: string;
  income: number; // 月收入
  minTier: SponsorTier; // 至少要到这一级联赛才能签
  goal: string;
}

export const SPONSORS: SponsorDef[] = [
  { id: 'wang', name: '网吧老板王哥', income: 3000, minTier: 'netcafe', goal: '赢 3 场' },
  { id: 'huang', name: '楼下黄焖鸡', income: 5000, minTier: 'netcafe', goal: '网吧联赛前 4，并点它家外卖 10 次' },
  { id: 'keyboard', name: '山寨键盘厂', income: 12000, minTier: 'city', goal: '城市联赛保级' },
  { id: 'milktea', name: '本地奶茶连锁', income: 18000, minTier: 'city', goal: '任意两人达到「好兄弟」' },
  { id: 'energy', name: '国产能量饮料', income: 40000, minTier: 'national', goal: '进国内联赛' },
  { id: 'peripheral', name: '外设大牌', income: 60000, minTier: 'national', goal: '国内联赛前 4' },
  { id: 'phone', name: '手机厂商', income: 100000, minTier: 'world', goal: '拿到世界赛资格' },
  { id: 'car', name: '汽车品牌', income: 150000, minTier: 'world', goal: '世界赛四强' },
];

export const SPONSOR_BY_ID = Object.fromEntries(SPONSORS.map((s) => [s.id, s])) as Record<string, SponsorDef>;

export const MAX_SPONSORS = 2;
