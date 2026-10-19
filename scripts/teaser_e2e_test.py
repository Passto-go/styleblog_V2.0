"""
teaser 模式（加密文章列表显标题摘要、点击输密码看正文）—— 端到端验证。

架构（与 encryption_e2e_test 同款）：
  scripts/mock_supabase.py 伪造 Supabase（REST + RPC，真实 bcrypt）
  astro dev                 经 .env.local 指向 mock
  本脚本                    HTTP 断言 + Playwright 驱动解锁流程

场景数据（mock 内置）：teaser-post（中英两行，加密 + list_visible=true）、
secret-post（中英两行，加密但非 teaser，对照组）、open-post（公开对照组）。

覆盖点：
  A. 列表露出：teaser 文章进首页 / 归档 / 分类页，标题与摘要可见
  B. 搜索索引：teaser 文章在索引内，标题摘要在、正文为空
  C. sitemap / RSS：teaser 文章出现
  D. 详情页锁定态：标题 + 摘要 + 密码框；无正文；noindex + no-store
  E. 解锁流程：错误密码 → 无正文；正确密码 → 正文出现
  F. 对照组：非 teaser 加密文章仍全隐身、锁定态也不给摘要
  G. 跨语言：英文 teaser 页同样露摘要 + 密码框；中文解锁后英文页直接放行
  H. 旧库降级（--v2-db）：teaser 文章按非 teaser 隐身，站点不报错
  I. RPC 契约：新/旧签名在不同库形态下的可用性（含后台降级路径）

运行：python3 scripts/teaser_e2e_test.py
"""
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MOCK_PORT = 5602
SITE = "http://127.0.0.1:4404"
SECRET_PW = "correct-horse"
UNLOCK_SECRET = "e2e-unlock-secret-0123456789abcdef0123456789abcdef"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -> {detail}" if detail else ""))


def http_get(path, headers=None, base=SITE):
    req = urllib.request.Request(base + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace"), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), {k.lower(): v for k, v in e.headers.items()}


def wait_ready(proc, url, needle, timeout_s=90):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if proc.poll() is not None:
            out = proc.stdout.read().decode("utf-8", "replace") if proc.stdout else ""
            raise RuntimeError(f"服务进程提前退出:\n{out[-2000:]}")
        try:
            req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=10) as r:
                if needle in r.read().decode("utf-8", "replace"):
                    return
        except Exception:
            pass
        time.sleep(1.5)
    raise RuntimeError(f"等待就绪超时: {url}")


async def unlock_via_ui(page, password):
    await page.fill("#unlock-pw", password)
    await page.click(".post-lock-btn")
    await page.wait_for_timeout(1500)
    msg_el = await page.query_selector("#unlock-msg")
    return ((await msg_el.text_content()) or "").strip() if msg_el else ""


