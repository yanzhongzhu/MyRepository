#!/bin/bash
# ============================================================
# chat-test-db 版本管理脚本
# 用途：每次部署前先 backup 存档；出问题时 rollback 回滚到任意历史版本
# 用法：
#   bash manage.sh backup              备份当前运行版本
#   bash manage.sh list                列出所有备份版本
#   bash manage.sh rollback <标识>     回滚到指定备份版本
#   bash manage.sh current             显示当前版本信息
# ============================================================
APP_DIR=/opt/chat-test-db
BACKUP_DIR=/opt/chat-test-db/backups
VERSION_FILE=/opt/chat-test-db/.current_version

current_version(){
  cat "$VERSION_FILE" 2>/dev/null || echo "未初始化"
}

case "${1:-}" in
  backup)
    ts=$(date +%Y%m%d_%H%M%S)
    cur=$(current_version)
    dir="$BACKUP_DIR/${ts}"
    mkdir -p "$dir/static"
    # 应用代码与配置
    cp "$APP_DIR/app.py" "$dir/" 2>/dev/null
    cp "$APP_DIR/requirements.txt" "$dir/" 2>/dev/null
    cp "$APP_DIR/config.json" "$dir/" 2>/dev/null && chmod 600 "$dir/config.json"
    # 前端静态文件
    cp "$APP_DIR/static/index.html" "$dir/static/" 2>/dev/null
    cp "$APP_DIR/static/echarts.min.js" "$dir/static/" 2>/dev/null
    # 记录来源版本
    echo "backup_from=${cur}" > "$dir/META.txt"
    echo "backup_time=$(date '+%Y-%m-%d %H:%M:%S')" >> "$dir/META.txt"
    echo "✅ 已把当前运行版本备份到：$dir"
    echo "   备份来源版本：$cur"
    ;;

  list)
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
      echo "（暂无备份版本，请先执行 backup）"
      exit 0
    fi
    echo "可回滚的备份版本："
    echo "------------------------------------------"
    for d in $(ls -1 "$BACKUP_DIR" | sort); do
      [ ! -d "$BACKUP_DIR/$d" ] && continue
      meta=$(head -1 "$BACKUP_DIR/$d/META.txt" 2>/dev/null)
      files=$(ls "$BACKUP_DIR/$d" | grep -v META | tr '\n' ' ')
      echo "  $d"
      echo "      来源:$meta  文件:$files"
    done
    ;;

  rollback)
    ver="$2"
    if [ -z "$ver" ]; then
      echo "用法: bash manage.sh rollback <备份标识>   (标识用 list 查看)"; exit 1
    fi
    dir="$BACKUP_DIR/$ver"
    if [ ! -d "$dir" ]; then
      echo "❌ 找不到备份版本：$ver（用 list 查看可用版本）"; exit 1
    fi
    # 回滚前再留一个"当前"备份，避免想反悔
    now_bak="$BACKUP_DIR/AUTO_before_rollback_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$now_bak/static"
    cp "$APP_DIR/app.py" "$now_bak/" 2>/dev/null
    cp "$APP_DIR/static/index.html" "$now_bak/static/" 2>/dev/null
    cp "$APP_DIR/static/echarts.min.js" "$now_bak/static/" 2>/dev/null
    echo "pre_rollback=on" > "$now_bak/META.txt"
    echo "（回滚前已自动备份当前状态到 $now_bak）"

    # 执行回滚
    cp "$dir/app.py" "$APP_DIR/app.py"
    [ -f "$dir/requirements.txt" ] && cp "$dir/requirements.txt" "$APP_DIR/"
    [ -f "$dir/config.json" ] && { cp "$dir/config.json" "$APP_DIR/config.json"; chmod 600 "$APP_DIR/config.json"; }
    [ -f "$dir/static/index.html" ] && cp "$dir/static/index.html" "$APP_DIR/static/"
    [ -f "$dir/static/echarts.min.js" ] && cp "$dir/static/echarts.min.js" "$APP_DIR/static/"
    # 可选，依赖未变化则不用重装
    echo "$ver" > "$VERSION_FILE"
    systemctl restart chat-test-db
    echo "✅ 已回滚到 $ver，服务已重启（systemctl is-active 应为 active）"
    ;;

  current)
    echo "当前运行版本：$(current_version)"
    echo "PID: $(pgrep -f gunicorn | tr '\n' ' ')"
    systemctl is-active chat-test-db
    ;;

  *)
    echo "用法: bash manage.sh {backup|list|rollback <标识>|current}"
    ;;
esac
