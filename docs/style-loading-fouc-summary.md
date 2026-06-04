# 首页样式加载问题总结

## 背景

首页在本地和服务器打开时，会短暂出现约 0.5 秒的无样式状态。表现为导航、图标、首页文案和输入框先按浏览器默认样式竖向展示，随后页面样式恢复。

## 根因

首屏关键样式原来写在 `styled-jsx` 中：

- `src/components/Navbar.tsx`：导航栏布局、按钮、移动端菜单样式
- `src/components/HomeClient.tsx`：首页 hero、搜索卡片、功能卡片、公开笔记、FAQ、快捷入口样式

Next.js 服务端渲染会先输出 HTML 结构，但这些 `styled-jsx` 样式在当前 Next.js 16 / Turbopack 开发与构建链路下没有作为首屏阻塞 CSS 直接出现在初始 HTML 中，而是依赖客户端 JS/hydration 后注入。

因此浏览器加载顺序变成：

1. 收到 SSR HTML，页面内容先出现；
2. 根全局 CSS 加载，但缺少导航和首页主体的关键规则；
3. 客户端 JS 执行后注入 `styled-jsx` 样式；
4. 页面恢复正常样式。

这个时间差就是无样式闪烁，也就是 FOUC（Flash of Unstyled Content）。

## 为什么修复过程中出现“样式加载不出来”

第一次修复时，已经把 `Navbar` 和 `HomeClient` 的 `styled-jsx` 样式移到了 `src/app/globals.css`，并移除了组件内的 `style jsx`。

生产构建验证是正常的，构建后的 CSS chunk 已包含：

- `.navbar`
- `.home-page`
- `.home-hero`

但本地 `next dev` 进程仍在返回 `.next/dev` 里的旧 CSS 缓存。旧 CSS 没有新移入的首页样式，而组件里的 `styled-jsx` 又已经移除，所以本地页面变成了持续无样式。

处理方式：

1. 停止旧的本地 dev 进程；
2. 删除 `.next/dev`；
3. 重新启动 `npm run dev:local`；
4. 再次确认 `localhost:3300` 返回的 CSS 中已经包含 `.navbar`、`.home-page`、`.home-hero`。

## 最终修复

已将首屏关键样式从运行时注入改为全局 CSS 首屏加载：

- `src/components/Navbar.tsx`
  - 移除导航栏 `styled-jsx`
  - 保留原有 className 结构

- `src/components/HomeClient.tsx`
  - 移除首页主体 `styled-jsx`
  - 保留原有 className 结构

- `src/app/globals.css`
  - 新增 `NAVBAR CRITICAL STYLES`
  - 新增 `HOMEPAGE CRITICAL STYLES`
  - 这些规则会随根布局的全局 CSS 文件加载，不再等待客户端 JS 注入

## 验证结果

已执行：

```bash
npx eslint src/components/Navbar.tsx src/components/HomeClient.tsx
npm run build
```

结果：

- ESLint 无错误，仅有一个既有的 `<img>` 性能 warning；
- 生产构建通过；
- 首页初始 HTML 不再包含原先的 `jsx-...` 组件样式类；
- 本地 dev CSS 清缓存重启后，`localhost:3300/_next/static/chunks/src_app_globals_*.css` 已包含首屏样式规则。

## 后续建议

首屏和公共布局样式不要再放进 `styled-jsx`，优先放到以下位置：

- `src/app/globals.css`：导航、首页、公共 footer、全局组件主题等首屏或跨页面样式；
- CSS Module：页面级但需要 SSR 首屏稳定输出的样式；
- Tailwind / shadcn class：简单布局与组件状态。

`styled-jsx` 适合低优先级、非首屏、不会影响页面结构稳定性的局部样式。对于导航、首页 hero、主布局这类首屏关键区域，继续使用 `styled-jsx` 容易再次引入无样式闪烁。

如果本地修改全局 CSS 后浏览器仍显示旧样式，优先检查：

```bash
rm -rf .next/dev
npm run dev:local
```

这只清理本地开发缓存，不影响源码、数据库或生产构建。
