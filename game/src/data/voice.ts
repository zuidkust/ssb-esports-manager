// 人设台词：摸鱼、外卖、老板动作。事件板的专属条目在 sim/personaEvents.ts。
import type { Rand } from '../core/rng';
import { pick } from '../core/rng';
import type { PhoneApp } from './phoneApps';
import { ROSTER_BY_ID, type MemberDef } from './roster';
import type { DishDef } from './takeout';

export function phoneWeight(def: MemberDef, app: PhoneApp): number {
  return app.weight * (def.phoneBias[app.id] ?? 1);
}

export function phoneLabel(def: MemberDef, app: PhoneApp): string {
  if (app.id === 'mobilegame' && (def.id === 'aji' || def.id === 'dibi')) return '玩三角洲';
  return app.label;
}

export function soloLabel(id: string, breakTime: boolean, rand: Rand): string {
  const common = breakTime ? '饭后单排一把' : '单排冲分';
  if (id === 'aji' && rand() < 0.45) return breakTime ? '饭后试一套歪出装' : '单排，顺手改一套没人玩的出装';
  if (id === 'dangdeng' && rand() < 0.35) return '单排，眼睛还在看别人的装备';
  if (id === 'gouliang' && rand() < 0.3) return '单排一把，说打完就歇';
  if (id === 'dibi' && rand() < 0.35) return '赖在中路练补刀，不游走';
  if (id === 'diaolong' && rand() < 0.3) return '自定义里练钩子';
  if (id === 'piegan' && rand() < 0.4) return '上路对线，剑魔已经锁了';
  return common;
}

export function snackWeightMul(id: string): number {
  if (id === 'diaolong') return 0.15;
  if (id === 'piegan' || id === 'gouliang' || id === 'aji') return 1.35;
  return 1;
}

