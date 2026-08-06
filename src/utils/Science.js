const axios = require('axios');

class Science {
    constructor(token, userAgent, proxyAgent = null) {
        this.token = token;
        this.userAgent = userAgent; // User-Agent Mobile será passado pelo AutomationEngine
        this.proxyAgent = proxyAgent;
        this.analyticsToken = null;
        this.sessionId = "5b8f" + Math.random().toString(16).slice(2, 14);
        
        // Super Properties simulando Discord iOS (Agosto 2026)
        // Isso permite coexistir com o usuário no Desktop/Web sem conflito
        this.superProperties = Buffer.from(JSON.stringify({
            os: "iOS",
            browser: "Discord iOS",
            device: "iPhone16,2",
            system_locale: "pt-BR",
            client_version: "230.0",
            release_channel: "stable",
            device_advertiser_id: "00000000-0000-0000-0000-000000000000",
            os_version: "17.5.1",
            client_build_number: 62500, 
            client_event_source: null,
            design_id: 0
        })).toString('base64');
    }

    setAnalyticsToken(token) {
        this.analyticsToken = token;
    }

    async track(eventName, properties = {}) {
        if (!this.analyticsToken) return;
        try {
            await axios.post('https://discord.com/api/v9/science', {
                token: this.analyticsToken,
                events: [{
                    type: eventName,
                    properties: {
                        client_track_timestamp: Date.now(),
                        client_heartbeat_session_id: this.sessionId,
                        accessibility_features: 128,
                        rendered_at: Date.now() - 500,
                        // Mobile Behavior: Sessão em segundo plano
                        window_focused: false,
                        is_active: false,
                        ...properties
                    }
                }]
            }, {
                httpsAgent: this.proxyAgent,
                headers: {
                    'Authorization': this.token,
                    'User-Agent': this.userAgent,
                    'x-super-properties': this.superProperties
                }
            });
        } catch (e) {}
    }

    async trackChannelOpened(guildId, channelId) {
        // Mobile raramente envia channel_opened da mesma forma que desktop
        // Vamos suprimir para evitar conflito com o canal que o usuário está vendo
    }

    async trackMessageInteraction(guildId, channelId, messageId) {
        await this.track('message_interaction', {
            guild_id: guildId,
            channel_id: channelId,
            message_id: messageId,
            interaction_type: 3,
            location: "message_component"
        });
    }

    startHeartbeat() {
        // Heartbeat Mobile (mais espaçado)
        setInterval(() => this.track('ui_performance', { 
            render_ms: Math.floor(10 + Math.random() * 20),
            window_focused: false,
            is_active: false
        }), 180000); // 3 minutos
    }
}

module.exports = Science;
