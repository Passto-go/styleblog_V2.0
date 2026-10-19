"""
文章加密功能 —— 端到端验证（本地 Mock Supabase，零生产影响）

架构：
  scripts/mock_supabase.py 伪造 Supabase（REST + post_check_password RPC，真实 bcrypt）
  astro dev                 经 .env.local 指向 mock（UNLOCK_SECRET 用测试值）
  本脚本                    Playwright 驱动完整读者侧链路

覆盖点：
  A. 未解锁：文章页只呈现密码框；正文/摘要标记不在 HTML；无 pass_hash；
     meta robots=noindex；Cache-Control: private, no-store
  B. 组级锁定：只加密中文行时，英文页同样锁定（防单行放行泄漏）
  C. 列表隐身：首页 / 归档 / 搜索索引 / sitemap / RSS 均不含加密文章
  D. 对照组：普通文章页正常渲染（正文在、无密码框、无 noindex）
  E. 解锁流程：错误密码 → 提示错误且无正文；正确密码 → cookie 落盘 → 刷新出正文
  F. 防伪造：篡改 cookie 签名 / 串用其它文章的 cookie → 仍锁定
  G. 跨语言共享：中文页解锁后英文页同 cookie 直接放行
  H. API 直测：/api/unlock 错误密码 401、正确 200 且 Set-Cookie HttpOnly
  I. 限流：连续错误密码触发 429（放最后，配额 60s 恢复）

运行：python3 scripts/encryption_e2e_test.py
"""
import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

ROOT = os.path.join(os.path.dirname(__file__), "..")
MOCK_PORT = 5599
SITE = "http://127.0.0.1:4402"
SECRET_PW = "correct-horse"
UNLOCK_SECRET = "e2e-unlock-secret-0123456789abcdef0123456789abcdef"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -> {detail}" if detail else ""))


def http_get(path, headers=None):
    req = urllib.request.Request(SITE + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "replace")
            # 响应头名大小写不敏感（dev server 下发的是小写 cache-control）
            h = {k.lower(): v for k, v in r.headers.items()}
            return r.status, raw, h
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        h = {k.lower(): v for k, v in e.headers.items()}
        return e.code, raw, h


def wait_ready(proc, url, needle, timeout_s=90):
    """轮询等待服务就绪（页面出现 mock 数据特征串）。"""
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if proc.poll() is not None:
            out = proc.stdout.read().decode("utf-8", "replace") if proc.stdout else ""
            raise RuntimeError(f"服务进程提前退出:\n{out[-2000:]}")
        try:
            req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=10) as r:
                body = r.read().decode("utf-8", "replace")
            if needle in body:
                return
        except Exception:
            pass
        time.sleep(1.5)
    raise RuntimeError(f"等待就绪超时: {url}")


async def unlock_via_ui(page, password):
    """在密码框提交密码。返回错误提示文本（解锁成功时表单已随刷新消失，返回空串）。"""
    await page.fill("#unlock-pw", password)
    await page.click(".post-lock-btn")
    await page.wait_for_timeout(1500)
    msg_el = await page.query_selector("#unlock-msg")
    return ((await msg_el.text_content()) or "").strip() if msg_el else ""


