#!/bin/sh
# ============================================================
# read-token.sh —— 凭据字典静默读取助手（C:\.ai_global\）
# 用法（务必在命令替换中使用，禁止直接执行回显）：
#   GT=$(sh /c/.ai_global/read-token.sh gitee)
#   GH=$(sh /c/.ai_global/read-token.sh github)
# 规则：脚本只认「平台名 -> token」键路径；token 轮换只覆盖 yml 值，本脚本零改动。
# 安全：本脚本只应被命令替换捕获输出；向终端直接打印即违反 META-0001。
# ============================================================
[ -n "$1" ] || { echo "usage: read-token.sh <platform>" >&2; exit 1; }
awk -v p="$1" '
  $0 ~ "^"p"[[:space:]]*:" {f=1; next}
  f && /^[[:space:]]*token[[:space:]]*:/ {
    sub(/^[^:]*:[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print; exit
  }
' "$(dirname "$0")/personal_token.yml" | tr -d '\r'
