const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - LÓGICA INTEGRADA E REFINADA
 * Extraída do arquivo ofc_simplificado_final(6).zip
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 1; // Conforme definido no ZIP (MAX_ENTRIES_PER_GUILD = 1)
    }

    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                onLog("⚠️ Automação já em execução para este bot", "warn");
                return false;
            }

            const { tokens, msgauto, mentionauto, confirmauto, categories, modos, msgdelay } = config;
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
                confirmedChannels: new Set(), // Para controle de confirmação automática
                lastClickTime: 0, // Controle de delay global entre cliques
                onLog,
                onStats
            };

            this.activeAutomations.set(botId, automation);

            // --- LOGIN ESCALONADO ---
            onLog(`🚀 Iniciando ${tokens.length} tokens com intervalo de segurança...`, "info");
            for (let i = 0; i < tokens.length; i++) {
                if (!automation.isRunning) break;
                
                const token = tokens[i];
                if (i > 0) {
                    const loginDelay = 3000 + Math.random() * 2000; // 3-5 segundos entre logins
                    await new Promise(res => setTimeout(res, loginDelay));
                }
                
                this._runOriginalLogic(botId, automation, token, config).catch(err => {
                    onLog(`❌ Erro crítico no token ${token.substring(0, 10)}...: ${err.message}`, "error");
                });
            }

            return true;
        } catch (err) {
            onLog(`❌ Erro fatal ao iniciar automação: ${err.message}`, "error");
            return false;
        }
    }

    async _runOriginalLogic(botId, automation, token, config) {
        const { onLog, onStats } = automation;
        const { categories, modos, msgauto, mentionauto, confirmauto } = config;

        try {
            const self = new Client();
            
            self.on('error', (err) => onLog(`⚠️ Erro no Client: ${err.message}`, "warn"));
            self.on('disconnect', () => onLog(`⚠️ Client desconectado.`, "warn"));

            await self.login(token);
            automation.clients.push(self);
            onLog(`✅ Logado como: ${self.user.tag}`, "success");

            const categoriaMap = {
                mobile: "mob",
                emulador: "emu",
                misto: "misto",
                tatico: "tatico"
            };

            // Formatos e Categorias para busca (v13 usa replace v por x conforme lógica do ZIP)
            const searchFormats = (modos || []).map(m => m.toLowerCase().replace("v", "x"));
            const searchCategories = (categories || []).map(cat => categoriaMap[cat.toLowerCase()] || cat.toLowerCase());

            onLog(`[AUTOMAÇÃO] Buscando canais que contenham: [${searchFormats.join(', ')}] e [${searchCategories.join(', ')}]`, "success");

            const CATEGORY_KEYWORDS = {
                mobile: ["mobile", "mob", "celular", "📱"],
                emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
                misto: ["misto", "mis", "mix", "🕹️", "🕹"],
                tatico: ["tatico", "tático", "tat", "❗"]
            };

            const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair"];

            const findCorrectButton = (buttons, activeCategories) => {
                let bestMatch = null;
                for (const cat of activeCategories) {
                    const keywords = CATEGORY_KEYWORDS[cat.toLowerCase()] || [cat.toLowerCase()];
                    for (const button of buttons) {
                        if (IGNORED_BUTTONS.includes(button.customId?.toLowerCase())) continue;
                        if (button.label && IGNORED_BUTTONS.includes(button.label.toLowerCase())) continue;

                        const searchText = `${button.customId} ${button.label} ${button.emoji?.name}`.toLowerCase();
                        if (keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
                            bestMatch = button;
                            break;
                        }
                    }
                    if (bestMatch) break;
                }

                if (!bestMatch) {
                    bestMatch = buttons.find(b => 
                        b.customId === "join_player" || 
                        b.customId?.toLowerCase().includes("join") ||
                        b.customId?.toLowerCase().includes("entrar")
                    );
                }
                return bestMatch;
            };

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

                        const correctButton = findCorrectButton(allButtons, categories);

                        if (correctButton) {
                            try {
                                // --- DELAY COM JITTER (ALEATÓRIO) ENTRE CLIQUES ---
                                const now = Date.now();
                                const timeSinceLastClick = now - (automation.lastClickTime || 0);
                                const baseDelay = 2000;
                                const jitter = Math.random() * 1500; // Adiciona 0-1.5s aleatório
                                const targetDelay = baseDelay + jitter;

                                if (timeSinceLastClick < targetDelay) {
                                    const waitTime = targetDelay - timeSinceLastClick;
                                    await new Promise(res => setTimeout(res, waitTime));
                                }
                                automation.lastClickTime = Date.now();

                                const newCount = (automation.guildClickCount.get(guildId) || 0) + 1;
                                automation.guildClickCount.set(guildId, newCount);
                                
                                await msg.clickButton(correctButton.customId);
                                automation.clickedMessages.add(msg.id);
                                
                                onLog(`✅ Entrada realizada em #${channel.name} (${channel.guild.name}) [${newCount}/${this.MAX_ENTRIES_PER_GUILD}]`, "success");
                                if (onStats) onStats({ entradas: [...automation.guildClickCount.values()].reduce((a, b) => a + b, 0) });
                                
                                if (newCount >= this.MAX_ENTRIES_PER_GUILD) break;
                            } catch (err) {
                                onLog(`❌ Erro ao clicar em #${channel.name}: ${err.message}`, "error");
                            }
                        }
                    }
                } catch (err) {
                    // Erro silencioso ao buscar mensagens
                }
            };

            // --- ESCANEAMENTO SUAVE (INTERVALO DE 3 SEGUNDOS) ---
            const interval = setInterval(async () => {
                if (!automation.isRunning) return clearInterval(interval);

                try {
                    // 1. ESCANEAMENTO DE CANAIS DE FILA
                    const canaisFila = self.channels.cache.filter(c => {
                        if (c.type !== "GUILD_TEXT") return false;
                        const nome = c.name.toLowerCase();
                        const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                        const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat));
                        return matchesFormat && matchesCategory;
                    });

                    let processedInThisTick = 0;
                    // --- PROCESSAMENTO SEQUENCIAL COM DELAY ---
                    for (const [, channel] of canaisFila) {
                        if (!automation.isRunning) break;
                        if (automation.processing.has(channel.id)) continue;
                        
                        const guildId = channel.guild?.id;
                        if (guildId && (automation.guildClickCount.get(guildId) || 0) >= this.MAX_ENTRIES_PER_GUILD) continue;

                        automation.processing.add(channel.id);
                        await processChannel(channel);
                        processedInThisTick++;
                        
                        // Pequeno delay entre processar um canal e outro (1s + jitter)
                        await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000));
                        setTimeout(() => automation.processing.delete(channel.id), 5000);
                    }

                    // 2. MONITORAMENTO DE PARTIDAS (MSG AUTO, CONFIRMAÇÃO, MENÇÃO)
                    const canaisPartida = self.channels.cache.filter(channel =>
                        channel.guild &&
                        (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                        (channel.name?.toLowerCase().includes("aguardando") || 
                         channel.name?.toLowerCase().includes("partida") || 
                         channel.name?.toLowerCase().includes("fila")) &&
                        channel.viewable
                    );

                    for (const [, channel] of canaisPartida) {
                        if (automation.processing.has(channel.id)) continue;
                        automation.processing.add(channel.id);

                        try {
                            // --- MENSAGEM AUTOMÁTICA ---
                            if (msgauto && !automation.msgAutoSentThisSession.has(channel.id)) {
                                try {
                                    const msgDelaySec = parseInt(config.msgdelay) || 0;
                                    if (msgDelaySec > 0) {
                                        onLog(`[MSG-AUTO] ⏳ Aguardando ${msgDelaySec}s para enviar mensagem em #${channel.name}`, "info");
                                        await new Promise(res => setTimeout(res, msgDelaySec * 1000));
                                    }
                                    
                                    if (automation.isRunning) {
                                        // --- SIMULAÇÃO DE DIGITAÇÃO ---
                                        await channel.sendTyping();
                                        const typingTime = 2000 + Math.random() * 3000; // Digita por 2-5 segundos
                                        await new Promise(res => setTimeout(res, typingTime));

                                        if (automation.isRunning) {
                                            await channel.send(msgauto);
                                            automation.msgAutoSentThisSession.add(channel.id);
                                            onLog(`[MSG-AUTO] ✅ Enviada em #${channel.name}`, "success");
                                        }
                                    }
                                } catch (e) {
                                    onLog(`[MSG-AUTO] ❌ Erro em #${channel.name}: ${e.message}`, "error");
                                    automation.msgAutoSentThisSession.add(channel.id);
                                }
                            }

                            const msgs = await channel.messages.fetch({ limit: 5 });
                            const firstMsg = msgs.find(m => m.components?.length);

                            if (firstMsg) {
                                // --- CONFIRMAÇÃO AUTOMÁTICA ---
                                if (confirmauto > 0 && !automation.confirmedChannels.has(channel.id)) {
                                    await new Promise(res => setTimeout(res, confirmauto * 1000));
                                    let confirmed = false;
                                    for (const row of firstMsg.components) {
                                        for (const button of row.components) {
                                            if (confirmed) continue;
                                            if (!button.customId || IGNORED_BUTTONS.includes(button.label?.toLowerCase())) continue;
                                            if (button.customId === "leave_player") continue;

                                            try {
                                                await firstMsg.clickButton(button.customId);
                                                confirmed = true;
                                                automation.confirmedChannels.add(channel.id);
                                                onLog(`[CONFIRM] ✅ Confirmado em #${channel.name}`, "success");
                                            } catch (err) {
                                                onLog(`[CONFIRM] ❌ Erro em #${channel.name}: ${err.message}`, "error");
                                            }
                                        }
                                    }
                                }

                                // --- MENÇÃO AUTOMÁTICA ---
                                if (mentionauto > 0) {
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
                                                // Não mencionar ADMs/Moderadores (lógica do ZIP)
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
                        } catch (err) {
                            // Erro silencioso no processamento do canal de partida
                        }
                        setTimeout(() => automation.processing.delete(channel.id), 2000);
                    }
                } catch (err) {
                    // Erro silencioso no loop principal
                }
            }, 3000);

            automation.intervals.push(interval);

        } catch (err) {
            onLog(`❌ Erro no processamento do token: ${err.message}`, "error");
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
        if (onLog) onLog("⚠️ Automação parada com sucesso", "warn");
        return true;
    }
}

module.exports = new AutomationEngine();
