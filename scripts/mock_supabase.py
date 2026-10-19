"""
Mock Supabase（REST + RPC）——文章加密 / teaser 功能 E2E 专用。

目的：不碰线上生产库，就能完整验证 SSR 加密链路。
astro dev 通过 .env.local 把 PUBLIC_SUPABASE_URL 指到本服务（默认 5599），
本服务按 PostgREST 语义返回场景数据，并模拟加密相关 RPC
（用真实 bcrypt 哈希校验，与 pgcrypto crypt() 行为一致）。

场景数据：
  · open-post（zh + en 两行）       普通文章，对照组
  · secret-post（zh + en 两行）     加密文章（非 teaser），密码 correct-horse，
                                    仅中文行带哈希（覆盖「只加密中文行」的组级锁定）
  · teaser-post（zh + en 两行）     加密 + teaser（list_visible=true），密码 correct-horse，
                                    仅中文行带哈希（覆盖 teaser 列表露出 + 组级传播）
  · draft-post（zh 一行）           草稿，验证草稿不可见

库形态（命令行开关）：
  （默认）        新库：加密四列齐全，RPC 均为新签名（post_set_password 四参）
  --v2-db        已执行 encryption.sql v2、未执行 teaser 迁移：
                  缺 list_visible 列（显式 select 报 42703）；
                  post_set_password 带 p_list_visible 调用报 PGRST202（旧签名）；
                  post_set_list_visible 不存在（PGRST202）
  --old-db       未执行 encryption.sql：加密四列全无，加密 RPC 全不存在

运行：python3 scripts/mock_supabase.py [port] [--v2-db | --old-db]
"""
import json
import re
import sys
import bcrypt
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 5599
ARGS = sys.argv[1:]
OLD_DB = "--old-db" in ARGS
V2_DB = "--v2-db" in ARGS
for _i, _a in enumerate(ARGS, start=1):
    if _a.isdigit():
        PORT = int(_a)
SECRET_PW = "correct-horse"
SECRET_HASH = bcrypt.hashpw(SECRET_PW.encode(), bcrypt.gensalt(rounds=6)).decode()

ALL_ENC_COLS = ("is_encrypted", "pass_hash", "pass_hint", "list_visible")
# 各形态缺失的列：新库无缺失；v2 库缺 list_visible；旧库四列全缺
MISSING_COLS = () if not (OLD_DB or V2_DB) else (("list_visible",) if V2_DB else ALL_ENC_COLS)

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
        "list_visible": False,
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
        "list_visible": False,
    },
    {
        # 加密文章中文行（非 teaser）：带哈希
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
        "list_visible": False,
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
        "list_visible": False,
    },
    {
        # teaser 文章中文行：加密 + list_visible=true，带哈希
        # 分类刻意与 secret-post（私密）分开：teaser 文章按设计公开露面，
        # 若混在同一分类会打破「只有隐藏文章的分类不出现」的既有断言。
        "id": "40000000-0000-0000-0000-000000000001",
        "title": "Teaser 文章标题",
        "slug": "teaser-post",
        "content": "# Teaser 文章\n\n这是 teaser 机密正文 TEASER_BODY_MARKER，未解锁绝不可出现。",
        "excerpt": "Teaser 摘要 TEASER_EXCERPT_MARKER",
        "cover": "",
        "published": True,
        "published_at": "2026-10-09T06:00:00+00:00",
        "created_at": NOW,
        "lang": "zh",
        "category": "手账",
        "category_slug": "notes",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": True,
        "pass_hash": SECRET_HASH,
        "pass_hint": "提示：teaser 测试",
        "list_visible": True,
    },
    {
        # teaser 文章英文行：组级传播——同样 list_visible=true
        "id": "40000000-0000-0000-0000-000000000002",
        "title": "Teaser Article EN",
        "slug": "teaser-post-en",
        "content": "# Teaser Article\n\nTOP SECRET TEASER_BODY_MARKER_EN body.",
        "excerpt": "Teaser excerpt TEASER_EXCERPT_MARKER",
        "cover": "",
        "published": True,
        "published_at": "2026-10-09T06:00:00+00:00",
        "created_at": NOW,
        "lang": "en",
        "category": "Notes",
        "category_slug": "notes",
        "author": "皮蛋solo粥",
        "deleted_at": None,
        "is_encrypted": True,
        "pass_hash": None,
        "pass_hint": None,
        "list_visible": True,
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
        "list_visible": False,
    },
]


def base_of(slug: str) -> str:
    return re.sub(r"-(en|ja)$", "", slug)


def public_posts():
    """模拟 RLS：仅已发布且未进垃圾箱的行对 anon 可见。"""
    rows = [p for p in POSTS if p["published"] and p["deleted_at"] is None]
    if MISSING_COLS:
        # 旧库形态：响应体直接不含缺失列（select=* 只返回既有列）
        rows = [{k: v for k, v in r.items() if k not in MISSING_COLS} for r in rows]
    return rows


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
            # PostgREST 语义：显式 select 不存在的列 → 42703；select=* → 只返回既有列
            if MISSING_COLS:
                sel = (qs.get("select", [""])[0] or "")
                if sel != "*":
                    missing = [c for c in MISSING_COLS if c in sel]
                    if missing:
                        self._json({"code": "42703", "details": None, "hint": None,
                                    "message": f"column posts.{missing[0]} does not exist"}, 400)
                        return
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
            if OLD_DB:
                # 旧库没有该函数（encryption.sql 未执行）
                self._json({"code": "PGRST202", "message": "Could not find the function public.post_check_password(text, text) in the schema cache."}, 404)
                return
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
            # v2 库只有三参签名：带 p_list_visible 的调用按 PostgREST 语义报 PGRST202
            if OLD_DB or (V2_DB and "p_list_visible" in body):
                self._json({"code": "PGRST202", "message": "Could not find the function public.post_set_password(p_id, p_pw, p_hint, p_list_visible) in the schema cache."}, 404)
                return
            # mock 不做持久化（E2E 不验证写路径，写路径由后台 UI 测试覆盖）
            self._json(None)
        elif path == "/rest/v1/rpc/post_set_list_visible":
            if OLD_DB or V2_DB:
                self._json({"code": "PGRST202", "message": "Could not find the function public.post_set_list_visible(uuid, boolean) in the schema cache."}, 404)
                return
            self._json(None)
        elif path == "/rest/v1/rpc/post_clear_encryption":
            if OLD_DB:
                self._json({"code": "PGRST202", "message": "Could not find the function public.post_clear_encryption(uuid) in the schema cache."}, 404)
                return
            self._json(None)
        else:
            self._json({"code": "PGRST202", "message": f"mock: no route for POST {path}"}, 404)


if __name__ == "__main__":
    mode = "OLD-DB(无加密列)" if OLD_DB else ("V2-DB(有加密三列/无list_visible)" if V2_DB else "NEW(teaser 就绪)")
    print(f"[mock] Supabase mock on http://127.0.0.1:{PORT}  (secret pw = {SECRET_PW!r})  [{mode}]")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
