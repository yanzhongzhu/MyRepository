# -*- coding: utf-8 -*-
"""
chat-test-db: 用 DeepSeek 大模型，通过自然语言对话查询 test 表数据。
- 用户在前端网页输入自然语言问题
- 后端将问题 + test 表结构发给 DeepSeek，让其生成只读 SELECT SQL
- 后端做安全校验后执行查询，返回结果表格
"""
import json
import os
import re
import time
import secrets
import logging

import requests
from flask import Flask, request, jsonify, send_from_directory
import pymysql

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("chat-test-db")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

# 应用版本号：用于验证 git 部署是否生效（git-pull 后此值应更新）
APP_VERSION = "v2.0"

# 管理员会话：token -> 过期时间戳（纯内存，重启即失效，可重新登录）
_ADMIN_SESSIONS = {}


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # 环境变量可覆盖 DeepSeek key，且优先级最高（不改文件）
    if os.environ.get("DEEPSEEK_API_KEY"):
        cfg["deepseek"]["api_key"] = os.environ["DEEPSEEK_API_KEY"]

    # admin 密码也允许用环境变量覆盖（可选）
    if os.environ.get("ADMIN_PASSWORD"):
        cfg.setdefault("admin", {})["password"] = os.environ["ADMIN_PASSWORD"]
    return cfg


def save_config(new_cfg):
    """把修改后的配置写回 config.json（服务器本地），并收紧文件权限。"""
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(new_cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)
    try:
        os.chmod(CONFIG_PATH, 0o600)  # 仅属主可读写，保护密钥
    except Exception as e:
        logger.warning("chmod config.json failed: %s", e)


cfg = load_config()
app = Flask(__name__, static_folder="static")


# ---------------------------------------------------------------------------
# 管理员会话
# ---------------------------------------------------------------------------
def _admin_token_valid(token):
    exp = _ADMIN_SESSIONS.get(token)
    if not exp:
        return False
    if time.time() > exp:
        _ADMIN_SESSIONS.pop(token, None)
        return False
    return True


def _require_admin():
    token = (request.headers.get("X-Admin-Token") or "").strip()
    if not token or not _admin_token_valid(token):
        return None
    return token


# ---------------------------------------------------------------------------
# 数据库工具
# ---------------------------------------------------------------------------
def get_conn():
    m = cfg["mysql"]
    return pymysql.connect(
        host=m.get("host", "127.0.0.1"),
        port=m.get("port", 3306),
        user=m["user"],
        password=m["password"],
        database=m["database"],
        charset=m.get("charset", "utf8mb4"),
        connect_timeout=cfg["security"]["connect_timeout"],
        read_timeout=cfg["security"]["read_timeout"],
        cursorclass=pymysql.cursors.DictCursor,
    )


