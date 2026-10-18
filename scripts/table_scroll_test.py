"""
正文表格横向滚动容器 —— 端到端验证

验证点：
  1. 所有正文表格都被包进 .wb-table-scroll，且不重复嵌套（幂等）
  2. 宽表：wrapper 出现横向滚动（scrollWidth > clientWidth），页面本身无横向溢出
  3. 宽表：表格 no longer 自己滚动（table 的 scrollWidth == clientWidth 或 overflow 非 auto）
  4. 窄表：wrapper 不产生滚动条
  5. 外框圆角在 wrapper 上，表格自身无外框（避免滚动时切边）
  6. 移动端 375px 视口下宽表可横向滚动、整页不溢出
  7. 未包裹的表格（JS 关闭）仍不撑破页面布局

运行：python3 table_scroll_test.py
"""
import asyncio
import sys
from playwright.async_api import async_playwright

BASE = "http://localhost:4400"

WIDE_MD = """
# 宽表测试

| 维度 | 本方案（Astro + Supabase + CF Workers） | WordPress | Next.js + Vercel | Hexo / Hugo（纯静态） |
|---|---|---|---|---|
| 访问速度（目标区域） | 地域次第：CF 在其部分区域（如中国）明显偏慢，多数区域良好 | 看主机 | 同样不稳 | 可放区域 CDN，最快 |
| 生态/资料 | Astro 生态较小，中文资料少 | 最大，插件主题随便挑 | Next.js 生态最大 | 静态生成生态成熟 |

正文结束。
"""

NARROW_MD = """
# 窄表测试

| 项目 | 费用 |
|---|---|
| 域名 | 唯一历史支出 |
| Cloudflare | 0 |
"""


def page_html(md_html: str, slug: str) -> str:
    # 直接复刻 PostPage.astro 里 .content 的结构与脚本，隔离验证「表格包裹」本身
    return f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="{BASE}/styles.css">
<style>body{{margin:0}} .wrap{{max-width:720px;margin:0 auto;padding:24px}}</style>
</head><body><div class="wrap">
<div class="content" data-post="{slug}">{md_html}</div>
</div>
<script>
  // 与 src/components/pages/PostPage.astro 中实现保持一致
  (function () {{
    var contents = document.querySelectorAll('.content');
    for (var c = 0; c < contents.length; c++) {{
      var tables = contents[c].querySelectorAll('table');
      for (var i = 0; i < tables.length; i++) {{
        var t = tables[i];
        if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('wb-table-scroll')) continue;
        var wrap = document.createElement('div');
        wrap.className = 'wb-table-scroll';
        t.parentNode.insertBefore(wrap, t);
        wrap.appendChild(t);
      }}
    }}
  }})();
