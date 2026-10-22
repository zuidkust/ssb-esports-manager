// 选人。没有 BP。撇干的英雄池永不出现石头人，上场就锁剑魔。
import { pick, type Rand } from '../core/rng';
import { ROSTER_BY_ID } from '../data/roster';

/** 狗粮的 ADC 池：主流都会，除了德莱文、滑板鞋、厄斐琉斯 */
export const GOULIANG_HEROES = ['卡莎', '艾希', '女警', '霞', '金克丝', '卢锡安', '韦鲁斯', '小炮', '老鼠', '寒冰'] as const;

export interface DraftPick {
  hero: string;
  /** 一定要让观众看见的句子。撇干上场时必有一句拒绝石头人 */
  lines: string[];
}

export function heroPool(id: string): string[] {
  if (id === 'gouliang') return [...GOULIANG_HEROES];
  const def = ROSTER_BY_ID[id];
  if (!def) return [];
  const banned = new Set(def.draft?.neverPicks ?? []);
  if (id === 'piegan') banned.add('石头人');
  return def.heroes.filter((h) => h && h !== '主流 AD' && !banned.has(h));
}

export function draftPlayer(id: string, rng: Rand): DraftPick {
  if (id === 'piegan') {
    return {
      hero: '剑魔',
      lines: ['队伍把石头人留到最后。撇干看都没看，锁了剑魔：“石头人？不拿。”剑魔战力 +30%。'],
    };
  }
  const pool = heroPool(id);
  const hero = pool.length ? pick(rng, pool) : '招牌英雄';
  const name = ROSTER_BY_ID[id]?.name ?? id;
  return { hero, lines: [`${name} 锁定 ${hero}。`] };
}
