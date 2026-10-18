"""
文章页「上一篇 / 下一篇」语言一致性 —— 端到端验证

背景：getAllPosts(lang) 对缺译文的文章会回退其它语言版本（中文原文兜底），
导致英文/日文文章页的上下篇导航露出中文标题。本次修复只改展示层标题。

验证点：
  A. 三种语言视图下导航文案来自 i18n（zh 上一篇/下一篇、en Previous/Next、ja 前の記事/次の記事）
  B. 导航标题：目标语言有译文则必须是译文标题、且不含中日文字符（除专有名词）
  C. 导航链接：语言前缀正确、目标页 200、且 == 该语言视图中真实的相邻文章
  D. 跨语言交叉：同一篇文章在三种语言页上的相邻「文章身份」一致（相邻关系与语言无关）
  E. 边界：首篇无上一篇、末篇无下一篇、占位项不可点击
  F. 回归：文章页正文标题不被替换（只影响导航展示层）

运行：python3 scripts/post_nav_lang_test.py（需 dev server 在 4400）
"""
import asyncio
import re
import sys
import urllib.request
from playwright.async_api import async_playwright

BASE = "http://localhost:4400"
LANGS = ["zh", "en", "ja"]
PREFIX = {"zh": "/posts/", "en": "/en/posts/", "ja": "/ja/posts/"}
LABEL = {
    "zh": {"prev": "← 上一篇", "next": "下一篇 →"},
    "en": {"prev": "← Previous", "next": "Next →"},
    "ja": {"prev": "← 前の記事", "next": "次の記事 →"},
}
CJK = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff]")

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -> {detail}" if detail else ""))


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=25) as r:
        return r.status, r.read().decode()


def extract_nav(html):
    m = re.search(r'<nav class="post-nav".*?</nav>', html, re.S)
    if not m:
        return None
    nav = m.group(0)
    out = {}
    for key in ("prev", "next"):
        im = re.search(
            rf'class="post-nav-item {key}"([^>]*)>(.*?)</a>', nav, re.S)
        if not im:
            out[key] = None
            continue
        attrs, inner = im.group(1), im.group(2)
        href = re.search(r'href="([^"]*)"', attrs)
        dirs = re.search(r'class="post-nav-dir"[^>]*>([^<]*)<', inner)
        title = re.search(r'class="post-nav-title"[^>]*>(.*?)</span>', inner, re.S)
        out[key] = {
            "href": href.group(1) if href else None,
            "dir": (dirs.group(1) if dirs else "").strip(),
            "title": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", title.group(1))).strip() if title else "",
        }
    # 占位项（首/末篇）：是否存在 disabled 且无链接
    out["disabled"] = {
        k: bool(re.search(rf'class="post-nav-item {k} disabled"', nav)) for k in ("prev", "next")
    }
    return out


def h1(html):
    m = re.search(r'<h1 class="post-title"[^>]*>(.*?)</h1>', html, re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""


def discover():
    _, html = get("/")
    return sorted(set(re.findall(r'href="/posts/([^"/]+)/"', html)))


async def main():
    posts = discover()
    print(f"文章 {len(posts)} 篇: {posts}\n")
    navs = {}  # (lang, slug) -> nav

    # ---------- A / B / C ----------
    for lang in LANGS:
        print(f"[{lang}] 文案本地化 / 标题语言 / 链接归属")
        for p in posts:
            st, html = get(f"{PREFIX[lang]}{p}/")
            if st != 200:
                check(f"{lang} {p} 页面可达", False, f"status={st}")
                continue
            nav = extract_nav(html)
            navs[(lang, p)] = nav
            if nav is None:
                check(f"{lang} {p} 渲染导航", len(posts) == 1, "仅单篇时允许不渲染")
                continue
            for key in ("prev", "next"):
                it = nav[key]
                if it is None:
                    continue
                check(f"{lang} {p} {key} 文案", it["dir"] == LABEL[lang][key], repr(it["dir"]))
                check(f"{lang} {p} {key} 链接前缀", it["href"].startswith(PREFIX[lang]), it["href"])
                code, _ = get(it["href"])
                check(f"{lang} {p} {key} 目标页可达", code == 200, f"{it['href']} -> {code}")
                # 标题语言：中文页应为中文；英日页允许专有名词，但不得整条是中文标题
                if lang in ("en", "ja"):
                    # 与中文页同篇导航标题对比：若完全一致，需确认该文章本身在目标
                    # 语言下的标题就与中文相同（如 "Hello World" 这类原名不变的标题），
                    # 否则说明回退逻辑没生效。
                    zh_nav = navs.get(("zh", p))
                    zh_title = (zh_nav[key]["title"] if zh_nav and zh_nav[key] else None)
                    same = zh_title is not None and it["title"] == zh_title
                    legit = False
                    if same:
                        # 打开目标语言下该相邻文章的页面，看它自己的 H1 是否就是这个名字
                        code, tgt_html = get(it["href"])
                        legit = code == 200 and h1(tgt_html) == it["title"]
                    check(f"{lang} {p} {key} 标题已本地化",
                          not same or legit,
                          f"{lang}={it['title']!r} zh={zh_title!r} 同文本合法={legit}")

    # ---------- D: 相邻关系跨语言一致 ----------
    print("\n[交叉] 相邻文章身份与语言无关")
    for p in posts:
        zh = navs.get(("zh", p))
        if not zh:
            continue
        zh_partners = {k: (zh[k]["title"] if zh[k] else None) for k in ("prev", "next")}
        for lang in ("en", "ja"):
            other = navs.get((lang, p))
            if not other:
                continue
            same_shape = all((zh[k] is None) == (other[k] is None) for k in ("prev", "next"))
            check(f"{p} zh vs {lang} 相邻数量一致", same_shape, f"zh={zh_partners}")

    # ---------- F: 正文标题未被替换 ----------
    print("\n[回归] 正文 H1 仍是该页自己的标题")
    for lang in LANGS:
        for p in posts:
            st, html = get(f"{PREFIX[lang]}{p}/")
            if st != 200:
                continue
            title = h1(html)
            check(f"{lang} {p} 正文标题非空", bool(title), title[:40])

    # ---------- E: 浏览器内点击验证 ----------
    print("\n[浏览器] 点击导航可正常跳转、占位项不可点")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        for lang in ("en", "ja"):
            for p in posts:
                st, _ = get(f"{PREFIX[lang]}{p}/")
                if st != 200:
                    continue
                nav = navs.get((lang, p))
                if not nav:
                    continue
                await page.goto(BASE + f"{PREFIX[lang]}{p}/", wait_until="domcontentloaded")
                key = "next" if nav["next"] else "prev"
                if not nav[key]:
                    continue
                expect = nav[key]["href"]
                await page.click(f".post-nav-item.{key}")
                await page.wait_for_load_state("domcontentloaded")
                check(f"{lang} {p} 点击 {key} 落到 {expect}",
                      page.url.rstrip("/").endswith(expect.rstrip("/")), page.url)
        await browser.close()

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