/** 日常动态里的人设句。返回 null 就用通用句。 */
export function habitLine(id: string, kind: string, other: string, app: string | undefined, rand: Rand): string | null {
  const n = ROSTER_BY_ID[id]?.name ?? id;
  if (kind === 'chat' && other) {
    if (id === 'gouliang' && (other === '阿鸡' || other === '撇干')) {
      return pick(rand, [
        `${n}凑到${other}旁边，损了三句，自己先笑了。`,
        `${n}：“${other}，这波你自己说。”说完不等回答。`,
        `${n}拉着${other}复盘，复盘到一半变成吐槽。`,
        `${n}和${other}聊着聊着，槽点已经换了两个。`,
      ]);
    }
    if (id === 'dangdeng' && other === '阿鸡') {
      return pick(rand, [
        `当邓看着阿鸡的屏幕：“这出装你跟谁学的？”`,
        `当邓：“野区被进，是因为有人出装像在实验。”阿鸡在笑。`,
        `出装警察上岗。当邓把阿鸡的装备念出了声。`,
        `当邓指着阿鸡的鞋子说了半天。阿鸡说这是理论。`,
      ]);
    }
    if (id === 'piegan' && other === '当邓') {
      return pick(rand, [
        `撇干：“你打野能不能来一次上路？”当邓没马上答。`,
        `撇干跟当邓吵帮不帮上路，声音不算大，内容很熟。`,
        `当邓：“你别一打起来就没了。”撇干：“那你倒是来。”`,
        `上路和打野又在讲三分钟来一次的事。`,
      ]);
    }
    if (id === 'diaolong') {
      return pick(rand, [
        `吊隆看了${other}一眼：“${other}最新外号，星期二质检员。”`,
        `吊隆给${other}起了个外号，${other}问什么意思，他不解释。`,
        `吊隆：“${other}最新外号，半熟领航员。”说完自己点头。`,
        `吊隆点评${other}刚才那波，顺手送了一个听不懂的外号。`,
      ]);
    }
    if (id === 'dibi') return pick(rand, [`弟必听${other}说完，只回了句“没事，下一把”。`, `弟必和${other}说话不多，场子倒是松了一点。`]);
    if (id === 'aji') return pick(rand, [`阿鸡跟${other}讲一套新出装，理论很长，例子只有他自己。`, `阿鸡：“我要拿出我的兜裆布了。”${other}已经习惯了。`]);
  }
  if (kind === 'slack_phone') {
    if (id === 'aji' && app === 'mobilegame') return '阿鸡把手机侧过去，在打三角洲，说就一把。';
    if (id === 'dibi' && app === 'mobilegame') return '弟必在打三角洲，训练模式还开着。';
    if (id === 'piegan' && app === 'xiaohongshu') return '撇干在看小红书，耳机里却是上路对线的声音。';
    if (id === 'diaolong' && (app === 'bilibili' || app === 'hupu')) return '吊隆在看比赛，看到钩子会把进度条拖回去。';
  }
  if (kind === 'snack') {
    if (id === 'diaolong') return '吊隆在零食柜前站了一下，什么都没拿。';
    if (id === 'piegan') return pick(rand, ['撇干拿走一包辣条，说晚上还要打。', '撇干抓了把薯片，边吃边看上路录像。']);
    if (id === 'gouliang') return '狗粮拆了一包薯片，嘴没停，薯片也没停。';
    if (id === 'aji') return '阿鸡零食不挑，抓到哪包是哪包。';
  }
  if (kind === 'fridge' || kind === 'drink') {
    if (id === 'aji') return kind === 'fridge' ? '阿鸡没拿奶茶，冰箱里翻出一罐可乐。' : '阿鸡接了杯水，说可乐等会儿再说。';
    if (id === 'dangdeng') return kind === 'fridge' ? '当邓拿了罐东鹏，说这把不能犯困。' : '当邓灌了口水，嘴里还在说节奏。';
    if (id === 'gouliang') return '狗粮倒了杯茶，说无糖就行。';
    if (id === 'dibi') return kind === 'fridge' ? '弟必拿了罐可乐，没说话。' : '弟必接了杯白开水。';
    if (id === 'diaolong') return kind === 'fridge' ? '吊隆冲了杯咖啡，零食没动。' : '吊隆接水，路过时看了一眼别人的屏幕。';
    if (id === 'piegan') return kind === 'fridge' ? '撇干拿了罐可乐，辣条还在另一只手里。' : '撇干接水，脚步是熬过夜的那种。';
  }
  if (kind === 'slack_stream' && id === 'dangdeng') return '当邓看直播，看的不是运营，是别人的出装。';
  if (kind === 'nap_desk' && id === 'aji') return '阿鸡趴下前还在说一套出装，说完就睡着了。';
  return null;
}

const QUIPS: Record<string, readonly string[]> = {
  aji: [
    '阿鸡点单很随便：“什么都吃。奶茶就算了，给我可乐。”',
    '阿鸡：“你们点，我跟着。别点奶茶就行。”',
    '阿鸡的外卖没有固定那家，他说出装才要固定思路。',
    '阿鸡看了一眼菜单就下单，理由是“都能吃”。',
  ],
  dangdeng: [
    '当邓点了汉堡炸鸡，说吃完再查别人的出装。',
    '当邓：“炸鸡就行。别整那些实验菜。”眼睛看着阿鸡。',
    '当邓的本命还是汉堡炸鸡，点的时候很果断。',
    '当邓：“这才叫吃饭。”袋子上是炸鸡。',
  ],
  gouliang: [
    '狗粮点了炸鸡：“记住了，我吃完只打一把。”没人信。',
    '狗粮边等炸鸡边说话，话题换了三次。',
    '狗粮：“汉堡可以。吃完我真的只打一把。”',
    '炸鸡到狗粮面前，他先发表了一句点评。',
  ],
  dibi: [
    '弟必点了汉堡，说不挑，炸鸡也行。',
    '弟必：“都行。”最后还是落在汉堡炸鸡上。',
    '弟必的外卖不折腾，汉堡，吃完继续。',
    '弟必把单子发出去，补了一句“没事，下一把之前能吃完”。',
  ],
  diaolong: [
    '吊隆点了炸鸡，备注里写着不要内脏。',
    '吊隆：“汉堡炸鸡就行。内脏别往里加。”',
    '吊隆的单子很普通，他顺便给商家起了个外号。',
    '吊隆点炸鸡，咖啡留到饭后再说。',
  ],
  piegan: [
    '撇干：“什么都行。”点完又去看上路录像。',
    '撇干不挑食，可乐倒是说死了要冰的。',
    '撇干随便点的，说吃完还得看对面打野来不来。',
    '撇干的外卖没有本命，他说上路才是本命。',
  ],
};

