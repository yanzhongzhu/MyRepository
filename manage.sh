#!/bin/bash
# ============================================================
# chat-test-db 版本管理脚本
# 用途：备份 + git 双通道版本管理
#   - 本地备份通道：每次部署前 backup 存档；出问题 rollback 回滚
#   - git 通道（GitHub）：
#       git-status          查看本地与远端差异
#       git-pull            从 GitHub 拉取最新代码并重启
#       git-log             显示提交历史
#       git-rollback <版本>  回退到指定 git 提交（git reset --hard）
#       git-rollback-last    回退上一版（git reset --hard HEAD~1）
# 用法：
#   bash manage.sh backup              备份当前运行版本
#   bash manage.sh list                列出所有备份版本
#   bash manage.sh rollback <标识>     回滚到指定备份版本
#   bash manage.sh current             显示当前版本信息
#   bash manage.sh git-status          查看 git 状态
#   bash manage.sh git-pull            从 GitHub 拉取最新代码
#   bash manage.sh git-log             查看提交历史
#   bash manage.sh git-rollback <版本> 回退 git 到指定提交
#   bash manage.sh git-rollback-last   回退 git 到上一个提交
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

  git-status)
    echo "=== 本地工作区状态 ==="
    git -C "$APP_DIR" status -s
    echo "=== 本地 vs 远端差异 ==="
    git -C "$APP_DIR" fetch origin -q
    git -C "$APP_DIR" log --oneline HEAD..origin/main 2>/dev/null | head -10
    echo "（以上为本地落后远端的提交；若为空说明已是最新）"
    ;;

  git-pull)
    echo "=== 拉取前自动备份当前运行版本 ==="
    ts=$(date +%Y%m%d_%H%M%S)
    dir="$BACKUP_DIR/gitpull_${ts}"
    mkdir -p "$dir/static"
    cp "$APP_DIR/app.py" "$dir/" 2>/dev/null
    cp "$APP_DIR/config.json" "$dir/" 2>/dev/null && chmod 600 "$dir/config.json"
    cp "$APP_DIR/static/index.html" "$dir/static/" 2>/dev/null
    cp "$APP_DIR/static/echarts.min.js" "$dir/static/" 2>/dev/null
    echo "backup_before_gitpull=$(current_version)" > "$dir/META.txt"
    echo "✅ 已备份到：$dir"
    echo ""
    echo "=== git pull 拉取最新代码 ==="
    git -C "$APP_DIR" pull origin main
    if [ $? -ne 0 ]; then
      echo "❌ git pull 失败，服务未重启（可检查是否有未提交改动）"
      exit 1
    fi
    echo "=== pull 成功，重启服务 ==="
    systemctl restart chat-test-db
    echo "✅ 已重启（systemctl is-active 应为 active）"
    ;;

  git-log)
    git -C "$APP_DIR" log --oneline -15
    ;;

  git-rollback)
    ver="$2"
    if [ -z "$ver" ]; then
      echo "用法: bash manage.sh git-rollback <提交版本号>   (用 git-log 查看版本号)"
      echo "例如: bash manage.sh git-rollback 336c08f"
      exit 1
    fi
    echo "=== 回退前自动备份当前运行版本 ==="
    ts=$(date +%Y%m%d_%H%M%S)
    dir="$BACKUP_DIR/gitrollback_${ts}"
    mkdir -p "$dir/static"
    cp "$APP_DIR/app.py" "$dir/" 2>/dev/null
    cp "$APP_DIR/config.json" "$dir/" 2>/dev/null && chmod 600 "$dir/config.json"
    cp "$APP_DIR/static/index.html" "$dir/static/" 2>/dev/null
    cp "$APP_DIR/static/echarts.min.js" "$dir/static/" 2>/dev/null
    echo "backup_before_gitrollback=$ver" > "$dir/META.txt"
    echo "✅ 已备份到：$dir"
    echo ""
    echo "=== 回退到提交 $ver ==="
    git -C "$APP_DIR" reset --hard "$ver"
    if [ $? -ne 0 ]; then
      echo "❌ 回退失败，请检查提交版本号（git-log 查看）"
      exit 1
    fi
    echo "=== 重启服务 ==="
    systemctl restart chat-test-db
    echo "✅ 已回退到 $ver 并重启服务"
    echo ""
    echo "⚠️ 注意：回退后本地领先远端，若需同步请执行:"
    echo "   bash manage.sh git-sync-fix   (强制让远端也回到该版本)"
    ;;

  git-rollback-last)
    echo "=== 回退到上一个提交（HEAD~1）==="
    ts=$(date +%Y%m%d_%H%M%S)
    dir="$BACKUP_DIR/gitrollback_${ts}"
    mkdir -p "$dir/static"
    cp "$APP_DIR/app.py" "$dir/" 2>/dev/null
    cp "$APP_DIR/config.json" "$dir/" 2>/dev/null && chmod 600 "$dir/config.json"
    cp "$APP_DIR/static/index.html" "$dir/static/" 2>/dev/null
    cp "$APP_DIR/static/echarts.min.js" "$dir/static/" 2>/dev/null
    echo "backup_before_gitrollback_last=HEAD~1" > "$dir/META.txt"
    git -C "$APP_DIR" reset --hard HEAD~1
    systemctl restart chat-test-db
    echo "✅ 已回退到上一个提交并重启服务"
    ;;

  git-sync-fix)
    echo "=== 强制让远端跟随本地当前版本 ==="
    git -C "$APP_DIR" push --force origin main
    echo "✅ 远端已同步（本操作会覆盖远端历史，请确认符合预期）"
    ;;

  *)
    echo "用法: bash manage.sh {backup|list|rollback <标识>|current|git-status|git-pull|git-log|git-rollback <版本>|git-rollback-last|git-sync-fix}"
    ;;
esac