async def main():
    # ---------- 0. 启动 mock + dev server ----------
    env_local = os.path.join(ROOT, ".env.local")
    had_env_local = os.path.exists(env_local)
    backup = None
    if had_env_local:
        with open(env_local, encoding="utf-8") as f:
            backup = f.read()
    with open(env_local, "w", encoding="utf-8") as f:
        f.write(
            "PUBLIC_SUPABASE_URL=http://127.0.0.1:%d\n"
            "PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-e2e\n"
            "UNLOCK_SECRET=%s\n" % (MOCK_PORT, UNLOCK_SECRET)
        )

    mock = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "scripts", "mock_supabase.py"), str(MOCK_PORT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    dev = subprocess.Popen(
        [os.path.join(ROOT, "node_modules", ".bin", "astro"), "dev",
         "--port", "4402", "--host", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    try:
        wait_ready(dev, SITE + "/", "公开文章标题")
        print("mock + dev server 就绪\n")

        # ---------- A/B. 未解锁态 ----------
        print("[A] 未解锁：密码框、无正文、noindex、no-store")
        st, html, headers = http_get("/posts/secret-post/")
        check("A 加密文章页 200", st == 200, f"status={st}")
        check("A 呈现密码框", 'id="unlock-form"' in html)
        check("A 中文正文标记不在 HTML", "SECRET_BODY_MARKER" not in html)
        check("A 摘要标记不在 HTML", "SECRET_EXCERPT_MARKER" not in html)
        check("A pass_hash 不在 HTML", "pass_hash" not in html and "$2a$" not in html and "$2b$" not in html)
        check("A robots=noindex", 'name="robots"' in html and "noindex" in html)
        check("A Cache-Control private no-store",
              "no-store" in (headers.get("cache-control") or "") and "private" in (headers.get("cache-control") or ""),
              headers.get("cache-control"))

        print("\n[B] 组级锁定：只加密中文行，英文页同样上锁")
        st, html_en, _ = http_get("/en/posts/secret-post/")
        check("B 英文加密页 200", st == 200, f"status={st}")
        check("B 英文页呈现密码框", 'id="unlock-form"' in html_en)
        check("B 英文正文标记不在 HTML", "SECRET_BODY_MARKER_EN" not in html_en)

        # ---------- C. 列表隐身 ----------
        print("\n[C] 列表隐身：首页/归档/搜索/sitemap/RSS")
        _, home, _ = http_get("/")
        check("C 首页不含加密文章标题", "加密文章标题" not in home)
        check("C 首页不含加密文章链接", "/posts/secret-post/" not in home)
        _, arch, _ = http_get("/archive/")
        check("C 归档不含加密文章", "加密文章标题" not in arch)
        _, si, _ = http_get("/search-index.json")
        check("C 搜索索引不含 secret-post", "secret-post" not in si)
        _, sm, _ = http_get("/sitemap-index.xml")
        # 本站 sitemap-index.xml 直接内联全部 URL（@astrojs/sitemap 的索引形态），
        # 若为子页索引形态则再抓一层子页，两种形态都断言加密文章缺席。
        sm_all = sm
        for child in __import__("re").findall(r"<loc>([^<]*sitemap-\d+\.xml)</loc>", sm):
            _, child_body, _ = http_get(child.replace("https://hxlss.cn", ""))
            sm_all += child_body
        check("C sitemap 不含 secret-post", "secret-post" not in sm_all)
        check("C sitemap 含公开文章（对照组）", "open-post" in sm_all)
        _, rss, _ = http_get("/rss.xml")
        check("C RSS 不含加密文章", "加密文章标题" not in rss and "secret-post" not in rss)
        # 分类枚举也不该出现只有加密文章的分类
        _, cats, _ = http_get("/categories/")
        check("C 分类列表不含私密分类", "私密" not in cats)

        # ---------- D. 对照组 ----------
        print("\n[D] 对照：普通文章正常渲染")
        st, html_open, headers_open = http_get("/posts/open-post/")
        check("D 公开文章页 200", st == 200, f"status={st}")
        check("D 正文在场", "OPEN_BODY_MARKER" in html_open)
        check("D 无密码框", 'id="unlock-form"' not in html_open)
        check("D 无 noindex", 'name="robots"' not in html_open or "noindex" not in html_open)
        check("D 无 no-store", "no-store" not in (headers_open.get("cache-control") or ""))

        # ---------- E~H. 浏览器侧解锁链路 ----------
        print("\n[E] 解锁流程（错误 → 正确 → 刷新出正文）")
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            page = await ctx.new_page()

            await page.goto(SITE + "/posts/secret-post/", wait_until="domcontentloaded")
            msg = await unlock_via_ui(page, "wrong-password")
            check("E 错误密码有提示", bool(msg), msg)
            check("E 错误密码后仍无正文", "SECRET_BODY_MARKER" not in await page.content())
            cookies_after_wrong = await ctx.cookies()
            check("E 错误密码不落 cookie", not any(c["name"] == "unlocked" for c in cookies_after_wrong))

            # E 续：UI 正确密码（必须在 H 的 API 直测之前——否则 API 提前种下
            # cookie，页面刷新后直接放行，UI 链路就没被真正验证到）
            msg2 = await unlock_via_ui(page, SECRET_PW)
            check("E 正确密码无错误提示", not msg2 or "错误" not in msg2, msg2)
            await page.wait_for_load_state("domcontentloaded")
            await page.wait_for_timeout(800)
            content = await page.content()
            check("E 解锁后正文在场", "SECRET_BODY_MARKER" in content)
            check("E 解锁后密码框消失", 'id="unlock-form"' not in content)
            unlocked_cookie = next((c for c in await ctx.cookies() if c["name"] == "unlocked"), None)
            check("E unlocked cookie 已落盘", unlocked_cookie is not None)
            check("E cookie 值为 base.签名 形态",
                  bool(unlocked_cookie and unlocked_cookie["value"].startswith("secret-post.")),
                  unlocked_cookie["value"][:40] if unlocked_cookie else "")

            # ---------- H. /api/unlock 直测 ----------
            print("\n[H] /api/unlock 直测")
            resp_wrong = await page.request.post(SITE + "/api/unlock",
                                                 data=json.dumps({"slug": "secret-post", "password": "nope"}))
            check("H API 错误密码 401", resp_wrong.status == 401, f"status={resp_wrong.status}")
            resp_right = await page.request.post(SITE + "/api/unlock",
                                                 data=json.dumps({"slug": "secret-post", "password": SECRET_PW}))
            check("H API 正确密码 200", resp_right.status == 200, f"status={resp_right.status}")
            set_cookie = resp_right.headers.get("set-cookie") or ""
            check("H Set-Cookie 含 HttpOnly", "httponly" in set_cookie.lower(), set_cookie[:80])

            # ---------- F. 防伪造 ----------
            print("\n[F] 防伪造：篡改签名 / 串用其它文章 cookie")
            if unlocked_cookie:
                await ctx.clear_cookies()
                forged = dict(unlocked_cookie)
                sig = forged["value"].split(".")[-1]
                flipped = ("0" if sig[0] != "0" else "1") + sig[1:]
                forged["value"] = "secret-post." + flipped
                await ctx.add_cookies([forged])
                await page.goto(SITE + "/posts/secret-post/", wait_until="domcontentloaded")
                c = await page.content()
                check("F 篡改签名仍锁定", 'id="unlock-form"' in c and "SECRET_BODY_MARKER" not in c)

                # 串用 open-post 的合法 cookie（用 dev 同密钥现算一个）
                await ctx.clear_cookies()
                await page.request.post(SITE + "/api/unlock",
                                        data=json.dumps({"slug": "open-post", "password": SECRET_PW}))
                await page.goto(SITE + "/posts/secret-post/", wait_until="domcontentloaded")
                c = await page.content()
                check("F 串用其它文章 cookie 仍锁定", 'id="unlock-form"' in c and "SECRET_BODY_MARKER" not in c)

            # ---------- G. 跨语言共享 ----------
            print("\n[G] 跨语言共享：中文解锁后英文页同 cookie 放行")
            await ctx.clear_cookies()
            await page.request.post(SITE + "/api/unlock",
                                    data=json.dumps({"slug": "secret-post", "password": SECRET_PW}))
            await page.goto(SITE + "/en/posts/secret-post/", wait_until="domcontentloaded")
            c = await page.content()
            check("G 英文页解锁出正文", "SECRET_BODY_MARKER_EN" in c and 'id="unlock-form"' not in c)

            # ---------- I. 限流（最后跑，配额 60s 恢复） ----------
            print("\n[I] 限流：连续错误密码触发 429")
            got_429 = False
            calls = 0
            for _ in range(11):
                r = await page.request.post(SITE + "/api/unlock",
                                            data=json.dumps({"slug": "secret-post", "password": "brute"}))
                calls += 1
                if r.status == 429:
                    got_429 = True
                    body = await r.text()
                    check("I 429 文案为限流提示", "频繁" in body, body[:60])
                    break
            check("I 连续错误密码被限流", got_429, f"第 {calls} 次触发" if got_429 else "11 次内未触发")
            check("I 限流阈值合理（≤11 次）", got_429 and calls <= 11, f"第 {calls} 次触发")

            await browser.close()
    finally:
        for p in (dev, mock):
            try:
                p.send_signal(signal.SIGTERM)
            except Exception:
                pass
        for p in (dev, mock):
            try:
                p.wait(timeout=8)
            except Exception:
                p.kill()
        # 还原 .env.local
        if had_env_local and backup is not None:
            with open(env_local, "w", encoding="utf-8") as f:
                f.write(backup)
        elif not had_env_local:
            try:
                os.remove(env_local)
            except FileNotFoundError:
                pass

    print("\n" + "=" * 62)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"结果: {passed}/{total} 通过")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name}  {detail}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
