const express = require('express');
const puppeteer = require('playwright');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS setup to allow WebOS app access
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

async function extractM3U8(type, id, s = 1, e = 1) {
    const url = type === 'movie' 
        ? `https://vidsrc.me/embed/movie/${id}` 
        : `https://vidsrc.me/embed/tv/${id}/${s}/${e}`;

    let m3u8Url = null;
    const { chromium } = require('playwright');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.new_context({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    });
    const page = await context.new_page();

    // Intercept requests
    page.on('request', request => {
        const reqUrl = request.url();
        if (reqUrl.includes('.m3u8') && !m3u8Url) {
            m3u8Url = reqUrl;
        }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Click play button to trigger network activity
        const playSelectors = ['#bigPlay', '.jw-bigplay', 'button', 'svg'];
        for (const selector of playSelectors) {
            try {
                const btn = await page.$(selector);
                if (btn) {
                    await btn.click();
                    await page.waitForTimeout(2000);
                    if (m3u8Url) break;
                }
            } catch (err) {}
        }

        // Poll for a few seconds if not found
        let attempts = 0;
        while (!m3u8Url && attempts < 10) {
            await page.waitForTimeout(1000);
            attempts++;
        }
    } catch (err) {
        console.error('Extraction error:', err);
    } finally {
        await browser.close();
    }

    return m3u8Url;
}

app.get('/extract', async (req, res) => {
    const { type, id, s, e } = req.query;
    if (!type || !id) {
        return res.status(400).json({ error: 'Missing type or id' });
    }

    console.log(`Extracting for ${type} ID: ${id}`);
    const streamUrl = await extractM3U8(type, id, s, e);
    
    if (streamUrl) {
        res.json({ success: true, url: streamUrl });
    } else {
        res.status(404).json({ success: false, error: 'Could not extract stream' });
    }
});

app.listen(PORT, () => {
    console.log(`VidSrc API Server running on port ${PORT}`);
});

