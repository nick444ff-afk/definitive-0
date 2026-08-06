const axios = require('axios');

class Science {
    constructor(token, userAgent, proxyAgent = null) {
        this.token = token;
        this.userAgent = userAgent;
        this.proxyAgent = proxyAgent;
        this.analyticsToken = null;
        this.sessionId = "5b8f" + Math.random().toString(16).slice(2, 14);
        
        // Build Number atualizado para Agosto de 2026
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
        await this.track('message_interaction', {
            guild_id: guildId,
            channel_id: channelId,
            message_id: messageId,
            interaction_type: 3 // Component interaction
        });
    }

    async trackWindowFocus(focused) {
        await this.track('window_focused', { focused: focused });
    }

    startHeartbeat() {
        // Heartbeat de UI mais realista
        setInterval(() => this.track('ui_performance', { 
            render_ms: Math.floor(15 + Math.random() * 25),
            window_focused: true,
            is_active: true
        }), 45000);
    }
}

module.exports = Science;
