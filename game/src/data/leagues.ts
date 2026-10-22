// 联赛与对手（docs/对手名单-草案v0.1.md）。M1 只用到网吧联赛的队名和实力
export type Tier = 'netcafe' | 'city' | 'national';
export const TIER_CN: Record<Tier, string> = { netcafe: '网吧联赛', city: '城市联赛', national: '国内联赛' };

export interface OpponentDef {
  id: string;
  name: string;
  power: number; // 五人能力均值
  tactic: string;
  blurb: string;
}

export const OPPONENTS: Record<Tier, OpponentDef[]> = {
  netcafe: [
    { id: 'class32', name: '三年级二班', power: 52, tactic: '速攻节奏', blurb: '小学生战队，手速奇快、嘴更快' },
    { id: 'netadmin', name: '网管和他的朋友们', power: 48, tactic: '防守反打', blurb: '主场作战，网管随时可以“网络波动”' },
    { id: 'bbq', name: '楼下烧烤摊', power: 45, tactic: '强开团', blurb: '老板带着伙计打，赛后请客' },
    { id: 'riders', name: '外卖骑手联队', power: 43, tactic: '速攻节奏', blurb: '打一半要去接单' },
    { id: 'dorm404', name: '宿舍 404', power: 41, tactic: '运营发育', blurb: '大学寝室开黑团，熄灯前必须打完' },
    { id: 'couple', name: '情侣双排加三', power: 39, tactic: '保排消耗', blurb: '下路是情侣，吵架就崩' },
    { id: 'uncles', name: '包夜大叔队', power: 35, tactic: '强开团', blurb: '隔壁包夜的大叔们，打到后半夜就困' },
  ],
  city: [],
  national: [],
};