def describe_table(table):
    """读取指定表的结构，用于告诉大模型如何写 SQL。"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM `%s`" % table)
            cols = cur.fetchall()
            cur.execute("SELECT COUNT(*) AS cnt FROM `%s`" % table)
            cnt = cur.fetchone()["cnt"]
    lines = ["表名: %s (共 %s 行数据)" % (table, cnt)]
    lines.append("字段信息(名称 / 类型 / 是否允许为空 / 说明):")
    for c in cols:
        lines.append("- %s | %s | nullable=%s" % (c["Field"], c["Type"], "YES" if c["Null"] == "YES" else "NO"))
    lines.append("样例数据(前 3 行):")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM `%s` ORDER BY id DESC LIMIT 3" % table
            )
            for row in cur.fetchall():
                lines.append(str(row))
    return "\n".join(lines)


def build_system_prompt():
    sec = cfg["security"]
    db = sec["allowed_database"]
    tables = sec["allowed_tables"]
    descs = []
    for t in tables:
        try:
            descs.append(describe_table(t))
        except Exception as e:
            logger.warning("describe_table(%s) failed: %s", t, e)
    schema_block = "\n\n".join(descs)
    return (
        "你是数据库查询助手。用户会用中文提出数据查询需求。\n"
        f"你只能查询数据库 `{db}`，且只能查询以下白名单表: {', '.join(tables)}。\n"
        "严禁查询、修改其他任何表或数据库；严禁任何 INSERT/UPDATE/DELETE/DROP/ALTER/GRANT/SHOW DATABASES 等非只读操作。\n"
        "你必须只输出一条可执行的 SELECT 语句，不要输出任何解释、前后缀、反引号或 markdown 代码块。\n"
        "日期字段是 shipping_date(date)，另有 year/month 整数字段；中文文本字段(project/address/city等)的匹配建议用 LIKE。\n"
        "如果用户的问题与数据查询无关或无法通过此表回答，只输出: <NO_QUERY> 你的简短说明\n"
        "图表输出要求(重要)：在 SELECT 语句之前单独输出一行图表配置注释，格式为：\n"
        "<!--CHART:{\"type\":\"bar\"或\"pie\"或\"line\",\"x\":\"用于作横轴/分组的列名\",\"y\":\"用于作数值的列名\",\"title\":\"图表标题\"}-->\n"
        "规则：统计/占比类(如按项目、按月份计数)优先 pie 或 bar；趋势类(按时间变化)用 line；其他按最合适选择。"
        "若结果不适合画图(如明细列表)，则输出 <!--CHART:none-->。仅允许 type 为 bar/pie/line。\n"
        "--- 表结构 ---\n"
        + schema_block
    )


# ---------------------------------------------------------------------------
# DeepSeek 调用
# ---------------------------------------------------------------------------
def deepseek_chat_url(base_url):
    """构造 chat/completions 完整地址。
    兼容两种填法：
      - 只填根地址(如 https://api.deepseek.com )  -> 自动拼 /chat/completions
      - 填完整地址(如 https://xxx.com/v1/chat/completions) -> 原样使用，不重复拼接
    """
    base = (base_url or "").strip().rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def call_deepseek(user_question):
    ds = cfg["deepseek"]
    api_key = ds.get("api_key")
    if not api_key or "请填入" in api_key:
        raise RuntimeError("DEEPSEEK_API_KEY 未配置，请联系管理员设置。")
    url = deepseek_chat_url(ds["base_url"])
    headers = {"Authorization": "Bearer " + api_key, "Content-Type": "application/json"}
    payload = {
        "model": ds.get("model", "deepseek-chat"),
        "temperature": ds.get("temperature", 0.1),
        "messages": [
            {"role": "system", "content": build_system_prompt()},
            {"role": "user", "content": user_question},
        ],
        "stream": False,
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        logger.error("DeepSeek error %s: %s", resp.status_code, resp.text[:500])
        raise RuntimeError("大模型调用失败(%s): %s" % (resp.status_code, resp.text[:200]))
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# SQL 安全校验
# ---------------------------------------------------------------------------
def strip_comments(sql):
    # 去掉 -- 注释、# 注释、/* */ 注释（简单处理，保留不带注释的核心语句）
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"#[^\n]*", " ", sql)
    return sql


def validate_sql(raw_sql):
    """安全校验：只允许针对白名单表的只读 SELECT。返回 (cleaned_sql, error)。"""
    sec = cfg["security"]
    tables = sec["allowed_tables"]

    sql = strip_comments(raw_sql).strip()
    if not sql:
        return None, "未生成有效 SQL"

    # 去除结尾分号，并拒绝内部多语句
    sql = sql.rstrip(";").strip()
    if ";" in sql:
        return None, "检测到多条语句，已拒绝执行（仅允许单条查询）"

    lower = sql.lower().lstrip()
    # 只允许 SELECT / WITH 开头的只读查询
    if not (lower.startswith("select") or lower.startswith("with")):
        return None, "仅允许 SELECT 查询，已拒绝执行"

    # 禁止危险关键字
    banned = ["insert", "update", "delete", "drop", "alter", "create", "truncate",
              "grant", "revoke", "replace", "rename", "load", "set ", "show",
              "information_schema", "mysql.", "performance_schema", "sys."]
    for b in banned:
        if re.search(r"\b" + re.escape(b), lower):
            return None, "检测到不允许的操作关键字，已拒绝执行"

    # 表名校验：只检查 FROM / JOIN / INTO / UPDATE 等关键字后紧跟的表名，
    # 只能引用白名单中的表（支持可选的 库名.表名 前缀形式，但库名必须匹配）
    db = sec["allowed_database"]
    for m in re.finditer(r"(?:\bfrom\b|\bjoin\b|\binto\b|\bupdate\b|\btable\b)\s+(?:`?%s`?\.)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?" % re.escape(db), sql, flags=re.I):
        name = m.group(1)
        if name not in tables:
            return None, "查询涉及未授权表: %s" % name

    # 补 LIMIT，防止返回超大结果集
    if not re.search(r"\blimit\s+\d", lower):
        sql += " LIMIT %d" % sec["max_rows"]

    return sql, None


def execute_query(sql):
    sec = cfg["security"]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchmany(sec["max_rows"] + 1)
            if cur.description:
                columns = [d[0] for d in cur.description]
            else:
                columns = []
    return columns, rows


# ---------------------------------------------------------------------------
# 路由
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/info")
def api_info():
    """返回表结构信息，供前端展示。"""
    tables = cfg["security"]["allowed_tables"]
    info = []
    for t in tables:
        try:
            info.append({"table": t, "desc": describe_table(t)})
        except Exception as e:
            info.append({"table": t, "desc": "读取失败: %s" % e})
    return jsonify({"ok": True, "version": APP_VERSION, "tables": info})


def parse_chart_config(text):
    """从大模型输出中解析图表配置注释 <!--CHART:{...}-->。"""
    m = re.search(r"<!--CHART:(\{.*?\})-->", text, re.S)
    if not m:
        m = re.search(r"<CHART>(.*?)</CHART>", text, re.S)
    if not m:
        return None
    raw = m.group(1).strip()
    if raw == "none":
        return None
    try:
        obj = json.loads(raw)
        if obj.get("type") in ("bar", "pie", "line") and obj.get("x"):
            return obj
    except Exception:
        pass
    return None


def remove_chart_marker(text):
    """从 SQL 前置的文本中移除图表注释行。"""
    t = re.sub(r"<!--CHART:.*?-->", "", text, flags=re.S)
    t = re.sub(r"<CHART>.*?</CHART>", "", t, flags=re.S)
    return t


@app.route("/api/chat", methods=["POST"])
def api_chat():
    data = request.get_json(silent=True) or {}
    question = (data.get("message") or "").strip()
    if not question:
        return jsonify({"ok": False, "error": "请输入问题"}), 400

    try:
        ds_out = call_deepseek(question)
    except Exception as e:
        logger.exception("deepseek call failed")
        return jsonify({"ok": False, "error": str(e)}), 500

    # 大模型表示无法回答
    if ds_out.startswith("<NO_QUERY>"):
        return jsonify({
            "ok": True,
            "no_query": True,
            "reply": ds_out.replace("<NO_QUERY>", "").strip() or "无法通过该数据表回答此问题。",
        })

    chart_cfg = parse_chart_config(ds_out)
    sql_clean = remove_chart_marker(ds_out).strip()
    sql, err = validate_sql(sql_clean)
    if err:
        return jsonify({"ok": False, "sql": sql_clean, "error": err}), 200

    try:
        columns, rows = execute_query(sql)
    except Exception as e:
        logger.exception("query failed")
        return jsonify({"ok": False, "sql": sql, "error": "SQL 执行失败: %s" % e}), 200

    return jsonify({
        "ok": True,
        "sql": sql,
        "columns": columns,
        "rows": [list(r.values()) for r in rows],
        "row_count": len(rows),
        "truncated": len(rows) > cfg["security"]["max_rows"],
        "chart": chart_cfg,
    })


# ---------------------------------------------------------------------------
# 管理员接口（密钥自助配置）
# ---------------------------------------------------------------------------
def _mask_key(key):
    if not key:
        return ""
    if len(key) <= 6:
        return "*" * len(key)
    return key[:4] + "*" * 8 + key[-4:]


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    pwd = (data.get("password") or "").strip()
    if not pwd:
        return jsonify({"ok": False, "error": "请输入管理员密码"}), 400
    admin_cfg = cfg.setdefault("admin", {})
    if not pwd or pwd != admin_cfg.get("password"):
        return jsonify({"ok": False, "error": "管理员密码错误"}), 401

    token = secrets.token_urlsafe(32)
    ttl = int(admin_cfg.get("session_ttl_hours", 8)) * 3600
    _ADMIN_SESSIONS[token] = time.time() + ttl
    return jsonify({"ok": True, "token": token, "ttl_hours": ttl // 3600})


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    token = (request.headers.get("X-Admin-Token") or "").strip()
    _ADMIN_SESSIONS.pop(token, None)
    return jsonify({"ok": True})


@app.route("/api/admin/status")
def admin_status():
    if not _require_admin():
        return jsonify({"ok": False, "error": "未登录或会话已过期"}), 401
    key = cfg["deepseek"].get("api_key", "")
    configured = bool(key) and "请填入" not in key
    # 数据库连接健康检查
    db_ok = True
    try:
        with get_conn() as conn:
            conn.ping(reconnect=True)
    except Exception:
        db_ok = False
    return jsonify({
        "ok": True,
        "deepseek_configured": configured,
        "deepseek_mask": _mask_key(key) if key else "",
        "base_url": cfg["deepseek"].get("base_url", ""),
        "model": cfg["deepseek"].get("model", ""),
        "db_ok": db_ok,
        "allowed_tables": cfg["security"].get("allowed_tables", []),
    })


@app.route("/api/admin/set-deepseek-config", methods=["POST"])
def admin_set_deepseek_config():
    """管理员自助配置 DeepSeek 的接口地址 / API Key / 模型名称。"""
    if not _require_admin():
        return jsonify({"ok": False, "error": "未登录或会话已过期"}), 401
    data = request.get_json(silent=True) or {}

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        disk_cfg = json.load(f)
    ds = disk_cfg.setdefault("deepseek", {})

    changed = []
    if "base_url" in data:
        bu = (data.get("base_url") or "").strip().rstrip("/")
        if bu:
            ds["base_url"] = bu
            changed.append("base_url")
    if "api_key" in data:
        k = (data.get("api_key") or "").strip()
        # 允许留空表示“保持不变”，避免前端空值误清空 key
        if k:
            ds["api_key"] = k
            changed.append("api_key")
    if "model" in data:
        m = (data.get("model") or "").strip()
        if m:
            ds["model"] = m
            changed.append("model")

    if not changed:
        return jsonify({"ok": False, "error": "没有可更新的配置项"}), 400

    save_config(disk_cfg)
    global cfg
    cfg = load_config()  # 立即生效

    masked = _mask_key(ds.get("api_key", ""))
    logger.info("管理员已更新 DeepSeek 配置: %s (key=%s)", ",".join(changed), masked)
    return jsonify({
        "ok": True,
        "updated": changed,
        "base_url": ds.get("base_url"),
        "model": ds.get("model"),
        "deepseek_mask": masked,
        "env_override": bool(os.environ.get("DEEPSEEK_API_KEY")),
    })


@app.route("/api/admin/test-deepseek", methods=["POST"])
def admin_test_deepseek():
    """用当前配置的接口/Key/模型发一条最小请求，验证连通性。"""
    if not _require_admin():
        return jsonify({"ok": False, "error": "未登录或会话已过期"}), 401
    ds = cfg["deepseek"]
    key = ds.get("api_key", "")
    if not key or "请填入" in key:
        return jsonify({"ok": False, "error": "请先配置 API Key 再测试"}), 200

    url = deepseek_chat_url(ds["base_url"])
    payload = {
        "model": ds.get("model", "deepseek-chat"),
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5,
    }
    try:
        r = requests.post(url, json=payload,
                          headers={"Authorization": "Bearer " + key},
                          timeout=30)
        if r.status_code == 200:
            return jsonify({"ok": True, "message": "连接成功，DeepSeek 接口与 Key 有效。"})
        else:
            body = r.text[:300]
            return jsonify({"ok": False, "error": "HTTP %s: %s" % (r.status_code, body)}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": "连接异常: %s" % e}), 200


@app.route("/api/admin/set-password", methods=["POST"])
def admin_set_password():
    if not _require_admin():
        return jsonify({"ok": False, "error": "未登录或会话已过期"}), 401
    data = request.get_json(silent=True) or {}
    new_pwd = (data.get("new_password") or "").strip()
    if len(new_pwd) < 6:
        return jsonify({"ok": False, "error": "新密码至少 6 位"}), 400

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        disk_cfg = json.load(f)
    disk_cfg.setdefault("admin", {})["password"] = new_pwd
    save_config(disk_cfg)
    global cfg
    cfg = load_config()
    return jsonify({"ok": True, "message": "管理员密码已更新"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 80))
    app.run(host="0.0.0.0", port=port, debug=False)
