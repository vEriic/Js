const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, id, s = 1, e = 1 } = req.query;
    
    // قائمة المصادر بالترتيب
    const sources = [
        {
            name: 'vidsrc.to',
            url: type === 'movie' ? `https://vidsrc.to/embed/movie/${id}` : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
        },
        {
            name: 'vidsrc.me',
            url: type === 'movie' ? `https://vidsrc.me/embed/movie/${id}` : `https://vidsrc.me/embed/tv/${id}/${s}/${e}`
        }
    ];

    for (const source of sources) {
        try {
            const response = await axios.get(source.url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://vidsrc.to/'
                },
                timeout: 5000
            });
            
            const $ = cheerio.load(response.data);
            
            // 1. محاولة استخراج iframe src المباشر (لبنية vidsrc.me الجديدة)
            const iframeSrc = $('iframe#player_iframe').attr('src');
            if (iframeSrc && iframeSrc.startsWith('http')) {
                return res.status(200).json({ success: true, url: iframeSrc, source: 'iframe' });
            }

            // 2. محاولة استخراج hash (لبنية vidsrc.stream القديمة)
            const hash = $('div.server[data-name="VidSrc PRO"]').attr('data-hash') || $('div.server').first().attr('data-hash');
            if (hash) {
                const rcpUrl = `https://vidsrc.stream/rcp/${hash}`;
                const rcpRes = await axios.get(rcpUrl, { 
                    headers: { 'Referer': source.url }, 
                    timeout: 3000 
                });
                const $rcp = cheerio.load(rcpRes.data);
                const encoded = $rcp('#hidden').attr('data-h');
                const seed = $rcp('body').attr('data-i');

                if (encoded && seed) {
                    let decoded = "";
                    const encodedBuf = Buffer.from(encoded, 'hex');
                    for (let i = 0; i < encodedBuf.length; i++) {
                        decoded += String.fromCharCode(encodedBuf[i] ^ seed.charCodeAt(i % seed.length));
                    }
                    const finalUrl = decoded.startsWith('//') ? `https:${decoded}` : decoded;
                    return res.status(200).json({ success: true, url: finalUrl, source: 'hash' });
                }
            }
        } catch (err) {
            console.error(`Source ${source.name} failed:`, err.message);
        }
    }

    // الحل النهائي: إذا فشل كل شيء، نرسل رابط vidsrc.to المباشر (فهو يعمل كـ iframe ممتاز)
    const fallback = `https://vidsrc.to/embed/${type === 'movie' ? 'movie' : 'tv'}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`;
    res.status(200).json({ success: true, url: fallback, source: 'fallback' });
};