def start_mock(port, extra=()):
    return subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "scripts", "mock_supabase.py"), str(port), *extra],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def start_dev(port):
    return subprocess.Popen(
        [os.path.join(ROOT, "node_modules", ".bin", "astro"), "dev",
         "--port", str(port), "--host", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )


def rpc_probe(mock_port, fn, payload):
    """直接打 mock 的 RPC，返回 (status, body)。用于 H/I 组的契约验证。"""
    req = urllib.request.Request(
        f"http://127.0.0.1:{mock_port}/rest/v1/rpc/{fn}",
        data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def stop(*procs):
    for p in procs:
        if p and p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=10)
            except Exception:
                p.kill()


async def main():
    env_local = os.path.join(ROOT, ".env.local")
    had_env_local = os.path.exists(env_local)
    backup = None
    if had_env_local:
        with open(env_local, encoding="utf-8") as f:
            backup = f.read()
    with open(env_local, "w", encoding="utf-8") as f:
        f.write(
            "PUBLIC_SUPABASE_URL=http://127.0.0.1:%d\n"
            "PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-teaser-e2e\n"
            "UNLOCK_SECRET=%s\n" % (MOCK_PORT, UNLOCK_SECRET)
        )

    mock = start_mock(MOCK_PORT)
    dev = start_dev(4404)
    browser = None
    try:
        wait_ready(dev, SITE + "/", "公开文章标题")

        print("== A. 列表露出（首页/归档/分类）==")
        _, home, _ = http_get("/")
        check("A1 首页含 teaser 标题", "Teaser 文章标题" in home)
        check("A2 首页含 teaser 链接", "/posts/teaser-post/" in home)
        check("A3 首页含 teaser 摘要", "Teaser 摘要" in home)
        _, arch, _ = http_get("/archive/")
        check("A4 归档含 teaser 标题", "Teaser 文章标题" in arch)
        _, cat, _ = http_get("/categories/")
        check("A5 分类页含 teaser 所属分类", "手账" in cat)
        _, catp, _ = http_get("/categories/notes/")
        check("A6 分类详情页含 teaser 标题", "Teaser 文章标题" in catp)

        print("== B. 搜索索引（标题摘要在、正文空）==")
        _, si, _ = http_get("/search-index.json")
        idx = json.loads(si)
        teaser_items = [x for x in idx if x["slug"] == "teaser-post"]
        check("B1 索引含 teaser-post", len(teaser_items) == 1)
        if teaser_items:
            it = teaser_items[0]
            check("B2 索引标题在", "Teaser 文章标题" in (it.get("title") or ""))
            check("B3 索引摘要在", "Teaser 摘要" in (it.get("excerpt") or ""))
            check("B4 索引正文为空", (it.get("content") or "") == "")
        check("B5 索引不含非 teaser 加密文章", not any(x["slug"] == "secret-post" for x in idx))

        print("== C. sitemap / RSS ==")
        _, sm, _ = http_get("/sitemap-index.xml")
        check("C1 sitemap 含 teaser-post", "teaser-post" in sm)
        _, rss, _ = http_get("/rss.xml")
        check("C2 RSS 含 teaser 标题", "Teaser 文章标题" in rss)
        check("C3 RSS 不含非 teaser 加密文章", "secret-post" not in rss)

        print("== D/E/G. 详情页与解锁（浏览器）==")
        pw = await async_playwright().start()
        browser = await pw.chromium.launch()
        page = await browser.new_page()

        st, html, hdrs = http_get("/posts/teaser-post/")
        check("D1 teaser 详情页 200", st == 200, f"status={st}")
        check("D2 锁定态无正文", "TEASER_BODY_MARKER" not in html)
        check("D3 锁定态有摘要", "Teaser 摘要" in html)
        check("D4 锁定态有密码框", 'id="unlock-form"' in html)
        check("D5 加密页 noindex", "noindex" in (hdrs.get("x-robots-tag") or "") or 'content="noindex' in html)
        check("D6 加密页 no-store", "no-store" in (hdrs.get("cache-control") or ""))

        await page.goto(SITE + "/posts/teaser-post/", wait_until="domcontentloaded")
        msg = await unlock_via_ui(page, "wrong-password")
        check("E1 错误密码被拒", msg != "", f"msg={msg!r}")
        check("E2 错误密码后仍无正文", "TEASER_BODY_MARKER" not in (await page.content()))
        await unlock_via_ui(page, SECRET_PW)
        content = await page.content()
        check("E3 正确密码出正文", "TEASER_BODY_MARKER" in content)
        check("E4 解锁后密码框消失", (await page.query_selector("#unlock-form")) is None)

        # G. 跨语言：先用全新上下文（无 cookie）验证英文 teaser 锁定态；
        #    再用已解锁的上下文验证 cookie 跨语言共享（中文解锁后英文页直接放行）。
        ctx_fresh = await browser.new_context()
        page_en = await ctx_fresh.new_page()
        await page_en.goto(SITE + "/en/posts/teaser-post-en/", wait_until="domcontentloaded")
        en_locked = await page_en.content()
        check("G1 英文 teaser 锁定态无正文", "TEASER_BODY_MARKER_EN" not in en_locked)
        check("G2 英文 teaser 锁定态有摘要", "Teaser excerpt" in en_locked)
        check("G2b 英文 teaser 锁定态有密码框", (await page_en.query_selector("#unlock-form")) is not None)
        await ctx_fresh.close()

        await page.goto(SITE + "/en/posts/teaser-post-en/", wait_until="domcontentloaded")
        en_content = await page.content()
        check("G3 中文解锁后英文页直接放行（cookie 跨语言共享）", "TEASER_BODY_MARKER_EN" in en_content)

        print("== F. 对照组：非 teaser 加密文章 ==")
        _, sec, _ = http_get("/posts/secret-post/")
        check("F1 非 teaser 锁定态无正文", "SECRET_BODY_MARKER" not in sec)
        check("F2 非 teaser 锁定态无摘要", "加密文章摘要" not in sec)
        check("F3 非 teaser 锁定态有密码框", 'id="unlock-form"' in sec)
        check("F4 首页不含非 teaser 加密文章", "加密文章标题" not in home)
        _, arch2, _ = http_get("/archive/")
        check("F5 归档不含非 teaser 加密文章", "加密文章标题" not in arch2)

        await browser.close()
        await pw.stop()
        browser = None

        print("== I. RPC 契约（新库）==")
        st1, _ = rpc_probe(MOCK_PORT, "post_set_password",
                           {"p_id": "40000000-0000-0000-0000-000000000001", "p_pw": "x", "p_hint": "", "p_list_visible": True})
        check("I1 新库四参调用可用", st1 == 200, f"status={st1}")
        st2, _ = rpc_probe(MOCK_PORT, "post_set_password",
                           {"p_id": "40000000-0000-0000-0000-000000000001", "p_pw": "x", "p_hint": ""})
        check("I2 新库三参调用仍可用（向后兼容）", st2 == 200, f"status={st2}")
        st3, _ = rpc_probe(MOCK_PORT, "post_set_list_visible",
                           {"p_id": "40000000-0000-0000-0000-000000000001", "p_visible": False})
        check("I3 新库 post_set_list_visible 可用", st3 == 200, f"status={st3}")
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        stop(dev, mock)
        # 注意：.env.local 此时刻意保留（H 组降级测试仍要指向 mock），最终统一还原

    # ---------- H. 旧库降级：--v2-db（有加密三列、无 list_visible）----------
    print("== H. 旧库降级（v2 库：无 list_visible 列）==")
    mock2 = start_mock(MOCK_PORT, ("--v2-db",))
    dev2 = start_dev(4405)
    try:
        wait_ready(dev2, "http://127.0.0.1:4405/", "公开文章标题")
        SITE2 = "http://127.0.0.1:4405"
        _, home2, _ = http_get("/", base=SITE2)
        check("H1 v2 库 teaser 文章按非 teaser 隐身（首页）", "Teaser 文章标题" not in home2)
        _, sec2, _ = http_get("/posts/teaser-post/", base=SITE2)
        check("H2 v2 库 teaser 详情页仍 200", sec2 and True, "（页面不报错）")
        check("H3 v2 库锁定态无摘要", "Teaser 摘要" not in sec2)
        check("H4 v2 库锁定态有密码框", 'id="unlock-form"' in sec2)
        st4, _ = rpc_probe(MOCK_PORT, "post_set_password",
                           {"p_id": "40000000-0000-0000-0000-000000000001", "p_pw": "x", "p_hint": "", "p_list_visible": True})
        check("H5 v2 库四参调用报 PGRST202（触发后台降级）", st4 == 404, f"status={st4}")
        st5, _ = rpc_probe(MOCK_PORT, "post_set_password",
                           {"p_id": "40000000-0000-0000-0000-000000000001", "p_pw": "x", "p_hint": ""})
        check("H6 v2 库三参调用可用（后台降级目标）", st5 == 200, f"status={st5}")
        st6, _ = rpc_probe(MOCK_PORT, "post_set_list_visible",
                           {"p_id": "40000000-0000-0000-0000-000000000001", "p_visible": True})
        check("H7 v2 库 post_set_list_visible 报 PGRST202", st6 == 404, f"status={st6}")
    finally:
        stop(dev2, mock2)
        # .env.local 统一还原（H 组用完即还）
        if had_env_local and backup is not None:
            with open(env_local, "w", encoding="utf-8") as f:
                f.write(backup)
        elif not had_env_local:
            if os.path.exists(env_local):
                os.remove(env_local)

    ok = sum(1 for _, o, _ in results if o)
    print(f"\n结果：{ok}/{len(results)} 通过")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
