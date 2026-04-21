# LiveBot 后端 API 文档

## 1. 根路径接口
- **GET /** - 返回后端服务运行状态，包含服务器状态、机器人状态和时间戳
- **GET /health** - 健康检查

## 2. 认证相关接口 (`/api/auth`)
- **POST /login** - 用户登录
- **POST /register** - 用户注册
- **GET /captcha** - 生成验证码
- **GET /me** - 获取当前用户信息
- **POST /logout** - 用户登出
- **POST /login/telegram** - Telegram自动登录
- **POST /verify-password** - 验证密码

## 3. 主播管理接口 (`/api/vtbs`)
- **GET /** - 获取主播列表（支持关键字和分类筛选）
- **GET /:id** - 获取单个主播详情
- **POST /** - 添加主播
- **PUT /:id** - 更新主播信息
- **DELETE /:id** - 删除主播
- **GET /search/:keyword** - 搜索主播

## 4. 设置管理接口 (`/api/settings`)
- **GET /** - 获取所有设置
- **GET /:key** - 获取单个设置
- **POST /** - 添加或更新设置
- **DELETE /:key** - 删除设置

## 5. 日志管理接口 (`/api/logs`)
- **GET /live-history** - 获取直播历史记录
- **GET /sends** - 获取发送记录
- **GET /messages** - 获取消息记录（支持关键字和类型筛选）
- **GET /files** - 获取日志文件列表
- **GET /files/:filename** - 获取日志文件内容
- **GET /stats** - 获取统计数据（用户权限不同返回内容不同）
- **DELETE /clean** - 清理日志

## 6. 用户管理接口 (`/api/users`)
- **GET /** - 获取用户列表（仅管理员）
- **GET /:id** - 获取单个用户详情
- **POST /** - 添加用户（仅管理员）
- **PUT /:id** - 更新用户信息
- **DELETE /:id** - 删除用户（仅管理员）
- **PUT /me/password** - 修改当前用户密码

## 7. 监控接口 (`/api/monitor`)
- **GET /live** - 获取直播监控状态
- **GET /system** - 获取系统监控状态
- **GET /spider** - 获取爬虫监控状态
- **POST /start** - 启动监控（支持live、system、spider类型）
- **POST /stop** - 停止监控
- **POST /interval** - 设置监控频率
- **GET /interval** - 获取监控频率设置

## 8. 爬虫接口 (`/api/spider`)
- **GET /status** - 获取爬虫状态
- **GET /configs** - 获取爬虫配置
- **GET /logs** - 获取爬虫日志
- **POST /add** - 添加爬虫
- **DELETE /:id** - 删除爬虫
- **PUT /:id** - 更新爬虫
- **PUT /toggle/:name** - 更新爬虫状态
- **POST /start-all** - 启动所有爬虫
- **POST /stop-all** - 停止所有爬虫
- **GET /script/:site** - 获取爬虫脚本
- **POST /script** - 保存爬虫脚本
- **POST /test** - 测试爬虫脚本
- **POST /upload-to-db** - 上传脚本到数据库
- **GET /local-scripts** - 获取本地脚本列表
- **POST /add-from-local** - 从本地脚本添加爬虫

## 9. 机器人接口 (`/api/bot`)
- **GET /music/search** - 搜索音乐
- **POST /music/search** - 搜索音乐
- **GET /music/history** - 获取音乐搜索历史
- **POST /music/history/clear** - 清空音乐搜索历史
- **DELETE /music/history** - 清空音乐搜索历史
- **GET /status** - 获取机器人状态
- **POST /start** - 启动机器人（仅管理员）
- **POST /stop** - 停止机器人（仅管理员）
- **GET /search/live** - 搜索直播
- **GET /search/user** - 搜索用户
- **GET /search/content** - 搜索内容
- **GET /search/logs** - 搜索日志
- **POST /search/logs** - 搜索日志
- **GET /env** - 获取环境配置
- **GET /commands** - 获取命令列表
- **POST /commands** - 添加命令（仅管理员）
- **PUT /commands/order** - 更新命令顺序（仅管理员）
- **DELETE /commands/:command** - 删除命令（仅管理员）
- **PUT /commands/:command** - 更新命令（仅管理员）
- **GET /users** - 获取用户列表
- **POST /message/send** - 发送消息（仅管理员）
- **GET /messages** - 获取消息列表
- **GET /send-records** - 获取发送记录
- **GET /groups** - 获取群组列表
- **POST /groups** - 添加群组（仅管理员）
- **PUT /groups/:id** - 更新群组（仅管理员）
- **DELETE /groups/:id** - 删除群组（仅管理员）
- **PUT /groups/:id/disable** - 禁用/启用群组（仅管理员）
- **GET /groups/:groupId/vtbs** - 获取主播列表（用于关注主播）
- **POST /groups/:groupId/vtbs/:mid/follow** - 关注/取消关注主播
- **POST /groups/:groupId/message** - 发布消息到群组
- **POST /groups/:groupId/mute** - 禁言群成员
- **POST /groups/:groupId/unmute** - 解除禁言
- **POST /groups/:groupId/kick** - 踢人
- **POST /groups/:groupId/unban** - 解除封禁
- **GET /groups/:groupId/members/:userId** - 获取单个成员信息
- **POST /groups/:groupId/watch/disable** - 禁用群组的所有关注
- **GET /startup-records** - 获取启动记录

## 10. 工具接口 (`/api/tools`)
- **GET /tasks/status** - 获取定时任务状态（仅管理员）
- **GET /tasks/configs** - 获取定时任务配置（仅管理员）
- **GET /tasks/logs** - 获取任务执行日志（仅管理员）
- **POST /tasks/add** - 添加定时任务（仅管理员）
- **DELETE /tasks/:id** - 删除定时任务（仅管理员）
- **PUT /tasks/:id** - 更新定时任务（仅管理员）
- **POST /tasks/start-all** - 启动所有定时任务（仅管理员）
- **POST /tasks/stop-all** - 停止所有定时任务（仅管理员）
- **GET /system/status** - 获取系统状态
- **POST /system/backup** - 备份数据库（仅管理员）
- **GET /system/backup-records** - 获取备份记录（仅管理员）
- **GET /system/backup/:id** - 下载备份文件（仅管理员）
- **POST /system/cleanup-logs** - 清理日志（仅管理员）
- **POST /system/restart** - 重启服务（仅管理员）
- **GET /system/config** - 获取配置信息（仅管理员）
- **PUT /system/config** - 更新配置（仅管理员）
- **POST /system/check-proxy** - 检测代理是否可用

## 11. 配置接口 (`/api/config`)
- **GET /environments** - 获取所有环境配置
- **GET /environments/:envName** - 获取单个环境配置
- **PUT /environments/:envName** - 更新环境配置（仅管理员）
- **GET /settings** - 获取系统设置
- **PUT /settings** - 更新系统设置（仅管理员）
- **GET /sites** - 获取网站配置
- **PUT /sites/:siteType** - 更新网站配置（仅管理员）
- **GET /current-env** - 获取当前环境
- **PUT /current-env** - 更新当前环境（仅管理员）

## 12. 主播管理接口 (`/api/robot`)
- **POST /streamers** - 添加主播
- **GET /streamers** - 获取主播列表
- **GET /streamers/online** - 获取在线主播
- **DELETE /streamers/:id** - 删除主播
- **POST /parser** - 解析链接

## 13. 权限管理接口 (`/api/permission`)
- **GET /** - 获取所有模块权限配置（仅超级管理员）
- **PUT /** - 更新模块权限配置（仅超级管理员）
- **GET /user** - 获取用户可用的模块权限

## 14. 登录日志接口 (`/api/login-logs`)
- **GET /** - 获取登录日志列表（仅管理员，支持分页、用户名和状态筛选）
- **GET /me** - 获取当前用户的登录日志（支持分页）

## 15. 操作日志接口 (`/api/operation-logs`)
- **GET /** - 获取操作日志列表（仅管理员，支持分页、操作类型、目标类型和用户名筛选）
- **GET /me** - 获取当前用户的操作日志（支持分页）

## 接口特点
1. **认证机制**：大部分接口需要JWT令牌认证
2. **权限控制**：部分接口需要管理员权限
3. **数据验证**：包含详细的参数验证和错误处理
4. **日志记录**：操作日志和登录日志的记录
5. **监控功能**：系统、直播、爬虫的监控
6. **定时任务**：支持定时任务的管理和执行
7. **系统管理**：数据库备份、日志清理、服务重启等功能

## 访问方式
- **API 基础 URL**：http://localhost:3001
- **Swagger 文档**：http://localhost:3001/api-docs
- **健康检查**：http://localhost:3001/health