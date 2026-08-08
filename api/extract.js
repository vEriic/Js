const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, id, s = 1, e = 1 } = req.query;
    if (!type || !id) return res.status(400).json({ error: 'Missing parameters' });

    try {
        const embedUrl = type === 'movie' 
            ? `https://vidsrc.me/embed/movie/${id}` 
            : `https://vidsrc.me/embed/tv/${id}/${s}/${e}`;

        const response = await axios.get(embedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 5000
        });
        
        const $ = cheerio.load(response.data);
        const hash = $('div.server[data-name="VidSrc PRO"]').attr('data-hash') || $('div.server').first().attr('data-hash');
        
        if (hash) {
            const rcpUrl = `https://vidsrc.stream/rcp/${hash}`;
            const rcpRes = await axios.get(rcpUrl, { headers: { 'Referer': embedUrl }, timeout: 5000 });
            const $rcp = cheerio.load(rcpRes.data);
            const encoded = $rcp('#hidden').attr('data-h');
            const seed = $rcp('body').attr('data-i');

            if (encoded && seed) {
                let decoded = "";
                const encodedBuf = Buffer.from(encoded, 'hex');
                for (let i = 0; i < encodedBuf.length; i++) {
                    decoded += String.fromCharCode(encodedBuf[i] ^ seed.charCodeAt(i % seed.length));
                }
                let finalUrl = decoded.startsWith('//') ? `https:${decoded}` : decoded;
                return res.status(200).json({ success: true, url: finalUrl });
            }
        }
    } catch (err) {}

    // Fallback: إذا فشل الاستخراج، نعيد رابط الـ embed المباشر ليعمل كمشغل طوارئ
    const fallback = `https://vidsrc.xyz/embed/${type === 'movie' ? 'movie' : 'tv'}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`;
    res.status(200).json({ success: true, url: fallback });
};
