# SSH Keydrop

把自己的 SSH 公钥部署成一个短网址，在新设备上用一条命令为当前用户配置密钥登录。

```sh
curl -fsSL https://ssh.example.com | sh
```

## 与 ssh-copy-id 的区别

两者都向服务器上目标用户的 `~/.ssh/authorized_keys` 添加公钥，区别在于从哪一侧发起：

| 方式 | 在哪里执行 | 适合的场景 |
| --- | --- | --- |
| SSH Keydrop：`curl … \| sh` | SSH 服务器上 | 已进入新设备的控制台或管理终端，快速安装服务中配置好的公钥 |
| `ssh-copy-id user@server` | SSH 客户端上 | 已能通过密码或其他方式 SSH 登录服务器，将客户端的公钥复制过去 |

例如，在自己的电脑上执行：

```sh
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server
```

`ssh-copy-id` 通常需要输入服务器的登录密码。SSH Keydrop 适合已通过云控制台、管理终端或串口进入设备的情况。密钥登录需要服务器已运行 SSH 服务并允许公钥认证；私钥始终留在客户端。

## 一键部署

<!-- deploy-button:start -->
[![部署到 Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FOWNER%2Fssh-keydrop)
<!-- deploy-button:end -->

<!-- release-note:start -->
> 发布准备：当前按钮中的 `OWNER` 是占位符，尚不可用于克隆项目。维护者发布公开仓库前，运行 `npm run prepare:release -- https://github.com/OWNER/REPOSITORY` 生成真实按钮链接；此提示会自动删除。
<!-- release-note:end -->

1. 点击按钮，登录 Cloudflare，连接 GitHub 或 GitLab 并创建自己的仓库副本。
2. 选择 Worker 名称，在 **SSH_PUBLIC_KEYS** 配置框中粘贴自己的完整 OpenSSH **公钥**。
3. 确认构建命令为 `npm run build`，部署命令为 `npm run deploy`，开始部署。
4. 使用 Cloudflare 给出的 `https://<worker>.<account>.workers.dev` 地址替换命令中的 `https://ssh.example.com`。

想进一步缩短网址，可在 Worker 的 **Settings → Domains & Routes → Add → Custom Domain** 添加自己的域名。

## 填写公钥

通常复制本机 `~/.ssh/id_ed25519.pub` 文件的完整内容：

```sh
cat ~/.ssh/id_ed25519.pub
```

`SSH_PUBLIC_KEYS` 支持以下形式：

| 形式 | 适用情况 |
| --- | --- |
| 单行 OpenSSH 公钥 | 只授权一把密钥，直接粘贴 `.pub` 内容 |
| 每行一把公钥 | 配置框支持多行输入 |
| JSON 字符串数组 | 单行输入框中配置多把公钥 |
| 用字面的 `\n` 分隔 | 单行输入框中配置多把公钥的另一种方式 |

支持 Ed25519、RSA 和 ECDSA，可带尾部注释。请只填写公钥，不要填写私钥或 `authorized_keys` 选项。

部署后可以通过 `/keys` 核对实际提供的公钥：

```sh
curl -fsSLo public-keys.txt https://ssh.example.com/keys
ssh-keygen -lf public-keys.txt
```

配置的公钥会通过 `/keys` 和安装脚本公开。

### 后续更新

打开 Worker 的 **Settings → Variables and Secrets**，修改 `SSH_PUBLIC_KEYS` 并保存部署。

新配置只影响以后下载安装脚本的设备。已安装设备不会自动同步，也不会自动撤销旧密钥；撤销权限需要从各设备的 `authorized_keys` 中移除对应条目。

## 安装与接口

除了开头的一行命令，也可以先查看脚本再执行：

```sh
curl -fsSLo install-ssh.sh https://ssh.example.com
cat install-ssh.sh
sh install-ssh.sh
```

| 路径 | 返回内容 |
| --- | --- |
| `/`、`/install.sh` | 包含本次部署所配置公钥的安装脚本 |
| `/keys` | OpenSSH 公钥，每行一把 |

公钥配置缺失或非法时返回 503，不提供安装脚本。

安装脚本会创建当前用户的 `~/.ssh`，设置目录权限 `700`、授权文件权限 `600`，验证公钥后只追加缺失项，保留已有注释和密钥限制。

适用于 Linux/macOS，需要 POSIX `sh`、`ssh-keygen`、`awk`、`mktemp` 和基础文件工具。命令为**执行它的当前用户**授权，以 root 执行就是授权 root；不会更改 SSH 服务配置。

## 本地开发

需要 Node.js 24 与 npm：

```sh
npm ci
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，将 SSH_PUBLIC_KEYS 设置为自己的公钥。
npm run dev
```

运行检查：

```sh
npm test
npm run typecheck
npm run build
npx cf deploy --dry-run
```

CLI 部署：

```sh
npx cf auth login
npm run deploy
```

`.dev.vars` 只用于本地开发，被 Git 忽略且不会自动上传。CLI 部署后需在 Cloudflare 控制台设置 `SSH_PUBLIC_KEYS`，也可通过 `cf deploy --secrets-file <file>` 上传含该字段的本地 JSON 文件。

项目使用 `cf` CLI。`wrangler.jsonc` 供官方部署按钮识别，`cloudflare.config.ts` 从中读取 Worker 名称和兼容日期。手动改名请编辑 `wrangler.jsonc` 的 `name`。

## 发布和贡献

发布新模板仓库前，设置正式的仓库地址：

```sh
npm run prepare:release -- https://github.com/OWNER/REPOSITORY
npm install --package-lock-only
```

该命令生成部署按钮链接及仓库元数据。将仓库发布为公开后，按钮即可用于克隆部署。

测试使用临时 HOME。Linux/macOS CI 检查权限和符号链接；Windows 可通过 Git Bash 运行其余测试，`BASH_PATH` 可指定 Shell。

MIT License.
