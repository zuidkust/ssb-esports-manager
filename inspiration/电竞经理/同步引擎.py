# -*- coding: utf-8 -*-
"""
引擎同步脚本：把《重生之我是SSB职业经理.html》的 engine 块整块同步到《引擎调试台.html》

为什么需要：游戏和调试台共享同一份引擎代码（<script id="engine"> 块）。
规则：引擎只在主文件里改，改完跑本脚本同步，再跑测试。
⚠️ 模拟测试.js 读的是调试台——不同步就测的是旧引擎！

用法（在本目录下）：python 同步引擎.py
"""
import re
import sys
import io
import os

# Windows 控制台中文输出
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

os.chdir(os.path.dirname(os.path.abspath(__file__)))

GAME = "重生之我是SSB职业经理.html"
DBG = "引擎调试台.html"

game = open(GAME, encoding="utf-8", newline="").read()
m = re.search(r'<script id="engine">[\s\S]*?</script>', game)
if not m:
    sys.exit("[FAIL] 主文件未找到 <script id=\"engine\"> 块：" + GAME)
block = m.group(0)

dbg = open(DBG, encoding="utf-8", newline="").read()
if '<script id="engine">' not in dbg:
    sys.exit('[FAIL] 调试台未找到 engine 块：' + DBG)

dbg2, n = re.subn(
    r'<script id="engine">[\s\S]*?</script>',
    lambda _: block,
    dbg,
    count=1,
)
if n != 1:
    sys.exit("[FAIL] engine 块替换失败")

open(DBG, "w", encoding="utf-8", newline="").write(dbg2)

# 回读校验
chk = open(DBG, encoding="utf-8", newline="").read()
if block not in chk:
    sys.exit("[FAIL] 回读校验未通过，请检查文件")

print("[OK] 引擎同步完成：%d 字符 → %s" % (len(block), DBG))
print("     下一步：node 游戏测试.js && node 模拟测试.js")
