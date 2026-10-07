# 网申助手 · Application Assistant

用于 Chrome / Edge 的本地网申填写扩展。自行导入材料，核对后通过网页右侧面板复制、光标插入或批量填写。

![右侧悬浮面板预览](demo/新版界面预览.png)

## 下载与安装

1. 打开 [Releases 下载页](https://github.com/keyingdm/application-assistant/releases/latest)，下载 Assets 中的 `chrome-edge-extension-v0.2.0.zip`，解压到固定文件夹。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启开发者模式，点击“加载已解压的扩展程序”，选择解压后包含 `manifest.json` 的文件夹。
4. 在浏览器工具栏固定“网申助手”。打开网申网页，点击图标即可打开右侧面板。

Releases 同时提供更新说明与 `SHA256SUMS.txt` 校验文件。也可以下载[仓库内的 v0.2.0 安装包](网申助手_通用插件_v0.2.0.zip)，或使用 **Code → Download ZIP** 下载整个项目，解压后加载 `extension` 文件夹。插件正常使用无需 Node.js、Python 或构建命令。

## 功能

- **空资料库开始**：使用者自行选择文件，不预装个人资料。
- **本机材料提取**：支持 DOCX、文字 PDF、TXT / MD、JSON、图片，以及扫描 PDF 的中英 OCR。识别草稿经人工核对后保存。
- **右侧可折叠面板**：搜索、分类、复制、编辑、替换字段、光标插入和撤销。
- **识别后批量填写**：检查字段对应关系与预览后填写；已有内容默认保留，敏感字段逐项核对。
- **网申栏目**：个人资料、教育、项目、校园、工作、证书、家庭、成果、奖惩、爱好评价、资格声明和考试城市。
- **求职管理**：岗位资料版本、手动投递记录与本地附件库。
- **自带 API Key 的 AI 精简**：自行配置兼容 Chat Completions 的服务，只发送工作区中的一段文字；先预览，再手动采用。

## 数据与权限

资料保存在本机浏览器的扩展存储中，附件保存在本地 IndexedDB；解析与 OCR 的程序、模型均随安装包提供。AI Key 默认仅保存在浏览器会话中，主动选择记住时才在本机持久保存，不进入资料 JSON 备份。

扩展使用 `activeTab`、`scripting`、`storage`。配置 AI 时单独请求所选服务域名的访问权限。网页最终保存 / 提交、登录、验证码与附件选择由使用者操作。

本仓库包含通用程序与虚构演示，不包含个人简历、个人资料库、API Key、浏览器配置或本机日志。

## 兼容范围

适用于桌面 Chrome / Edge（Chromium 128 及以上）。原生输入框、下拉框、单选框和部分同源 iframe 可识别；复杂学校 / 省市联动、日期弹窗、跨域 iframe 等可能需要复制后手动处理。OCR 和规则识别结果需要核对。

56 项本地检查已通过，包括材料解析、图片 / 扫描 PDF OCR、真实扩展链路和本机模拟 AI。实际招聘网站控件及具体模型服务仍需实际使用验证。

## 文档

- [安装、导入与使用说明](使用说明.md)
- [v0.2 更新说明](更新说明_v0.2.md)
- [验证记录](验证记录.md)
- [第三方依赖与许可证](extension/THIRD_PARTY.md)

## 本地演示

已安装 Python 时，双击 `启动演示.cmd`，打开 `http://127.0.0.1:8088/demo/v2.html`。首次为空，可点击“加载虚构示例资料”体验；演示资料库与已安装插件分开。

也可以在项目目录运行：

```powershell
python tools/serve_demo.py --port 8088
```

## 开发与打包

测试需要 Node.js、Python 和桌面 Edge。`BROWSER_PATH` 可用于指定其他 Chromium 浏览器（部分界面检查默认使用 Windows Edge）。

```powershell
npm install
npm test
npm run test:browser
npm run test:extension
npm run test:v2
npm run test:demo
python tools/package_extension.py
```

`extension/vendor` 内提供本地解析和 OCR 依赖；`extension/vendor/SHA256.json` 记录文件哈希。打包脚本仅打包 `extension`，不会包含测试、演示或任何用户资料。
