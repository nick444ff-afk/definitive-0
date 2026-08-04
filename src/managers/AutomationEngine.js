const { Client } = require('discord.js-selfbot-v13');
const HumanSim = require('../utils/HumanSim');
const Science = require('../utils/Science');

class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
    }

    async _performWhiteNoise(client, guild, onLog) {
        try {
            const rand = Math.random();
            if (rand < 0.7) {
                const randomChannel = guild.channels.cache.find(c => 
                    c.type === "GUILD_TEXT" && 
                    (c.name.includes("regras") || c.name.includes("rules") || c.name.includes("geral") || c.name.includes("announcements"))
                );
                if (randomChannel) {
                    await HumanSim.enterChannel(client, randomChannel);
                    if (client.science) await client.science.trackChannelOpened(guild.id, randomChannel.id);
                    await HumanSim.sleep(2000 + Math.random() * 3000);
                }
            } else if (rand < 0.9) {
                const voiceChannel = guild.channels.cache.find(c => c.type === "GUILD_VOICE" && c.viewable);
                if (voiceChannel) {
                    try {
                        await voiceChannel.join({ selfMute: true, selfDeaf: true });
                        await HumanSim.sleep(5000 + Math.random() * 10000);
                        voiceChannel.leave();
                    } catch (e) {}
                }
            } else {
                await HumanSim.sleep(2000 + Math.random() * 3000);
            }
        } catch (e) {}
    }

    async startAutomation(botId, config, onLog, onStats) {
        if (this.activeAutomations.has(botId)) return false;
        const { tokens } = config;
        if (!tokens || tokens.length === 0) return false;

        const automation = {
            isRunning: true,
            clients: [],
            globalClickCount: 0,
            clickedModesInCycle: new Set(),
            limiteCliquesGeral: 4,
            blacklistedGuilds: new Set(),
            confirmedChannels: new Set(),
            onLog,
            onStats
        };

        this.activeAutomations.set(botId, automation);

        for (const token of tokens) {
            if (!automation.isRunning) break;
            this._runOriginalLogic(botId, automation, token, config).catch(err => {
                onLog(`❌ Erro no token ${token.substring(0, 10)}: ${err.message}`, "error");
            });
        }
        return true;
    }

    async _runOriginalLogic(botId, automation, token, config) {
        const { onLog, onStats } = automation;
        const { categories, modos, targets } = config;
        let actionCounter = 0;

        try {
            const self = new Client();
            const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
            const science = new Science(token, userAgent);
            self.science = science;

            self.options.http.headers = {
                ...self.options.http.headers,
                'User-Agent': userAgent,
                'x-super-properties': science.superProperties
            };

            await self.login(token);
            if (self.user.analyticsToken) science.setAnalyticsToken(self.user.analyticsToken);
            science.startHeartbeat();

            // Status Dinâmico
            setInterval(async () => {
                if (!automation.isRunning) return;
                const statusPhrases = ["Calculando...", "Vendo as filas", "AFK", "Trabalhando"];
                const phrase = statusPhrases[Math.floor(Math.random() * statusPhrases.length)];
                try {
                    await self.user.setPresence({ activities: [{ name: phrase, type: "CUSTOM" }] });
                    await science.trackSettingsOpened();
                } catch (e) {}
            }, 15 * 60 * 1000);

            automation.clients.push(self);
            onLog(`🟢 Logado com @${self.user.username}`, "success");

            const searchFormats = (modos || []).map(m => m.toLowerCase().replace(/[vx\s]/g, ""));
            const activeCategories = (categories || []).map(c => c.toLowerCase());

            const CATEGORY_KEYWORDS = {
                mobile: ["mobile", "mob", "celular", "📱"],
                emulador: ["emulador", "emu", "emul", "🖥️"],
                misto: ["misto", "mis", "mix", "🕹️"],
                tatico: ["tatico", "tat", "❗"]
            };

            const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "sair", "finalizar"];

            const findCorrectButton = (buttons) => {
                for (const cat of activeCategories) {
                    const keywords = CATEGORY_KEYWORDS[cat] || [cat];
                    for (const b of buttons) {
                        const txt = `${b.customId} ${b.label} ${b.emoji?.name}`.toLowerCase();
                        if (keywords.some(kw => txt.includes(kw)) && !IGNORED_BUTTONS.some(i => txt.includes(i))) return b;
                    }
                }
                return buttons.find(b => 
                    (b.customId?.toLowerCase().includes("join") || b.label?.toLowerCase().includes("entrar") || b.label?.toLowerCase().includes("fila")) && 
                    !IGNORED_BUTTONS.some(i => (b.customId || "").toLowerCase().includes(i))
                );
            };

            const processChannel = async (channel) => {
                try {
                    const msgs = await channel.messages.fetch({ limit: 10 });
                    const msgArray = [...msgs.values()];
                    
                    for (const msg of msgArray) {
                        if (!automation.isRunning || !msg.components?.length) continue;
                        
                        // Filtro de Valor Fixo (0.50 - 20.00)
                        const content = (msg.content + " " + msg.embeds.map(e => e.description || "").join(" ")).replace(/,/g, '.');
                        const values = content.match(/\d+(\.\d+)?/g) || [];
                        const val = values.length > 0 ? parseFloat(values[0]) : null;
                        if (val !== null && (val < 0.50 || val > 20.00)) continue;

                        const buttons = [];
                        msg.components.forEach(row => row.components.forEach(c => buttons.push(c)));
                        const button = findCorrectButton(buttons);
                        if (!button) continue;

                        // Distribuição de Modos (1 clique por modo por ciclo)
                        const channelNameNorm = channel.name.toLowerCase().replace(/[vx\s]/g, "");
                        const mode = searchFormats.find(f => channelNameNorm.includes(f)) || "unknown";
                        if (mode !== "unknown" && automation.clickedModesInCycle.has(mode)) continue;

                        // Clique Humano
                        await HumanSim.sleep(HumanSim.getClickJitter());
                        await msg.clickButton(button.customId);
                        
                        automation.globalClickCount++;
                        if (mode !== "unknown") automation.clickedModesInCycle.add(mode);
                        
                        onLog(`✅ Clicado | ${channel.guild.name} | ${mode.toUpperCase()}`, "success");
                        if (onStats) onStats({ entradas: automation.globalClickCount });

                        // Fuga Imediata e Window Blur
                        await science.trackWindowFocus(false);
                        
                        // --- AGENDAR CONFIRMAÇÃO (2s) ---
                        setTimeout(async () => {
                            try {
                                const freshMsgs = await channel.messages.fetch({ limit: 5 });
                                const firstMsg = freshMsgs.find(m => m.components?.length);
                                if (firstMsg) {
                                    for (const row of firstMsg.components) {
                                        for (const b of row.components) {
                                            if (b.customId && !IGNORED_BUTTONS.some(i => b.customId.includes(i))) {
                                                await firstMsg.clickButton(b.customId);
                                                onLog(`✅ Confirmado | ${channel.guild.name}`, "success");
                                                return;
                                            }
                                        }
                                    }
                                }
                            } catch (e) {}
                        }, 2000);

                        await HumanSim.sleep(2000 + Math.random() * 3000);
                        return true;
                    }
                } catch (e) { return false; }
                return false;
            };

            // Loop Principal Intercalado
            let guildQueue = [];
            (async () => {
                while (automation.isRunning) {
                    try {
                        if (automation.globalClickCount >= automation.limiteCliquesGeral) {
                            onLog(`🏁 Ciclo de 4 cliques concluído. Pausando 1 min...`, "info");
                            await HumanSim.sleep(60000 + Math.random() * 30000);
                            automation.globalClickCount = 0;
                            automation.clickedModesInCycle.clear();
                        }

                        if (guildQueue.length === 0) {
                            const targetsList = (targets || []).filter(t => t.selected);
                            guildQueue = (targetsList.length > 0 ? targetsList : [...self.guilds.cache.values()])
                                .sort(() => Math.random() - 0.5);
                        }

                        const target = guildQueue.shift();
                        const gId = target.guildId || target.id;
                        const guild = self.guilds.cache.get(gId);
                        if (!guild) continue;

                        const channels = guild.channels.cache.filter(c => {
                            if (c.type !== "GUILD_TEXT" || !c.viewable) return false;
                            const nameNorm = c.name.toLowerCase().replace(/[vx\s]/g, "");
                            return searchFormats.length === 0 || searchFormats.some(f => nameNorm.includes(f));
                        });

                        for (const channel of channels.values()) {
                            if (!automation.isRunning) break;
                            if (automation.globalClickCount >= automation.limiteCliquesGeral) break;

                            await HumanSim.enterChannel(self, channel);
                            await science.trackChannelOpened(guild.id, channel.id);
                            await HumanSim.sleep(HumanSim.getObservationDelay());

                            if (await processChannel(channel)) {
                                actionCounter++;
                                if (actionCounter % 5 === 0) await this._performWhiteNoise(self, guild, onLog);
                                break; // Pula para próximo servidor após 1 clique bem-sucedido
                            }
                        }
                        await HumanSim.sleep(HumanSim.getServerTransitionDelay());
                    } catch (e) { await HumanSim.sleep(5000); }
                }
            })();

        } catch (e) {}
    }

    async stopAutomation(botId) {
        const a = this.activeAutomations.get(botId);
        if (a) {
            a.isRunning = false;
            a.clients.forEach(c => c.destroy());
            this.activeAutomations.delete(botId);
        }
    }
}

module.exports = new AutomationEngine();
