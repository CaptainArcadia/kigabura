@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo キガブラを起動します（このウィンドウを閉じると終了）
start "" http://localhost:8765/
python -m http.server 8765 --bind 127.0.0.1
