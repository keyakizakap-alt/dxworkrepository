/**
 * OrcaRouter 知識ベース（単一の真実の源）
 *
 * このファイルがチャットボットのシステムプロンプトと docs/orcarouter-research.md の
 * 両方の元データになる。内容を更新したら必ず以下を実行してドキュメントを再生成すること:
 *
 *   node tools/orcarouter-chat/scripts/build-docs.mjs
 *
 * 全レコードに sources（出典URL）と confidence（確度）を必須で持たせている。
 * confidence の意味:
 *   official      … OrcaRouter 公式サイト / 公式ドキュメントの記載
 *   press-release … 提供元が配信したプレスリリース（PR TIMES 等）
 *   vendor-claim  … 提供元の主張する数値（独立検証されていない）
 *   third-party   … 第三者のベンチマーク / ドキュメント / OSS リポジトリ
 *   unverified    … 出典が間接的で一次情報での確認が必要
 */

window.ORCA_KB = {
  meta: {
    title: 'OrcaRouter 調査ノート',
    subject: 'OrcaRouter（アダプティブLLMルーティング・AIゲートウェイ）',
    updatedAt: '2026-08-08',
    researchNotes: [
      '本知識ベースは 2026-08-08 時点の Web 調査に基づく。',
      '調査環境のネットワークポリシーにより www.orcarouter.ai および docs.orcarouter.ai への直接アクセスができなかったため、内容はプレスリリース（PR TIMES 配信）・報道記事・GitHub（OrcaRouter-Lite の README は取得成功）・Promptfoo / Apify / LibreChat 等の第三者ドキュメントから再構成している。',
      '記載の数値の多くは提供元の公表値であり、独立した検証を経ていない。導入判断の前に必ず一次情報（公式サイト・公式ドキュメント・提供元への直接確認）と、自社ワークロードでの PoC 実測で裏を取ること。',
      '公開情報の範囲では「個社名を明かした顧客導入事例」は確認できなかった。本ノートの「事例」は主に Dify / Cursor Directory / Codex CLI / MCP クライアント等のエコシステム採用事例である。'
    ]
  },

  overview: {
    summary:
      'OrcaRouter は OpenAI 互換のインターフェースを持つ AI ゲートウェイ。200 以上の LLM を「1 エンドポイント・1 API キー・1 請求」に集約し、プロンプトごとに難易度を判定して最適なモデルへ自動的に振り分ける「アダプティブルーティング」により、出力品質を保ちながら推論コストを削減することを主眼に置く。ルーティングだけでなく、ガードレール・エージェントファイアウォール・可観測性・ガバナンスをゲートウェイという同一ホップ上で提供する点を、単純なモデルアグリゲータとの差別化として打ち出している。',
    facts: [
      {
        label: '開発元',
        value: 'Continuum AI（本社：米国）。次世代 AI インフラを開発する研究機関と説明される。GitHub Organization は Continuum-AI-Corp。',
        confidence: 'press-release',
        sources: [
          { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' },
          { title: 'Continuum AI · GitHub', url: 'https://github.com/Continuum-AI-Corp' }
        ]
      },
      {
        label: '日本での提供体制',
        value: 'FlashLabs 株式会社が Continuum AI と日本独占ディストリビューション提携を結び、日本市場向けに提供。円建て請求と日本語サポートを用意する。FlashLabs は東京都千代田区に本社を置く AI 応用研究所で、代表取締役は細井洋一。営業・カスタマーエクスペリエンスの自動化／自律化を掲げる。',
        confidence: 'press-release',
        sources: [
          { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' },
          { title: 'AI推論コスト最大70%削減──OrcaRouter が日本上陸（銀座経済新聞）', url: 'https://ginza.keizai.biz/release/580948/' }
        ]
      },
      {
        label: '注意：記事による主語の揺れ',
        value: '報道記事では「FlashLabs の OrcaRouter」と書かれることが多いが、プロダクトの開発元は Continuum AI、FlashLabs は日本独占ディストリビューターという関係。契約先・サポート窓口・データ処理者が誰になるかは導入時に必ず確認すべき論点。',
        confidence: 'unverified',
        sources: [
          { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' },
          { title: 'FlashLabs の OrcaRouter が RouterArena で第2位（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4534' }
        ]
      },
      {
        label: '公式サイト',
        value: 'https://www.orcarouter.ai/ （料金は /pricing、モデル比較は /ja/compare、ドキュメントは docs.orcarouter.ai）',
        confidence: 'official',
        sources: [
          { title: 'OrcaRouter 公式サイト', url: 'https://www.orcarouter.ai/' },
          { title: 'OrcaRouter 料金ページ', url: 'https://www.orcarouter.ai/pricing' }
        ]
      },
      {
        label: 'API エンドポイント',
        value: 'Base URL は https://api.orcarouter.ai/v1 。OpenAI 互換のため、既存の OpenAI SDK コードは base_url と API キーの差し替えだけで動作する。API キーは sk-orca- で始まる。',
        confidence: 'third-party',
        sources: [
          { title: 'OrcaRouter | Promptfoo', url: 'https://www.promptfoo.dev/docs/providers/orcarouter/' },
          { title: 'OpenCode 連携 - OrcaRouter Docs', url: 'https://docs.orcarouter.ai/integrations/opencode' }
        ]
      },
      {
        label: '自動ルーティングの指定方法',
        value: 'モデル名に orcarouter/auto を指定すると、実モデルではなく「仮想ルーター」が選択され、リクエストごとに OrcaRouter がアップストリームを選ぶ。エンドポイントは通常どおり /chat/completions。ワークスペースごとに自動ルーターが生成される。',
        confidence: 'third-party',
        sources: [
          { title: 'OrcaRouter | Promptfoo', url: 'https://www.promptfoo.dev/docs/providers/orcarouter/' }
        ]
      },
      {
        label: '対応モデル数',
        value: 'OpenAI・Anthropic・Google・xAI・DeepSeek・Mistral など 15 以上のプロバイダから 200 を超えるモデル。Claude Opus 4.8、GPT-5.5 Pro、Gemini 3.5、DeepSeek V4 Pro、Qwen3.6 Plus などが挙げられている。',
        confidence: 'press-release',
        sources: [
          { title: 'OrcaRouter が Dify Marketplace に登場（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000034.000138449.html' },
          { title: 'FlashLabs、OrcaRouter で Claude Opus 4.8 API の提供を開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000037_000138449/' }
        ]
      }
    ]
  },

  features: [
    {
      name: 'アダプティブルーティング',
      description:
        'プロンプトごとに難易度を自動判定し、高度な推論を要するリクエストはフロンティアモデルへ、定型処理は高性能なオープンモデルへ振り分ける。これが OrcaRouter の中核機能であり、コスト削減の主要な源泉。',
      details: [
        'Embedding 強化 LinUCB コンテキスト・バンディットアルゴリズムを採用し、リクエストの結果から継続的に学習する。',
        '特定のプロンプト群で成果が悪いモデルには自動的に振り分けを減らす。',
        'ワークスペース単位でルーティング方針を選択できる（cheapest / fastest / quality / balanced）。orcarouter/auto を使えば OrcaRouter がリクエストごとに調整し続ける。'
      ],
      confidence: 'press-release',
      sources: [
        { title: 'FlashLabs、OrcaRouter 研究論文を公開 ― RouterArena で第2位', url: 'https://prtimes.jp/main/html/rd/p/000000040.000138449.html' },
        { title: 'FlashLabs が提供する OrcaRouter（VOIX）', url: 'https://voix.jp/business-cards/flashlabs-orcarouter-ai-cost-reduction/' },
        { title: 'OrcaRouter 公式サイト', url: 'https://www.orcarouter.ai/' }
      ]
    },
    {
      name: 'ルーティングのレイテンシ',
      description:
        'プロンプトの難易度判定（グレーディング）は 1 ミリ秒未満、ゲートウェイ経由による総追加レイテンシは 50 ミリ秒未満とされる。',
      details: [
        'ルーティング判定そのものがボトルネックにならない設計を訴求している。',
        'ただしこれは提供元の公表値であり、実際のレイテンシはリージョン・ネットワーク経路・アップストリームの混雑に左右されるため、PoC での実測が必要。'
      ],
      confidence: 'vendor-claim',
      sources: [
        { title: 'OrcaRouter 公式サイト', url: 'https://www.orcarouter.ai/' },
        { title: 'FlashLabs の OrcaRouter が RouterArena で第2位（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4534' }
      ]
    },
    {
      name: 'Guardrails（ガードレール）',
      description:
        'モデルに到達する前のゲートウェイ上でセキュリティを適用する 8 種類のガードレール。プロンプト（入力）とレスポンス（出力）の双方をリアルタイムでスクリーニングする。テンプレートまたはカスタムルールで適用できる。',
      details: [
        'PII（個人情報）の検知・マスキング',
        'シークレット / API キーの漏えいブロック',
        'プロンプトインジェクション対策',
        'ブランドセーフティ',
        '入力だけでなく出力側も検査する点が特徴。'
      ],
      confidence: 'press-release',
      sources: [
        { title: 'AIエージェントの脆弱性を突く脅威から企業を守る「AI Firewall & Guardrails」を無料提供開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000052_000138449/' },
        { title: 'OrcaRouter Firewall & Guardrails が無料提供開始（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4946' }
      ]
    },
    {
      name: 'AI Firewall（エージェントファイアウォール）',
      description:
        'AI エージェントが行う「行動」そのものを監視・制御する層。テキストの入出力検査にとどまらず、エージェントが外部に副作用を及ぼす経路を絞り込む。Guardrails と併せて無料で提供開始された。',
      details: [
        'ツール呼び出しの制御',
        'ネットワークエグレス（外部通信）の制限',
        'コストキャップ（暴走時の支出上限）',
        'AI エージェントを狙う「ソーシャルエンジニアリング」型の攻撃をゲートウェイで遮断することを訴求。'
      ],
      confidence: 'press-release',
      sources: [
        { title: 'AIエージェントの脆弱性を突く脅威から企業を守る「AI Firewall & Guardrails」を無料提供開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000052_000138449/' },
        { title: 'OrcaRouter、AIエージェント狙う攻撃を遮断する無料の防御機能を提供開始（O!Product AI）', url: 'https://oproduct.ai/articles/1813198' }
      ]
    },
    {
      name: '可観測性・ガバナンス',
      description:
        'リクエスト単位の可視化、予算（バジェット）の強制、ガードレールの適用を、ルーティングと同じ 1 ホップ上でまとめて行う。どのリクエストがどのモデルに流れ、いくらかかったかを追跡できる。',
      details: [
        'リクエスト単位のトレース・分析',
        '予算 enforcement（上限に達したら止める）',
        'コンプライアンス施行とレポート（Team プラン以上）',
        '2026 年 8 月 2 日に全面施行される EU AI 法への準拠支援を訴求している。'
      ],
      confidence: 'press-release',
      sources: [
        { title: 'OrcaRouter 公式サイト', url: 'https://www.orcarouter.ai/' },
        { title: 'OrcaRouter Firewall & Guardrails が無料提供開始（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4946' }
      ]
    },
    {
      name: '信頼性（フェイルオーバー・キャッシュ）',
      description:
        '健全で速く安価な容量を持つプロバイダへ推論を振り向け、障害時には自動フェイルオーバーする。繰り返しのプロンプトはキャッシュされる。',
      details: [
        '自動フェイルオーバーは Free プランにも含まれる。',
        'OSS 版の OrcaRouter-Lite ではプロバイダ横断のプロンプトキャッシュ（Anthropic だけでなく全プロバイダで機能する）を特徴として挙げている。',
        'Enterprise プランで 99.99% のアップタイム SLA。'
      ],
      confidence: 'official',
      sources: [
        { title: 'OrcaRouter 公式サイト', url: 'https://www.orcarouter.ai/' },
        { title: 'OrcaRouter 料金ページ', url: 'https://www.orcarouter.ai/pricing' },
        { title: 'OrcaRouter-Lite · GitHub', url: 'https://github.com/Continuum-AI-Corp/OrcaRouter-Lite' }
      ]
    },
    {
      name: 'OpenAI 互換 API',
      description:
        'base_url を https://api.orcarouter.ai/v1 に変更し API キーを差し替えるだけで、OpenAI / Anthropic / Google の SDK コードがそのまま動作する。コード変更は不要。',
      details: [
        '環境変数 ORCAROUTER_API_KEY（フォールバックキー）と ORCAROUTER_API_BASE_URL（既定 https://api.orcarouter.ai/v1）が利用できる。',
        'セルフホスト時の OpenAI 互換ベースは「ホスト + /api/v1」。',
        '移行は「5 分で完了」と訴求されている。'
      ],
      confidence: 'third-party',
      sources: [
        { title: 'OrcaRouter | Promptfoo', url: 'https://www.promptfoo.dev/docs/providers/orcarouter/' },
        { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' }
      ]
    }
  ],

  pricing: {
    summary:
      '最大の特徴はトークンへのマークアップが 0% であること。トークン課金はアップストリームプロバイダの公開レート（OpenAI / Anthropic / Google の公式価格ページと同じ）でそのまま請求され、OrcaRouter は上乗せを取らない。収益はプラットフォーム側のプラン課金で得るモデル。OpenRouter が全トークンに 5% のスプレッドを課すのと対比して打ち出されている。',
    plans: [
      {
        name: 'Free（Hacker）',
        price: '$0',
        includes: [
          '200 以上のモデルカタログへのフルアクセス',
          'OpenAI 互換 API',
          '自動フェイルオーバー',
          '基本的な可視化（オブザーバビリティ）',
          'シングルユーザーワークスペース',
          'AI Firewall & Guardrails（無料提供）'
        ],
        confidence: 'official',
        sources: [
          { title: 'OrcaRouter 料金ページ', url: 'https://www.orcarouter.ai/pricing' },
          { title: 'AI Firewall & Guardrails を無料提供開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000052_000138449/' }
        ]
      },
      {
        name: 'Team',
        price: '$499 / 月',
        includes: [
          '最大 10 シート',
          'コンプライアンス施行とレポート',
          '無制限の API キー',
          '優先サポート'
        ],
        confidence: 'official',
        sources: [{ title: 'OrcaRouter 料金ページ', url: 'https://www.orcarouter.ai/pricing' }]
      },
      {
        name: 'Enterprise',
        price: '個別見積',
        includes: [
          'プライベート / オンプレミスデプロイメント',
          'データレジデンシーコントロール',
          '99.99% アップタイム SLA'
        ],
        confidence: 'official',
        sources: [{ title: 'OrcaRouter 料金ページ', url: 'https://www.orcarouter.ai/pricing' }]
      }
    ],
    notes: [
      {
        label: 'マークアップ 0%',
        value: 'OpenAI・Anthropic・Gemini への全コールでマークアップ 0%。BYOK（自前のキー持ち込み）トラフィックについてもゼロマークアップ。開発者は各プロバイダとの既存の契約・請求関係を維持したまま、統一 API を得られる。',
        confidence: 'official',
        sources: [
          { title: 'OrcaRouter 料金ページ', url: 'https://www.orcarouter.ai/pricing' },
          { title: 'OrcaRouter, an OpenRouter Alternative, Launches Free BYOK for Developers（PR Newswire）', url: 'https://www.prnewswire.com/news-releases/orcarouter-an-openrouter-alternative-launches-free-byok-for-developers-302834125.html' }
        ]
      },
      {
        label: '月額プラン（日本市場向け・2026-06-03 提供開始）',
        value: '主要モデルを含む 200 以上の AI モデルを最大 10% のボーナスクレジット付きで利用できる。円建て請求・日本語サポートに対応。',
        confidence: 'press-release',
        sources: [
          { title: 'FlashLabs、「OrcaRouter 月額プラン」提供開始へ（ccsi.jp）', url: 'https://ccsi.jp/11666/' }
        ]
      },
      {
        label: 'DeepSeek V4 Pro の割引提供（2026-05-25〜）',
        value: '入力 $0.14 / 100万トークン、出力 $0.28 / 100万トークン。通常価格から 75% 割引、トークンマークアップは 0%。エンタープライズの AI エージェントワークフローのコスト最適化が狙い。',
        confidence: 'press-release',
        sources: [
          { title: 'OrcaRouter、DeepSeek V4 Pro API を75%割引価格で提供開始', url: 'https://prtimes.jp/main/html/rd/p/000000035.000138449.html' },
          { title: '同（テレ東プラス）', url: 'https://www.tv-tokyo.co.jp/plus/external-pr/entry/119877.html' }
        ]
      },
      {
        label: 'Claude Opus 4.8 の提供',
        value: 'コンテキストウィンドウ 100 万トークン、最大出力 12.8 万トークンの Claude Opus 4.8 API を OrcaRouter 経由で提供開始。コスト最適化と最高性能の両立を訴求。',
        confidence: 'press-release',
        sources: [
          { title: 'FlashLabs、OrcaRouter で Claude Opus 4.8 API の提供を開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000037_000138449/' }
        ]
      }
    ]
  },

  benchmarks: [
    {
      name: 'RouterArena（第三者ベンチマーク）',
      result: '公開リーダーボードで第 2 位（2026-05-20 提出時点）。精度 75.54%、Arena スコア 72.08。',
      detail:
        '独立系のルーター評価ベンチマークで、精度 75.54% を維持しながら極めて低コストでのルーティングを実現したとされる。GPT-5 や Azure のルーターと比較しても同等以上と報じられている。FlashLabs は関連する研究論文も公開している。',
      caveat: '順位は 2026 年 5 月時点のスナップショットであり、リーダーボードは更新される。最新の順位は必ず一次情報で確認すること。',
      confidence: 'third-party',
      sources: [
        { title: 'FlashLabs、OrcaRouter 研究論文を公開 ― RouterArena で第2位', url: 'https://prtimes.jp/main/html/rd/p/000000040.000138449.html' },
        { title: 'FlashLabs の OrcaRouter が RouterArena で第2位、LLMコストを約40%削減（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4534' }
      ]
    },
    {
      name: '内部ベンチマーク（提供元公表値）',
      result: '固定モデル運用との比較で、推論支出を 47%〜71% 削減。エンドユーザー側の品質指標に測定可能な劣化なし。',
      detail:
        '削減率はワークロード構成に依存する。最大の削減（71% 側）は「大半が単純処理で、一部だけ高度な推論を要する」エージェント型ワークロードで達成されたとされる。逆に高度推論の比率が高いワークロードでは削減幅は小さくなる。',
      caveat: '提供元による内部ベンチマークであり、独立検証されていない。「品質指標に劣化なし」の測定方法・指標定義も公開情報からは特定できない。自社のワークロードで PoC を行い、コストと品質の双方を実測すること。',
      confidence: 'vendor-claim',
      sources: [
        { title: 'FlashLabs の OrcaRouter が RouterArena で第2位、LLMコストを約40%削減（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4534' },
        { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' }
      ]
    },
    {
      name: '代表的な訴求値の内訳',
      result: '「約 40% 削減」と「最大 70% 削減」の 2 つの数字が併用されている。',
      detail:
        '「約 40%」はプロンプトの約 65%（定型処理）を安価なオープンモデルに、約 35%（高度推論）をフロンティアモデルに振り分けた想定での試算。「最大 70%（70〜71%）」はエージェント型ワークロードなど、定型処理の比率が特に高いケースでの上限値。試算例として、月間 $10,000 の LLM 利用で年間約 $47,700 の純削減、投資回収期間は 1 日未満とされる。',
      caveat: '「最大 70%」は上限値であり期待値ではない。自社のプロンプト構成が想定（定型 65%）とどれだけ一致するかで結果は大きく変わる。',
      confidence: 'vendor-claim',
      sources: [
        { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' },
        { title: 'OrcaRouter MCP Server 機能が正式リリース（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4181' }
      ]
    }
  ],

  useCases: [
    {
      title: 'AI コーディング支援のコスト最適化',
      category: '活用事例（ワークロード）',
      body:
        'コード補完やボイラープレート生成といった定型タスクは開発ワークロード全体の約 65% を占める。これらを DeepSeek V4 Pro や Qwen3.6 Plus などの高性能オープンモデルに振り分けると約 1/15 のコストで処理でき、品質を維持したまま開発チームの AI コーディング支出を約 40% 削減できるとされる。残りの高度な推論タスクはフロンティアモデルに回す。',
      confidence: 'press-release',
      sources: [
        { title: 'FlashLabs、「OrcaRouter 月額プラン」提供開始へ（ccsi.jp）', url: 'https://ccsi.jp/11666/' },
        { title: 'OrcaRouter が OpenAI Codex CLI に対応（東京新聞 × PR TIMES）', url: 'https://adv.tokyo-np.co.jp/prtimes/article167535/' }
      ]
    },
    {
      title: 'エージェント型ワークロード',
      category: '活用事例（ワークロード）',
      body:
        '大半が単純処理で一部だけ高度な推論を要するエージェント型のワークロードで、削減率が最大（内部ベンチで最大 71%）になる。ツール呼び出しの制御・ネットワークエグレス制限・コストキャップを備えた AI Firewall は、まさにこのエージェント用途を想定した機能。',
      confidence: 'vendor-claim',
      sources: [
        { title: 'FlashLabs の OrcaRouter が RouterArena で第2位（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4534' },
        { title: 'AI Firewall & Guardrails を無料提供開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000052_000138449/' }
      ]
    },
    {
      title: 'マルチ LLM 運用の一元化',
      category: '活用事例（運用）',
      body:
        '200 以上の LLM API 呼び出しを 1 エンドポイント・1 API キー・1 請求書に集約することで、開発チームの保守負担を減らす。再設計・調達サイクルの見直し・コード書き換えを伴わずに導入できる点を訴求している。プロバイダごとに契約・請求・SDK が分かれる状態の解消が主目的。',
      confidence: 'press-release',
      sources: [
        { title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' }
      ]
    },
    {
      title: 'AI エージェントのセキュリティ統制',
      category: '活用事例（セキュリティ）',
      body:
        'AI エージェントの脆弱性を突く「ソーシャルエンジニアリング」型の攻撃に対し、ゲートウェイ層で防御する。入出力のリアルタイムスクリーニング（PII・シークレット・プロンプトインジェクション）とエージェントの行動制御（ツール呼び出し・エグレス・コスト上限）を組み合わせる。既存の OpenAI SDK 環境にエンドポイント URL の変更だけで導入でき、EU AI 法への準拠支援も兼ねる。',
      confidence: 'press-release',
      sources: [
        { title: 'AIエージェントの脆弱性を突く脅威から企業を守る「AI Firewall & Guardrails」を無料提供開始', url: 'https://news.infoseek.co.jp/article/prtimes_000000052_000138449/' },
        { title: 'OrcaRouter Firewall & Guardrails が無料提供開始（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4946' }
      ]
    }
  ],

  integrations: [
    {
      name: 'OpenAI Codex CLI',
      type: '導入事例（ツール対応）',
      body:
        'OrcaRouter が OpenAI Codex CLI に対応。config.toml の base_url を 1 行書き換えるだけで導入でき、Codex CLI の他の設定やワークフローは一切変更不要。200 以上の LLM をコーディングエージェントから直接利用できる。トークン上乗せ 0%、設定 3 行。',
      setup: 'config.toml の base_url を https://api.orcarouter.ai/v1 に変更し、API キーを sk-orca- のキーに差し替える。',
      confidence: 'press-release',
      sources: [
        { title: 'OrcaRouter が OpenAI Codex CLI に対応（東京新聞 × PR TIMES）', url: 'https://adv.tokyo-np.co.jp/prtimes/article167535/' }
      ]
    },
    {
      name: 'MCP Server（Model Context Protocol）',
      type: '導入事例（ツール対応）',
      body:
        'OrcaRouter の MCP Server 機能が正式リリース。Claude Desktop / Cursor / Windsurf / Zed / OpenClaw といった MCP クライアントから、ベンダーロックインなしに 200 以上の AI モデルへ統一アクセスできる。LLM 運用コストを約 40% 削減、月間 $10,000 の利用で年間約 $47,700 の削減、投資回収期間 1 日未満と試算されている。',
      setup: 'MCP クライアントの設定ファイルに OrcaRouter の MCP Server を登録する。',
      confidence: 'press-release',
      sources: [
        { title: 'OrcaRouter MCP Server 機能が正式リリース（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news4181' },
        { title: 'OrcaRouter、MCP Server 機能を正式リリース（時事ドットコム）', url: 'https://www.jiji.com/jc/article?k=000000036.000138449&g=prt' }
      ]
    },
    {
      name: 'Dify Marketplace',
      type: '導入事例（プラットフォーム掲載）',
      body:
        'Continuum AI が Dify 向けスマートルーティングプラグイン「OrcaRouter」を Dify Marketplace に公開。Dify ユーザーは 1 つの API 経由で 200 以上の LLM にアクセスでき、プロンプト内容に応じて最適なモデルを自動選択する。既存の Dify ワークフローは Base URL と API キーの変更のみで移行でき、出力品質を保ちながら AI 推論コストを最大 70% 削減すると訴求。',
      setup: 'Dify Marketplace からプラグインを導入し、Base URL と API キーを設定する。',
      confidence: 'press-release',
      sources: [
        { title: 'OrcaRouter が Dify Marketplace に登場（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000034.000138449.html' },
        { title: 'OrcaRouter が Dify Marketplace に公開（CodeCamp Trends）', url: 'https://trends.codecamp.jp/blogs/media/news3985' },
        { title: 'Dify で複数 LLM をどう使い分ける？OrcaRouter 連携ガイド（HelloCraftAI）', url: 'https://hellocraftai.com/blog/dify-orcarouter-multi-llm-cost-cap-routing-evaluation-guide-2026/' }
      ]
    },
    {
      name: 'Cursor Directory',
      type: '導入事例（プラットフォーム掲載）',
      body:
        'AI 開発ツール「Cursor Directory」に OrcaRouter が公式掲載。200+ モデル対応のアダプティブルーティングにより開発コスト最大 70% 削減を訴求。',
      setup: 'Cursor の設定で OpenAI 互換エンドポイントとして OrcaRouter を指定する。',
      confidence: 'press-release',
      sources: [
        { title: 'FlashLabs、Cursor Directory に OrcaRouter を公式掲載', url: 'https://prtimes.jp/main/html/rd/p/000000042.000138449.html' },
        { title: '同（時事ドットコム）', url: 'https://www.jiji.com/jc/article?k=000000042.000138449&g=prt' }
      ]
    },
    {
      name: 'Promptfoo',
      type: '導入事例（第三者ツール）',
      body:
        'LLM 評価ツール Promptfoo が OrcaRouter をプロバイダとして公式ドキュメントに掲載。環境変数 ORCAROUTER_API_KEY / ORCAROUTER_API_BASE_URL で設定する。評価フローに OrcaRouter を組み込める。',
      setup: 'Promptfoo の設定でプロバイダに orcarouter を指定し、ORCAROUTER_API_KEY を設定する。',
      confidence: 'third-party',
      sources: [{ title: 'OrcaRouter | Promptfoo', url: 'https://www.promptfoo.dev/docs/providers/orcarouter/' }]
    },
    {
      name: 'Apify / LibreChat / OpenCode',
      type: '導入事例（第三者エコシステム）',
      body:
        'Apify に OpenAI 互換 LLM API として Actor が公開されている。LibreChat ではカスタム OpenAI 互換エンドポイントとして OrcaRouter を設定する方法がコミュニティで議論・文書化されている。OpenCode 向けの公式連携ドキュメントも存在する。',
      setup: '各ツールの「OpenAI 互換エンドポイント」設定に Base URL と API キーを入れる。',
      confidence: 'third-party',
      sources: [
        { title: 'OrcaRouter – OpenAI-compatible LLM API on Apify', url: 'https://apify.com/continuum-ai-corp/orcarouter' },
        { title: 'LibreChat でのカスタム OpenAI 互換エンドポイント設定（Discussion）', url: 'https://github.com/danny-avila/LibreChat/discussions/13316' },
        { title: 'OpenCode 連携 - OrcaRouter Docs', url: 'https://docs.orcarouter.ai/integrations/opencode' }
      ]
    }
  ],

  oss: {
    name: 'OrcaRouter Lite',
    summary:
      'OrcaRouter のオープンソース版（MIT ライセンス、シングルワークスペース版）。セルフホスト可能な OpenAI 互換の LLM ルーターで、BYOK に対応する。「マネージドなセーフティネット付きのセルフホストルーター」という位置づけ。',
    points: [
      'model="auto" で、各リクエストに対して「最も安く要件を満たすモデル」を自動選択する。',
      'プロバイダ横断のプロンプトキャッシュ（Anthropic だけでなく全プロバイダで機能する）。',
      'プロバイダ状況・ルーティング戦略・分析を見るダッシュボードを内蔵。',
      'OpenAI 標準の SSE 形式でストリーミングをサポート。',
      '外部依存なし。SQLite 既定で Postgres / Redis / Kubernetes は不要。ノート PC でも VPS でもクラスタでも動く。',
      'ルーティング戦略は balanced / cheapest / fastest / quality を切り替え可能。',
      'LiteLLM の価格データベースを利用したコミュニティ管理の 100+ モデルカタログを持ち、tools / vision / JSON mode の対応可否をケイパビリティフラグとして公開する。',
      'BYOK のキーは AES-256-GCM で暗号化して保存される。',
      'ホスト版（api.orcarouter.ai）をフォールバックプロバイダとして指定でき、自前で鍵を管理したくないロングテールのモデルはホスト版に逃がせる。'
    ],
    quickstart:
      'リポジトリを clone し、.env に最低 1 つのプロバイダキー（例: OPENAI_API_KEY）を設定して docker compose up。http://localhost:8000 で起動し、API キーが生成される。OpenAI クライアントの base_url には http://localhost:8000/v1 を指定する。',
    license: 'MIT',
    confidence: 'third-party',
    sources: [
      { title: 'Continuum-AI-Corp/OrcaRouter-Lite · GitHub', url: 'https://github.com/Continuum-AI-Corp/OrcaRouter-Lite' },
      { title: 'OrcaRouter Launches the Open LLM API Router — Zero Markup, MIT-Licensed, 100+ Models（PR Newswire）', url: 'https://www.prnewswire.com/news-releases/orcarouter-launches-the-open-llm-api-router--zero-markup-mit-licensed-100-models-302766356.html' }
    ]
  },

  competitors: [
    {
      name: 'OpenRouter',
      positioning: '最も直接的な比較対象。OrcaRouter 自身が「OpenRouter の代替」を名乗っている。',
      diff:
        'OpenRouter は全トークンに 5% のスプレッドを課すのに対し、OrcaRouter はマークアップ 0% で、開発者は自前のキーを持ち込んでプロバイダに直接支払う。OpenRouter は意図的に軽量で、ルーティングとアグリゲーションに集中しており、デプロイ・ガバナンス・インフラ管理は範囲外。OrcaRouter はガードレール・ファイアウォール・ガバナンスを一体で提供する本番運用寄りの設計。',
      confidence: 'press-release',
      sources: [
        { title: 'OrcaRouter, an OpenRouter Alternative, Launches Free BYOK for Developers（PR Newswire）', url: 'https://www.prnewswire.com/news-releases/orcarouter-an-openrouter-alternative-launches-free-byok-for-developers-302834125.html' },
        { title: 'The Best OpenRouter Alternatives in 2026', url: 'https://thedatascientist.com/the-best-openrouter-alternatives-in-2026-and-how-to-choose/' }
      ]
    },
    {
      name: 'LiteLLM（OSS・自前運用）',
      positioning: '自社でプロキシを立てて統一 API とコスト管理を行う選択肢。',
      diff:
        'ライセンス費用はかからないが、運用・監視・アップデートを自社で担う。OrcaRouter-Lite も同じ「セルフホスト」領域に入るため、OSS 同士の比較になる（OrcaRouter-Lite は LiteLLM の価格 DB を利用している）。アダプティブルーティングの学習機能を自前で作るコストが論点。',
      confidence: 'unverified',
      sources: [
        { title: 'Awesome AI Gateway（100+ AI ゲートウェイ比較）', url: 'https://github.com/cuihuan/awesome-ai-gateway' },
        { title: 'OrcaRouter-Lite · GitHub', url: 'https://github.com/Continuum-AI-Corp/OrcaRouter-Lite' }
      ]
    },
    {
      name: 'Vercel AI Gateway / Portkey / Kong 等',
      positioning: '同じ AI ゲートウェイ領域のプレイヤー。',
      diff:
        'ホスティング基盤との統合度、ガバナンス機能の深さ、料金体系（マークアップの有無）が主な比較軸。既に Vercel などの基盤に乗っている組織は、そちらのゲートウェイのほうが統合コストが低い可能性がある。',
      confidence: 'unverified',
      sources: [
        { title: 'Vercel AI Gateway vs OpenRouter（TrueFoundry）', url: 'https://www.truefoundry.com/blog/vercel-ai-gateway-vs-openrouter' },
        { title: 'Awesome AI Gateway', url: 'https://github.com/cuihuan/awesome-ai-gateway' }
      ]
    },
    {
      name: '各プロバイダとの直接契約（現状維持）',
      positioning: 'ゲートウェイを挟まない選択肢。比較のベースライン。',
      diff:
        '経路が増えないぶんレイテンシ・障害点・データ経路の観点でシンプル。ただしモデルごとの契約・請求・SDK 差異、コスト最適化の手作業が残る。OrcaRouter の削減効果は、この現状維持との差分で測るべき。',
      confidence: 'unverified',
      sources: [{ title: 'OrcaRouter が日本上陸（FlashLabs プレスリリース）', url: 'https://prtimes.jp/main/html/rd/p/000000030.000138449.html' }]
    }
  ],

  considerations: [
    {
      topic: '数値の確度',
      question: '「40% 削減」「最大 70% 削減」は自社にも当てはまるか？',
      body:
        '削減率はワークロード構成（定型処理と高度推論の比率）に完全に依存する。提供元の試算は「定型 65% / 高度推論 35%」を前提にしている。自社のプロンプト分布がこれと違えば結果も変わる。内部ベンチの 47〜71% というレンジは提供元の公表値であり独立検証されていない。まず 1〜2 週間の PoC で実トラフィックを流し、コストと品質の両方を実測すること。'
    },
    {
      topic: '品質劣化の測り方',
      question: '「品質指標に測定可能な劣化なし」を自社ではどう検証するか？',
      body:
        '安いモデルへ振り分けた結果の品質低下は平均値では見えにくく、テールに出る。自社のユースケースに対する評価セット（ゴールデンセット）を先に用意し、固定モデル運用時とルーティング運用時でスコアを比較する。Promptfoo が OrcaRouter をプロバイダとしてサポートしているので、評価フローに組み込みやすい。'
    },
    {
      topic: '単一障害点とデータ経路',
      question: 'ゲートウェイを挟むことで何が増えるか？',
      body:
        'すべての LLM トラフィックが 1 か所を通る構成になる。可用性（Free / Team プランに SLA があるか、99.99% SLA は Enterprise のみ）、障害時の挙動、ログの保持期間と保持場所、データレジデンシー、プロンプト内容が学習に使われないかを契約で確認する。Enterprise ではプライベート / オンプレデプロイとデータレジデンシー制御が用意されている。'
    },
    {
      topic: '契約主体とサポート',
      question: '契約先は Continuum AI か FlashLabs か？',
      body:
        '開発元は Continuum AI（米国）、日本独占ディストリビューターは FlashLabs 株式会社。契約主体・支払通貨（円建て可）・サポート言語・SLA の履行責任・データ処理者が誰になるかを明確にする。'
    },
    {
      topic: '再現性と評価',
      question: 'リクエストごとにモデルが変わることの副作用は？',
      body:
        'アダプティブルーティングは同じプロンプトでも実行タイミングによって別のモデルが選ばれうる。出力の再現性が要件になるユースケース（監査ログ、回帰テスト、A/B 評価）では、ワークスペースのルーティング方針を quality 固定にする、あるいは重要な経路だけモデルを明示指定するといった使い分けが必要。'
    },
    {
      topic: 'ロックインの度合い',
      question: '入れたあと抜けられるか？',
      body:
        'OpenAI 互換なので base_url を戻せば離脱できる、というのが表面的な答え。実際にはガードレール設定・ルーティング方針・可観測性ダッシュボードへの依存が積み上がる。MIT ライセンスの OSS 版（OrcaRouter-Lite）が存在することは、退出戦略として評価できる材料。'
    },
    {
      topic: 'スモールスタートの現実性',
      question: 'いくらから試せるか？',
      body:
        'Free（Hacker）プランで 200+ モデルカタログ・OpenAI 互換 API・自動フェイルオーバー・基本的な可視化が使え、AI Firewall & Guardrails も無料提供。トークンはマークアップ 0% で実費のみ。まず Free で 1 チーム・1 ワークロードから試し、シート数とコンプライアンス要件が必要になった段階で Team（$499/月）を検討する流れが現実的。'
    },
    {
      topic: 'コンプライアンス',
      question: 'EU AI 法や社内規程との関係は？',
      body:
        'OrcaRouter は 2026 年 8 月 2 日全面施行の EU AI 法への準拠支援を訴求している。ただし「準拠支援」であって「準拠の保証」ではない。自社が EU 域内でサービスを提供するか、リスク分類がどうなるかは自社側の整理が必要。ガードレールによる PII マスキングは社内規程上のプラス材料になりうる。'
    }
  ],

  glossary: [
    { term: 'AI ゲートウェイ', desc: 'アプリケーションと複数の LLM プロバイダの間に立ち、認証・ルーティング・ログ・制御を一手に引き受ける中継層。' },
    { term: 'アダプティブルーティング', desc: 'リクエストの内容に応じて、その都度最適なモデルを選んで振り分ける方式。固定のモデルを使い続ける運用の対義。' },
    { term: 'LinUCB / コンテキスト・バンディット', desc: '「どの選択肢が良いか」を試行しながら学習する強化学習系アルゴリズム。OrcaRouter はこれをモデル選択に使い、結果の良くないモデルへの振り分けを減らす。' },
    { term: 'BYOK（Bring Your Own Key）', desc: '各 LLM プロバイダとの契約・API キーは自社のまま持ち込み、ゲートウェイは中継だけを行う方式。請求関係が変わらない。' },
    { term: 'マークアップ', desc: 'ゲートウェイ事業者がトークン単価に上乗せする手数料。OpenRouter は 5%、OrcaRouter は 0% を訴求。' },
    { term: 'ガードレール', desc: 'LLM の入出力を検査して、PII やシークレットの漏えい、プロンプトインジェクションなどを止める仕組み。' },
    { term: 'MCP（Model Context Protocol）', desc: 'AI クライアントが外部のツールやデータソースに接続するための標準プロトコル。OrcaRouter は MCP Server として 200+ モデルを公開する。' },
    { term: 'フロンティアモデル / オープンモデル', desc: '前者は最高性能帯の商用モデル（Claude Opus, GPT-5.5 Pro など）、後者は公開重みの高性能モデル（DeepSeek, Qwen など）。単価が 1 桁以上違う。' }
  ]
};
