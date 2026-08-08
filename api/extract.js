const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, id, s = 1, e = 1 } = req.query;
    if (!type || !id) return res.status(400).json({ error: 'Missing parameters' });

    const embedUrl = type === 'movie' 
        ? `https://vidsrc.me/embed/movie/${id}` 
        : `https://vidsrc.me/embed/tv/${id}/${s}/${e}`;

    try {
        const response = await axios.get(embedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(response.data);
        const hash = $('div.server[data-name="VidSrc PRO"]').attr('data-hash') || $('div.server').first().attr('data-hash');
        
        if (!hash) throw new Error('Hash not found');

        const rcpUrl = `https://vidsrc.stream/rcp/${hash}`;
        const rcpRes = await axios.get(rcpUrl, { headers: { 'Referer': embedUrl } });
        const $rcp = cheerio.load(rcpRes.data);
        const encoded = $rcp('#hidden').attr('data-h');
        const seed = $rcp('body').attr('data-i');

        let decoded = "";
        const encodedBuf = Buffer.from(encoded, 'hex');
        for (let i = 0; i < encodedBuf.length; i++) {
            decoded += String.fromCharCode(encodedBuf[i] ^ seed.charCodeAt(i % seed.length));
        }

        let finalUrl = decoded.startsWith('//') ? `https:${decoded}` : decoded;
        const finalCheck = await axios.get(finalUrl, { 
            maxRedirects: 0, validateStatus: null, headers: { 'Referer': rcpUrl } 
        });
        
        res.status(200).json({ success: true, url: finalCheck.headers.location || finalUrl });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

