import asyncio, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:4400"

WIDE = """<div class="content" data-post="t"><table><thead><tr><th>维度</th><th>本方案</th><th>WordPress</th><th>Next.js + Vercel</th><th>Hexo / Hugo</th></tr></thead><tbody>
<tr><td>访问速度（目标区域）</td><td>地域次第：CF 在其部分区域明显偏慢，多数区域良好</td><td>看主机</td><td>同样不稳</td><td>可放区域 CDN，最快</td></tr>
<tr><td>生态/资料</td><td>Astro 生态较小，中文资料少</td><td>最大</td><td>Next.js 生态最大</td><td>静态生成生态成熟</td></tr>
</tbody></table></div>"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=2)
        p = await ctx.new_page()
        await p.goto(BASE + "/")
        await p.set_content(f"<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'><link rel='stylesheet' href='{BASE}/styles.css'><style>body{{margin:0;padding:20px}}</style></head><body>{WIDE}"
                            "<script>(function(){var cs=document.querySelectorAll('.content');for(var c=0;c<cs.length;c++){var ts=cs[c].querySelectorAll('table');for(var i=0;i<ts.length;i++){var t=ts[i];if(t.parentNode&&t.parentNode.classList&&t.parentNode.classList.contains('wb-table-scroll'))continue;var w=document.createElement('div');w.className='wb-table-scroll';t.parentNode.insertBefore(w,t);w.appendChild(t);}}})();</script></body></html>")
        await p.wait_for_timeout(400)
        await p.screenshot(path="/workspace/正文表格-滚动容器-01初始位置.png")
        await p.evaluate("()=>{const w=document.querySelector('.wb-table-scroll');w.scrollLeft=w.scrollWidth;}")
        await p.wait_for_timeout(300)
        await p.screenshot(path="/workspace/正文表格-滚动容器-02滚到最右.png")
        info = await p.evaluate("()=>{const w=document.querySelector('.wb-table-scroll');return {sw:w.scrollWidth,cw:w.clientWidth,left:w.scrollLeft}}")
        print(info)
        await b.close()

asyncio.run(main())
