const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, id, s = 1, e = 1 } = req.query;
    try {
        const embedUrl = type === 'movie' 
            ? `https://vidsrc.me/embed/movie/${id}` 
            : `https://vidsrc.me/embed/tv/${id}/${s}/${e}`;

        const response = await axios.get(embedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 4000 // مهلة قصيرة جداً لضمان السرعة
        });
        
        const $ = cheerio.load(response.data);
        const hash = $('div.server[data-name="VidSrc PRO"]').attr('data-hash') || $('div.server').first().attr('data-hash');
        
        if (hash) {
            const rcpUrl = `https://vidsrc.stream/rcp/${hash}`;
            const rcpRes = await axios.get(rcpUrl, { headers: { 'Referer': embedUrl }, timeout: 3000 });
            const $rcp = cheerio.load(rcpRes.data);
            const encoded = $rcp('#hidden').attr('data-h');
            const seed = $rcp('body').attr('data-i');

            if (encoded && seed) {
                let decoded = "";
                const encodedBuf = Buffer.from(encoded, 'hex');
                for (let i = 0; i < encodedBuf.length; i++) {
                    decoded += String.fromCharCode(encodedBuf[i] ^ seed.charCodeAt(i % seed.length));
                }
                return res.status(200).json({ success: true, url: decoded.startsWith('//') ? `https:${decoded}` : decoded });
            }
        }
    } catch (err) {}

    // إذا فشل الاستخراج السريع، نرسل رابط الطوارئ فوراً
    const fallback = `https://vidsrc.xyz/embed/${type === 'movie' ? 'movie' : 'tv'}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`;
    res.status(200).json({ success: true, url: fallback });
};
