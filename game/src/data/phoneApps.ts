// 刷手机细分（设计文档 6.1.1）：多数时候在刷抖音；也保留笼统的“耍手机”，不是每次都说清楚在干什么
// weight 是相对权重；screen 是手机屏幕的发光颜色，远看也能分出在刷什么
export interface PhoneApp {
  id: string;
  label: string; // 人物卡“此刻在干嘛”
  weight: number;
  screen: number;
}

export const PHONE_APPS: PhoneApp[] = [
  { id: 'douyin', label: '刷抖音', weight: 45, screen: 0xff3b6b },
  { id: 'generic', label: '耍手机', weight: 20, screen: 0x6fa8ff },
  { id: 'bilibili', label: '看 B 站', weight: 8, screen: 0xfb7299 },
  { id: 'mobilegame', label: '玩手游', weight: 6, screen: 0x7bd88f },
  { id: 'shortdrama', label: '看短剧', weight: 4, screen: 0xffb454 },
  { id: 'xiaohongshu', label: '看小红书', weight: 4, screen: 0xff2442 },
  { id: 'weibo', label: '看微博', weight: 4, screen: 0xff8200 },
  { id: 'wechat', label: '回微信', weight: 3, screen: 0x07c160 },
  { id: 'taobao', label: '逛淘宝', weight: 2, screen: 0xff5000 },
  { id: 'hupu', label: '看虎扑', weight: 2, screen: 0xd0d6e0 },
  { id: 'moments', label: '刷朋友圈', weight: 2, screen: 0x9fe3b4 },
];

export const PHONE_APP_BY_ID: Record<string, PhoneApp> = Object.fromEntries(PHONE_APPS.map((a) => [a.id, a]));
