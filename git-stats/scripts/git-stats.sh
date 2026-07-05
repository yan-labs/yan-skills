#!/bin/bash
# Git 贡献统计脚本（精简版）
# - 按 email 聚类同一人不同 git user.name 的情况（传递闭包合并）
# - 输出每位作者的 commit 数与占比，配彩色块状进度条 + 排名 + 表头

RANGE="${1:---all}"

tmpfile=$(mktemp)
datafile=$(mktemp)

# 收集 (email, name) 对，用传递闭包合并：
#   同 email 不同 name → 同一人；同 name 不同 email → 同一人
git log $RANGE --format='%aE|%aN' | sort -u | awk -F'|' '
{
    raw_email = $1; ek = tolower($1); nk = tolower($2); disp = $2
    if (length(disp) > length(best[nk])) best[nk] = disp
    if (!(ek in orig_email)) orig_email[ek] = raw_email
    if (!(ek SUBSEP nk in seen)) {
        seen[ek SUBSEP nk] = 1
        ec[ek]++; en[ek, ec[ek]] = nk
        nc[nk]++; ne[nk, nc[nk]] = ek
    }
}
END {
    for (nk in nc) leader[nk] = nk
    for (e in ec) {
        first = leader[en[e, 1]]
        for (i = 2; i <= ec[e]; i++) {
            old = leader[en[e, i]]
            if (old != first) for (nk in leader) if (leader[nk] == old) leader[nk] = first
        }
    }
    for (nk in nc) {
        l = leader[nk]
        for (i = 1; i <= nc[nk]; i++) {
            ek = ne[nk, i]
            if (!(l SUBSEP ek in gs)) {
                gs[l SUBSEP ek] = 1
                raw = orig_email[ek]
                ge[l] = ge[l] ? ge[l] "," raw : raw
            }
        }
        if (length(best[nk]) > length(gd[l])) gd[l] = best[nk]
    }
    for (l in ge) if (leader[l] == l) print gd[l] "|" ge[l]
}' > "$tmpfile"

# 用合并后的 email 列表统计每个人的 commit 数
while IFS='|' read -r name email_list; do
    [ -z "$name" ] && continue
    author_args=""
    IFS=',' read -ra emails <<< "$email_list"
    for e in "${emails[@]}"; do author_args="$author_args --author=$e"; done
    commits=$(eval "git log $RANGE $author_args --oneline" | wc -l | tr -d ' ')
    [ "$commits" -eq 0 ] && continue
    echo "$name|$commits" >> "$datafile"
done < "$tmpfile"

# 渲染：表头 + 排名 + 块状彩色进度条 + 数量 + 占比
sort -t'|' -k2 -rn "$datafile" | awk -F'|' '
BEGIN { n=0; total=0 }
{ name[n]=$1; count[n]=$2; total+=$2; n++ }
END {
  # 调色板（前景色），每行轮询使用
  c[0]="\033[38;5;39m"   # bright cyan-blue
  c[1]="\033[38;5;46m"   # green
  c[2]="\033[38;5;220m"  # gold
  c[3]="\033[38;5;201m"  # magenta
  c[4]="\033[38;5;33m"   # blue
  c[5]="\033[38;5;208m"  # orange
  c[6]="\033[38;5;160m"  # red
  R="\033[0m"; D="\033[2m"; B="\033[1m"; W="\033[97m"

  bar_total = 50

  printf "\n  %s%sTotal: %d commits · %d contributors%s\n\n", B, W, total, n, R

  # 表头
  printf "  %s%-6s %-14s %-50s %7s  %s%s\n", B, "RANK", "AUTHOR", "PROGRESS", "COMMITS", "PCT", R
  printf "  %s", D
  for (j=0;j<88;j++) printf "─"
  printf "%s\n", R

  medal[1]="🥇"; medal[2]="🥈"; medal[3]="🥉"
  for (i=0;i<n;i++) {
    rank = i + 1
    pct = count[i]*100/total
    bar_len = int(pct*bar_total/100 + 0.5)
    if (bar_len<1 && count[i]>0) bar_len=1
    if (bar_len > bar_total) bar_len = bar_total
    col = c[i%7]

    # 排名前缀（6 cell 宽）：前 3 名带奖牌，其余用灰色 #N
    if (rank <= 3) {
      printf "  %s %s#%-2d%s ", medal[rank], B, rank, R
    } else {
      printf "     %s#%-2d%s ", D, rank, R
    }

    # 名字（14 cell）
    printf "%s%-14s%s ", col, name[i], R

    # 进度条（50 cell，块状彩色 + 灰色空槽）
    printf "%s", col
    for (j=0;j<bar_len;j++) printf "█"
    printf "%s%s", R, D
    for (j=bar_len;j<bar_total;j++) printf "░"
    printf "%s ", R

    # 数量 + 占比
    printf "%s%7d%s  %s(%5.1f%%)%s\n", B, count[i], R, D, pct, R
  }
  printf "\n"
}'

rm -f "$tmpfile" "$datafile"
