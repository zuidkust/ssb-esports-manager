// 游戏时钟（设计文档第 3 章）
// 白天 09:00–22:00 可见：正常速度下这 13 小时 = 现实 10 分钟；×3、×10 按比例加速
// 22:00 下班后自动快进夜间（约 6 秒，不受档位影响），第二天 09:00 继续
// 暂停分两种：玩家手动暂停；系统自动暂停（比赛日、重大事件、要老板拍板），自动暂停要逐个解除

export const DAY_START = 9 * 60;
export const DAY_END = 22 * 60;
export const REAL_SECONDS_PER_DAY = 600;
export const BASE_RATE = (DAY_END - DAY_START) / REAL_SECONDS_PER_DAY; // 游戏分钟 / 现实秒
export const NIGHT_SECONDS = 6;
const NIGHT_MINUTES = 24 * 60 - DAY_END + DAY_START;
const NIGHT_RATE = NIGHT_MINUTES / NIGHT_SECONDS;

export type SpeedId = 'x1' | 'x3' | 'x10';
export const SPEEDS: Record<SpeedId, { mult: number; label: string }> = {
  x1: { mult: 1, label: '正常' },
  x3: { mult: 3, label: '快 ×3' },
  x10: { mult: 10, label: '极快 ×10' },
};

export interface ClockState {
  day: number;
  minute: number; // 当天第几分钟（可带小数）
  speed: SpeedId;
  paused: boolean; // 玩家手动暂停
}

export interface TickResult {
  advanced: number; // 本帧推进的游戏分钟
  newDay: boolean;
  used: number; // 实际消化掉的现实秒（停靠点或单次推进上限会提前停）
}

export class GameClock {
  day: number;
  minute: number;
  speed: SpeedId;
  manualPause: boolean;
  // 调试面板的自由倍速（1–60）。不进存档；切回底部 1/2/3 档位时清掉。夜间快进不看这个数。
  debugRate: number | null = null;
  private holds = new Map<string, string>(); // 自动暂停：原因 id → 说明

  constructor(s: ClockState) {
    this.day = s.day;
    this.minute = s.minute;
    this.speed = s.speed;
    this.manualPause = s.paused;
  }

  get paused(): boolean {
    return this.manualPause || this.holds.size > 0;
  }

  get night(): boolean {
    return this.minute >= DAY_END || this.minute < DAY_START;
  }

  get holdReasons(): string[] {
    return [...this.holds.values()];
  }

  hold(id: string, reason: string): void {
    this.holds.set(id, reason);
  }

  release(id: string): void {
    this.holds.delete(id);
  }

  // 跳时间时丢掉「match-第几天」这类自动暂停，避免停在已经过去的比赛日
  releasePrefixed(prefix: string): void {
    for (const id of [...this.holds.keys()]) if (id.startsWith(prefix)) this.holds.delete(id);
  }

  isHeld(id: string): boolean {
    return this.holds.has(id);
  }

  // 走路和进门跟着时间档位走。×10 时如果还按现实速度排队，名册已经全员在岗，人却还藏在门外。
  get moveScale(): number {
    return this.debugRate ?? SPEEDS[this.speed].mult;
  }

  setSpeed(s: SpeedId): void {
    this.speed = s;
    this.debugRate = null;
    this.manualPause = false;
  }

  setDebugRate(mult: number): void {
    const n = Math.round(Number.isFinite(mult) ? mult : 1);
    this.debugRate = Math.max(1, Math.min(60, n));
    this.manualPause = false;
  }

  togglePause(): void {
    this.manualPause = !this.manualPause;
  }

  // 跳到指定时刻（调试与读档用）
  set(day: number, minute: number): void {
    this.day = day;
    this.minute = minute;
  }

  // realDt：现实秒。按“白天 → 22:00 → 午夜 → 09:00”分段推进，夜间固定快进
  // stopAt：当天的这些分钟是停靠点，走到就停在那里（本次调用的剩余时间作废），由调用方决定是否暂停
  // 跨过午夜就返回，不带着「昨天的停靠点」继续走下一天。否则一次大步（极快或调试 60 倍）会在同一调用里
  // 把下一天的 18:30 赛前跳过去。主循环用 drainRealtime 分批喂时间，过了午夜会按新的一天重新要停靠点。
  tick(realDt: number, stopAt: number[] = []): TickResult {
    if (this.paused || !(realDt > 0)) return { advanced: 0, newDay: false, used: 0 };
    let remaining = realDt;
    let advanced = 0;
    let newDay = false;
    for (let guard = 0; guard < 4 && remaining > 1e-9; guard++) {
      const night = this.night;
      const mult = this.debugRate ?? SPEEDS[this.speed].mult;
      const rate = night ? NIGHT_RATE : BASE_RATE * mult;
      let boundary = !night ? DAY_END : this.minute >= DAY_END ? 24 * 60 : DAY_START;
      let isStop = false;
      for (const s of stopAt) {
        if (s > this.minute && s < boundary) {
          boundary = s;
          isStop = true;
        }
      }
      const need = (boundary - this.minute) / rate;
      if (need > remaining) {
        this.minute += remaining * rate;
        advanced += remaining * rate;
        remaining = 0;
        break;
      }
      advanced += boundary - this.minute;
      remaining -= need;
      this.minute = boundary;
      if (isStop) break;
      if (this.minute >= 24 * 60) {
        this.minute = 0;
        this.day += 1;
        newDay = true;
        break;
      }
    }
    return { advanced, newDay, used: realDt - remaining };
  }

  snapshot(): ClockState {
    return { day: this.day, minute: this.minute, speed: this.speed, paused: this.manualPause };
  }
}

export function fmtHM(minute: number): string {
  const m = Math.floor(minute) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 太阳位置：固定一个秋天的北京日期，只随一天中的时刻变化（NOAA 简化算法）
export function sunPosition(minute: number, lat = 39.9, lon = 116.4): { elevation: number; azimuth: number } {
  const doy = 280;
  const hourUTC = (minute / 60 - 8 + 24) % 24;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hourUTC - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hourUTC * 60 + eqtime + 4 * lon;
  const ha = ((tst / 4 - 180) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { elevation: Math.PI / 2 - zen, azimuth: az };
}
