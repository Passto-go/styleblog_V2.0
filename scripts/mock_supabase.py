"""
Mock Supabase（REST + RPC）——文章加密功能 E2E 专用。

目的：不碰线上生产库，就能完整验证 SSR 加密链路。
astro dev 通过 .env.local 把 PUBLIC_SUPABASE_URL 指到本服务（默认 5599），
本服务按 PostgREST 语义返回场景数据，并模拟 post_check_password RPC
（用真实 bcrypt 哈希校验，与 pgcrypto crypt() 行为一致）。

场景数据：
  · open-post（zh + en 两行）       普通文章，对照组
  · secret-post（zh + en 两行）     加密文章，密码 correct-horse，仅中文行带哈希
                                     （专门覆盖「只加密中文行」的组级锁定路径）
  · draft-post（zh 一行）           草稿，验证草稿不可见

运行：python3 scripts/mock_supabase.py [port]
"""
import json
import re
import sys
import bcrypt
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5599
SECRET_PW = "correct-horse"
SECRET_HASH = bcrypt.hashpw(SECRET_PW.encode(), bcrypt.gensalt(rounds=6)).decode()

NOW = "2026-10-10T00:00:00+00:00"

POSTS = [
    {
        "id": "10000000-0000-0000-0000-000000000001",
        "title": "公开文章标题",
        "slug": "open-post",
        "content": "# 公开文章\n\n这是公开文章的正文 OPEN_BODY_MARKER。",
        "excerpt": "公开文章摘要",
        "cover": "",
        "published": True,
        "published_at": "2026-10-08T00:00:00+00:00",
        "created_at": NOW,
        "lang": "zh",
        "category": "随笔",
        "category_slug": "essays",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": False,
        "pass_hash": None,
        "pass_hint": None,
    },
    {
        "id": "10000000-0000-0000-0000-000000000002",
        "title": "Open Article EN",
        "slug": "open-post-en",
        "content": "# Open Article\n\nEnglish body OPEN_BODY_MARKER_EN.",
        "excerpt": "Open article excerpt",
        "cover": "",
        "published": True,
        "published_at": "2026-10-08T00:00:00+00:00",
        "created_at": NOW,
        "lang": "en",
        "category": "Essays",
        "category_slug": "essays",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": False,
        "pass_hash": None,
        "pass_hint": None,
    },
    {
        # 加密文章中文行：带哈希
        "id": "20000000-0000-0000-0000-000000000001",
        "title": "加密文章标题",
        "slug": "secret-post",
        "content": "# 加密文章\n\n这是机密正文 SECRET_BODY_MARKER，未解锁绝不可出现。",
        "excerpt": "加密文章摘要 SECRET_EXCERPT_MARKER",
        "cover": "",
        "published": True,
        "published_at": "2026-10-09T00:00:00+00:00",
        "created_at": NOW,
        "lang": "zh",
        "category": "私密",
        "category_slug": "private",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": True,
        "pass_hash": SECRET_HASH,
        "pass_hint": "提示：域名去掉www",
    },
    {
        # 加密文章英文行：is_encrypted=true 但 pass_hash 为空——
        # 覆盖 RPC「跳过空哈希行」与组级锁定（英文页同样要密码）
        "id": "20000000-0000-0000-0000-000000000002",
        "title": "Secret Article EN",
        "slug": "secret-post-en",
        "content": "# Secret Article\n\nTOP SECRET SECRET_BODY_MARKER_EN body.",
        "excerpt": "Secret excerpt SECRET_EXCERPT_MARKER",
        "cover": "",
        "published": True,
        "published_at": "2026-10-09T00:00:00+00:00",
        "created_at": NOW,
        "lang": "en",
        "category": "Private",
        "category_slug": "private",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": True,
        "pass_hash": None,
        "pass_hint": None,
    },
    {
        "id": "30000000-0000-0000-0000-000000000001",
        "title": "草稿文章标题",
        "slug": "draft-post",
        "content": "草稿正文 DRAFT_BODY_MARKER",
        "excerpt": "草稿摘要",
        "cover": "",
        "published": False,
        "published_at": "2026-10-09T12:00:00+00:00",
        "created_at": NOW,
        "lang": "zh",
        "category": "随笔",
        "category_slug": "essays",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": False,
        "pass_hash": None,
        "pass_hint": None,
    },
]


def base_of(slug: str) -> str:
    return re.sub(r"-(en|ja)$", "", slug)


def public_posts():
    """模拟 RLS：仅已发布且未进垃圾箱的行对 anon 可见。"""
    return [p for p in POSTS if p["published"] and p["deleted_at"] is None]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 静音默认日志，请求记录走 _log
        sys.stderr.write("[mock] %s\n" % (fmt % args))

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path
        qs = parse_qs(u.query)
        if path == "/rest/v1/posts":
            rows = public_posts()
            # 尽力模拟常见过滤参数（应用侧还会再过滤，这里只为贴近真实）
            if qs.get("published", [None])[0] == "eq.true":
                rows = [r for r in rows if r["published"]]
            if "is.null" in (qs.get("deleted_at", [None])[0] or ""):
                rows = [r for r in rows if r["deleted_at"] is None]
            self._json(rows)
        elif path == "/rest/v1/site_settings":
            self._json([])
        elif path == "/rest/v1/categories":
            self._json([])
        elif path == "/rest/v1/media":
            self._json([])
        else:
            self._json({"code": "PGRST202", "message": f"mock: no route for GET {path}"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        path = u.path
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            body = {}

        if path == "/rest/v1/rpc/post_check_password":
            p_base = str(body.get("p_base") or "")
            p_pw = str(body.get("p_pw") or "")
            ok = False
            for row in public_posts():
                if (
                    base_of(row["slug"]) == p_base
                    and row["is_encrypted"]
                    and row["pass_hash"]
                ):
                    try:
                        ok = bcrypt.checkpw(p_pw.encode(), row["pass_hash"].encode())
                    except Exception:
                        ok = False
                    break
            self._json(ok)
        elif path == "/rest/v1/rpc/post_set_password":
            # mock 不做持久化（E2E 不验证写路径，写路径由后台 UI 测试覆盖）
            self._json(None)
        elif path == "/rest/v1/rpc/post_clear_encryption":
            self._json(None)
        else:
            self._json({"code": "PGRST202", "message": f"mock: no route for POST {path}"}, 404)


if __name__ == "__main__":
    print(f"[mock] Supabase mock on http://127.0.0.1:{PORT}  (secret pw = {SECRET_PW!r})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
