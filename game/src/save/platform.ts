// 平台接口层（设计文档第 2 章）：存档、文件导入导出只经过这里
// 现在是网页版实现（浏览器存储 + 下载/选择文件）；以后 Electron 版换成本地文件实现，游戏逻辑不改

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}

export interface Platform {
  name: 'web' | 'electron';
  store: KeyValueStore;
  // 存储是否可靠：浏览器隐私模式、file:// 下某些浏览器会禁用或随时清空
  persistent: boolean;
  downloadText(filename: string, text: string): void;
  pickTextFile(): Promise<string | null>;
}

// 内存存储：浏览器存储不可用时兜底（关掉页面就没了，界面会提示导出）
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  get(key: string) {
    return this.m.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.m.set(key, value);
  }
  remove(key: string) {
    this.m.delete(key);
  }
  keys(prefix: string) {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix));
  }
}

class LocalStore implements KeyValueStore {
  constructor(private ls: Storage) {}
  get(key: string) {
    return this.ls.getItem(key);
  }
  set(key: string, value: string) {
    this.ls.setItem(key, value);
  }
  remove(key: string) {
    this.ls.removeItem(key);
  }
  keys(prefix: string) {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k?.startsWith(prefix)) out.push(k);
    }
    return out;
  }
}

function probeLocalStorage(): Storage | null {
  try {
    const ls = window.localStorage;
    const k = '__ssb_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

export function createWebPlatform(): Platform {
  const ls = probeLocalStorage();
  return {
    name: 'web',
    store: ls ? new LocalStore(ls) : new MemoryStore(),
    persistent: !!ls,
    downloadText(filename, text) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    pickTextFile() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', async () => {
          const f = input.files?.[0];
          resolve(f ? await f.text() : null);
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },
  };
}
