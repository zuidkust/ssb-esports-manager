// 世界赛海外队（docs/对手名单-草案v0.1.md）。队名是谐音，人名是主题词，不影射真实选手。
import type { OpponentDef } from './leagues';

export const WORLD_TEAMS: OpponentDef[] = [
  {
    id: 't0', name: 'T0 零号机', power: 88, tactic: '运营发育',
    bias: { mental: 18, sense: 6 },
    blurb: '大魔王。中单是“不老传说”，心态极高，逆风不崩。',
    players: ['Unit', 'Pilot', 'Legend', 'Core', 'Shield'],
  },
  {
    id: 'gem', name: 'GEM 宝石', power: 85, tactic: '保排消耗', perk: 'lateBoost',
    bias: { sense: 14 },
    blurb: '运营教科书。意识高，后期节点 +6%。',
    players: ['Ruby', 'Jade', 'Opal', 'Pearl', 'Amber'],
  },
  {
    id: 'han', name: 'HAN 汉江烤肉', power: 80, tactic: '强开团',
    blurb: '有钱的超级战队。',
    players: ['Galbi', 'Bulgogi', 'Kimchi', 'Soju', 'Bibim'],
  },
  {
    id: 'g3', name: 'G3 三号人物', power: 78, tactic: '速攻节奏', swing: true,
    bias: { pool: 12 },
    blurb: '欧洲整活大师。英雄池宽，每场战术会换。',
    players: ['Clown', 'Juggle', 'Jester', 'Mime', 'Circus'],
  },
  {
    id: 'func', name: 'FUNC 函数', power: 75, tactic: '防守反打',
    blurb: '老牌欧洲队，粉丝最热情。',
    players: ['Lambda', 'Return', 'Void', 'Async', 'Callback'],
  },
  {
    id: 'c10', name: 'C10 十朵云', power: 72, tactic: '运营发育',
    blurb: '北美希望。过了八强心态会掉一截。',
    players: ['Cumulus', 'Stratus', 'Nimbus', 'Cirrus', 'Fog'],
  },
];

export const WORLD_BY_ID = Object.fromEntries(WORLD_TEAMS.map((t) => [t.id, t])) as Record<string, OpponentDef>;
