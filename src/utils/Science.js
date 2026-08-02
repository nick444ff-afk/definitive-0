const axios = require('axios');

/**
 * Utilitário para gerenciar a telemetria (Science) e Headers do Discord
 */
class Science {
    constructor(token, userAgent) {
        this.token = token;
        this.userAgent = userAgent;
        this.analyticsToken = null;
        this.superProperties = this.generateSuperProperties(userAgent);
    }

    /**
     * Gera o cabeçalho x-super-properties baseado no User-Agent
     */
    generateSuperProperties(ua) {
        const props = {
            os: ua.includes('Windows') ? 'Windows' : 'Mac OS X',
            browser: ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : 'Edge',
            device: "",
            system_locale: "pt-BR",
            browser_user_agent: ua,
            browser_version: "120.0.0.0",
            os_version: ua.includes('Windows') ? "10" : "10.15.7",
            referrer: "",
            referring_domain: "",
            referrer_current: "",
            referring_domain_current: "",
            release_channel: "stable",
            client_build_number: 260000, // Build aproximada de 2026
            client_event_source: null
        };
        return Buffer.from(JSON.stringify(props)).toString('base64');
    }

    /**
     * Define o token de analytics recebido no READY ou INFO
     */
    setAnalyticsToken(token) {
        this.analyticsToken = token;
    }

    /**
     * Envia um evento de telemetria para o endpoint /science
     */
    async sendEvent(eventName, data = {}) {
        if (!this.analyticsToken) return;

        try {
            const payload = {
                token: this.analyticsToken,
                events: [{
                    type: eventName,
                    properties: {
                        client_track_timestamp: Date.now(),
                        client_heartbeat_session_id: "8c7a" + Math.random().toString(16).slice(2, 14),
                        ...data
                    }
                }]
            };

            await axios.post('https://discord.com/api/v9/science', payload, {
                headers: {
                    'Authorization': this.token,
                    'User-Agent': this.userAgent,
                    'x-super-properties': this.superProperties,
                    'Content-Type': 'application/json'
                }
            });
        } catch (err) {
            // Silencioso para não alertar o usuário ou travar o bot
        }
    }

    /**
     * Simula a abertura de um canal
     */
    async trackChannelOpened(guildId, channelId) {
        await this.sendEvent('channel_opened', {
            guild_id: guildId,
            channel_id: channelId,
            channel_type: 0 // GUILD_TEXT
        });
    }

    /**
     * Simula a visualização de uma mensagem específica
     */
    async trackMessageViewed(channelId, messageId) {
        await this.sendEvent('message_viewed', {
            channel_id: channelId,
            message_id: messageId
        });
    }
}

module.exports = Science;
