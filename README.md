# dxworkrepository

業務効率化のためのツール・知見をまとめるリポジトリ。
現在の主コンテンツは、**Claude Code スキルの正本**（single source of truth）。

## 収録スキル

| スキル | 内容 |
|---|---|
| [`ai-product-playbook`](.claude/skills/ai-product-playbook/) | LLM を組み込んだ日本語 Web プロダクトの設計・実装・出荷の流儀。CHIGIRI Beauty 系 3 本 / ニュアンス税関 / オシ・カレ / こいのかたち / 引っ越しアプリの開発で確定した判断基準を集約したもの |

各アプリのリポジトリにはスキルを複製せず、`CLAUDE.md` からここを参照する形にしている
（複製すると更新時に内容がずれるため）。

## 導入

このリポジトリで作業する場合は、`.claude/skills/` 配下が自動で読み込まれるため設定は不要。

**全プロジェクトで有効にする**場合は、ユーザースキルとして配置する。

```bash
git clone https://github.com/keyakizakap-alt/dxworkrepository.git ~/src/dxworkrepository
mkdir -p ~/.claude/skills
ln -s ~/src/dxworkrepository/.claude/skills/ai-product-playbook ~/.claude/skills/ai-product-playbook
```

シンボリックリンクにしておくと、`git pull` した内容がそのまま反映される。
リンクを張れない環境では `cp -r` でもよい（その場合は更新のたびにコピーし直す）。

## 更新の指針

- 原則を増やすより**減らす**。実際に判断が分かれた場面だけを残す
- 一般論は書かない。**このリポジトリ群の実装に裏付けがある内容だけ**を書く
- 実装を変えたら、スキル内の「実装の正本」表の参照先も同じコミットで直す
