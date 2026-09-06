# dxworkrepository

業務効率化のためのツール・知見をまとめるリポジトリ。
現在の主コンテンツは、**Claude Code スキルの正本**（single source of truth）。

## 収録スキル

| スキル | 内容 |
|---|---|
| [`work-directives`](.claude/skills/work-directives/) | **作業を始める前に読む。** 開発で繰り返し出してきた指示 — 進め方、実行前に確認を取る操作、成果物の禁則（捏造しない・推測で埋めない）、リサーチの裏取り、アイデアの絞り込み方 |
| [`ai-product-playbook`](.claude/skills/ai-product-playbook/) | **設計を変える前に読む。** LLM を組み込んだ日本語 Web プロダクトの設計・実装・出荷の流儀 — LLM の境界、API の防御、コスト管理、品質ゲート |

どちらも CHIGIRI Beauty 系 3 本 / ニュアンス税関 / オシ・カレ / こいのかたち / 引っ越しアプリの
開発経緯から抽出したもの。前者は**どう進めるか**、後者は**何を作るか**を扱う。

各アプリのリポジトリにはスキルを複製せず、`CLAUDE.md` からここを参照する形にしている
（複製すると更新時に内容がずれるため）。

## 導入

このリポジトリで作業する場合は、`.claude/skills/` 配下が自動で読み込まれるため設定は不要。

**全プロジェクトで有効にする**場合は、ユーザースキルとして配置する。

```bash
git clone https://github.com/keyakizakap-alt/dxworkrepository.git ~/src/dxworkrepository
mkdir -p ~/.claude/skills
for s in work-directives ai-product-playbook; do
  ln -s ~/src/dxworkrepository/.claude/skills/$s ~/.claude/skills/$s
done
```

シンボリックリンクにしておくと、`git pull` した内容がそのまま反映される。
リンクを張れない環境では `cp -r` でもよい（その場合は更新のたびにコピーし直す）。

## 更新の指針

- 原則を増やすより**減らす**。実際に判断が分かれた場面だけを残す
- 一般論は書かない。**このリポジトリ群の実装に裏付けがある内容だけ**を書く
- 実装を変えたら、スキル内の「実装の正本」表の参照先も同じコミットで直す
