@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 网申助手本地试用
echo 请打开 http://127.0.0.1:8088/demo/v2.html
echo 关闭此窗口即可停止服务。
python tools\serve_demo.py --port 8088
pause
