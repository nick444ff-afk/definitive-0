const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - TRANSPLANTE TOTAL DA LÓGICA ORIGINAL
 * Este arquivo contém a lógica EXATA do ZIP original, adaptada para Web.
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 5; // Mantendo o limite de 5 conforme solicitado
    }

    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                onLog("⚠️ Automação já em execução", "warn");
                return false;
            }

            const { tokens, msgauto, mentionauto, categories, modos } = config;
            if (!tokens || tokens.length === 0) {
                onLog("❌ Nenhum token fornecido", "error");
                return false;
            }

            const automation = {
                isRunning: true,
                clients: [],
                intervals: [],
                processing: new Set(),
                clickedMessages: new Set(),
                guildClickCount: new Map(),
                msgAutoSentThisSession: new Set(),
                onLog,
                onStats
            };

            this.activeAutomations.set(botId, automation);

            // Iniciar para cada token
            for (const token of tokens) {
                if (!automation.isRunning) break;
                await this._runOriginalLogic(botId, automation, token, config);
            }

            return true;
        } catch (err) {
            onLog(`❌ Erro fatal: ${err.message}`, "error");
            return false;
        }
    }

    async _runOriginalLogic(botId, automation, token, config) {
        const { onLog, onStats } = automation;
        const { categories, modos, msgauto, mentionauto } = config;

        try {
            const self = new Client();
            await self.login(token);
            automation.clients.push(self);
            onLog(`✅ Logado como: ${self.user.tag}`, "success");

            // Mapeamento original exato
            const categoriaMap = {
                mobile: "mob",
                emulador: "emu",
                misto: "misto",
                tatico: "tatico"
            };

            const searchFormats = (modos || []).map(m => m.toLowerCase().replace("x", "v").replace("v", "x"));
            const searchCategories = (categories || []).map(cat => categoriaMap[cat.toLowerCase()] || cat.toLowerCase());

            onLog(`[AUTOMAÇÃO] Buscando: [${searchFormats.join(', ')}] - [${searchCategories.join(', ')}]`, "success");

            // Lógica de botões original exata
            const CATEGORY_KEYWORDS = {
                mobile: ["mobile", "mob", "celular", "📱"],
                emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
                misto: ["misto", "mis", "mix", "🕹️", "🕹"],
                tatico: ["tatico", "tático", "tat", "❗"]
            };

            const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair"];

            const processChannel = async (channel) => {
                const guildId = channel.guild?.id;
                if (!guildId || !automation.isRunning) return;
                
                const currentClicks = automation.guildClickCount.get(guildId) || 0;
                if (currentClicks >= this.MAX_ENTRIES_PER_GUILD) return;

                try {
                    const msgs = await channel.messages.fetch({ limit: 15 });
                    for (const msg of msgs.values()) {
                        if (!automation.isRunning) break;
                        if ((automation.guildClickCount.get(guildId) || 0) >= this.MAX_ENTRIES_PER_GUILD) break;
                        if (!msg.components?.length || automation.clickedMessages.has(msg.id)) continue;

                        const allButtons = [];
                        for (const row of msg.components) {
                            for (const component of row.components) {
                                if (component.type === "BUTTON" || component.customId) allButtons.push(component);
                            }
                        }

                        let bestMatch = null;
                        for (const cat of categories) {
                            const keywords = CATEGORY_KEYWORDS[cat.toLowerCase()] || [cat.toLowerCase()];
                            for (const button of allButtons) {
                                if (IGNORED_BUTTONS.includes(button.customId?.toLowerCase())) continue;
                                const searchText = `${button.customId} ${button.label} ${button.emoji?.name}`.toLowerCase();
                                if (keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
                                    bestMatch = button;
                                    break;
                                }
                            }
                            if (bestMatch) break;
                        }

                        if (!bestMatch) {
                            bestMatch = allButtons.find(b => b.customId === "join_player" || b.customId?.toLowerCase().includes("join"));
                        }

                        if (bestMatch) {
                            try {
                                const newCount = (automation.guildClickCount.get(guildId) || 0) + 1;
                                automation.guildClickCount.set(guildId, newCount);
                                await msg.clickButton(bestMatch.customId);
                                automation.clickedMessages.add(msg.id);
                                onLog(`✅ Tentativa ${newCount}/${this.MAX_ENTRIES_PER_GUILD} em #${channel.name} (${channel.guild.name})`, "success");
                                if (onStats) onStats({ entradas: [...automation.guildClickCount.values()].reduce((a, b) => a + b, 0) });
                                if (newCount >= this.MAX_ENTRIES_PER_GUILD) break;
                            } catch (err) {
                                onLog(`❌ Falha em #${channel.name}: ${err.message}`, "error");
                            }
                        }
                    }
                } catch (err) {}
            };

            let cycleStartTime = Date.now();
            const interval = setInterval(async () => {
                if (!automation.isRunning) return clearInterval(interval);

                try {
                    // LOOP INFINITO: Resetar contadores a cada 15 minutos para permitir novo ciclo
                    // Isso garante que o bot volte a clicar nos mesmos servidores após percorrer todos
                    if (Date.now() - cycleStartTime > 15 * 60 * 1000) {
                        automation.guildClickCount.clear();
                        automation.clickedMessages.clear();
                        automation.msgAutoSentThisSession.clear();
                        cycleStartTime = Date.now();
                        onLog("🔄 Reiniciando ciclo de automação (Loop Infinito)...", "info");
                    }

                    // 1. Escaneamento
                    const canaisFila = self.channels.cache.filter(c => {
                        if (c.type !== "GUILD_TEXT") return false;
                        const nome = c.name.toLowerCase();
                        const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                        const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat));
                        return matchesFormat && matchesCategory;
                    });

                    for (const [, channel] of canaisFila) {
                        if (automation.processing.has(channel.id)) continue;
                        automation.processing.add(channel.id);
                        await processChannel(channel);
                        setTimeout(() => automation.processing.delete(channel.id), 3000);
                    }

                    // 2. Partida (MENSAGEM E MENÇÃO) - LÓGICA ORIGINAL EXATA
                    const canaisPartida = self.channels.cache.filter(channel =>
                        channel.guild &&
                        (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                        (channel.name?.toLowerCase().includes("aguardando") || 
                         channel.name?.toLowerCase().includes("Aguardando") || 
                         channel.name?.toLowerCase().includes("partida") || 
                         channel.name?.toLowerCase().includes("Partida") || 
                         channel.name?.toLowerCase().includes("fila") || 
                         channel.name?.toLowerCase().includes("Fila")) &&
                        channel.viewable
                    );

                    for (const [, channel] of canaisPartida) {
                        if (automation.processing.has(channel.id)) continue;
                        automation.processing.add(channel.id);

                        try {
                            // MENSAGEM AUTOMÁTICA
                            if (msgauto && !automation.msgAutoSentThisSession.has(channel.id)) {
                                await channel.send(msgauto);
                                automation.msgAutoSentThisSession.add(channel.id);
                                onLog(`[MSG-AUTO] ✅ Enviada em #${channel.name}`, "success");
                            }

                            // MENÇÃO AUTOMÁTICA
                            if (mentionauto > 0) {
                                const msgs = await channel.messages.fetch({ limit: 5 });
                                const firstMsg = msgs.find(m => m.components?.length);
                                
                                if (firstMsg) {
                                    const mentionKey = `mention_${channel.id}_${firstMsg.id}`;
                                    if (!automation.clickedMessages.has(mentionKey)) {
                                        await new Promise(res => setTimeout(res, mentionauto * 1000));
                                        let foundMentions = [];
                                        const regex = /<@!?(\d+)>/g;
                                        const contentMentions = [...(firstMsg.content || "").matchAll(regex)].map(m => m[1]);
                                        foundMentions.push(...contentMentions);
                                        for (const embed of firstMsg.embeds) {
                                            if (embed.description) foundMentions.push(...[...embed.description.matchAll(regex)].map(m => m[1]));
                                            if (embed.fields) embed.fields.forEach(f => foundMentions.push(...[...f.value.matchAll(regex)].map(m => m[1])));
                                        }
                                        foundMentions = [...new Set(foundMentions)].filter(id => id !== self.user.id);
                                        for (const mentionUserId of foundMentions) {
                                            try {
                                                const member = await channel.guild.members.fetch(mentionUserId);
                                                if (!member.permissions.has("MANAGE_MESSAGES")) {
                                                    await channel.send(`<@${mentionUserId}>`);
                                                    automation.clickedMessages.add(mentionKey);
                                                    onLog(`[MENÇÃO] ✅ Mencionou <@${mentionUserId}> em #${channel.name}`, "success");
                                                    break;
                                                }
                                            } catch (e) {}
                                        }
                                    }
                                }
                            }
                        } catch (err) {}
                        setTimeout(() => automation.processing.delete(channel.id), 2000);
                    }
                } catch (err) {}
            }, 2000);

            automation.intervals.push(interval);

        } catch (err) {
            onLog(`❌ Erro: ${err.message}`, "error");
        }
    }

    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;
        automation.isRunning = false;
        automation.intervals.forEach(i => clearInterval(i));
        for (const client of automation.clients) {
            try { await client.destroy(); } catch (e) {}
        }
        this.activeAutomations.delete(botId);
        onLog("⚠️ Automação parada", "warn");
        return true;
    }
}

module.exports = new AutomationEngine();
