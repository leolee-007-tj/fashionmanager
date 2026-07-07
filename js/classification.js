const ClassificationService = {
    classify(title) {
        if (!title) return this.emptyResult();
        const keywords = DB.getKeywords().filter(k => k.is_active);
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
            const allKeywords = [
                ...(kw.ko_keywords || '').split(','),
                ...(kw.zh_keywords || '').split(','),
                ...(kw.en_keywords || '').split(','),
                ...(kw.other_aliases || '').split(','),
                kw.standard_value
            ].filter(k => k.trim().length > 0).map(k => k.trim().toLowerCase());
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
            { classification_type: 'brand', standard_value: 'SYSTEM', ko: ['시스템'], zh: ['SYSTEM', '系统'], en: ['SYSTEM', 'System'], ja: ['SYSTEM', 'システム'], priority: 8 },
            { classification_type: 'brand', standard_value: 'MIXXO', ko: ['믹소'], zh: ['MIXXO', '米克索'], en: ['MIXXO', 'Mixxo'], ja: ['MIXXO', 'ミッソ'], priority: 7 },
            { classification_type: 'brand', standard_value: 'SPAO', ko: ['스파오'], zh: ['SPAO', '斯帕奥'], en: ['SPAO', 'Spao'], ja: ['SPAO', 'スパオ'], priority: 7 },
            { classification_type: 'brand', standard_value: 'ZARA', ko: ['자라'], zh: ['ZARA', '飒拉'], en: ['ZARA', 'Zara'], ja: ['ZARA', 'ザラ'], priority: 9 },
            { classification_type: 'brand', standard_value: 'H&M', ko: ['에이치엔엠'], zh: ['H&M', '海恩莫里斯'], en: ['H&M', 'hm'], ja: ['H&M', 'エイチアンドエム'], priority: 9 },
            { classification_type: 'brand', standard_value: 'UNIQLO', ko: ['유니클로'], zh: ['UNIQLO', '优衣库'], en: ['UNIQLO', 'Uniqlo'], ja: ['UNIQLO', 'ユニクロ'], priority: 9 },
            { classification_type: 'category', standard_value: '니트', ko: ['니트'], zh: ['针织', '毛衣'], en: ['knit', 'sweater'], ja: ['ニット', 'セーター'], priority: 8 },
            { classification_type: 'category', standard_value: '자켓', ko: ['자켓', '재킷'], zh: ['夹克', '外套'], en: ['jacket'], ja: ['ジャケット'], priority: 7 },
            { classification_type: 'category', standard_value: '코트', ko: ['코트'], zh: ['大衣', '外套'], en: ['coat'], ja: ['コート'], priority: 7 },
            { classification_type: 'category', standard_value: '팬츠', ko: ['팬츠', '바지'], zh: ['裤子', '长裤'], en: ['pants', 'trousers'], ja: ['パンツ', 'ズボン'], priority: 7 },
            { classification_type: 'category', standard_value: '원피스', ko: ['원피스', '드레스'], zh: ['连衣裙'], en: ['dress'], ja: ['ワンピース', 'ドレス'], priority: 7 },
            { classification_type: 'category', standard_value: '셔츠', ko: ['셔츠'], zh: ['衬衫'], en: ['shirt'], ja: ['シャツ'], priority: 7 },
            { classification_type: 'color', standard_value: 'BLACK', ko: ['검정', '블랙'], zh: ['黑色', '黑'], en: ['black'], ja: ['黒', 'ブラック'], priority: 9 },
            { classification_type: 'color', standard_value: 'WHITE', ko: ['흰색', '화이트'], zh: ['白色', '白'], en: ['white'], ja: ['白', 'ホワイト'], priority: 9 },
            { classification_type: 'color', standard_value: 'CREAM', ko: ['크림', '아이보리'], zh: ['奶白', '米色'], en: ['cream', 'ivory'], ja: ['クリーム', 'アイボリー'], priority: 7 },
            { classification_type: 'color', standard_value: 'BEIGE', ko: ['베이지'], zh: ['米色', '米色'], en: ['beige'], ja: ['ベージュ'], priority: 7 },
            { classification_type: 'color', standard_value: 'RED', ko: ['빨강', '레드'], zh: ['红色', '红'], en: ['red'], ja: ['赤', 'レッド'], priority: 8 },
            { classification_type: 'color', standard_value: 'BLUE', ko: ['파랑', '블루'], zh: ['蓝色', '蓝'], en: ['blue'], ja: ['青', 'ブルー'], priority: 8 },
            { classification_type: 'color', standard_value: 'GREEN', ko: ['초록', '그린'], zh: ['绿色', '绿'], en: ['green'], ja: ['緑', 'グリーン'], priority: 8 },
            { classification_type: 'color', standard_value: 'PINK', ko: ['분홍', '핑크'], zh: ['粉色', '粉'], en: ['pink'], ja: ['ピンク'], priority: 7 },
            { classification_type: 'color', standard_value: 'GRAY', ko: ['회색', '그레이'], zh: ['灰色', '灰'], en: ['gray', 'grey'], ja: ['グレー'], priority: 7 },
            { classification_type: 'size', standard_value: 'XS', ko: ['엑스에스'], zh: ['XS', '加小'], en: ['XS'], ja: ['XS'], priority: 5 },
            { classification_type: 'size', standard_value: 'S', ko: ['스몰', 'S'], zh: ['S', '小'], en: ['S', 'small'], ja: ['S', 'スモール'], priority: 6 },
            { classification_type: 'size', standard_value: 'M', ko: ['미디엄', 'M'], zh: ['M', '中'], en: ['M', 'medium'], ja: ['M', 'ミディアム'], priority: 6 },
            { classification_type: 'size', standard_value: 'L', ko: ['라지', 'L'], zh: ['L', '大'], en: ['L', 'large'], ja: ['L', 'ラージ'], priority: 6 },
            { classification_type: 'size', standard_value: 'XL', ko: ['엑스라지', 'XL'], zh: ['XL', '加大'], en: ['XL'], ja: ['XL'], priority: 5 },
            { classification_type: 'size', standard_value: 'FREE', ko: ['프리', 'FREE'], zh: ['均码', 'FREE'], en: ['FREE', 'free', 'onesize'], ja: ['FREE', 'フリー'], priority: 7 },
            { classification_type: 'material', standard_value: 'WOOL', ko: ['울', '양모'], zh: ['羊毛', '毛'], en: ['wool'], ja: ['ウール', '羊毛'], priority: 8 },
            { classification_type: 'material', standard_value: 'COTTON', ko: ['면', '코튼'], zh: ['棉', '纯棉'], en: ['cotton'], ja: ['綿', 'コットン'], priority: 8 },
            { classification_type: 'material', standard_value: 'POLYESTER', ko: ['폴리에스터', '폴리'], zh: ['涤纶', '聚酯'], en: ['polyester'], ja: ['ポリエステル'], priority: 7 },
            { classification_type: 'material', standard_value: 'LINEN', ko: ['린넨', '마'], zh: ['亚麻'], en: ['linen', 'flax'], ja: ['リネン', '麻'], priority: 7 },
            { classification_type: 'material', standard_value: 'SILK', ko: ['실크', '비단'], zh: ['丝绸', '真丝'], en: ['silk'], ja: ['シルク', '絹'], priority: 7 },
            { classification_type: 'material', standard_value: 'CASHMERE', ko: ['캐시미어'], zh: ['羊绒', '开司米'], en: ['cashmere'], ja: ['カシミア'], priority: 8 },
        ];
        defaults.forEach(d => DB.addKeyword(d));
    }
};
