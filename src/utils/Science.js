const axios = require('axios');

class Science {
    constructor(token, userAgent, proxyAgent = null) {
        this.token = token;
        this.userAgent = userAgent;
        this.proxyAgent = proxyAgent;
        this.analyticsToken = null;
        this.superProperties = Buffer.from(JSON.stringify({
            os: "Windows",
            browser: "Chrome",
            device: "",
            system_locale: "pt-BR",
            browser_user_agent: userAgent,
            browser_version: "126.0.0.0",
            os_version: "10",
            referrer: "https://www.google.com/",
            referring_domain: "www.google.com",
            referrer_current: "",
            referring_domain_current: "",
            release_channel: "stable",
            client_build_number: 320420,
            client_event_source: null
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
                        client_heartbeat_session_id: "5b8f" + Math.random().toString(16).slice(2, 14),
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
        await this.track('channel_opened', { guild_id: guildId, channel_id: channelId, channel_type: 0 });
    }

    async trackSettingsOpened() {
        await this.track('settings_opened', { section: 'USER_SETTINGS', subsection: 'ACCOUNT' });
    }

    async trackWindowFocus(focused) {
        await this.track('window_focused', { focused: focused });
    }

    startHeartbeat() {
        setInterval(() => this.track('ui_performance', { 
            render_ms: Math.floor(10 + Math.random() * 20),
            window_focused: true 
        }), 60000);
    }
}

module.exports = Science;
