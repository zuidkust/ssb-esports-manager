// 老板动作的人设反馈。数值仍走 actions.ts，这里只换说法。
import type { Rand } from '../core/rng';
import { pick } from '../core/rng';
import { pairKey, ROSTER_BY_ID } from '../data/roster';

function name(id: string): string {
  return ROSTER_BY_ID[id]?.name ?? id;
}

function from(rand: Rand, lines: readonly string[] | undefined): string | null {
  if (!lines?.length) return null;
  return pick(rand, lines);
}

const TALK: Record<string, string[]> = {
  aji: [
    '老板单独夸了阿鸡的出装。他嘴硬了两句，人是高兴的。',
    '老板把阿鸡叫到一边。阿鸡先讲理论，再认错，最后自己把场面圆了。',
  ],
  dangdeng: [
    '老板夸当邓的节奏和指挥。他点头，这回没提投降。',
    '单独谈完，当邓说就该这么打。耳朵还是红的。',
  ],
  gouliang: [
    '老板夸狗粮的操作和输出。狗粮损了自己一句，尾音是开心的。',
    '狗粮听完点头：“是我的。”然后又补了一句骚话。',
  ],
  dibi: [
    '老板夸弟必的团战输出。弟必“嗯”了一声。',
    '弟必听完没多话，说下一把团战再看看。',
  ],
  diaolong: [
    '老板夸吊隆的钩子和开团。他点点头，外号咽了回去。',
    '单独谈完，吊隆把今天谁开团说了一遍，比老板说得还长。',
  ],
  piegan: [
    '老板夸撇干的剑魔，说打野会多看上路。撇干肩膀松下来一点。',
    '老板没说他送。撇干自己先补了一句对面打野三分钟来一次。',
  ],
};

const PRAISE: Record<string, string[]> = {
  aji: [
    '老板当众夸阿鸡的出装。当邓看了一眼装备栏，没说话。',
    '阿鸡被点名夸打法。他当场把歪理论又证明了一遍。',
  ],
  dangdeng: [
    '老板当众夸当邓的指挥。他补了句“就该这么打”。',
    '表扬落到节奏上。当邓今天没喊投降。',
  ],
  gouliang: [
    '老板夸狗粮的输出。狗粮立刻开始嘲对面，话比平时更多。',
    '狗粮被当众夸操作。他先说 my bad，再把高光回放打开。',
  ],
  dibi: [
    '老板夸弟必团战。他闷了一句，然后低头补刀去了。',
    '弟必被点名。他没推辞，也没多说。',
  ],
  diaolong: [
    '老板当众夸吊隆的钩子和开团。他点评了今天谁划水。',
    '吊隆听完表扬，说这把是钩子开出来的。',
  ],
  piegan: [
    '老板夸撇干上路。他先说自己对线打爆了，再提对面打野。',
    '撇干被当众夸剑魔。他坐直了，没提被针对。',
  ],
};

const SCOLD: Record<string, string[]> = {
  aji: [
    '老板点了阿鸡。他先歪理论，再认错，再用自嘲把场面圆回去。',
    '阿鸡几乎没有雷点。被说完还问下把出装能不能继续试。',
  ],
  dangdeng: [
    '老板当众说当邓。他当场急眼，把锅甩回队友。',
    '当面批评踩中当邓的雷。他抬高声音，说没人听指挥。',
  ],
  gouliang: [
    '老板说狗粮。他先认“是我的”，再损回去一句。',
    '狗粮点头认错，转头把旁边的人一起捎上。',
  ],
  dibi: [
    '老板说弟必。他淡定接受，说下一把看对线。',
    '弟必没争。刺客那句他咽回去了，人还坐得住。',
  ],
  diaolong: [
    '老板说吊隆。他毒舌反怼，锅分给下路和打野。',
    '吊隆没认。钩子的账他算给了别人。',
  ],
  piegan: [
    '老板说到撇干的对线。他闷着不说话，只留一句“被针对了”。',
    '撇干被点名之后不说话了。打野三分钟来一次，他没说出口。',
  ],
};

const DUO: Record<string, string> = {
  'aji|dangdeng': '一个要试出装，一个要当出装警察。',
  'aji|dibi': '弟必话少，阿鸡把理论讲完了。',
  'dangdeng|piegan': '打野帮不帮上路，进房间之前先吵了一句。',
  'diaolong|gouliang': '下路这一对的连招名还是【待定】。',
  'dangdeng|dibi': '中野这一对的连招名还是【待定】。弟必大概率还是赖线。',
  'gouliang|piegan': '狗粮进房就先损了撇干一句。',
};

export function personaActionLine(actionId: string, targets: string[], rand: Rand, backfire: boolean): string | null {
  if (backfire) return null;
  if (actionId === 'talk' && targets[0]) return from(rand, TALK[targets[0]]);
  if (actionId === 'praise' && targets[0]) return from(rand, PRAISE[targets[0]]);
  if (actionId === 'scold' && targets[0]) return from(rand, SCOLD[targets[0]]);
  if (actionId === 'duo' && targets.length === 2) {
    const flavor = DUO[pairKey(targets[0], targets[1])];
    const base = `老板安排${name(targets[0])}和${name(targets[1])}今天双排。`;
    return flavor ? `${base}${flavor}` : base;
  }
  if (actionId === 'rest') return '老板放假一天。吊隆把椅子往后一靠，说钩子明天再练。训练心得没有了，人是松下来了。';
  if (actionId === 'party') return '团建聚餐。阿鸡说随便点，吊隆不碰内脏，桌上还是在复盘昨天那把。';
  return null;
}
