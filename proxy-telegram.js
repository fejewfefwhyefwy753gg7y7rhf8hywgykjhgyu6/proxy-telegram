// Функция для получения геолокации с множественными API
async function getGeoLocationMultiAPI(ip) {
    const apis = [
        {
            name: 'ipapi.co',
            url: `https://ipapi.co/${ip}/json/`,
            parser: (data) => ({
                country: data.country_name || 'Неизвестно',
                countryCode: data.country_code || 'N/A',
                region: data.region || 'Неизвестно',
                city: data.city || 'Неизвестно',
                isp: data.org || 'Неизвестно'
            })
        },
        {
            name: 'ip-api.com',
            url: `http://ip-api.com/json/${ip}`,
            parser: (data) => {
                if (data.status !== 'success') throw new Error('API ip-api.com вернул ошибку');
                return {
                    country: data.country || 'Неизвестно',
                    countryCode: data.countryCode || 'N/A',
                    region: data.regionName || 'Неизвестно',
                    city: data.city || 'Неизвестно',
                    isp: data.isp || 'Неизвестно'
                };
            }
        },
        {
            name: 'ipinfo.io',
            url: `https://ipinfo.io/${ip}/json`,
            parser: (data) => ({
                country: data.country || 'Неизвестно',
                countryCode: data.country || 'N/A',
                region: data.region || 'Неизвестно',
                city: data.city || 'Неизвестно',
                isp: data.org || 'Неизвестно'
            })
        }
    ];

    for (const api of apis) {
        try {
            const response = await fetch(api.url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (response.ok) {
                const data = await response.json();
                return { ...api.parser(data), api: api.name };
            }
        } catch (error) {
            console.error(`Ошибка API ${api.name}:`, error.message);
        }
    }
    
    return {
        country: 'Ошибка получения',
        countryCode: 'N/A',
        region: 'Ошибка получения',
        city: 'Ошибка получения',
        isp: 'Ошибка получения',
        api: 'Все API недоступны'
    };
}

// Форматирование сообщения для Telegram
function formatTelegramMessage(userInfo) {
    const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const geo = userInfo.geoLocation;

    return `<b>🔍 Новая информация о пользователе</b>\n\n` +
        `<blockquote>` +
        `<b>⏰ Время сбора данных</b>\n` +
        `<code>${now}</code>\n\n` +
        `<b>💻 Информация о браузере</b>\n` +
        `<code>User Agent: ${userInfo.userAgent}</code>\n\n` +
        `<b>🌐 Сетевая информация</b>\n` +
        `<code>IP адрес: ${userInfo.ip}</code>\n\n` +
        `<b>🌍 Геолокация</b>\n` +
        `<code>Страна: ${geo.country} (${geo.countryCode})\n` +
        `Регион: ${geo.region}\n` +
        `Город: ${geo.city}\n` +
        `Провайдер: ${geo.isp}\n` +
        `API: ${geo.api}</code>\n\n` +
        `<b>🖥️ Системная информация</b>\n` +
        `<code>Разрешение экрана: ${userInfo.screenResolution}\n` +
        `Часовой пояс: ${userInfo.timezone}</code>` +
        `</blockquote>`;
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
        // Убедимся, что все поля существуют, чтобы избежать ошибок
        userInfo.userAgent = userInfo.userAgent || 'N/A';
        userInfo.screenResolution = userInfo.screenResolution || 'N/A';
        userInfo.timezone = userInfo.timezone || 'N/A';
        
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
