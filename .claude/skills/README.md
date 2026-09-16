# 共通スキル

このディレクトリのスキルは、以下7リポジトリで**同一内容**を維持している共通スキルです。
1つだけを編集せず、変更時は7リポジトリすべてに反映してください。

- keyakizakap-alt/game-apps
- keyakizakap-alt/daily-useful-tools
- keyakizakap-alt/web-sites
- keyakizakap-alt/dxworkrepository
- keyakizakap-alt/kouritsu-apps
- keyakizakap-alt/app_oshikatsu
- keyakizakap-alt/syakai-hackathon

## 一覧

| スキル | 用途 | 発動タイミング |
|---|---|---|
| `brainstorming` | 要望を質問で具体化し、設計を承認してもらってから実装に入る | 何かを**作り始める前**／既存の振る舞いを変える前 |
| `writing-plans` | 承認済み設計を、2〜5分粒度の実装計画に落とす | 承認済み設計があり、**コードに触れる前** |
| `executing-plans` | 計画をタスク単位で実装し、検証とコミットを回す | 実装計画書がある状態 |
| `test-driven-development` | 先にテストを書き、失敗を見てから実装する | **実装コードを書く前**（毎回） |
| `systematic-debugging` | 根本原因を特定してから直す4フェーズ手順 | バグ・テスト失敗・CI失敗に遭遇し、**修正案を出す前** |
| `verification-before-completion` | 主張の根拠となるコマンドを実行してから報告する | 「完了」「直った」と言う前／コミット・PR の前 |
| `review-triage` | レビュー指摘のトリアージと沼（修正→再指摘ループ）の回避 | レビュー指摘を受けて**修正に着手する前** |

## 使い分け（典型的な流れ）

```
作りたいものがある
  └ brainstorming        ── 質問 → 設計 → 承認（ここを飛ばさない）
      ├ Spike / Bounded  ── 承認後そのまま実装へ
      └ Architectural
          └ writing-plans        ── docs/plans/ に計画
              └ executing-plans  ── タスク単位で実装
                  ├ test-driven-development      ── 各実装ステップで
                  ├ systematic-debugging         ── 失敗に当たったら
                  └ verification-before-completion ── 完了と言う前に
                      └ review-triage            ── 指摘が返ってきたら
```

## 原則（スキル横断で共通している考え方）

1. **主張の前に証拠。** 実行していないコマンドの結果を語らない
2. **修正の前に原因。** 症状を潰すのは失敗である
3. **実装の前に承認。** 設計の長さは変わるが、承認ゲートは変わらない
4. **指摘された「問題」は信じる。指摘された「修正方法」は仮説として扱う**
5. **同じテーマが3周したら止めて人間に聞く**（レビュー・デバッグとも）

## 出典とライセンス

`brainstorming` / `writing-plans` / `executing-plans` / `test-driven-development` /
`systematic-debugging` / `verification-before-completion` は、
[obra/superpowers](https://github.com/obra/superpowers)（MIT License, Copyright (c) Jesse Vincent）の
同名スキルを日本語化し、本リポジトリ群の運用に合わせて改変したものです。各 SKILL.md の末尾に出典を記載しています。

本家から**意図的に取り込んでいないもの**と理由:

| 本家スキル | 見送った理由 |
|---|---|
| `using-git-worktrees` | 本環境はリポジトリごとに指定ブランチで作業する運用。worktree は摩擦のみ増える |
| `finishing-a-development-branch` | マージ／PR の判断フローが本環境のブランチ・ドラフトPR運用と衝突する |
| `receiving-code-review` | 既存の `review-triage` と重複。ループ検知を持つ `review-triage` のほうが強い |
| `dispatching-parallel-agents` / `subagent-driven-development` | 本環境ではサブエージェントの多用を抑制している |
| `writing-skills` | `skill-creator` スキルと重複 |
| `using-superpowers` | プラグインのセッション開始フック前提。代わりに各リポジトリの `CLAUDE.md` に起動ルールを置いた |
| brainstorming の visual companion | Node サーバの常駐とテレメトリを伴うため除外 |
