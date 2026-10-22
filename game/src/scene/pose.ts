// 姿态表：只算关节目标角。走路、坐下、挥手的角度都在这里，寻路不在这里。
export type PoseName =
  | 'stand' | 'walk' | 'sit_play' | 'sit_phone' | 'sit_relax' | 'sit_eat' | 'sleep_desk' | 'slump'
  | 'rage' | 'cheer' | 'chat' | 'drink' | 'watch' | 'lie' | 'reach';

export interface Pose {
  hipsY: number; bodyRX: number; bodyY: number; spineRX: number; spineRY: number; spineRZ: number; headRX: number; headRY: number; headRZ: number;
  sh: [number, number][]; el: number[]; hp: number[]; kn: number[];
}

export interface PoseBody {
  legLen: number;
  seatH: number;
  lastSlam: number;
  onSlam: (() => void) | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 各关节目标角。slam 的时间戳写回 body.lastSlam，拍桌子才会响一次。 */
export function poseTargets(name: PoseName, t: number, body: PoseBody): Pose {
  const P: Pose = {
    hipsY: body.legLen, bodyRX: 0, bodyY: 0, spineRX: 0, spineRY: 0, spineRZ: 0, headRX: 0, headRY: 0, headRZ: 0,
    sh: [[0, 0.08], [0, -0.08]], el: [0, 0], hp: [0, 0], kn: [0, 0],
  };
  const sit = () => {
    P.hipsY = body.seatH;
    P.hp = [-Math.PI / 2 + 0.05, -Math.PI / 2 + 0.05];
    P.kn = [Math.PI / 2 - 0.05, Math.PI / 2 - 0.05];
  };
  switch (name) {
    case 'stand':
      P.spineRX = Math.sin(t * 1.4) * 0.015;
      P.headRY = Math.sin(t * 0.5) * 0.12;
      P.sh = [[Math.sin(t * 0.9) * 0.04, 0.1], [-Math.sin(t * 0.9) * 0.04, -0.1]];
      P.el = [-0.12, -0.12];
      break;
    case 'walk': {
      const w = t * 7.5;
      P.hp = [Math.sin(w) * 0.5, -Math.sin(w) * 0.5];
      P.kn = [Math.max(0, -Math.sin(w)) * 0.75, Math.max(0, Math.sin(w)) * 0.75];
      P.sh = [[-Math.sin(w) * 0.45, 0.1], [Math.sin(w) * 0.45, -0.1]];
      P.el = [-0.3, -0.3];
      P.bodyY = Math.abs(Math.sin(w)) * 0.035;
      P.spineRX = 0.05;
      P.spineRY = Math.sin(w) * 0.06;
      break;
    }
    case 'sit_play':
      sit();
      P.spineRX = 0.16 + Math.sin(t * 1.3) * 0.02;
      P.headRX = 0.08 + Math.sin(t * 2.1) * 0.03;
      P.sh = [[-0.85 + Math.sin(t * 13) * 0.04, 0.12], [-0.8 + Math.sin(t * 3.1) * 0.06, -0.05]];
      P.el = [-0.85 + Math.sin(t * 15) * 0.07, -0.95 + Math.sin(t * 4) * 0.05];
      break;
    case 'sit_phone':
      sit();
      P.spineRX = 0.3;
      P.headRX = 0.5;
      P.headRZ = Math.sin(t * 0.6) * 0.06;
      P.sh = [[-0.35, 0.15], [-0.55, -0.25]];
      P.el = [-0.8, -1.7 + Math.sin(t * 2) * 0.05];
      break;
    case 'sit_relax':
      sit();
      P.spineRX = -0.22;
      P.headRX = -0.05 + Math.sin(t * 0.7) * 0.05;
      P.headRZ = 0.12;
      P.sh = [[-0.4, 0.45], [-0.4, -0.45]];
      P.el = [-1.9, -1.9];
      P.hp = [-Math.PI / 2 + 0.25, -Math.PI / 2 + 0.25];
      P.kn = [Math.PI / 2 - 0.35, Math.PI / 2 - 0.35];
      break;
    case 'sit_eat':
      sit();
      P.spineRX = 0.2;
      P.headRX = 0.2;
      P.sh = [[-0.6, 0.1], [-0.4 - Math.max(0, Math.sin(t * 1.6)) * 0.6, -0.1]];
      P.el = [-0.9, -1.2 - Math.max(0, Math.sin(t * 1.6)) * 0.9];
      break;
    case 'sleep_desk':
      sit();
      P.spineRX = 0.95 + Math.sin(t * 0.9) * 0.02;
      P.headRX = 0.25;
      P.headRZ = 0.5;
      P.sh = [[-1.25, 0.35], [-1.25, -0.35]];
      P.el = [-1.6, -1.6];
      break;
    case 'slump':
      sit();
      P.spineRX = 0.45;
      P.headRX = 0.55;
      P.sh = [[0.1, 0.15], [0.1, -0.15]];
      P.el = [-0.2, -0.2];
      break;
    case 'rage': {
      P.spineRX = 0.28;
      P.headRX = 0.2;
      const ph = (t * 1.9) % 1;
      const up = ph < 0.65 ? ph / 0.65 : 1 - Math.pow((ph - 0.65) / 0.35, 2);
      P.sh = [[lerp(-0.95, -2.7, up), 0.15], [lerp(-0.95, -2.5, ph < 0.65 ? up * 0.8 : up), -0.15]];
      P.el = [-0.25, -0.35];
      P.hp = [-0.12, -0.12];
      P.kn = [0.15, 0.15];
      P.hipsY = body.legLen - 0.03;
      if (ph > 0.95 && t - body.lastSlam > 0.3) {
        body.lastSlam = t;
        body.onSlam?.();
      }
      break;
    }
    case 'cheer':
      P.sh = [[-2.8 + Math.sin(t * 9) * 0.25, 0.35], [-2.8 - Math.sin(t * 9) * 0.25, -0.35]];
      P.el = [-0.3, -0.3];
      P.bodyY = Math.max(0, Math.sin(t * 9)) * 0.12;
      P.headRX = -0.25;
      break;
    case 'chat':
      P.sh = [[-0.2 + Math.sin(t * 2.2) * 0.15, 0.12], [-0.7 + Math.sin(t * 3.1 + 1) * 0.35, -0.2]];
      P.el = [-0.3, -1.1 + Math.sin(t * 3.3) * 0.3];
      P.headRX = Math.sin(t * 2.4) * 0.08;
      P.headRY = Math.sin(t * 0.9) * 0.15;
      P.spineRY = Math.sin(t * 0.8) * 0.08;
      break;
    case 'drink':
      P.sh = [[0, 0.1], [-0.35 - Math.max(0, Math.sin(t * 1.2)) * 0.55, -0.15]];
      P.el = [0, -1.5 - Math.max(0, Math.sin(t * 1.2)) * 0.6];
      P.headRX = -Math.max(0, Math.sin(t * 1.2)) * 0.2;
      break;
    case 'reach':
      // 开冰箱、在零食柜前挑东西：手往前伸、头左右看
      P.spineRX = 0.18;
      P.headRX = 0.15;
      P.headRY = Math.sin(t * 1.3) * 0.3;
      P.sh = [[-0.25, 0.1], [-1.25 + Math.sin(t * 1.6) * 0.15, -0.1]];
      P.el = [-0.3, -0.25];
      break;
    case 'watch':
      P.sh = [[-0.45, 0.5], [-0.45, -0.5]];
      P.el = [-1.85, -1.85];
      P.headRX = 0.15;
      P.spineRX = 0.05 + Math.sin(t * 1.1) * 0.02;
      break;
    case 'lie':
      P.hipsY = body.legLen;
      P.bodyRX = -Math.PI / 2;
      P.sh = [[-0.5, 0.3], [-0.5, -0.3]];
      P.el = [-1.4, -1.4];
      P.headRX = -0.15;
      P.headRZ = 0.25;
      P.hp = [0.05, -0.05];
      P.kn = [0.1, 0.2];
      P.spineRX = Math.sin(t * 0.8) * 0.015;
      break;
  }
  return P;
}
