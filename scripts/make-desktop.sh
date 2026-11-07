#!/usr/bin/env bash
# 生成 .desktop 文件。用法: make-desktop.sh <输出路径>
set -euo pipefail
OUT="${1:?需要输出路径}"
{
  printf '[Desktop Entry]\n'
  printf 'Type=Application\n'
  printf 'Name=做T全能终端\n'
  printf 'Name[zh_CN]=做T全能终端\n'
  printf 'Comment=本地离线的做T成本核算与交易记录工具\n'
  printf 'Exec=zuot-terminal\n'
  printf 'Icon=zuot-terminal\n'
  printf 'Terminal=false\n'
  printf 'Categories=Office;Finance;\n'
  printf 'StartupWMClass=zuot-terminal\n'
  printf 'Keywords=stock;trade;finance;做T;股票;\n'
} > "$OUT"
