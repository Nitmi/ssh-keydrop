# SSH Keydrop

把自己的 SSH 公钥部署成一个短网址，在新设备上用一条命令为当前用户配置密钥登录。

```sh
curl -fsSL https://ssh.example.com | sh
```

每个部署独立配置公钥。无需改源码、无需数据库，不依赖任何默认账户、域名或 GitHub 公钥源。

## 项目定位：在服务器侧快速配置密钥登录

SSH Keydrop 适合你已经通过云厂商控制台、管理终端、串口或其他方式进入设备，需要为当前账户添加自己的 SSH 公钥的场景。安装命令在作为 SSH 服务器的目标设备上执行；用于登录的私钥保留在自己的客户端上。

它与 `ssh-copy-id` 都会将公钥添加到服务器上目标用户的 `~/.ssh/authorized_keys`，区别在于操作从哪一侧发起：

| 方式 | 在哪里执行 | 适合的场景 |
| --- | --- | --- |
| SSH Keydrop：`curl … \| sh` | SSH 服务器上 | 已进入新设备的控制台或管理终端，快速安装服务中配置好的公钥 |
| `ssh-copy-id user@server` | SSH 客户端上 | 已能通过密码或其他方式 SSH 登录服务器，将客户端的公钥复制过去 |

例如，在自己的电脑上执行：

```sh
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server
```

`ssh-copy-id` 会通过 SSH 连接服务器，将指定公钥添加到远端用户的授权文件中；首次配置通常需要输入服务器的登录密码。SSH Keydrop 则通过你在服务器上已有的终端访问权限完成配置，无需先从客户端建立 SSH 连接。

刚开好的云服务器、通过串口进入的设备，以及已经打开管理终端的机器，都适合使用 SSH Keydrop。完成公钥安装后，密钥登录仍需要目标设备的 SSH 服务正常运行，并允许该账户使用公钥认证。

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

无需购买域名。想进一步缩短网址，可在 Worker 的 **Settings → Domains & Routes → Add → Custom Domain** 添加自己托管在 Cloudflare 的域名。

Cloudflare 的官方按钮要求源仓库公开；会创建使用者自己的仓库副本并通过 Workers Builds 部署。仓库用 `.dev.vars.example` 声明需要填写的字段，用 `package.json` 给出字段说明。`wrangler.jsonc` 仅供官方按钮读取模板元数据，日常开发、构建和部署均使用 `cf` CLI 与 `cloudflare.config.ts`。

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

支持 Ed25519、RSA 和 ECDSA。可以包含公钥尾部注释；服务会移除注释并合并重复公钥。不接受私钥或 `authorized_keys` 选项。不要粘贴 `BEGIN OPENSSH PRIVATE KEY` 等私钥内容。

部署后可以通过 `/keys` 核对实际提供的公钥：

```sh
curl -fsSLo public-keys.txt https://ssh.example.com/keys
ssh-keygen -lf public-keys.txt
```

公钥会通过 `/keys` 和安装脚本公开。将其配置成 Cloudflare Secret 只是为了方便部署和修改，公钥本身并不保密。仓库内的样例仅用于测试，不作为部署默认值。

### 后续更新

打开 Worker 的 **Settings → Variables and Secrets**，修改 `SSH_PUBLIC_KEYS` 并保存部署。服务会使用新的运行时配置，无需修改源码或重新发布源仓库。

新配置只影响以后下载安装脚本的设备。已安装设备不会自动同步，也不会自动撤销旧密钥；撤销权限需要从各设备的 `authorized_keys` 中移除对应条目。

## 安装与接口

快速安装：

```sh
curl -fsSL https://ssh.example.com | sh
```

也可以先查看脚本再执行：

```sh
curl -fsSLo install-ssh.sh https://ssh.example.com
cat install-ssh.sh
sh install-ssh.sh
```

| 路径 | 返回内容 |
| --- | --- |
| `/`、`/install.sh` | 包含本次部署所配置公钥的安装脚本 |
| `/keys` | OpenSSH 公钥，每行一把 |

支持 GET / HEAD。未知路径返回 404，其他请求方法返回 405；缺失或非法配置返回 503，不提供安装脚本。公钥和脚本禁用缓存。

安装脚本会创建当前用户的 `~/.ssh`，设置目录权限 `700`、授权文件权限 `600`，验证所有公钥后只追加缺失项。重复运行不会重复添加，已有注释和密钥限制会保留。它还处理文件末尾缺少换行的情况，并拒绝 `.ssh` 或 `authorized_keys` 为符号链接。

目标设备需要 POSIX `sh`、`ssh-keygen`、`awk`、`mktemp` 和基础文件工具，适用于 Linux/macOS。Windows PowerShell 不直接运行这条安装命令。命令为**执行它的当前用户**授权；以 root 执行就是授权 root。脚本不安装或启动 SSH 服务，不修改 `sshd_config`，不关闭密码登录。

目录锁只协调本工具，运行时请避免其他程序同时写入授权文件。若意外断电留下 `~/.ssh/.ssh-keydrop.lock`，确认没有安装进程后手动移除该空目录。

## 本地开发

需要 Node.js 24 与 npm：

```sh
npm ci
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，将 SSH_PUBLIC_KEYS 设置为自己的公钥。
npm run dev
```

本地配置示例（将占位内容替换成完整公钥）：

```dotenv
SSH_PUBLIC_KEYS="ssh-ed25519 YOUR_COMPLETE_PUBLIC_KEY"
```

`.dev.vars` 被 Git 忽略。运行测试不需要配置真实公钥：

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

`.dev.vars` 只用于本地开发，不自动上传。首次 CLI 部署可使用 Cloudflare 控制台设置运行时 `SSH_PUBLIC_KEYS`，然后保存部署；未配置前服务返回 503。高级用户也可通过 `cf deploy --secrets-file <file>` 上传一个含 `SSH_PUBLIC_KEYS` 的本地 JSON 文件。不要提交该文件，不要上传私钥。

Worker 默认名称为 `ssh-keydrop`，不指定账户或域名。`cloudflare.config.ts` 从 `wrangler.jsonc` 读取名称和兼容日期，因此官方按钮对 Worker 名称的修改也会用于 `cf` 部署。手动改名请编辑 `wrangler.jsonc` 的 `name`。如果需要在同一账户创建多个服务，请使用不同 Worker 名称。没有付费存储绑定。

## 发布和贡献

发布新模板仓库前，设置正式的仓库地址：

```sh
npm run prepare:release -- https://github.com/OWNER/REPOSITORY
npm install --package-lock-only
```

该命令只生成部署按钮链接及仓库元数据，不执行发布。仓库地址仅用于克隆模板，不参与运行时公钥来源或授权。将项目发布为公开仓库后，按钮才能让其他人克隆部署。

测试在临时 HOME 下执行，不修改测试执行者的真实 SSH 配置。Linux/macOS CI 检查权限和符号链接；Windows 可通过 Git Bash 执行其余测试，`BASH_PATH` 可指定 Shell。欢迎提交 Issue / Pull Request，行为变更请补充测试及文档。

使用自己的域名和 Cloudflare 账户提供脚本，并保护它们的访问权限：执行 `curl | sh` 会信任服务提供的脚本，并授予公钥持有者访问当前账户的能力。

MIT License.
