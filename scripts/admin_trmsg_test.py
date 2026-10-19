"""
后台「一键翻译」提示行与当前编辑版本一致性 —— 端到端验证

复现的问题：点「一键翻译」行右侧的 EN 按钮切换版本后，
tr-msg 绿色提示仍停留在上一个版本的语言与 URL，不随切换更新。

验证点：
  A. 从中文版点 EN → 提示文案与 URL 指向英文版（不再是中文）
  B. 再点回 中文 → 提示回到中文版
  C. 点 lang-state 的「EN ✓」按钮（另一处换版入口）→ 提示同步
  D. 未知语言版本（无该语言行）→ 提示为「新建态」口径，不残留旧 URL
  E. 回归：翻译按钮填入译文后提示为「✓ 译文已填入」，不被误覆盖

运行：python3 scripts/admin_trmsg_test.py（dev server 在 4401）
说明：注入伪造 session + 拦截 Supabase REST，模拟一个「中/英两版都已发布」的文章。
"""
import asyncio
import json
import sys
from playwright.async_api import async_playwright

BASE = "http://localhost:4401"
import os
_env = {}
for line in open(os.path.join(os.path.dirname(__file__), "..", ".env"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    _env[k.strip()] = v.strip().strip('"').strip("'")
_url = _env.get("PUBLIC_SUPABASE_URL", "")
PROJECT = (_url.split("//")[-1].split(".")[0] if "//" in _url else "") or "local"
KEY = PROJECT
SLUG = "demo-article"
SID = "11111111-1111-1111-1111-111111111111"

ROWS = [
    {"id": "r-zh", "title": "中文原标题", "slug": SLUG, "lang": "zh", "content": "中文正文",
     "published": True, "published_at": "2026-10-01T00:00:00+00:00", "category": "随笔",
     "category_slug": "essays", "excerpt": "中文摘要", "cover": "", "author": "老一贯"},
    {"id": "r-en", "title": "English Title", "slug": SLUG + "-en", "lang": "en", "content": "English body",
     "published": True, "published_at": "2026-10-02T00:00:00+00:00", "category": "Essays",
     "category_slug": "essays", "excerpt": "EN excerpt", "cover": "", "author": "老一贯"},
]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -> {detail}" if detail else ""))


SCENARIO = {"rows": ROWS}


async def mock_routes(page):
    async def handle(route):
        url = route.request.url
        method = route.request.method
        if "/auth/v1/" in url:
            if "user" in url:
                return await route.fulfill(status=200, content_type="application/json",
                                           body=json.dumps({"id": "u1", "email": "a@b.c"}))
            return await route.fulfill(status=200, content_type="application/json",
                                       body=json.dumps({"access_token": "tok", "token_type": "bearer",
                                                        "expires_in": 3600, "refresh_token": "r",
                                                        "user": {"id": "u1", "email": "a@b.c"}}))
        if "/rest/v1/" in url:
            if "/posts" in url:
                return await route.fulfill(status=200, content_type="application/json",
                                           body=json.dumps(SCENARIO["rows"]))
            if "/comments" in url:
                return await route.fulfill(status=200, content_type="application/json", body="[]")
            if "/categories" in url:
                return await route.fulfill(status=200, content_type="application/json",
                                           body=json.dumps([{"slug": "essays", "name": "随笔",
                                                             "name_en": "Essays"}]))
            if "/site_settings" in url:
                return await route.fulfill(status=200, content_type="application/json", body="[]")
            if "/media" in url:
                return await route.fulfill(status=200, content_type="application/json", body="[]")
            return await route.fulfill(status=200, content_type="application/json", body="[]")
        if "/storage/v1/" in url:
            return await route.fulfill(status=200, content_type="application/json", body="{}")
        return await route.continue_()
    await page.route("**/auth/v1/**", handle)
    await page.route("**/rest/v1/**", handle)
    await page.route("**/storage/v1/**", handle)


async def tr_msg(page):
    return await page.eval_on_selector("#tr-msg", "e => ({ text: e.textContent.trim(), kind: e.dataset.kind || '' })")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # 伪造 Supabase 会话：storageState 让浏览器启动前就带上 localStorage，
        # 比 add_init_script / 路由注入更稳（后台首次 getSession 就能读到）。
        import datetime as _dt
        expires = int((_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=6)).timestamp())
        stored = {
            "access_token": "tok", "token_type": "bearer", "expires_in": 3600,
            "expires_at": expires, "refresh_token": "r",
            "user": {"id": "u1", "email": "a@b.c", "aud": "authenticated", "role": "authenticated",
                     "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"},
        }
        state = {"cookies": [], "origins": [{
            "origin": BASE,
            "localStorage": [{"name": f"sb-{PROJECT}-auth-token", "value": json.dumps(stored)}],
        }]}
        ctx = await browser.new_context(viewport={"width": 1440, "height": 950}, storage_state=state)
        page = await ctx.new_page()
        await mock_routes(page)

        logs = []
        page.on("console", lambda m: logs.append(m.type + ":" + m.text[:160]))
        page.on("pageerror", lambda e: logs.append("pageerror:" + str(e)[:160]))

        await page.goto(BASE + "/admin", wait_until="domcontentloaded")
        await page.wait_for_selector("#post-list li", timeout=15000)
        await page.wait_for_timeout(400)

        n_li = await page.eval_on_selector("#post-list", "e=>e.querySelectorAll('li').length")
        check("0 登录成功 + 文章列表已渲染（整组行数=1）", n_li == 1, f"li={n_li}")

        async def tm():
            return await page.eval_on_selector(
                "#tr-msg", "e => ({ text: e.textContent.trim(), kind: e.dataset.kind || '' })")

        async def open_by_lang_tag(code):
            """点列表行内的语言标签，把该语言的版本载入编辑器（setForm 路径）"""
            await page.click(f'#post-list .wb-item-lang[data-id="r-{code}"]')
            await page.wait_for_timeout(400)

        async def click_lang(code):
            """点「一键翻译」行右侧的 EN 按钮（switchLangVersion 路径）"""
            await page.click(f'#f-lang button[data-v="{code}"]')
            await page.wait_for_timeout(400)

        # 进入编辑：点语言标签「中文」载入中文版（已发布）
        await open_by_lang_tag("zh")
        check("1 编辑器已打开", await page.eval_on_selector("#f-lang", "e=>e.offsetParent!==null"), "")

        # ---------- A：中文 → EN（用户报告的正是这一步） ----------
        zh_msg = await tm()
        check("A0 中文版：提示为中文版 URL", f"/posts/{SLUG}/" in zh_msg["text"], zh_msg["text"])
        await click_lang("en")
        en_msg = await tm()
        check("A1 点 EN 后提示改为 EN版", "EN版" in en_msg["text"], en_msg["text"])
        check("A2 点 EN 后 URL 指向 -en", f"/en/posts/{SLUG}-en/" in en_msg["text"], en_msg["text"])
        check("A3 点 EN 后无中文版残留", f"/posts/{SLUG}/" not in en_msg["text"], en_msg["text"])

        # ---------- B：EN → 中文 ----------
        await click_lang("zh")
        b_msg = await tm()
        check("B1 切回中文后提示恢复中文版",
              f"/posts/{SLUG}/" in b_msg["text"] and "EN版" not in b_msg["text"], b_msg["text"])

        # ---------- C：另一处换版入口 lang-state 的「EN ✓」 ----------
        btn = await page.query_selector('#lang-state button[data-lang="en"]')
        if btn:
            await btn.click()
            await page.wait_for_timeout(400)
            c_msg = await tm()
            check("C1 lang-state「EN ✓」切换后提示同步", "EN版" in c_msg["text"], c_msg["text"])
        else:
            check("C0 存在 lang-state EN 按钮", False, "未找到按钮")

        # ---------- E：翻译填入后的有效提示不被无谓覆盖 ----------
        await click_lang("zh")
        await page.evaluate("""() => { const el = document.getElementById('tr-msg');
            el.textContent = '✓ 译文已填入。请通读检查后点击「发布」'; el.dataset.kind = 'ok'; }""")
        f_before = (await tm())["text"]
        # 同版本内做一次无关操作（改标题），提示应保留
        await page.fill("#f-title", "中文原标题（改）")
        await page.wait_for_timeout(300)
        f_same = (await tm())["text"]
        check("E1 同版本内编辑不冲掉「译文已填入」提示", f_same == f_before, f"{f_before!r} -> {f_same!r}")
        # 换版本 → 提示已过期，应被刷新为新版本口径
        await click_lang("en")
        f_after = (await tm())["text"]
        check("E2 换版本后过期提示被刷新为 EN版",
              f_after != f_before and "EN版" in f_after, f"{f_before!r} -> {f_after!r}")

        # ---------- D：目标语言没有对应行 → 提示应为「新建该语言版」口径，不残留旧 URL ----------
        # 仅保留中文版，EN 没有已发布版本
        SCENARIO["rows"] = [
            dict(ROWS[0]),
        ]
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_selector("#post-list li", timeout=15000)
        await page.wait_for_timeout(400)
        await page.click("#post-list .wb-item-lang[data-id='r-zh']")
        await page.wait_for_timeout(400)
        d0 = await tm()
        check("D0 仅中文行时提示为中文版 URL", f"/posts/{SLUG}/" in d0["text"], d0["text"])
        await click_lang("en")   # 英文版整行不存在 → 新建态
        d1 = await tm()
        # switchLangVersion 对「无该语言行」走的是「转入新建态」专文案（比 renderTrMsg 的兜底更具体），
        # 关键是：必须提到英文、且不得残留中文版 URL
        check("D1 切到不存在的英文版 → 提示为新建态且无旧 URL",
              "英文" in d1["text"] and "新建态" in d1["text"] and "/posts/" not in d1["text"], d1["text"])

        if logs:
            errs = [l for l in logs if l.startswith("pageerror")]
            check("G1 无未捕获前端异常", not errs, str(errs[:3]))

        await browser.close()

    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"结果: {passed}/{len(results)} 通过")
    for n, ok, d in results:
        if not ok:
            print(f"  ✗ {n}  {d}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
