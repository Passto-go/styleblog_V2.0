"""
关于页文案编辑 —— 端到端验证（本地 Mock Supabase，零生产影响）

架构：
  内置 Mock（本文件）        仅伪造 GET /rest/v1/site_settings（键 about_content）
  astro dev                 经 .env.local 指向 mock（PUBLIC_SUPABASE_URL → mock）
  本脚本                    HTTP 直查渲染结果

覆盖点：
  A. 已保存中文文案：引导语 + 正文按迷你 markdown 渲染（## → h2、** → strong、[ ]( ) → a）
  B. 已保存英文文案：/en/about 同样生效（双语独立存储）
  C. XSS 防护：正文里的 <script> 被转义，不出现在 HTML 里
  D. 字段为空 → 回退 i18n 内置文案（清空输入不会把页面弄空）
  E. 整键缺失 → 全量回退 i18n 内置文案（与未配置时行为一致）

运行：python3 scripts/about_edit_e2e_test.py
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MOCK_PORT = 5601
SITE = "http://127.0.0.1:4403"

# 后台保存形态：{ zh: { lead, body }, en: { lead, body } }（admin.astro saveAbout 写入结构）
I18N_DEFAULT_LEAD_ZH = "你好，我是老一贯。"
I18N_DEFAULT_LEAD_EN = "Hi, I'm 老一贯."

state = {
    "zh": {
        "lead": "测试引导语（纯文本单行）",
        "body": "## 小标题一\n\n第一段：**重点**与 [链接](https://example.com)。\n\n<script>alert(1)</script>\n\n第二段。",
    },
    "en": {
        "lead": "Test lead text",
        "body": "## Heading One\n\nPara one.\n\nPara two.",
    },
    "row_exists": True,   # False = 模拟 site_settings 里没有 about_content 键
}


class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        if u.path == "/rest/v1/site_settings":
            key = (qs.get("key", [""])[0] or "")
            if "about_content" in key and state["row_exists"]:
                value = {"zh": state["zh"], "en": state["en"]}
                self._json([{"value": value}])
            else:
                self._json([])   # maybeSingle → data=null → 回退 i18n
        else:
            self._json([])


def http_get(path):
    req = urllib.request.Request(SITE + path)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8")


def wait_ready(proc, url, needle, timeout_s=90):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if proc.poll() is not None:
            raise RuntimeError(f"dev 进程提前退出 code={proc.returncode}")
        try:
            if needle in http_get(url):
                return
        except Exception:
            pass
        time.sleep(1.5)
    raise RuntimeError(f"等待 {url} 就绪超时")


results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -> {detail}" if detail else ""))


def run():
    mock = HTTPServer(("127.0.0.1", MOCK_PORT), Mock)

    import threading
    threading.Thread(target=mock.serve_forever, daemon=True).start()

    env_local = os.path.join(ROOT, ".env.local")
    had_env_local = os.path.exists(env_local)
    backup = None
    if had_env_local:
        with open(env_local, encoding="utf-8") as f:
            backup = f.read()

    with open(env_local, "w", encoding="utf-8") as f:
        f.write(
            f"PUBLIC_SUPABASE_URL=http://127.0.0.1:{MOCK_PORT}\n"
            "PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-about-e2e\n"
        )

    dev = subprocess.Popen(
        ["npx", "astro", "dev", "--port", "4403", "--host", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_ready(dev, "/about", "<html")
        print("== A. 已保存中文文案渲染 ==")
        zh = http_get("/about")
        check("A1 引导语按保存内容渲染", "测试引导语（纯文本单行）" in zh)
        check("A2 引导语为纯文本（不解析标记，与 i18n 默认行为一致）", "测试引导语（纯文本单行）" in zh and "<strong>纯文本单行" not in zh)
        check("A3 ## 小标题转 <h2>", re.search(r"<h2[^>]*>[^<]*小标题一", zh) is not None)
        check("A4 正文粗体", "<strong>重点</strong>" in zh)
        check("A5 链接语法转 <a>", 'href="https://example.com"' in zh)

        print("== B. 已保存英文文案渲染（/en/about）==")
        en = http_get("/en/about")
        check("B1 英文引导语", "Test lead text" in en)
        check("B2 英文小标题", re.search(r"<h2[^>]*>[^<]*Heading One", en) is not None)
        check("B3 英文正文", "Para two." in en)

        print("== C. XSS 防护 ==")
        check("C1 <script> 被转义（不出现在 HTML）", "<script>alert(1)</script>" not in zh)
        check("C2 <script> 以实体形式呈现", "&lt;script&gt;" in zh)

        print("== D. 字段为空 → 回退 i18n ==")
        state["en"] = {"lead": "", "body": ""}
        en2 = http_get("/en/about")
        check("D1 英文清空后回退默认引导语", I18N_DEFAULT_LEAD_EN in en2)
        check("D2 英文清空后回退默认正文", "吾道一以贯之" in en2 or "长期主义" in en2)
        state["en"] = {"lead": "Test lead text", "body": "## Heading One\n\nPara one.\n\nPara two."}

        print("== E. 整键缺失 → 全量回退 i18n ==")
        state["row_exists"] = False
        zh2 = http_get("/about")
        en3 = http_get("/en/about")
        check("E1 中文回退默认引导语", I18N_DEFAULT_LEAD_ZH in zh2)
        check("E2 中文回退默认正文", "吾道一以贯之" in zh2)
        check("E3 英文回退默认引导语", I18N_DEFAULT_LEAD_EN in en3)
        state["row_exists"] = True
    finally:
        dev.terminate()
        try:
            dev.wait(timeout=10)
        except Exception:
            dev.kill()
        mock.shutdown()
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
    sys.exit(run())
