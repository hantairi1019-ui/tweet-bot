# Linuxサーバーへのデプロイ手順

まだNode.jsがインストールされていないLinuxサーバー（Ubuntu/Debian系を想定）でのセットアップ手順です。

## 前提条件
- サーバーにSSH接続できること
- `sudo` 権限があること

## 手順概要
1. Node.js のインストール
2. プロジェクトファイルの配置
3. 依存パッケージとブラウザのインストール
4. 定期実行設定 (PM2 または cron)

---

## 1. Node.js のインストール

最新のLTS（推奨版）をインストールします。

```bash
# curlのインストール（無い場合）
sudo apt update
sudo apt install -y curl

# NodeSourceからNode.js (LTS版) をセットアップ
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -

# Node.jsのインストール
sudo apt install -y nodejs

# バージョン確認
node -v
npm -v
```

## 2. プロジェクトファイルの配置

サーバー上の任意のディレクトリ（例: `/opt/tweet-bot` や `~/tweet-bot`）を作成し、プロジェクトファイルを配置します。方法は「Git経由」と「ファイルアップロード」の2通りあります。

### A. Git経由で配置する（推奨）

ソースコード管理がしやすいため、Gitの利用を推奨します。

1. **ローカル環境（Windows）でGitリポジトリ作成**
   ```bash
   # プロジェクトルートで実行
   git init
   git add .
   git commit -m "Initial commit"
   
   # GitHubなどで空のリポジトリを作成し、リモート追加（URLは自身のリポジトリに合わせてください）
   git remote add origin https://github.com/your-username/tweet-bot.git
   git push -u origin main
   ```

2. **サーバー環境（Linux）でClone**
   ```bash
   # gitコマンドがない場合はインストール
   sudo apt install -y git

   # ホームディレクトリなどにClone
   cd ~
   git clone https://github.com/your-username/tweet-bot.git
   cd tweet-bot
   ```

### B. ファイルアップロードで配置する

Gitを使わない場合、ローカルのファイルをFTPやSCPでアップロードします。

**アップロード必要なファイル/フォルダ:**
- `package.json`
- `package-lock.json`
- `src/` (フォルダ丸ごと)
- `tsconfig.json` (もしあれば。無ければ不要ですが、TypeScriptプロジェクトなので通常は必要です)
- `.gitignore` など

※ `node_modules` はアップロード**しないで**ください（サーバー側でインストールします）。

例（SCPコマンドの例）:
```bash
# ローカルから実行 (linux-user@your-server-ip は自身の環境に合わせてください)
scp -r package.json package-lock.json src linux-user@your-server-ip:~/tweet-bot/
```

## 3. 依存パッケージのインストール



`package.json` のあるディレクトリで実行します。

```bash
# 依存ライブラリのインストール
npm install

# Playwright用ブラウザのインストール（OS依存の依存関係も含む）
npx playwright install --with-deps chromium
```
※ `--with-deps` は、Chromiumを動かすのに必要なシステムライブラリも一緒にインストールするオプションです。

## 4. 動作確認

まずは手動でコマンドが動くか試します。

```bash
# --user オプションで自分の設定ファイルを指定してテスト
npx tsx src/index.ts like --user hantairi0505
```
エラーなく動作（ログインセッションが無いというログが出るなど）すればOKです。

## 5. 初回ログイン (ヘッドレスモードOFFが必要な場合)

通常、ログインにはGUIのあるブラウザ操作が必要です。サーバーはCUI環境（画面がない）ことが多いため、以下のどちらかの方法をとります。

### A. ローカルで作成したセッションファイルを使う（推奨）
1. ローカルPC（Windows）で `npx tsx src/index.ts login --user hantairi0505` を実行し、ログインを完了させます。
2. 作成された `src/sessions/hantairi0505.json` を、サーバーの同じパスにアップロードします。

### B. サーバー上でログイン操作（難易度高）
Xvfbなどを使って仮想ディスプレイで動かす必要がありますが、設定が複雑なため今回は **A. ローカルセッションのアップロード** を推奨します。

## 6. 定期実行の設定 (PM2 の利用を推奨)

サーバーで常駐させてスケジュール実行するには、`pm2` というツールが便利です。

```bash
# PM2のインストール
sudo npm install -g pm2

# スケジュールモードで起動
# 名前(--name)は管理しやすいものをつけます
pm2 start "npx tsx src/index.ts schedule --user hantairi0505" --name tweet-bot-hantairi
```

### PM2 管理コマンド
- ログを見る: `pm2 logs tweet-bot-hantairi`
- 停止する: `pm2 stop tweet-bot-hantairi`
- 再開する: `pm2 start tweet-bot-hantairi`
- 状態確認: `pm2 status`

以上で構築は完了です。
