# 新民独立中学 2026 年度运动会 · 实时成绩与电视大屏转播系统

> **Sin Min Middle School Annual Sports Meet 2026**
> 纯前端零后端架构 · SheetJS Excel 读写 · BroadcastChannel 现场电视零延迟联动 · GitHub Pages 手机端浏览

---

## 🔗 全部可点击在线链接（可直接打开查看或转发）

- **📱 纯净师生实时查分版（推荐印成二维码贴操场，默认聚焦 02/12 正日项目）**：
  [https://felixyu9722.github.io/sinmin-sports-2026/live.html](https://felixyu9722.github.io/sinmin-sports-2026/live.html)
- **🏠 完整总览首页（供主任与工作人员一站式预览切换）**：
  [https://felixyu9722.github.io/sinmin-sports-2026/](https://felixyu9722.github.io/sinmin-sports-2026/)
- **📺 决赛现场大屏幕投影页（电视机 / LED 屏 · 默认 1➔3➔4➔7 轮播 + 6秒极速云同步）**：
  [https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html](https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html)
- **📺 师生手机端大屏直播入口（隐藏导播条）**：
  [https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html?from=live](https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html?from=live)
- **🎛️ 现场成绩录入与导播控制台（检录处 / 记录台）**：
  [https://felixyu9722.github.io/sinmin-sports-2026/admin.html](https://felixyu9722.github.io/sinmin-sports-2026/admin.html)
- **💻 本机记录台一键启动地址（先双击运行 `启动运动会系统.bat`）**：
  - 本机控制台：[http://localhost:8080/admin.html](http://localhost:8080/admin.html)
  - 本机 HDMI 大屏：[http://localhost:8080/tv-display.html](http://localhost:8080/tv-display.html)
  - 本机师生查分预览：[http://localhost:8080/live.html](http://localhost:8080/live.html)
  - 本机首页预览：[http://localhost:8080/index.html](http://localhost:8080/index.html)

---

## 💡 比赛当天最佳运行架构：「本地电脑控大屏 + GitHub 供手机看成绩」

这个组合是学校运动会现场**最稳妥、最实用**的架构：

1. **记录台电脑端（现场大屏 0 延迟、不怕操场断网）**：
   - 在记录台电脑上打开这三个页面（建议在项目文件夹内打开终端运行 `py -m http.server 8080`，访问 `http://localhost:8080/admin.html` 与 `tv-display.html`）。
   - 记录台主屏操作 `admin.html` 录入成绩，点击 **「↗ 新窗投屏」** 把 `tv-display.html` 拖到 HDMI 连接的电视机 / LED 大屏幕并全屏（`F11`）。
   - 两页通过浏览器本地 `BroadcastChannel` 通信，**断网也能毫秒级秒切画面、放破纪录礼花与音效**。

2. **师生手机端（通过 GitHub Pages 浏览最新成绩）**：
   - 手机扫码打开 `https://felixyu9722.github.io/sinmin-sports-2026/`。
   - **两种云端同步方式任选其一**：
     - **方案 A（最简 · GitHub Pages 直推）**：在记录台电脑 `admin.html` →「☁️ 云端同步」中填入仓库 `felixyu9722/sinmin-sports-2026` 与本地 GitHub Token，勾选「推送大屏时自动同步到 GitHub 手机端」。每次电脑点推送大屏，全校手机端 20 秒内自动刷新出最新成绩与积分榜！
     - **方案 B（Google Sheets CSV 实时同步）**：将决赛成绩表用 Google Sheets「发布到网络 → CSV」，在网页「☁️ Google Sheets 同步」填入链接即可同步。

---

## ✨ 已集成的新民中学竞赛章程与 2026 手册功能

- **四色队伍与初中/高中/公开分组**：红（1）、黄（2）、蓝（3）、青（4）；男甲=1 / 女甲=4（高中）、男乙=2 / 女乙=5（初中）、公开=0（大队拔河/大队接力）；所有号码布统一采用**白底 + 左侧实心队伍色块**，并通过学部标签区分高中与初中。
- **完整 40 项官方赛程与实赛数据**：已导入 `2026新民独中运动会手册.docx` 与 `竞赛检录表格.xlsx`（涵盖已完赛的 6 项田赛与 4 项 1500 米、60m/200m/400m 预赛晋级与决赛名单、以及 18/11 与 02/12 正日全部 40 个项目），并在页面提供「📖 运动会手册与赛程」弹窗速查各队集合地点、工委裁判与正日时间表。
- **4 位编号智能解析（章程 13、14 条）**：输入 `1101` 自动识别为红队男甲并渲染仿真白色号码布。
- **预赛晋级与决赛道次自动编排（章程 10.1.2 ~ 10.1.3）**：
  - 常规 4 道：两组各取第 1 名 + 择优 2 名 `✓ 晋级决赛`，决赛自动排入 **第 3、2、1、4 道**。
  - 60 米 6 道：两组各取第 1 名 + 择优 4 名 `✓ 晋级决赛`，决赛自动排入 **第 4、3、2、5、1、6 道**。
- **计分与并列平分（章程 10.2 ~ 10.4）**：个人决赛 `7-5-3-2-1`，团体决赛 `10-7-5-3-1`；同成绩自动平均分配所占名次分数；田赛支持 6 次试掷自动比对次佳成绩及跳高失误次数裁决。
- **缺席跨项目失格预警（章程 15.1）**：若选手在任一项目被标为 `DNS`，后续所有项目自动弹出红字失格警告。
- **奖杯与实体奖牌颁发细节（章程 9 & 10.5）**：自动统计全场总冠军杯（1 座）、四组最佳运动员奖杯（4 座，个人金牌最多者、同数共享），以及实体奖牌实领数量（个人 1 面 / 接力 5 面 / 拔河与大队接力 8 面）。
- **Excel 零后端读写**：支持直接拖入校方多表检录簿（`竞赛`、`田赛`、`跳高`、`20261116`）或标准 `.xlsx` / `.csv` 导入，赛后一键导出含 5 张统计工作表的完整归档 `.xlsx`。
- **一键打印扫码查分海报**：`admin.html` 控制台内置 `📱 扫码海报` 弹窗，一键生成指向 `live.html` 的 A4 高清扫码查分海报。

---

## 🔗 全部可点击链接总览 & 对话留档

### 1. 🌐 线上 GitHub Pages 网址（手机端 / 第二台联网电视 / 群发链接）
- 📱 **师生纯净实时查分榜（主推扫码/群发）**：[https://felixyu9722.github.io/sinmin-sports-2026/live.html](https://felixyu9722.github.io/sinmin-sports-2026/live.html)
- 🏠 **完整总览首页（主任审阅 / 各端导航入口）**：[https://felixyu9722.github.io/sinmin-sports-2026/](https://felixyu9722.github.io/sinmin-sports-2026/)
- 📺 **电视 / LED 大屏转播页（默认 `1➔3➔4➔7` 自动轮播 + 6秒云同步）**：[https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html](https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html)
- 📺 **师生端纯净大屏直播页（无导播控制条）**：[https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html?from=live](https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html?from=live)
- 🏆 **电视大屏固定「四队总积分榜」专页**：[https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html?mode=standings](https://felixyu9722.github.io/sinmin-sports-2026/tv-display.html?mode=standings)
- 🎛️ **线上成绩录入与导播控制台**：[https://felixyu9722.github.io/sinmin-sports-2026/admin.html](https://felixyu9722.github.io/sinmin-sports-2026/admin.html)
- 📝 **线上查看完整对话留档（GitHub）**：[https://github.com/felixyu9722/sinmin-sports-2026/blob/main/PROJECT_RECORD.md](https://github.com/felixyu9722/sinmin-sports-2026/blob/main/PROJECT_RECORD.md)
- 📦 **GitHub 代码仓库主页**：[https://github.com/felixyu9722/sinmin-sports-2026](https://github.com/felixyu9722/sinmin-sports-2026)

### 2. 💻 本机记录台零延迟网址（先双击运行 `启动运动会系统.bat` 后点击打开）
- 🎛️ **本机记录台与导播控制台（免 Token 自动云同步）**：[http://localhost:8080/admin.html](http://localhost:8080/admin.html)
- 📺 **本机 HDMI 电视大屏页（0 秒即时联动）**：[http://localhost:8080/tv-display.html](http://localhost:8080/tv-display.html)
- 📱 **本机预览师生纯净查分榜**：[http://localhost:8080/live.html](http://localhost:8080/live.html)
- 🏠 **本机预览完整总览首页**：[http://localhost:8080/index.html](http://localhost:8080/index.html)

### 3. 📁 本地核心项目文件与对话留档（编辑器按住 `Ctrl + 点击` 即可打开）
- 📝 **[PROJECT_RECORD.md](./PROJECT_RECORD.md)** — **项目完整开发决策、赛果快照与对话留档**
- 📱 **[live.html](./live.html)** — 纯净师生实时查分榜（无后台操作按钮，自动每 20 秒拉取云端赛果）
- 🏠 **[index.html](./index.html)** — 公开成绩查询与四色总积分榜（主任预览与管理员工具入口）
- 📺 **[tv-display.html](./tv-display.html)** — 决赛现场大屏幕投影页（7 大模式、自动轮播、礼花、跑马灯与学生肖像）
- 🎛️ **[admin.html](./admin.html)** — 现场成绩录入与导播控制台（面板拖拽调宽、远程轮播控制、一键推屏与扫码海报）
- ⚙️ **[js/core.js](./js/core.js)** — 新民独立中学章程核心规则引擎、手册速查数据、SheetJS 读写、主题曲播放器与云端同步模块
- 🎨 **[css/style.css](./css/style.css)** — 深色广播级科技感主题、白底色块号码布样式与手机窄屏适配
- 📊 **[data/live-state.json](./data/live-state.json)** — 云端实时赛事数据快照（含官方 40 项赛程与已赛成绩）
- 🚀 **[local_server.py](./local_server.py)** & **[启动运动会系统.bat](./启动运动会系统.bat)** — 本机一键启动服务与免 Token 自动 GitHub 云同步脚本
- 🎵 **[MP3/](./MP3/)** — 运动会原创主题曲《新民少年・勇往直前》（4～7 号无损调音背景音乐）
- 🏫 **[Sin Min Logo.png](./Sin Min Logo.png)** — 亚罗士打新民独立中学校徽
