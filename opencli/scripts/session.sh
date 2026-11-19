#!/usr/bin/env bash
# session.sh —— Bash tool 侧的会话名助手。
#
# 为什么需要它：opencli-core.mjs 的 defaultSession() 只有 JS 调用方能用，
# 而实测出事的那批会话全是从 Bash tool 直接发出去的，压根没经过它。
# 2026-08-28 一天里 `opencli-wait-probe-<PID>` 出现了 14 个不同后缀 ——
# 同一个探针开了 14 个标签页，因为 Bash tool 每次调用都是新进程，$$ 每次都变。
#
#   source <opencli-skill-dir>/scripts/session.sh
#   S=$(oc_session backlink-probe)      # 同一轮对话里稳定不变
#   S=$(oc_session_for "https://sem.proxy.example.com/...")   # 配额站自动收敛成固定名
#
# 后缀解析顺序与 defaultSession() 保持一致：
#   OPENCLI_SESSION_SUFFIX -> CLAUDE_CODE_SESSION_ID -> CLAUDE_CODE_HOST_SESSION_ID -> p<PPID>
# HOST id 排在最后是有意的：它被整个桌面应用共享，拿它当后缀会把同一个
# 标签页发给两个并行任务——正是这个助手要防的事。

oc_session_suffix() {
  local raw="${OPENCLI_SESSION_SUFFIX:-${CLAUDE_CODE_SESSION_ID:-${CLAUDE_CODE_HOST_SESSION_ID:-p$PPID}}}"
  printf '%s' "$raw" | tr -cd 'a-zA-Z0-9' | cut -c1-12
}

oc_session() {
  local base="$1"
  if [ -z "$base" ]; then echo "oc_session: 需要一个描述工作的 base 名" >&2; return 2; fi
  local suffix; suffix="$(oc_session_suffix)"
  printf '%s-%s' "$base" "${suffix:-local}"
}

# 配额站（同时加载会触发上限）收敛成固定会话名，让 daemon 自动把并发排成队。
# 规则和 opencli-core.mjs 的 QUOTA_SITES 必须一致，改一处要同步另一处。
oc_session_for() {
  local url="$1" base="$2"
  if [ -n "${TOOLS_SHARE_DOMAIN:-}" ]; then
    case "$url" in
      *"sem.${TOOLS_SHARE_DOMAIN}"*) printf 'semrush-nav'; return 0 ;;
      *"sim.${TOOLS_SHARE_DOMAIN}"*) printf 'similarweb-nav'; return 0 ;;
    esac
  fi
  case "$url" in
    *semrush.com*)    printf 'semrush-nav';    return 0 ;;
    *similarweb.com*) printf 'similarweb-nav'; return 0 ;;
  esac
  oc_session "$base"
}

# 拒绝 $$ 形状的名字。这个失败原本不报错，只表现为「页面怎么老是空的」。
oc_guard_session() {
  local name="$1"
  case "$name" in
    *-[0-9][0-9][0-9]|*-[0-9][0-9][0-9][0-9]|*-[0-9][0-9][0-9][0-9][0-9]|*-[0-9][0-9][0-9][0-9][0-9][0-9])
      echo "会话名 \"$name\" 以 3~6 位数字结尾，这是 \$\$ / PID 的形状。" >&2
      echo "Bash tool 里 \$\$ 每次调用都变，会把同一件事拆成一串标签页。" >&2
      echo "改用描述性常量，或 oc_session <base>。" >&2
      return 1 ;;
  esac
  printf '%s' "$name"
}
