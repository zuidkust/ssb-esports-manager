// 世界时钟：与现实 1:1 的北京时间（UTC+8）
// 样板额外提供"审核模式"：可拖动时间、加速、切换到指定星期，正式版不提供

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const BJ_OFFSET = 8 * HOUR;
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 北京时间的日期分解
export function beijingParts(ms) {
  const d = new Date(ms + BJ_OFFSET);
  const wd = d.getUTCDay();
  return {
    ms,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: wd === 0 ? 7 : wd, // 周一=1 … 周日=7
    weekdayCn: WEEK_CN[wd],
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000,
    dateKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
  };
}

export function startOfBeijingDay(ms) {
  return Math.floor((ms + BJ_OFFSET) / DAY) * DAY - BJ_OFFSET;
}

export function fmtHM(minuteOfDay) {
  const m = Math.floor(minuteOfDay) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 太阳高度角/方位角（NOAA 简化算法），默认北京坐标
export function sunPosition(ms, lat = 39.9, lon = 116.4) {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((ms - start) / DAY) + 1;
  const hourUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hourUTC - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hourUTC * 60 + eqtime + 4 * lon;
  const ha = ((tst / 4 - 180) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  // 方位角：从正北顺时针
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { elevation: Math.PI / 2 - zen, azimuth: az };
}

export class WorldClock {
  constructor() {
    this.goLive();
  }

  // 回到"现在"：真实北京时间、1 倍速
  goLive() {
    this.baseReal = Date.now();
    this.baseWorld = Date.now();
    this.speed = 1;
    this.live = true;
  }

  _anchor() {
    const now = Date.now();
    this.baseWorld = this.baseWorld + (now - this.baseReal) * this.speed;
    this.baseReal = now;
  }

  nowMs() {
    return this.baseWorld + (Date.now() - this.baseReal) * this.speed;
  }

  now() {
    return beijingParts(this.nowMs());
  }

  setSpeed(speed) {
    this._anchor();
    this.speed = speed;
    this.live = false;
  }

  // 跳到当天指定时刻（分钟）
  setMinuteOfDay(min) {
    this._anchor();
    this.baseWorld = startOfBeijingDay(this.baseWorld) + min * 60000;
    this.live = false;
  }

  // 切换到本周指定星期（1–7），保持时刻不变
  setWeekday(target) {
    this._anchor();
    const p = beijingParts(this.baseWorld);
    this.baseWorld += (target - p.weekday) * DAY;
    this.live = false;
  }
}
