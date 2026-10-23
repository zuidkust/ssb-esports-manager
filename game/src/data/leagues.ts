// 联赛与对手（docs/对手名单-草案v0.1.md）
// 每级 7 支对手 + 玩家 = 8 队。实力是五人 7 属性均值。perk / bias 进比赛引擎。
import type { AbilityKey } from './roster';

export type Tier = 'netcafe' | 'city' | 'national';
export const TIER_CN: Record<Tier, string> = { netcafe: '网吧联赛', city: '城市联赛', national: '国内联赛' };
export const TIER_ORDER: Tier[] = ['netcafe', 'city', 'national'];

/** 玩家战队在积分榜上的 id */
export const OUR_ID = 'ssb';
export const OUR_NAME = 'SSB';

export type PerkId =
  | 'early'
  | 'dc'
  | 'latePenalty'
  | 'shortStaff'
  | 'botChaos'
  | 'noExtend'
  | 'lateBoost'
  | 'snowball'
  | 'laneBoost'
  | 'lowVariance'
  | 'earlyBoost';

export interface OpponentDef {
  id: string;
  name: string;
  power: number;
  tactic: string;
  blurb: string;
  /** 上、野、中、AD、辅 */
  players: [string, string, string, string, string];
  /** 相对均值的属性偏移，生成时会拉回实力均值 */
  bias?: Partial<Record<AbilityKey, number>>;
  perk?: PerkId;
  /** 每场实力再随机 ±6（微波炉） */
  swing?: boolean;
}

