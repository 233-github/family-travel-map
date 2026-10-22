@echo off
REM ============================================================
REM  家庭旅行地图 · 一键启动服务（Windows）
REM ------------------------------------------------------------
REM  用法：双击本文件即可启动；默认地址 http://localhost:8787
REM
REM  启用天地图官方底图（可选）：
REM    先在命令行设置环境变量，再运行本脚本：
REM      set "TIANDITU_TOKEN=你的天地图Token"
REM      start.bat
REM    不要把 Token 写进本文件或提交到仓库。
REM ============================================================
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 node。请先安装 Node.js 18+ 并将其加入 PATH。
  pause
  exit /b 1
)

cd /d "%~dp0"
echo.
echo  ============================================
echo   家庭旅行地图服务启动中...
echo   浏览器打开： http://localhost:8787
echo   关闭： 在本窗口按 Ctrl+C
echo  ============================================
echo.
node server/server.js
pause
