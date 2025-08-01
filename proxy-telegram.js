// Функция для получения геолокации с множественными API
async function getGeoLocationMultiAPI(ip) {
    const apis = [
        {
            name: 'ipapi.co',
            url: `https://ipapi.co/${ip}/json/`,
            parser: (data) => ({
                country: data.country_name || 'Неизвестно',
                city: data.city || 'Неизвестно',
                isp: data.org || 'Неизвестно',
            })
        },
        {
            name: 'ip-api.com',
            url: `http://ip-api.com/json/${ip}`,
            parser: (data) => {
                if (data.status !== 'success') throw new Error('API ip-api.com вернул ошибку');
                return {
                    country: data.country || 'Неизвестно',
                    city: data.city || 'Неизвестно',
                    isp: data.isp || 'Неизвестно',
                };
            }
        },
        {
            name: 'ipinfo.io',
            url: `https://ipinfo.io/${ip}/json`,
            parser: (data) => ({
                country: data.country || 'Неизвестно',
                city: data.city || 'Неизвестно',
                isp: data.org || 'Неизвестно',
            })
        },
    ];

    for (const api of apis) {
        try {
            const response = await fetch(api.url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (response.ok) {
                const data = await response.json();
                const geoData = api.parser(data);
                return { ...geoData, api: api.name };
            }
        } catch (error) {
            console.error(`Ошибка API ${api.name}:`, error.message);
        }
    }
    
    return {
        country: 'Ошибка',
        city: 'Ошибка',
        isp: 'Ошибка',
        api: 'Все недоступны'
    };
}

// Форматирование сообщения для Telegram
function formatTelegramMessage(userInfo) {
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const geo = userInfo.geoLocation;
    
    return `<b>🔍 Новая информация</b>\n\n` +
           `<b>Время:</b> <code>${now}</code>\n` +
           `<b>IP:</b> <code>${userInfo.ip}</code>\n` +
           `<b>Страна:</b> <code>${geo.country}</code>\n` +
           `<b>Город:</b> <code>${geo.city}</code>\n` +
           `<b>Провайдер:</b> <code>${geo.isp}</code>\n` +
           `<b>User Agent:</b> <code>${userInfo.userAgent}</code>\n` +
           `<b>API:</b> <code>${geo.api}</code>`;
}

// Отправка сообщения в Telegram
async function sendToTelegram(message) {
    const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
    const CHAT_ID = Deno.env.get("CHAT_ID");

    if (!BOT_TOKEN || !CHAT_ID) {
        throw new Error("BOT_TOKEN или CHAT_ID не установлены в переменных окружения");
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ошибка Telegram API: ${error}`);
    }
    return response.json();
}

// Главный обработчик Deno Deploy
Deno.serve(async (request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response('салам', { status: 405, headers: corsHeaders });
    }

    try {
        const userInfo = await request.json();
        const geoInfo = await getGeoLocationMultiAPI(userInfo.ip);
        userInfo.geoLocation = geoInfo;
        
        const message = formatTelegramMessage(userInfo);
        await sendToTelegram(message);

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("Главная ошибка:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