export const OPPONENTS: Record<Tier, OpponentDef[]> = {
  netcafe: [
    {
      id: 'class32', name: '三年级二班', power: 60, tactic: '速攻节奏', perk: 'early',
      blurb: '小学生战队，手速奇快、嘴更快。前 10 分钟节点 +5%',
      players: ['写完作业再打', '妈妈来了', '奥特曼', '小天才', '红领巾'],
    },
    {
      id: 'netadmin', name: '网管和他的朋友们', power: 56, tactic: '防守反打', perk: 'dc',
      blurb: '主场作战，网管随时可以“网络波动”',
      players: ['续费请找我', '网管本管', '重启试试', '泡面加蛋', '包夜八块'],
    },
    {
      id: 'bbq', name: '楼下烧烤摊', power: 53, tactic: '强开团',
      blurb: '老板带着伙计打，输了也请客',
      players: ['腰子', '老板', '孜然', '大串', '啤酒'],
    },
    {
      id: 'riders', name: '外卖骑手联队', power: 51, tactic: '速攻节奏', perk: 'shortStaff',
      blurb: '打一半要去接单。30 分钟后场上会少人',
      players: ['准时达', '超时赔付', '差评别给', '五星好评', '放门口了'],
    },
    {
      id: 'dorm404', name: '宿舍 404', power: 49, tactic: '运营发育', perk: 'noExtend',
      blurb: '熄灯前必须打完，膀胱局概率更低',
      players: ['床上铺', '挂科王', '早八', '熄灯了', '宿管来了'],
    },
    {
      id: 'couple', name: '情侣双排加三', power: 47, tactic: '保排消耗', perk: 'botChaos',
      blurb: '下路是情侣，吵架就崩。对线节点波动大',
      players: ['电灯泡甲', '电灯泡乙', '电灯泡丙', '宝宝', '宝宝的宝宝'],
    },
    {
      id: 'uncles', name: '包夜大叔队', power: 43, tactic: '强开团', perk: 'latePenalty',
      blurb: '打到后半夜就困。后期节点 −8%',
      players: ['老王', '老张', '老李', '老赵', '老刘'],
    },
  ],
  city: [
    {
      id: 'sunset', name: '夕阳红老将团', power: 76, tactic: '运营发育', perk: 'lateBoost',
      bias: { sense: 16, mech: -14 },
      blurb: '前职业养老队。意识高、手速跟不上，后期节点 +6%',
      players: ['当年勇', '腰不行', '老花眼', '退役不退心', '保温杯'],
    },
    {
      id: 'uni', name: '本地大学冠军队', power: 71, tactic: '速攻节奏', perk: 'snowball',
      blurb: '高校冠军，顺风更顺，逆风易崩',
      players: ['学生会长', '保研了', '绩点 4.0', '毕业即失业', '辅导员'],
    },
    {
      id: 'viewers', name: '水友赛战队', power: 69, tactic: '强开团',
      blurb: '主播带着直播间水友打，全程开播',
      players: ['榜一大哥', '主播本人', '刷个火箭', '房管', '水友七号'],
    },
    {
      id: 'village', name: '城中村电竞馆', power: 67, tactic: '防守反打', perk: 'laneBoost',
      blurb: '地头蛇，对线节点 +4%',
      players: ['拆迁款', '握手楼', '城中村之光', '收租', '二房东'],
    },
    {
      id: 'coldnoodle', name: '烤冷面赞助队', power: 65, tactic: '保排消耗',
      blurb: '也是靠小吃摊赞助起家的，可以发展成老对手',
      players: ['加蛋', '加肠', '多放醋', '不要香菜', '打包'],
    },
    {
      id: 'gym', name: '健身房战队', power: 63, tactic: '强开团',
      bias: { fight: 14, pool: -12 },
      blurb: '一群肌肉男，团战特别硬，英雄池窄',
      players: ['深蹲', '卧推', '蛋白粉', '练腿日', '私教'],
    },
    {
      id: 'rich', name: '富二代战队', power: 61, tactic: '运营发育',
      blurb: '设备顶配，实力一般',
      players: ['我爸是', '钱不是问题', '全皮肤', '买个号', '管家'],
    },
  ],
  national: [
    {
      id: 'jdd', name: 'JDD 京都豆', power: 83, tactic: '运营发育', perk: 'lowVariance',
      bias: { sense: 12 },
      blurb: '卫冕冠军，运营滴水不漏，失误少',
      players: ['豆浆', '豆花', '豆皮', '豆沙', '豆芽'],
    },
    {
      id: 'blb', name: 'BLB 菠萝包', power: 80, tactic: '强开团',
      bias: { fight: 14 },
      blurb: '天才中单，团战爆炸',
      players: ['酥皮', '黄油', '冰火', '奶酥', '面团'],
    },
    {
      id: 'tea', name: 'TEA 下午茶', power: 77, tactic: '速攻节奏', perk: 'earlyBoost',
      bias: { roam: 12 },
      blurb: '野区节奏怪。前期节点 +5%',
      players: ['奶盖', '天天', '芋泥', '杰克', '椰果'],
    },
    {
      id: 'wbc', name: 'WBC 微波炉', power: 74, tactic: '防守反打', swing: true,
      blurb: '时冷时热，每场实力随机 ±6',
      players: ['解冻', '加热', '叮', '转盘', '锡纸'],
    },
    {
      id: 'egg', name: 'EGG 蛋蛋', power: 72, tactic: '保排消耗',
      blurb: '老牌豪门，正在重建',
      players: ['荷包', '卤蛋', '溏心', '蛋挞', '蛋黄'],
    },
    {
      id: 'lmg', name: 'LMG 柠檬鸡', power: 70, tactic: '速攻节奏',
      bias: { mech: 8, lane: 4, roam: -6 },
      blurb: '下路很凶，其他位置一般',
      players: ['酸酸', '爽口', '冰镇', '爆汁', '去籽'],
    },
    {
      id: 'iq', name: 'IQ 智商', power: 67, tactic: '强开团',
      bias: { pool: 14, sense: -12 },
      blurb: '曾经的冠军，现在全员整活',
      players: ['二百五', '一加一', '九九表', '满分', '零蛋'],
    },
  ],
};

export function opponentsOf(tier: Tier): OpponentDef[] {
  return OPPONENTS[tier].length ? OPPONENTS[tier] : OPPONENTS.netcafe;
}

export function opponentById(tier: Tier, id: string): OpponentDef | undefined {
  return opponentsOf(tier).find((o) => o.id === id);
}

export function nextTier(tier: Tier): Tier | null {
  if (tier === 'netcafe') return 'city';
  if (tier === 'city') return 'national';
  return null;
}

export function prevTier(tier: Tier): Tier | null {
  if (tier === 'national') return 'city';
  if (tier === 'city') return 'netcafe';
  return null;
}
