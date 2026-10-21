import re,json,collections
MEM=['施颠','当邓','地鼠','弟必','吊龙','批菊']
evs=[];cat=pre=None;cnt=collections.Counter()
for l in open('events_src.txt',encoding='utf8'):
    l=l.strip()
    if not l:continue
    if l.startswith('#'):cat,pre=l[1:].split('|');continue
    n,lv,cond,roles,texts,eff,_,cd=l.split('|')
    cnt[pre]+=1
    conds=[c.strip() for c in cond.split(';') if c.strip()]
    effects=[];chain=[]
    for e in eff.split(';'):
        e=e.strip()
        if not e or e=='-':continue
        if e.startswith('chain:'):
            for x in e[6:].split(','):
                t,w=x.rsplit('+',1);chain.append({'ref':t,'weightPct':int(w)})
        else:
            m=re.match(r'(.+?)([+\-±]\d+(?:\.\d+)?%?)@(.+)$',e)
            effects.append({'attr':m.group(1),'delta':m.group(2),'target':m.group(3)} if m else {'raw':e})
    excl=[m for m in MEM if any(c.startswith('成员=') and m in c for c in conds)]
    rl=[r.strip() for r in roles.split(',')]
    excl+= [m for m in MEM if m in rl and m not in excl]
    evs.append(dict(id=f'{pre}_{n}',name=n,category=cat,level=lv,conditions=conds,roles=rl,
        exclusiveTo=excl,texts=[t.strip() for t in texts.split('/') if t.strip()],
        effects=effects,chainNext=chain,cooldownMinutes=int(cd),hiddenAdmin=(pre=='T')))
ids={e['id'] for e in evs}
byname={e['name']:e['id'] for e in evs}
for e in evs:
    for c in e['chainNext']:
        nm=c.pop('ref').split('_',1)[1]
        c['id']=byname[nm]
assert len(ids)==len(evs)
CHAINS=json.load(open('chains.json',encoding='utf8'))
for ch in CHAINS:
    for s in ch['steps']:
        for k in [s['event']]+[b['event'] for b in s.get('branches',[])]:
            assert k in ids,k
RULES=json.load(open('rules.json',encoding='utf8'))
out=dict(version='0.1',generatedFrom='事件库-v0.1.md',levels=['日常','有趣','剧情','重大'],
 conventions={'conditions':'字符串DSL，分号已拆分；属性名直接比较（如 专注<30）、time=HH:MM-HH:MM、成员=X 表示专属、flag=前置事件或状态、admin 表示仅管理员投放、rand<p 为基础概率',
 'effects':'attr+delta@target；target 可为角色槽位、全员、全局、队伍；A>B 为单向关系，A<>B 为双向',
 'texts':'{槽位名} 为人名占位；{对手}{对手风格}由比赛模块填充','hiddenAdmin':'天意类：前台展示与自然事件完全相同，仅写入后台干预日志'},
 events=evs,chains=CHAINS,combinationRules=RULES)
json.dump(out,open('../data/events.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
# markdown
L=['# 事件库 v0.1','','> 依据《设计文档-v0.1》《成长属性体系-草案v0.1》《事件系统-草案v0.1》。纯旁观；无管事、互相监督；9:00–17:00 上班可早到加班；每周周赛+每月杯赛，对手均为虚拟战队；天意类为管理员隐形投放，前台与自然事件无差别。结构化版本见 `data/events.json`。','',
 f'**总数 {len(evs)} 条**：'+'、'.join(f'{c} {sum(1 for e in evs if e["category"]==c)}' for c in dict.fromkeys(e['category'] for e in evs)),'',
 '专属事件数：'+'、'.join(f'{m} {sum(1 for e in evs if m in e["exclusiveTo"])}' for m in MEM),'',
 '字段说明：条件中 `成员=X` 表示专属事件；`flag=` 为前置事件/状态；`chain:` 为连锁加权（百分比提高下一事件当日触发概率）。','']
for c in dict.fromkeys(e['category'] for e in evs):
    L+=[f'## {c}','']
    for i,e in enumerate([x for x in evs if x['category']==c],1):
        ex=f"（专属：{'、'.join(e['exclusiveTo'])}）" if e['exclusiveTo'] else ''
        ef='；'.join(x.get('raw') or f"{x['target']} {x['attr']}{x['delta']}" for x in e['effects']) or '无数值影响'
        ch='；'.join(f"{x['id']} +{x['weightPct']}%" for x in e['chainNext'])
        L+=[f"### {i}. {e['name']} `{e['id']}`{ex}",f"- 级别：{e['level']}　冷却：{e['cooldownMinutes']} 分钟",
            f"- 触发：{'；'.join(e['conditions'])}",f"- 槽位：{'、'.join('['+r+']' for r in e['roles'])}","- 文案："]
        L+=[f"  - {t}" for t in e['texts']]
        L+=[f"- 影响：{ef}"+(f"；连锁加权 → {ch}" if ch else ''),'']
L+=['## 组合规则','']
for sec in RULES:
    L+=[f"### {sec['title']}",'']+[f"- {x}" for x in sec['items']]+['']
L+=['## 连锁链（多步剧情）','']
for i,ch in enumerate(CHAINS,1):
    L+=[f"### 链{i}：{ch['name']}",f"> {ch['desc']}",'']
    for j,s in enumerate(ch['steps'],1):
        L.append(f"{j}. `{s['event']}` {s.get('note','')}")
        for b in s.get('branches',[]):
            L.append(f"   - 分支（{b['if']}）→ `{b['event']}`")
    L.append('')
open('../docs/事件库-v0.1.md','w',encoding='utf8').write('\n'.join(L))
print(len(evs),collections.Counter(e['category'] for e in evs),{m:sum(1 for e in evs if m in e['exclusiveTo']) for m in MEM},len(CHAINS))
