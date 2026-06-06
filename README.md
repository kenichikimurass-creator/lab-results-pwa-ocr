# 検査結果ログ PWA OCR版

病院から紙でもらった検査結果をスマホで撮影し、OCRで読み取り、検査値を時系列グラフで確認する個人用PWAです。

## 方針

- GitHub Pagesで公開できるブラウザアプリです。
- 画像はDropboxの `/LabResultApp/images` に通常のJPEGとして保存します。
- OCR結果、検査値、画像との紐づけは `/LabResultApp/data/lab-results.enc.json` に暗号化して保存します。
- 暗号化にはブラウザ標準の Web Crypto API、AES-GCM、PBKDF2 を使います。
- OCRには Tesseract.js を使います。
- グラフ表示には Recharts を使います。

## 重要な注意

画像は暗号化しません。Dropbox上で普通の画像として開けます。
そのため、Google/Dropbox等の2段階認証を有効化し、フォルダを共有しないでください。
このアプリは検査結果の整理用です。診断や治療判断は医師に確認してください。

## Dropboxアプリの作成

1. Dropbox Developers にアクセスします。
2. App Consoleで新しいアプリを作成します。
3. Scoped access を選びます。
4. App folder または Full Dropbox を選びます。個人用なら App folder 推奨です。
5. アプリ名を設定します。
6. Permissionsで次を許可します。
   - files.content.write
   - files.content.read
7. Redirect URIs に、ローカル開発用とGitHub Pages用のURLを追加します。
   - ローカル: `http://localhost:5173/`
   - GitHub Pages: `https://<ユーザー名>.github.io/<リポジトリ名>/`
8. App key を `.env.local` に設定します。

## ローカル起動

```bash
npm install
cp .env.example .env.local
# .env.local の VITE_DROPBOX_CLIENT_ID を設定
npm run dev
```

スマホから同じWi-Fiで試す場合は、起動時に表示される Network URL をスマホで開いてください。

## GitHub Pages公開

このリポジトリには GitHub Actions の `deploy.yml` を入れています。

1. GitHubに新規リポジトリを作成します。
2. このフォルダの中身をpushします。
3. GitHubリポジトリの Settings > Pages を開きます。
4. Source を GitHub Actions にします。
5. GitHubの Secrets and variables > Actions > Variables に、次を設定します。
   - `VITE_DROPBOX_CLIENT_ID`

ただし、このドラフト版の `deploy.yml` は `.env.local` を使わないため、GitHub Pagesで本番ビルドする場合は、Actionsに環境変数を渡すよう調整してください。
簡単にするなら、`vite.config.ts` と `src/dropbox.ts` の仕組みを確認した上で、GitHub Actionsに `VITE_DROPBOX_CLIENT_ID` を設定してください。

## 使い方

1. アプリを開きます。
2. Dropboxでログインします。
3. 復号パスフレーズを入力します。
4. 初回は暗号化データファイルが作成されます。
5. 登録画面で検査結果画像を撮影します。
6. OCR読取を実行します。
7. 読み取り候補を確認し、必要に応じて修正します。
8. Dropboxに保存します。
9. グラフ画面で項目を選択して時系列表示します。

## 既知の制限

- OCR精度は画像品質に左右されます。
- OCR結果からの検査値抽出は初期版の簡易ロジックです。
- 複数端末で同時編集した場合の競合解決はまだ簡易です。
- 画像のトリミング機能は未実装です。
- PDFには対応していません。

## GitHubに含めてはいけないもの

- 実際の検査画像
- 復号パスフレーズ
- `.env.local`
- Dropboxの秘密情報

