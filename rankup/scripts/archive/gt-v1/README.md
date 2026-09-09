# gt-v1（旧版 Google Trends 路由，已归档 2026-09-09）

这是 Google Trends **旧版** Explore UI（`https://trends.google.com/trends/explore?...`）的取数路由，
2026-09-09 归档，被 `rankup/scripts/gt.py` + `rankup/scripts/gt-browser.mjs`（新版路由，走
`https://trends.google.com/explore?...`）取代为主用工具。

## 为什么留着

- 新版走 Google 内部 `batchexecute` RPC 框架（`rpcids` 不是公开契约，Google 随时可能改），
  旧版走的 widget REST 接口（`/trends/api/explore` + `/trends/api/widgetdata/*`）虽然也是内部接口，
  但格式更稳定、已用了一年多没大改。**新版接口哪天悄悄换了字段或 rpcid，先拿旧版对拍**，
  确认是我们脚本的问题还是 Google 那边真的变了。
- 实测发现两套 UI 目前**并存**：`/trends/explore` 没有被重定向、没有下线，页面右上角还留着
  "Go to new Explore" 的入口（新版页面则留着 "Back to Classic Explore"）。旧版随时可能被
  Google 真正下线，但截至归档时仍然可用。

## 何时用它

- 新版 `gt.py` / `gt-browser.mjs` 报错、rpcid 失效、或怀疑新版数据有问题时，跑一遍旧版对拍。
- 需要旧版特有能力时：旧版 `region` 支持 `--resolution city`（城市粒度），新版尚未实测支持。

## 怎么调用

```bash
python3 rankup/scripts/archive/gt-v1/gt.py compare higgsfield manus --time 12m
python3 rankup/scripts/archive/gt-v1/gt.py region higgsfield manus
python3 rankup/scripts/archive/gt-v1/gt.py related higgsfield
node rankup/scripts/archive/gt-v1/gt-browser.mjs close
```

子命令、选项与主用版本一致（compare / region / related / hot / close，`--geo` `--time` `--raw`
`--property` `--category` `--resolution` `--top` `--via` `--session` `--keep-session`）。

- `gt-browser.mjs` 的默认会话名前缀是 `rankup-gt-v1-<后缀>`（主用版本是 `rankup-gt-trends-<后缀>`），
  避免两套脚本并行跑时抢同一个浏览器标签页。
- 依赖 `../../lib-scene.mjs`（即 `rankup/scripts/lib-scene.mjs`），移动目录时如果这层相对路径动了要一并改。
- `hot` 子命令走 `opencli google trends`，和新旧版 Explore 路由无关，两边行为一致。
