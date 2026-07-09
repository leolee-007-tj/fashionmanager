const ClassificationService = {
    // 상품 객체에 대해 DB에 저장된 분류값이 있으면 사용하고,
    // 없으면 original_title로 실시간 분류하여 반환
    classifyProduct(product) {
        if (!product) return this.emptyResult();
        // DB에 저장된 값이 있고 비어있지 않으면 사용
        const hasStored = (product.category && String(product.category).trim()) ||
                          (product.color && String(product.color).trim()) ||
                          (product.size && String(product.size).trim());
        if (hasStored) {
            return {
                detected_language: product.title_language || this.detectLanguage(product.original_title || ''),
                brand: product.brand || null,
                category: product.category || null,
                color: product.color || null,
                size: product.size || null,
                material: product.material || null,
                season: null,
                fit: null,
                style: null,
                normalized_title: product.original_title || '',
                confidence: 'high',
                needs_review: false,
                notes: [],
                classification_status: 'auto_complete',
                _source: 'stored'
            };
        }
        // 저장된 값이 없으면 실시간 분류
        const result = this.classify(product.original_title || '');
        result._source = 'computed';
        return result;
    },

    classify(title) {
        if (!title) return this.emptyResult();
        const keywords = DB.getKeywords().filter(k => k.is_active !== false);
        const result = {
            detected_language: this.detectLanguage(title),
            brand: null,
            category: null,
            color: null,
            size: null,
            material: null,
            season: null,
            fit: null,
            style: null,
            normalized_title: title,
            confidence: 'low',
            needs_review: true,
            notes: [],
            classification_status: 'pending'
        };
        const types = ['brand', 'category', 'color', 'size', 'material', 'season', 'fit', 'style'];
        let matchedCount = 0;
        types.forEach(type => {
            const match = this.matchKeyword(title, keywords.filter(k => k.classification_type === type));
            if (match) {
                result[type] = match.standard_value;
                if (['brand', 'category', 'color', 'size'].includes(type)) {
                    matchedCount++;
                }
            }
        });
        if (matchedCount >= 4) {
            result.confidence = 'high';
            result.needs_review = false;
            result.classification_status = 'auto_complete';
        } else if (matchedCount >= 2) {
            result.confidence = 'medium';
            result.needs_review = true;
            result.classification_status = 'needs_review';
        } else {
            result.confidence = 'low';
            result.needs_review = true;
            result.classification_status = 'failed';
            result.notes.push(t('status', 'failed'));
        }
        return result;
    },

    emptyResult() {
        return {
            detected_language: 'auto',
            brand: null,
            category: null,
            color: null,
            size: null,
            material: null,
            season: null,
            fit: null,
            style: null,
            normalized_title: '',
            confidence: 'low',
            needs_review: true,
            notes: [],
            classification_status: 'pending'
        };
    },

    detectLanguage(title) {
        const koCount = (title.match(/[가-힣]/g) || []).length;
        const zhCount = (title.match(/[\u4e00-\u9fa5]/g) || []).length;
        const enCount = (title.match(/[a-zA-Z]/g) || []).length;
        const total = koCount + zhCount + enCount;
        if (total === 0) return 'mixed';
        const koRatio = koCount / total;
        const zhRatio = zhCount / total;
        const enRatio = enCount / total;
        const aboveThreshold = [];
        if (koRatio > 0.15) aboveThreshold.push('ko');
        if (zhRatio > 0.15) aboveThreshold.push('zh');
        if (enRatio > 0.15) aboveThreshold.push('en');
        if (aboveThreshold.length >= 2) {
            return 'mixed_' + aboveThreshold.sort().join('_');
        }
        if (koRatio > zhRatio && koRatio > enRatio) return 'ko';
        if (zhRatio > koRatio && zhRatio > enRatio) return 'zh';
        return 'en';
    },

    matchKeyword(title, keywords) {
        const lowerTitle = title.toLowerCase();
        const sorted = keywords.sort((a, b) => a.priority - b.priority);
        for (const kw of sorted) {
            const toList = (val) => {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string') return val.split(',');
                return [];
            };
            const allKeywords = [
                ...toList(kw.ko_keywords || kw.ko),
                ...toList(kw.zh_keywords || kw.zh),
                ...toList(kw.en_keywords || kw.en),
                ...toList(kw.ja_keywords || kw.ja),
                ...toList(kw.other_aliases),
                kw.standard_value
            ].filter(k => k && String(k).trim().length > 0).map(k => String(k).trim().toLowerCase());
            for (const word of allKeywords) {
                if (word && lowerTitle.includes(word)) {
                    return kw;
                }
            }
        }
        return null;
    },

    getTestTitles() {
        return [
            'SYSTEM 羊毛 니트 cream FREE',
            'TIME 실크 블라우스 블랙 M',
            'MARRON 캐시미어 코트 베이지 L',
            '纯棉针织衫 米色 均码',
            'New Arrival silk dress white S',
            '울 가디건 그레이 FREE',
            '羽绒服 黑色 L',
            'linen pants beige M'
        ];
    },

    initDefaultKeywords() {
        const existing = DB.getKeywords();
        if (existing.length > 0) return;
        const defaults = [
            // 브랜드
            { classification_type: 'brand', standard_value: 'SYSTEM', ko: ['시스템'], zh: ['SYSTEM', '系统'], en: ['SYSTEM', 'System'], ja: ['SYSTEM', 'システム'], priority: 8 },
            { classification_type: 'brand', standard_value: 'MIXXO', ko: ['믹소'], zh: ['MIXXO', '米克索'], en: ['MIXXO', 'Mixxo'], ja: ['MIXXO', 'ミッソ'], priority: 7 },
            { classification_type: 'brand', standard_value: 'SPAO', ko: ['스파오'], zh: ['SPAO', '斯帕奥'], en: ['SPAO', 'Spao'], ja: ['SPAO', 'スパオ'], priority: 7 },
            { classification_type: 'brand', standard_value: 'ZARA', ko: ['자라'], zh: ['ZARA', '飒拉'], en: ['ZARA', 'Zara'], ja: ['ZARA', 'ザラ'], priority: 9 },
            { classification_type: 'brand', standard_value: 'H&M', ko: ['에이치엔엠'], zh: ['H&M', '海恩莫里斯'], en: ['H&M', 'hm'], ja: ['H&M', 'エイチアンドエム'], priority: 9 },
            { classification_type: 'brand', standard_value: 'UNIQLO', ko: ['유니클로'], zh: ['UNIQLO', '优衣库'], en: ['UNIQLO', 'Uniqlo'], ja: ['UNIQLO', 'ユニクロ'], priority: 9 },
            // 종류 (카테고리)
            { classification_type: 'category', standard_value: '니트', ko: ['니트'], zh: ['针织', '毛衣'], en: ['knit', 'sweater'], ja: ['ニット', 'セーター'], priority: 8 },
            { classification_type: 'category', standard_value: '가디건', ko: ['가디건'], zh: ['开衫', '开襟衫'], en: ['cardigan'], ja: ['カーディガン'], priority: 8 },
            { classification_type: 'category', standard_value: '자켓', ko: ['자켓', '재킷'], zh: ['夹克', '外套'], en: ['jacket'], ja: ['ジャケット'], priority: 7 },
            { classification_type: 'category', standard_value: '코트', ko: ['코트'], zh: ['大衣', '外套'], en: ['coat'], ja: ['コート'], priority: 7 },
            { classification_type: 'category', standard_value: '패딩', ko: ['패딩', '다운'], zh: ['羽绒服', '棉衣'], en: ['padding', 'down', 'puffer'], ja: ['ダウン', 'パディング'], priority: 7 },
            { classification_type: 'category', standard_value: '점퍼', ko: ['점퍼'], zh: ['夹克', '跳线'], en: ['jumper'], ja: ['ジャンパー'], priority: 7 },
            { classification_type: 'category', standard_value: '블라우스', ko: ['블라우스'], zh: ['衬衫', '罩衫'], en: ['blouse'], ja: ['ブラウス'], priority: 7 },
            { classification_type: 'category', standard_value: '셔츠', ko: ['셔츠'], zh: ['衬衫'], en: ['shirt'], ja: ['シャツ'], priority: 7 },
            { classification_type: 'category', standard_value: '티셔츠', ko: ['티셔츠', '티'], zh: ['T恤', '短袖'], en: ['t-shirt', 'tee'], ja: ['Tシャツ', 'ティーシャツ'], priority: 7 },
            { classification_type: 'category', standard_value: '맨투맨', ko: ['맨투맨', '맨투'], zh: ['卫衣', '圆领卫衣'], en: ['sweatshirt'], ja: ['スウェット', 'トレーナー'], priority: 7 },
            { classification_type: 'category', standard_value: '후드', ko: ['후드', '후디'], zh: ['连帽', '帽衫'], en: ['hoodie', 'hoody'], ja: ['パーカー', 'フーディ'], priority: 7 },
            { classification_type: 'category', standard_value: '원피스', ko: ['원피스', '드레스'], zh: ['连衣裙', '洋装'], en: ['dress', 'onepiece'], ja: ['ワンピース', 'ドレス'], priority: 7 },
            { classification_type: 'category', standard_value: '스커트', ko: ['스커트', '치마'], zh: ['裙子', '半身裙'], en: ['skirt'], ja: ['スカート'], priority: 7 },
            { classification_type: 'category', standard_value: '팬츠', ko: ['팬츠', '바지'], zh: ['裤子', '长裤'], en: ['pants', 'trousers'], ja: ['パンツ', 'ズボン'], priority: 7 },
            { classification_type: 'category', standard_value: '청바지', ko: ['청바지', '데님', '진'], zh: ['牛仔裤', '牛仔'], en: ['jeans', 'denim'], ja: ['ジーンズ', 'デニム'], priority: 7 },
            { classification_type: 'category', standard_value: '슬랙스', ko: ['슬랙스'], zh: ['西裤', '休闲裤'], en: ['slacks'], ja: ['スラックス'], priority: 7 },
            { classification_type: 'category', standard_value: '반바지', ko: ['반바지', '쇼츠'], zh: ['短裤'], en: ['shorts'], ja: ['ショートパンツ', '短パン'], priority: 7 },
            { classification_type: 'category', standard_value: '조끼', ko: ['조끼', '베스트'], zh: ['马甲', '背心'], en: ['vest'], ja: ['ベスト'], priority: 7 },
            { classification_type: 'category', standard_value: '수트', ko: ['수트', '정장'], zh: ['西装', '套装'], en: ['suit'], ja: ['スーツ'], priority: 7 },
            { classification_type: 'category', standard_value: '트레이닝복', ko: ['트레이닝복', '트레이닝', '츄리닝'], zh: ['运动服', '运动套装'], en: ['tracksuit', 'training'], ja: ['トレーニングウェア', 'ジャージ'], priority: 7 },
            { classification_type: 'category', standard_value: '언더웨어', ko: ['언더웨어', '속옷', '브라', '팬티'], zh: ['内衣', '文胸', '内裤'], en: ['underwear', 'lingerie', 'bra', 'panty'], ja: ['下着', 'ランジェリー'], priority: 6 },
            { classification_type: 'category', standard_value: '양말', ko: ['양말', '삭스', '스타킹'], zh: ['袜子', '丝袜'], en: ['socks', 'stockings'], ja: ['靴下', 'ソックス'], priority: 6 },
            { classification_type: 'category', standard_value: '모자', ko: ['모자', '캡', '비니', '버킷햇'], zh: ['帽子', '棒球帽', '针织帽'], en: ['cap', 'hat', 'beanie'], ja: ['帽子', 'キャップ'], priority: 6 },
            { classification_type: 'category', standard_value: '목도리', ko: ['목도리', '스카프', '머플러'], zh: ['围巾', '披肩'], en: ['scarf', 'muffler'], ja: ['マフラー', 'スカーフ'], priority: 6 },
            { classification_type: 'category', standard_value: '장갑', ko: ['장갑', '글러브'], zh: ['手套'], en: ['gloves'], ja: ['手袋', 'グローブ'], priority: 6 },
            { classification_type: 'category', standard_value: '벨트', ko: ['벨트'], zh: ['腰带', '皮带'], en: ['belt'], ja: ['ベルト'], priority: 6 },
            // 색상
            { classification_type: 'color', standard_value: 'BLACK', ko: ['검정', '블랙', '검은색'], zh: ['黑色', '黑'], en: ['black'], ja: ['黒', 'ブラック'], priority: 9 },
            { classification_type: 'color', standard_value: 'WHITE', ko: ['흰색', '화이트', '하얀색'], zh: ['白色', '白'], en: ['white'], ja: ['白', 'ホワイト'], priority: 9 },
            { classification_type: 'color', standard_value: 'CREAM', ko: ['크림', '아이보리', '아이보리색'], zh: ['奶白', '象牙白'], en: ['cream', 'ivory'], ja: ['クリーム', 'アイボリー'], priority: 7 },
            { classification_type: 'color', standard_value: 'BEIGE', ko: ['베이지', '베이지색'], zh: ['米色', '裸色'], en: ['beige'], ja: ['ベージュ'], priority: 7 },
            { classification_type: 'color', standard_value: 'RED', ko: ['빨강', '레드', '빨간색'], zh: ['红色', '红'], en: ['red'], ja: ['赤', 'レッド'], priority: 8 },
            { classification_type: 'color', standard_value: 'BLUE', ko: ['파랑', '블루', '파란색'], zh: ['蓝色', '蓝'], en: ['blue'], ja: ['青', 'ブルー'], priority: 8 },
            { classification_type: 'color', standard_value: 'NAVY', ko: ['남색', '네이비', '네이비색'], zh: ['藏青', '藏蓝色', '深蓝'], en: ['navy', 'darkblue'], ja: ['紺', 'ネイビー'], priority: 8 },
            { classification_type: 'color', standard_value: 'SKY BLUE', ko: ['하늘색', '스카이블루', '하늘'], zh: ['天蓝', '浅蓝'], en: ['skyblue', 'sky'], ja: ['水色', 'スカイブルー'], priority: 7 },
            { classification_type: 'color', standard_value: 'GREEN', ko: ['초록', '그린', '초록색'], zh: ['绿色', '绿'], en: ['green'], ja: ['緑', 'グリーン'], priority: 8 },
            { classification_type: 'color', standard_value: 'MINT', ko: ['민트', '민트색'], zh: ['薄荷绿', '浅绿'], en: ['mint'], ja: ['ミント'], priority: 7 },
            { classification_type: 'color', standard_value: 'YELLOW', ko: ['노랑', '옐로우', '노란색'], zh: ['黄色', '黄'], en: ['yellow'], ja: ['黄', 'イエロー'], priority: 8 },
            { classification_type: 'color', standard_value: 'ORANGE', ko: ['주황', '오렌지', '주황색'], zh: ['橙色', '橘色'], en: ['orange'], ja: ['橙', 'オレンジ'], priority: 7 },
            { classification_type: 'color', standard_value: 'PINK', ko: ['분홍', '핑크', '분홍색'], zh: ['粉色', '粉'], en: ['pink'], ja: ['ピンク'], priority: 7 },
            { classification_type: 'color', standard_value: 'LIGHT PINK', ko: ['연핑크', '라이트핑크'], zh: ['浅粉', '淡粉'], en: ['lightpink'], ja: ['ライトピンク'], priority: 7 },
            { classification_type: 'color', standard_value: 'CORAL', ko: ['코랄', '코랄색'], zh: ['珊瑚色', '珊瑚红'], en: ['coral'], ja: ['コーラル'], priority: 7 },
            { classification_type: 'color', standard_value: 'PURPLE', ko: ['보라', '퍼플', '보라색'], zh: ['紫色', '紫'], en: ['purple', 'violet'], ja: ['紫', 'パープル'], priority: 7 },
            { classification_type: 'color', standard_value: 'LAVENDER', ko: ['라벤더', '라벤더색'], zh: ['薰衣草紫', '淡紫'], en: ['lavender'], ja: ['ラベンダー'], priority: 7 },
            { classification_type: 'color', standard_value: 'GRAY', ko: ['회색', '그레이', '회색'], zh: ['灰色', '灰'], en: ['gray', 'grey'], ja: ['グレー'], priority: 7 },
            { classification_type: 'color', standard_value: 'CHARCOAL', ko: ['차콜', '차콜색', '짙은회색'], zh: ['炭灰', '深灰'], en: ['charcoal', 'darkgray'], ja: ['チャコール'], priority: 7 },
            { classification_type: 'color', standard_value: 'BROWN', ko: ['갈색', '브라운'], zh: ['棕色', '褐色', '咖啡'], en: ['brown', 'choco'], ja: ['茶', 'ブラウン'], priority: 7 },
            { classification_type: 'color', standard_value: 'KHAKI', ko: ['카키', '카키색'], zh: ['卡其', '卡其色'], en: ['khaki'], ja: ['カーキ'], priority: 7 },
            { classification_type: 'color', standard_value: 'CAMEL', ko: ['카멜', '카멜색'], zh: ['驼色', '骆驼色'], en: ['camel'], ja: ['キャメル'], priority: 7 },
            { classification_type: 'color', standard_value: 'WINE', ko: ['와인', '와인색', '버건디'], zh: ['酒红', '红酒色'], en: ['wine', 'burgundy'], ja: ['ワイン', 'バーガンディ'], priority: 7 },
            { classification_type: 'color', standard_value: 'MUSTARD', ko: ['머스타드', '머스타드색'], zh: ['芥末黄', '姜黄'], en: ['mustard'], ja: ['マスタード'], priority: 7 },
            // 사이즈
            { classification_type: 'size', standard_value: 'XS', ko: ['엑스에스', 'XS'], zh: ['XS', '加小'], en: ['XS'], ja: ['XS'], priority: 5 },
            { classification_type: 'size', standard_value: 'S', ko: ['스몰', 'S'], zh: ['S', '小'], en: ['S', 'small'], ja: ['S', 'スモール'], priority: 6 },
            { classification_type: 'size', standard_value: 'M', ko: ['미디엄', 'M'], zh: ['M', '中'], en: ['M', 'medium'], ja: ['M', 'ミディアム'], priority: 6 },
            { classification_type: 'size', standard_value: 'L', ko: ['라지', 'L'], zh: ['L', '大'], en: ['L', 'large'], ja: ['L', 'ラージ'], priority: 6 },
            { classification_type: 'size', standard_value: 'XL', ko: ['엑스라지', 'XL'], zh: ['XL', '加大'], en: ['XL'], ja: ['XL'], priority: 5 },
            { classification_type: 'size', standard_value: 'XXL', ko: ['더블엑스라지', 'XXL', '2XL'], zh: ['XXL', '2XL'], en: ['XXL', '2XL'], ja: ['XXL', '2XL'], priority: 5 },
            { classification_type: 'size', standard_value: 'FREE', ko: ['프리', 'FREE', 'F'], zh: ['均码', 'FREE', 'F'], en: ['FREE', 'free', 'onesize', 'F'], ja: ['FREE', 'フリー', 'F'], priority: 7 },
            { classification_type: 'size', standard_value: '44', ko: ['44'], zh: ['44'], en: ['44'], ja: ['44'], priority: 5 },
            { classification_type: 'size', standard_value: '55', ko: ['55'], zh: ['55'], en: ['55'], ja: ['55'], priority: 5 },
            { classification_type: 'size', standard_value: '66', ko: ['66'], zh: ['66'], en: ['66'], ja: ['66'], priority: 5 },
            { classification_type: 'size', standard_value: '77', ko: ['77'], zh: ['77'], en: ['77'], ja: ['77'], priority: 5 },
            { classification_type: 'size', standard_value: '88', ko: ['88'], zh: ['88'], en: ['88'], ja: ['88'], priority: 5 },
            // 소재
            { classification_type: 'material', standard_value: 'WOOL', ko: ['울', '양모'], zh: ['羊毛', '毛'], en: ['wool'], ja: ['ウール', '羊毛'], priority: 8 },
            { classification_type: 'material', standard_value: 'COTTON', ko: ['면', '코튼', '순면'], zh: ['棉', '纯棉'], en: ['cotton'], ja: ['綿', 'コットン'], priority: 8 },
            { classification_type: 'material', standard_value: 'POLYESTER', ko: ['폴리에스터', '폴리'], zh: ['涤纶', '聚酯'], en: ['polyester'], ja: ['ポリエステル'], priority: 7 },
            { classification_type: 'material', standard_value: 'LINEN', ko: ['린넨', '마', '아마'], zh: ['亚麻'], en: ['linen', 'flax'], ja: ['リネン', '麻'], priority: 7 },
            { classification_type: 'material', standard_value: 'SILK', ko: ['실크', '비단', '견'], zh: ['丝绸', '真丝'], en: ['silk'], ja: ['シルク', '絹'], priority: 7 },
            { classification_type: 'material', standard_value: 'CASHMERE', ko: ['캐시미어'], zh: ['羊绒', '开司米'], en: ['cashmere'], ja: ['カシミア'], priority: 8 },
            { classification_type: 'material', standard_value: 'DENIM', ko: ['데님', '청'], zh: ['牛仔布'], en: ['denim'], ja: ['デニム'], priority: 7 },
            { classification_type: 'material', standard_value: 'LEATHER', ko: ['가죽', '레더'], zh: ['皮革', '真皮'], en: ['leather'], ja: ['革', 'レザー'], priority: 7 },
            { classification_type: 'material', standard_value: 'FUR', ko: ['퍼', '모피'], zh: ['毛皮', '皮草'], en: ['fur'], ja: ['ファー', '毛皮'], priority: 7 },
            { classification_type: 'material', standard_value: 'RAYON', ko: ['레이온', '인견'], zh: ['人造丝', '粘胶'], en: ['rayon', 'viscose'], ja: ['レーヨン', '人絹'], priority: 7 },
            { classification_type: 'material', standard_value: 'SPANDEX', ko: ['스판', '스판덱스', '폴리우레탄'], zh: ['氨纶', '弹性纤维'], en: ['spandex', 'lycra', 'elastane'], ja: ['スパンデックス', 'ポリウレタン'], priority: 7 },
        ];
        defaults.forEach(d => DB.addKeyword(d));
    }
};
