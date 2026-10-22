// 游戏时钟（设计文档第 3 章）
// 白天 08:30–22:30 可见：正常速度下这 14 小时 = 现实 10 分钟；×3、×10 按比例加速
// 22:30 之后自动快进夜间（约 6 秒），第二天 08:30 继续
// 暂停分两种：玩家手动暂停；系统自动暂停（比赛日、重大事件、要老板拍板），自动暂停要逐个解除

export const DAY_START = 8 * 60 + 30;
export const DAY_END = 22 * 60 + 30;
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
}

export class GameClock {
  day: number;
  minute: number;
  speed: SpeedId;
  manualPause: boolean;
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

  isHeld(id: string): boolean {
    return this.holds.has(id);
  }

  setSpeed(s: SpeedId): void {
    this.speed = s;
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

  // realDt：现实秒。按“白天 → 22:30 → 午夜 → 08:30”分段推进，夜间固定快进
  // stopAt：当天的这些分钟是停靠点，走到就停在那里（本帧剩余时间作废），由调用方决定是否暂停
  tick(realDt: number, stopAt: number[] = []): TickResult {
    if (this.paused) return { advanced: 0, newDay: false };
    let remaining = realDt;
    let advanced = 0;
    let newDay = false;
    for (let guard = 0; guard < 4 && remaining > 1e-9; guard++) {
      const night = this.night;
      const rate = night ? NIGHT_RATE : BASE_RATE * SPEEDS[this.speed].mult;
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
      }
    }
    return { advanced, newDay };
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