export function takeoutQuip(id: string, dishId: string, rand: Rand): string | null {
  const def = ROSTER_BY_ID[id];
  if (!def) return null;
  const fav = def.taste.favorites.includes(dishId);
  if (id === 'aji') {
    if (dishId === 'milktea') return '阿鸡把奶茶退了，换成可乐。';
    if (!fav && rand() > 0.45) return null;
  } else if (!fav) return null;
  return pick(rand, QUIPS[id] ?? []);
}

export function preferenceMul(id: string, dish: DishDef): number {
  const t = ROSTER_BY_ID[id]?.taste;
  if (!t) return 1;
  if (t.avoid.includes(dish.id)) return 0;
  if (t.avoidTags.some((tag) => dish.tags.includes(tag))) return 0;
  if (t.favorites.includes(dish.id)) return t.favoriteMul;
  return 1;
}

type ActionId = 'talk' | 'praise' | 'scold' | 'milktea';

const BOSS: Record<ActionId, Record<string, readonly string[]>> = {
  talk: {
    aji: [
      '老板夸了阿鸡那套出装。阿鸡立刻把理论又讲了一遍。',
      '单独谈完，阿鸡说下把还用这个思路，脸上看不出压力。',
      '老板没批评出装。阿鸡出门的时候脚步都轻了。',
      '阿鸡听老板说话，中间插了一句“所以这件装备是对的”。',
    ],
    dangdeng: [
      '老板夸当邓节奏带得清楚。当邓说“就该这么打”。',
      '单独谈指挥。当邓点头，转头还是要问谁没听。',
      '老板没当面砸他。当邓的声音下来一点。',
      '当邓听完，先承认节奏，再补了一句线上的事。',
    ],
    gouliang: [
      '老板说狗粮这几把输出稳。狗粮认了，又损了一句别人。',
      '单独谈完，狗粮：“是我的那些我认。输出的部分你也看见了。”',
      '狗粮听表扬听得很受用，话量当场上涨。',
      '老板让狗粮少说两句。狗粮说“my bad”，然后又说了两句。',
    ],
    dibi: [
      '老板夸弟必团战。弟必“嗯”了一声，耳根有点红。',
      '单独谈，弟必听得很安静，回去把符文改了。',
      '弟必：“行，我注意对线。”没有辩。',
      '老板说团战那段好看。弟必过了几秒才说谢谢。',
    ],
    diaolong: [
      '老板夸吊隆的钩子。吊隆说“中了就该上”，嘴角是松的。',
      '单独谈指挥。吊隆听完，给老板也起了个一闪而过的外号。',
      '吊隆点头，说下路他守着，别的路别指望他游过去。',
      '老板把开团那波再说了一遍。吊隆看起来比平时好说话。',
    ],
    piegan: [
      '老板说剑魔那波开大是对的。撇干立刻把上路经济又念了一遍。',
      '单独谈，老板答应让打野多看看上路。撇干这才接话。',
      '撇干：“你别说我送。对面打野三分钟来一次。”',
      '夸了剑魔，撇干的肩膀松下来，辣条袋子也响了一下。',
    ],
  },
  praise: {
    aji: [
      '老板当众说阿鸡的出装这把是功。阿鸡把理论无偿广播了。',
      '公开表扬打法。阿鸡笑得很大声，说歪理论今天成立。',
      '阿鸡被点名夸出装，他要求把录像再放一遍。',
      '表扬完，阿鸡说下把还能再发明一件。',
    ],
    dangdeng: [
      '老板当众夸当邓的节奏。当邓：“就该这么打。”',
      '表扬指挥。当邓很受用，顺手又查了一圈出装。',
      '当邓被夸完坐直了，说雪人这英雄就得这么用。',
      '公开说节奏是当邓带的。他点头，像早就知道。',
    ],
    gouliang: [
      '老板夸狗粮的操作和输出。狗粮先谢，再把对面嘲了一句。',
      '公开表扬。狗粮话比平时更多，损人也不落下。',
      '狗粮：“输出我认。”然后看向阿鸡，好像还差一个槽点。',
      '被当众夸收割，狗粮说记住了，今天可以只玩一把。没人信。',
    ],
    dibi: [
      '老板夸弟必团战输出。弟必过了两秒：“还行。”',
      '公开表扬很短。弟必没接太多，耳朵红了。',
      '弟必被点名，只说队友开团开得好。',
      '表扬团战。弟必点头，对线的事他没主动提。',
    ],
    diaolong: [
      '老板夸吊隆钩子和开团。吊隆说这把指挥也行。',
      '公开表扬点评。吊隆接受了，毒舌留给没被夸的人。',
      '吊隆被夸完，给自己起了个外号，谁也没听懂。',
      '表扬钩子。吊隆：“中了就上，不中就当我没说。”',
    ],
    piegan: [
      '老板当众说撇干剑魔打得好。撇干把“靠上路”又说了一遍。',
      '表扬上路。撇干终于没提对面打野，维持了二十秒。',
      '撇干被夸剑魔，人柱力三个字他自己先说出来了。',
      '公开夸上路抗压。撇干嘴硬了一下，其实在听。',
    ],
  },
  scold: {
    aji: [
      '老板点了阿鸡的出装。他先辩理论，再认错，最后自己把场子圆了。',
      '阿鸡：“行，这件是我的。下把我换。”看起来没往心里去。',
      '被当众说了，阿鸡用一句自嘲把笑声接走。',
      '批评落在出装上。阿鸡点头，雷点这东西他几乎没有。',
    ],
    dangdeng: [
      '老板当面说当邓。他急了：“指挥没人听，你说我？”',
      '点名批评。当邓把锅当场甩回线上，脸是热的。',
      '当邓不服：“野区被进的时候人呢？”',
      '当面说他上头。当邓接得又快又硬，旁边没人插话。',
    ],
    gouliang: [
      '老板说狗粮输出断了。狗粮：“是我的。”说完损了回来一句。',
      '狗粮：“my bad。”认得很痛快，下一句就开始讲别人。',
      '被点名，狗粮先认操作，再用吐槽把批评分掉一点。',
      '批评他话多。狗粮认了，然后又说了四句。',
    ],
    dibi: [
      '老板说弟必对线崩了。弟必：“嗯，刺客。我改。”',
      '点名批评。弟必不顶，回去看自己的回放。',
      '弟必听完点头，没找队友的原因。',
      '被说不等信号。弟必说下一把他先看钩子再交技能。',
    ],
    diaolong: [
      '老板说吊隆不游走。吊隆把锅分给 AD：“线都守不住，我走去哪。”',
      '点名批评。吊隆反怼一句，又看了打野一眼。',
      '吊隆：“钩子的事我认。开团之前那波不是我。”',
      '被当众说了，吊隆嘴上不让，句子却很短。',
    ],
    piegan: [
      '老板说撇干对线送了。撇干闷了一会儿：“对面打野三分钟来一次。”',
      '点名上路。撇干不接“送”这个字，后面就没声了。',
      '撇干：“我被针对了。”说完盯着自己的键盘。',
      '关键时刻被批评，撇干把话咽回去，辣条也不嚼了。',
    ],
  },
  milktea: {
    aji: [
      '阿鸡没领奶茶，自己开了罐可乐。',
      '阿鸡把杯子推回去：“我不喝这个，给我可乐。”',
      '六杯里阿鸡那杯最后变成了可乐。',
      '阿鸡说奶茶换成可乐就行，别的他不挑剔。',
    ],
  },
};

export const REST_LINES = [
  '老板放假一天。训练心得没有了，人是松下来了。',
  '放假。吊隆把椅子往后一靠，说今天不指挥了。',
  '老板说休息。阿鸡已经在研究明天的出装。',
  '弟必点点头。人是松的，手机还开着。',
] as const;

export function bossLine(action: ActionId, memberId: string, rand: Rand): string | null {
  const bag = BOSS[action][memberId];
  if (!bag?.length) return null;
  return pick(rand, bag);
}
