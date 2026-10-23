import { describe, expect, it } from 'vitest';
import { LIBRARY_EVENTS } from '../src/sim/events/library';
import { ROSTER, ROSTER_BY_ID } from '../src/data/roster';
import type { Effect, LibraryEvent, RoleKind } from '../src/sim/events/types';

const ROLE_KINDS = new Set<RoleKind>(['any', 'all', 'fixed', 'slacker', 'other', 'jungle', 'bench', 'sleeping', 'early', 'late', 'overtime']);
const ids = new Set(LIBRARY_EVENTS.map((e) => e.id));
const roleKeys = (e: LibraryEvent) => new Set(e.roles.map((r) => r.key));

describe('事件库数据', () => {
  it('至少接入 90 条，id 唯一，没有旧昵称', () => {
    expect(LIBRARY_EVENTS.length).toBeGreaterThanOrEqual(90);
    expect(ids.size).toBe(LIBRARY_EVENTS.length);
    const all = JSON.stringify(LIBRARY_EVENTS);
    expect(all).not.toMatch(/施颠|地鼠|吊龙|批菊|shidian|dishu|piju/);
    for (const e of LIBRARY_EVENTS) {
      expect(e.id).not.toMatch(/^[STC]_/);
      expect(['日常', '有趣', '剧情', '重大']).toContain(e.level);
      expect(e.weight).toBeGreaterThan(0);
      expect(e.cooldownMin).toBeGreaterThan(0);
      expect(e.texts.length).toBeGreaterThan(0);
      expect(e.roles.length).toBeGreaterThan(0);
    }
  });

  it('角色、固定成员、条件、效果都能被引擎解析', () => {
    for (const e of LIBRARY_EVENTS) {
      const keys = roleKeys(e);
      for (const role of e.roles) {
        expect(ROLE_KINDS.has(role.kind)).toBe(true);
        if (role.kind === 'fixed') expect(ROSTER_BY_ID[role.id ?? '']).toBeTruthy();
        if (role.only) for (const id of role.only) expect(ROSTER_BY_ID[id]).toBeTruthy();
      }
      for (const c of e.conditions) {
        if ('who' in c && c.who) expect(keys.has(c.who) || ROSTER_BY_ID[c.who] || c.who === 'all').toBe(true);
        if (c.k === 'bond') {
          expect(keys.has(c.a)).toBe(true);
          expect(keys.has(c.b)).toBe(true);
        }
        if (c.k === 'flag') expect(ids.has(c.id)).toBe(true);
        if (c.k === 'time') {
          expect(c.from).toBeGreaterThanOrEqual(9 * 60);
          expect(c.to).toBeLessThanOrEqual(22 * 60);
          expect(c.to).toBeGreaterThan(c.from);
        }
        if (c.k === 'present') for (const id of c.ids) expect(ROSTER_BY_ID[id]).toBeTruthy();
        if (c.k === 'hasRole') expect(['jungle', 'top', 'mid', 'adc', 'support']).toContain(c.role);
      }
      for (const eff of e.effects as Effect[]) {
        if ('who' in eff) expect(eff.who === 'all' || keys.has(eff.who) || ROSTER_BY_ID[eff.who]).toBeTruthy();
        if (eff.k === 'bond') {
          expect(eff.a === '全员' || keys.has(eff.a) || ROSTER_BY_ID[eff.a]).toBeTruthy();
          expect(eff.b === '全员' || keys.has(eff.b) || ROSTER_BY_ID[eff.b]).toBeTruthy();
        }
      }
      for (const ch of e.chains) expect(ids.has(ch.id)).toBe(true);
    }
  });

  it('文案占位符都有对应角色，且没有旧系统词', () => {
    for (const e of LIBRARY_EVENTS) {
      const keys = roleKeys(e);
      for (const text of e.texts) {
        for (const m of text.matchAll(/\{([^}]+)\}/g)) expect(keys.has(m[1])).toBe(true);
        expect(text).not.toMatch(/周赛|月杯|晋级赛|管理员|天意|监督|举报|打卡|铂金|段位/);
      }
    }
  });

  it('接入分类集中在日常可映射的五类', () => {
    const cats = new Set(LIBRARY_EVENTS.map((e) => e.category));
    for (const c of cats) expect(['对局', '摸鱼', '甩锅与关系', '成长', '生活']).toContain(c);
    // 六个人名仍然在角色里出现
    const names = ROSTER.map((m) => m.name);
    for (const name of names) expect(JSON.stringify(LIBRARY_EVENTS)).toContain(name);
  });
});
