// 老板动作表（设计文档 6.2 / 6.3）。现金是网吧联赛价，结算时再乘联赛倍率。
// 场地才解锁的动作，价格和冷却是【待定】默认值，见设计文档第 15 章。

export type ActionScope = 'global' | 'member' | 'pair';

export interface ActionDef {
  id: string;
  name: string;
  ap: number;
  cash: number; // 0 = 不按表扣；今天我请改按菜单实价，在饭点结算
  cooldownDays: number; // 0 = 不冷却，只靠 7 天递减
  scope: ActionScope;
  venue: number; // 最低场地等级
  needsKnot?: boolean;
  blurb: string;
}

export const ACTIONS: ActionDef[] = [
  { id: 'talk', name: '单独谈话', ap: 1, cash: 0, cooldownDays: 2, scope: 'member', venue: 0, blurb: '安抚、鼓励或敲打一个人' },
  { id: 'milktea', name: '请奶茶', ap: 1, cash: 150, cooldownDays: 0, scope: 'global', venue: 0, blurb: '全员心情小涨。请太勤会觉得理所当然' },
  { id: 'host', name: '今天我请', ap: 1, cash: 0, cooldownDays: 0, scope: 'global', venue: 0, blurb: '下一顿还没点的外卖由公司按菜单实价报销' },
  { id: 'duo', name: '安排双排', ap: 1, cash: 0, cooldownDays: 1, scope: 'pair', venue: 0, blurb: '指定两人今天一起练' },
  { id: 'praise', name: '公开表扬', ap: 1, cash: 0, cooldownDays: 3, scope: 'member', venue: 0, blurb: '当众夸一个人。旁边的人可能吃醋' },
  { id: 'scold', name: '点名批评', ap: 1, cash: 0, cooldownDays: 3, scope: 'member', venue: 0, blurb: '当众说一个人。可能憋气，也可能振作' },
  { id: 'mediate', name: '调解矛盾', ap: 2, cash: 0, cooldownDays: 2, scope: 'pair', venue: 0, needsKnot: true, blurb: '有心结才能用。可能和好，也可能一起埋怨老板' },
  { id: 'overtime', name: '加班', ap: 2, cash: 0, cooldownDays: 2, scope: 'global', venue: 0, blurb: '今天心得 +50%，心情和疲劳变差' },
  { id: 'party', name: '团建聚餐', ap: 2, cash: 800, cooldownDays: 7, scope: 'global', venue: 0, blurb: '花钱，全员交情和心情上升' },
  { id: 'rest', name: '放假', ap: 3, cash: 0, cooldownDays: 7, scope: 'global', venue: 0, blurb: '心情和疲劳拉满。这一天没有训练心得' },
  { id: 'review', name: '白板复盘会', ap: 2, cash: 0, cooldownDays: 3, scope: 'global', venue: 1, blurb: '全队心得增加。可能吵起来' },
  { id: 'coach', name: '请教练一天', ap: 2, cash: 1500, cooldownDays: 7, scope: 'member', venue: 1, blurb: '花钱，指定 1 人最强的那项属性上涨' },
  { id: 'scrim', name: '拉练赛', ap: 2, cash: 2000, cooldownDays: 3, scope: 'global', venue: 2, blurb: '约训练赛，心得大增' },
  { id: 'media', name: '媒体采访', ap: 1, cash: 0, cooldownDays: 5, scope: 'member', venue: 2, blurb: '安排 1 人出镜，名气小涨。可能说错话' },
  { id: 'camp', name: '出国集训', ap: 3, cash: 20000, cooldownDays: 28, scope: 'global', venue: 3, blurb: '又贵又累，心得和状态一起涨' },
  { id: 'fanmeet', name: '粉丝见面会', ap: 2, cash: 5000, cooldownDays: 14, scope: 'global', venue: 3, blurb: '全员心情大涨。话少的人会不自在' },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<string, ActionDef>;

export function actionCooldownKey(def: ActionDef, target?: string): string {
  if (def.scope === 'global' || !target) return `act:${def.id}`;
  return `act:${def.id}:${target}`;
}
