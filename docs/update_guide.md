# ソースコード変更の反映・リリース手順

ローカルで修正したコードをGitに反映し、Linuxサーバーで最新化する手順です。

## 1. ローカル環境（Windows）での操作

開発環境で変更内容をコミットし、GitHub（リモートリポジトリ）へプッシュします。

```bash
# 変更内容をステージングへ追加（すべての変更対象）
git add .

# メッセージを添えてコミット（例: "バグ修正", "機能追加" など）
git commit -m "修正内容のコメント"

# リモートリポジトリへ反映
git push origin main
```

## 2. Linuxサーバー環境での操作

サーバーにSSH接続し、変更を取り込みます。

```bash
# プロジェクトフォルダへ移動（例）
cd ~/tweet-bot

# 最新コードを取得
git pull origin main

# もしpackage.json（依存ライブラリ）に変更があった場合のみ実行
npm install

# PM2で起動中のプロセスを再起動して反映
pm2 restart tweet-bot-hantairi
```

これで最新のコードがサーバー上で稼働します。
