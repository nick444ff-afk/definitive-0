const axios = require('axios');

class Science {
    constructor(token, userAgent, proxyAgent = null) {
        this.token = token;
        this.userAgent = userAgent;
        this.proxyAgent = proxyAgent;
        this.analyticsToken = null;
        this.sessionId = "5b8f" + Math.random().toString(16).slice(2, 14);
        
        // Super Properties simulando Android Chrome (Agosto 2026)
        // Identidade robusta para evitar restrições de dispositivo
        this.superProperties = Buffer.from(JSON.stringify({
            os: "Android",
            browser: "Chrome",
            device: "",
            system_locale: "pt-BR",
            browser_user_agent: userAgent,
            browser_version: "128.0.0.0",
            os_version: "13",
            referrer: "https://www.google.com/",
            referring_domain: "www.google.com",
            referrer_current: "",
            referring_domain_current: "",
            release_channel: "stable",
            client_build_number: 325000, 
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
        // Suprimido para evitar conflito com uso manual
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
        // Heartbeat de aba de fundo Android
        setInterval(() => this.track('ui_performance', { 
            render_ms: Math.floor(10 + Math.random() * 20),
            window_focused: false,
            is_active: false
        }), 150000); // 2.5 minutos
    }
}

module.exports = Science;
