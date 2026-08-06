const axios = require('axios');

class Science {
    constructor(token, userAgent, proxyAgent = null) {
        this.token = token;
        this.userAgent = userAgent;
        this.proxyAgent = proxyAgent;
        this.analyticsToken = null;
        this.sessionId = "5b8f" + Math.random().toString(16).slice(2, 14);
        
        // Build Number atualizado para Agosto de 2026
        // Configurado para parecer uma aba secundária inativa
        this.superProperties = Buffer.from(JSON.stringify({
            os: "Windows",
            browser: "Chrome",
            device: "",
            system_locale: "pt-BR",
            browser_user_agent: userAgent,
            browser_version: "128.0.0.0",
            os_version: "10",
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
                        // Mimetismo de Segundo Plano: Nunca reportar foco ativo
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
        await this.track('channel_opened', { 
            guild_id: guildId, 
            channel_id: channelId, 
            channel_type: 0,
            location: "guild_sidebar"
        });
    }

    async trackMessageInteraction(guildId, channelId, messageId) {
        // Evento de clique em segundo plano
        await this.track('message_interaction', {
            guild_id: guildId,
            channel_id: channelId,
            message_id: messageId,
            interaction_type: 3,
            window_focused: true // Foca apenas no milissegundo do clique
        });
    }

    startHeartbeat() {
        // Heartbeat de aba inativa (mais lento e sem foco)
        setInterval(() => this.track('ui_performance', { 
            render_ms: Math.floor(5 + Math.random() * 10),
            window_focused: false,
            is_active: false
        }), 120000); // 2 minutos (padrão de aba de fundo)
    }
}

module.exports = Science;
