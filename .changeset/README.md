# Changesets

変更内容の記録とバージョン管理に [changesets](https://github.com/changesets/changesets) を使用している。

- 変更を加えた PR では `npm run changeset` を実行し、生成された Markdown をコミットする
- `main` へマージすると Release ワークフローが「Version Packages」PR を作成・更新する
- その PR をマージすると npm publish と Docker イメージの push が自動実行される

詳細は [ドキュメント](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md) 参照
