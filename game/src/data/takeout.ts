// 外卖菜单（docs/外卖表-草案v0.1.md）。本命外卖等人设，这里不写任何人的偏好。
import type { StatusKey } from '../save/state';

export type Satiety = '小' | '中' | '大';
export const SATIETY_HUNGER: Record<Satiety, number> = { 小: 30, 中: 50, 大: 70 };

export type MealSlot = 'morning' | 'lunch' | 'dinner';

export interface DishDef {
  id: string;
  name: string;
  price: number;
  satiety: Satiety;
  tags: string[];
  slots: MealSlot[]; // 哪些饭点会出现
  afterWin?: boolean; // 只在上一场赢了之后（小龙虾）
  self: Partial<Record<StatusKey, number>>;
  others?: Partial<Record<StatusKey, number>>;
  slow?: boolean; // 送达更慢（煲仔饭）
}

export const DISHES: DishDef[] = [
  { id: 'huangmen', name: '黄焖鸡米饭', price: 22, satiety: '大', tags: ['下饭', '经典', '稳'], slots: ['lunch', 'dinner'], self: { 心情: 3 } },
  { id: 'luosifen', name: '螺蛳粉', price: 20, satiety: '中', tags: ['有味道'], slots: ['lunch', 'dinner'], self: { 心情: 8 }, others: { 心情: -3 } },
  { id: 'malatang', name: '麻辣烫', price: 25, satiety: '中', tags: ['自选', '辣'], slots: ['lunch', 'dinner'], self: { 心情: 4 } },
  { id: 'pigfoot', name: '猪脚饭', price: 24, satiety: '大', tags: ['碳水', '快乐'], slots: ['lunch', 'dinner'], self: { 体力: 5, 疲劳: 10 } },
  { id: 'friedchicken', name: '炸鸡', price: 35, satiety: '中', tags: ['油', '分享'], slots: ['lunch', 'dinner'], self: { 心情: 6, 专注: -3 } },
  { id: 'milktea', name: '奶茶', price: 18, satiety: '小', tags: ['甜', '续命'], slots: ['lunch', 'dinner'], self: { 心情: 5 } },
  { id: 'mcd', name: '麦当劳 / 肯德基', price: 30, satiety: '中', tags: ['快餐'], slots: ['lunch', 'dinner'], self: { 心情: 4 } },
  { id: 'shaxian', name: '沙县小吃', price: 16, satiety: '中', tags: ['便宜', '稳'], slots: ['lunch', 'dinner'], self: {} },
  { id: 'lanzhou', name: '兰州拉面', price: 20, satiety: '大', tags: ['面', '稳'], slots: ['lunch', 'dinner'], self: { 体力: 3 } },
  { id: 'claypot', name: '煲仔饭', price: 28, satiety: '大', tags: ['等待'], slots: ['lunch', 'dinner'], self: { 心情: 4 }, slow: true },
  { id: 'suancaiyu', name: '酸菜鱼', price: 38, satiety: '大', tags: ['贵', '分享'], slots: ['lunch', 'dinner'], self: { 心情: 6 } },
  { id: 'salad', name: '轻食沙拉', price: 32, satiety: '小', tags: ['健康'], slots: ['lunch', 'dinner'], self: { 专注: 5, 心情: -2 } },
  { id: 'bbq', name: '烧烤', price: 45, satiety: '中', tags: ['夜宵'], slots: ['dinner'], self: { 心情: 7, 专注: -5 } },
  { id: 'crayfish', name: '小龙虾', price: 88, satiety: '中', tags: ['贵', '庆祝'], slots: ['dinner'], afterWin: true, self: { 心情: 10 } },
  { id: 'jianbing', name: '煎饼果子', price: 10, satiety: '小', tags: ['便宜', '早饭'], slots: ['morning'], self: {} },
  { id: 'instant', name: '泡面', price: 5, satiety: '小', tags: ['穷', '便宜'], slots: ['lunch', 'dinner'], self: { 心情: -2 } },
];

export const DISH_BY_ID = Object.fromEntries(DISHES.map((d) => [d.id, d])) as Record<string, DishDef>;

// 每单触发连锁的概率。螺蛳粉抗议另算（点了螺蛳粉时 60%），不进这个池子
export const CHAIN_CHANCE = 0.15;
export const CHAIN_COOLDOWN_DAYS = 3;
export const LUOSIFEN_PROTEST_CHANCE = 0.6;

export interface ChainDef {
  id: string;
  name: string;
  weight: number;
}

export const CHAINS: ChainDef[] = [
  { id: 'mooch', name: '蹭外卖', weight: 25 },
  { id: 'wrong', name: '送错', weight: 15 },
  { id: 'spill', name: '洒了', weight: 10 },
  { id: 'late', name: '超时', weight: 15 },
  { id: 'share', name: '拼单', weight: 20 },
  { id: 'same', name: '点重了', weight: 10 },
  { id: 'famous', name: '外卖员认出来了', weight: 5 },
  { id: 'spicybill', name: '麻辣烫超预算', weight: 0 }, // 只在点了麻辣烫时临时加权
];

export function chainCooldownKey(id: string): string {
  return `takeout:${id}`;
}
