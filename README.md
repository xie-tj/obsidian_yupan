# OBSIDIAN · 驭盘

> A 股模拟交易与复盘训练 Web 应用 —— 深色玻璃拟物 + WebGL 3D 流体 + 全弹簧动效。
> 盲盒隐藏个股身份，凭走势练买卖，按 A 股规则全真撮合。

## ✨ 功能

- **日线盲盒**：随机历史日 K（隐藏代码 / 日期），播放·暂停·步进推演；走完一局揭晓身份，并对比「你的操作 vs 买入持有 vs 理论最佳」，战绩持久留存。
- **分时 T+0**：还原 9:30–11:30 / 13:00–15:00 分时，底仓日内回转练差价。
- **A 股全真规则**：T+1、主板 ±10% / 创业·科创 ±20% 涨跌停撮合、佣金 + 印花税 + 过户费精算。
- **可定制指标**：主图 MA / EMA / BOLL（互斥），副图 0~4 个窗格自由组合 MACD / KDJ / RSI / WR / BIAS / CCI，参数与布局持久化。
- **极客交互**：账户盈亏驱动 3D 流体情绪（盈利青蓝 / 回撤赤橙）、弹簧物理动效、默认全仓进出、刷新自动续局。

## 🚀 快速开始

```bash
npm install
npm run dev      # 启动开发服务器 → http://localhost:5173
npm run build    # 生产构建，产物输出至 dist/
```

> 默认使用拟真合成行情（含隔夜跳空、连板延续、量价耦合）。
> 想接真实历史：把日线 CSV 放进 `public/data/` 并登记 `manifest.json`，详见 [public/data/README.md](public/data/README.md)。

## ⌨️ 快捷键

`空格` 播放 / 暂停 · `→` 步进 · `B` 买入 · `S` 卖出 · `N` 新盲盒

## 🛠 技术栈

React 18 · TypeScript · Vite · Three.js / React Three Fiber · Framer Motion · TradingView Lightweight Charts v5 · Zustand · Tailwind CSS

## 📁 结构

```
src/
├─ core/        # 纯逻辑：撮合引擎(T+1/涨跌停/费用) · 行情合成 · 指标计算 · 真实数据加载
├─ store/       # Zustand：交易 / 指标 / 下单 / 战绩
├─ three/       # WebGL 3D 流体背景（情绪映射）
├─ charts/      # 日 K（Lightweight Charts）· 分时（Canvas）
├─ components/  # 玻璃面板 · 弹簧买卖按钮 · 指标面板 · 结算揭晓 · 引导
└─ modules/     # 日线盲盒 · 分时训练
```
