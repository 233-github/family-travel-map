#!/usr/bin/env bash
# ============================================================
#  家庭旅行地图 · 一键启动服务（macOS / Linux）
# ------------------------------------------------------------
#  用法： ./start.sh   （首次需 chmod +x start.sh）
#  默认地址： http://localhost:8787
#
#  启用官方带审图号底图（天地图）：
#    TIANDITU_TOKEN=你的天地图Token ./start.sh
# ============================================================
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未找到 node。请先安装 Node.js 18+ 并将其加入 PATH。" >&2
  exit 1
fi

echo "============================================"
echo "  家庭旅行地图服务启动中..."
echo "  浏览器打开： http://localhost:8787"
echo "  关闭： 按 Ctrl+C"
echo "============================================"
echo

exec node server/server.js
