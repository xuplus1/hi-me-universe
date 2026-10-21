# Hi！Me

一间以米白纸感与深蓝宇宙为视觉语言的私人书影音档案。

## 个人云端版：GitHub + Cloudflare Workers

- 代码保存在 GitHub 的 `personal-cloud` 分支。
- 使用 Cloudflare Secret 中的 `ARCHIVE_KEY` 解锁单用户私人档案。
- 登录成功后只在浏览器保存 HttpOnly、Secure、SameSite Cookie；钥匙不会写入仓库或 localStorage。
- D1 保存作品、状态、评分、逐日点亮和便签。
- R2 保存用户上传的作品封面。
- 浏览器 `localStorage` 只作为离线缓存与旧版迁移来源。
- 首次升级不会自动上传旧数据；原设备会显示迁移数量并等待确认。
- 写入使用递增 revision，避免两台设备静默覆盖彼此的新记录。

数据库迁移文件位于 `drizzle/`；服务接口为 `/api/archive` 与 `/api/covers/:id`。

部署前需要创建一个 D1 数据库、一个 R2 bucket，并通过 `wrangler secret put ARCHIVE_KEY` 设置至少 10 位的私人钥匙。

资源名称和 D1 ID 记录在 `cloudflare.resources.json` 中（资源 ID 不是密钥）。构建后的 Worker 配置位于 `dist/server/wrangler.json`。