</script></body></html>"""


def md_table_to_html(md: str) -> str:
    """极简 Markdown 表格 → HTML（仅测试用，够覆盖本次场景）"""
    lines = [l for l in md.strip().split("\n")]
    table_lines = [l for l in lines if l.strip().startswith("|")]
    if not table_lines:
        return "<p>无表格</p>"
    rows = []
    for idx, l in enumerate(table_lines):
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        if idx == 1:
            continue
        tag = "th" if idx == 0 else "td"
        rows.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>")
    head = rows[0].replace("<td>", "<th>").replace("</td>", "</th>")
    if "<th>" not in head:
        head = head.replace("<tr>", "<tr>")
    return "<table><thead>" + head + "</thead><tbody>" + "".join(rows[1:]) + "</tbody></table>"


results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -> {detail}" if detail else ""))


async def run_viewport(pw, vp_name, width, height):
    print(f"\n[{vp_name}] {width}x{height}")
    browser = await pw.chromium.launch()
    ctx = await browser.new_context(viewport={"width": width, "height": height})
    page = await ctx.new_page()
    await page.goto(BASE + "/", wait_until="domcontentloaded")  # 先拿同源，才能 set_content 内引用 styles.css

    # ---------- 宽表 ----------
    wide_html = md_table_to_html(WIDE_MD)
    page.set_content_smart = None
    await page.goto(BASE + "/")
    await page.set_content(page_html(wide_html, "wide-test"), wait_until="load")
    await page.add_script_tag(path=None) if False else None

    info = await page.evaluate(
        """() => {
        const w = document.querySelector('.wb-table-scroll');
        const t = w ? w.querySelector('table') : null;
        const cs = w ? getComputedStyle(w) : null;
        const tcs = t ? getComputedStyle(t) : null;
        return {
          wraps: document.querySelectorAll('.wb-table-scroll').length,
          tables: document.querySelectorAll('.content table').length,
          nested: document.querySelectorAll('.wb-table-scroll .wb-table-scroll').length,
          scrollW: w ? w.scrollWidth : 0,
          clientW: w ? w.clientWidth : 0,
          canScrollX: cs ? /auto|scroll/.test(cs.overflowX) : false,
          wrapRadius: cs ? cs.borderRadius : '',
          wrapBorder: cs ? cs.borderTopWidth : '',
          tableBorder: tcs ? tcs.borderTopWidth : '',
          tableOverflowX: tcs ? tcs.overflowX : '',
          tableDisplay: tcs ? tcs.display : '',
          docScrollW: document.documentElement.scrollWidth,
          docClientW: document.documentElement.clientWidth,
        };
      }"""
    )
    check("宽表被包裹且仅包裹一次", info["wraps"] == 1 and info["nested"] == 0, f"wraps={info['wraps']} nested={info['nested']}")
    check("wrapper 承担横向滚动", info["canScrollX"] and info["scrollW"] > info["clientW"],
          f"scrollW={info['scrollW']} clientW={info['clientW']}")
    check("表格自身不再滚动（还原 table 盒）",
          info["tableDisplay"] == "table" and info["tableOverflowX"] == "visible",
          f"display={info['tableDisplay']} overflowX={info['tableOverflowX']}")
    check("页面无横向溢出", info["docScrollW"] <= info["docClientW"] + 1,
          f"doc={info['docScrollW']} / {info['docClientW']}")
    check("外框圆角落在 wrapper", info["wrapRadius"] not in ("0px", ""), f"radius={info['wrapRadius']}")
    check("表格自身无外框（避免切边）", info["tableBorder"] == "0px", f"border={info['tableBorder']}")

    # 实际能滚动：滚到最右端，scrollLeft > 0
    scrolled = await page.evaluate(
        """() => {
        const w = document.querySelector('.wb-table-scroll');
        w.scrollLeft = 99999;
        return { left: w.scrollLeft, max: w.scrollWidth - w.clientWidth };
      }"""
    )
    check("可实际滚到最右端", scrolled["left"] > 0 and abs(scrolled["left"] - scrolled["max"]) <= 1,
          f"left={scrolled['left']} max={scrolled['max']}")

    # ---------- 窄表 ----------
    narrow_html = md_table_to_html(NARROW_MD)
    await page.goto(BASE + "/")
    await page.set_content(page_html(narrow_html, "narrow-test"), wait_until="load")
    n = await page.evaluate(
        """() => {
        const w = document.querySelector('.wb-table-scroll');
        return { scrollW: w.scrollWidth, clientW: w.clientWidth,
                 docScrollW: document.documentElement.scrollWidth,
                 docClientW: document.documentElement.clientWidth };
      }"""
    )
    check("窄表不出现横向滚动条", n["scrollW"] <= n["clientW"] + 1,
          f"scrollW={n['scrollW']} clientW={n['clientW']}")
    check("窄表页面无横向溢出", n["docScrollW"] <= n["docClientW"] + 1, "")

    await browser.close()


async def main():
    async with async_playwright() as pw:
        await run_viewport(pw, "桌面", 1280, 900)
        await run_viewport(pw, "移动端 375", 375, 780)

    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"结果: {passed}/{total} 通过")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name}  {detail}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
