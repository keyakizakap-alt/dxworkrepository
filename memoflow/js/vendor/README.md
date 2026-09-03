# vendor/

`supabase.js` は [`@supabase/supabase-js`](https://github.com/supabase/supabase-js)
v2.115.0 の UMD ビルド（`dist/umd/supabase.js`）をそのまま同梱したものです。
MITライセンス（`supabase-js.LICENSE` 参照）。npmレジストリから取得しており、
改変は行っていません。ブラウザ上で `window.supabase.createClient(...)` として使えます。

更新する場合:
```
npm pack @supabase/supabase-js@<version>
tar xf supabase-supabase-js-*.tgz
cp package/dist/umd/supabase.js  memoflow/js/vendor/supabase.js
cp package/LICENSE               memoflow/js/vendor/supabase-js.LICENSE
```
