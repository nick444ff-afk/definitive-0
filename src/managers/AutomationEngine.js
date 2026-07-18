const { Client } = require("discord.js-selfbot-v13");

/**
 * AutomationEngine
 * Motor de automação que implementa a lógica ORIGINAL do bot
 * com suporte para múltiplas instâncias independentes e controle via Web
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.clickedMessages = new Map();
        this.guildClickCount = new Map();
        this.msgAutoSentThisSession = new Map();
        this.MAX_ENTRIES_PER_GUILD = 5; // Limite de tentativas solicitado pelo usuário
        this.IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair"];
        this.CATEGORY_KEYWORDS = {
            mobile: ["mobile", "mob", "celular", "📱"],
            emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
            misto: ["misto", "mis", "mix", "🕹️", "🕹"],
            tatico: ["tatico", "tático", "tat", "❗"]
        };
    }

    /**
     * Inicia a automação para uma instância
     */
    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                onLog("⚠️ Automação já em execução", "warn");
                return false;
            }

            const { tokens, categories, modos, mensagem, mencao } = config;

            if (!tokens || tokens.length === 0) {
                onLog("❌ Nenhum token fornecido", "error");
                return false;
            }

            // Mapear termos de busca (Formatos e Categorias)
            const searchFormats = (modos || []).map(m => m.toLowerCase().replace("x", "v"));
            const searchCategories = (categories || []).map(cat => cat.toLowerCase());

            // Corrigir log de modos para exibir o formato amigável (ex: 2x2 em vez de 2v2)
            const displayFormats = searchFormats.map(f => f.replace("v", "x"));
            onLog(`✅ Iniciando automação: [${displayFormats.join(', ')}] - [${categories.join(', ')}]`, "success");

            // Inicializar estruturas para esta instância
            this.clickedMessages.set(botId, new Set());
            this.guildClickCount.set(botId, new Map());
            this.msgAutoSentThisSession.set(botId, new Set());

            // Armazenar automação ativa
            const automation = {
                botId,
                config,
                searchFormats,
                searchCategories,
                msgauto: mensagem,
                mentionauto: parseFloat(mencao) || 0,
                clients: new Map(),
                interval: null,
                isRunning: true,
                onLog,
                onStats,
                processing: new Set()
            };

            this.activeAutomations.set(botId, automation);

            // Iniciar loop de automação
            this._startAutomationLoop(botId, automation);

            return true;
        } catch (err) {
            onLog(`❌ Erro ao iniciar: ${err.message}`, "error");
            return false;
        }
    }

    /**
     * Loop principal de automação (A cada 2 segundos, conforme original)
     */
    _startAutomationLoop(botId, automation) {
        const { config, onLog } = automation;
        const { tokens } = config;

        const interval = setInterval(async () => {
            if (!automation.isRunning) {
                clearInterval(interval);
                this.activeAutomations.delete(botId);
                return;
            }

            try {
                // Processar cada token
                for (const token of tokens) {
                    if (!automation.isRunning) break;
                    await this._processTokenAutomation(botId, automation, token);
                }
            } catch (err) {
                onLog(`❌ Erro no loop: ${err.message}`, "error");
            }
        }, 2000);

        automation.interval = interval;
    }

    /**
     * Processa a automação para um token específico
     */
    async _processTokenAutomation(botId, automation, token) {
        if (!automation.isRunning) return;
        try {
            const { clients, searchFormats, searchCategories, onLog } = automation;
            const clientKey = `${token.substring(0, 15)}`;

            // Obter ou criar cliente
            let client = clients.get(clientKey);
            if (!client) {
                client = new Client();
                try {
                    await client.login(token);
                    clients.set(clientKey, client);
                    onLog(`✅ Logado como: ${client.user.tag}`, "success");
                } catch (loginErr) {
                    onLog(`❌ Erro de login no token ${clientKey}...: ${loginErr.message}`, "error");
                    return;
                }
            }

            // ─── PARTE 1: BUSCAR CANAIS DE FILA PARA CLIQUES ───
            const canaisFila = client.channels.cache.filter(c => {
                if (c.type !== "GUILD_TEXT") return false;
                const nome = c.name.toLowerCase();
                
                // Lógica original: deve conter o formato E a categoria
                const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => {
                    const keywords = this.CATEGORY_KEYWORDS[cat] || [cat.toLowerCase()];
                    return keywords.some(kw => nome.includes(kw));
                });
                
                return matchesFormat && matchesCategory;
            });

            for (const channel of canaisFila.values()) {
                if (!automation.isRunning) break;
                if (automation.processing.has(channel.id)) continue;
                
                const guildId = channel.guild?.id;
                if (guildId && this._getGuildClicks(botId, guildId) >= this.MAX_ENTRIES_PER_GUILD) continue;

                automation.processing.add(channel.id);
                await this._processQueueChannel(botId, automation, client, channel);
                setTimeout(() => automation.processing.delete(channel.id), 3000);
            }

            // ─── PARTE 2: MONITORAR CANAIS DE PARTIDA (MSGAUTO + MENÇÃO) ───
            const canaisPartida = client.channels.cache.filter(c => 
                c.guild &&
                (c.type === "GUILD_TEXT" || c.type === "GUILD_PRIVATE_THREAD") &&
                (c.name?.toLowerCase().includes("aguardando") || 
                 c.name?.toLowerCase().includes("partida") || 
                 c.name?.toLowerCase().includes("fila")) &&
                c.viewable
            );

            for (const channel of canaisPartida.values()) {
                if (!automation.isRunning) break;
                if (automation.processing.has(channel.id)) continue;

                automation.processing.add(channel.id);
                await this._processMatchChannel(botId, automation, client, channel);
                setTimeout(() => automation.processing.delete(channel.id), 2000);
            }

        } catch (err) {
            automation.onLog(`❌ Erro ao processar token: ${err.message}`, "error");
        }
    }

    /**
     * Processa um canal de fila para realizar cliques
     */
    async _processQueueChannel(botId, automation, client, channel) {
        try {
            const { searchCategories, onLog, onStats } = automation;
            const guildId = channel.guild?.id;
            const guildName = channel.guild?.name || "?";

            if (!guildId) return;

            // Verificar limite de tentativas
            if (this._getGuildClicks(botId, guildId) >= this.MAX_ENTRIES_PER_GUILD) return;

            const msgs = await channel.messages.fetch({ limit: 15 });

            for (const msg of msgs.values()) {
                if (!automation.isRunning) break;
                if (this._getGuildClicks(botId, guildId) >= this.MAX_ENTRIES_PER_GUILD) break;
                if (!msg.components?.length) continue;

                const clickedSet = this.clickedMessages.get(botId);
                if (clickedSet.has(msg.id)) continue;

                // Coletar todos os botões
                const allButtons = [];
                for (const row of msg.components) {
                    for (const component of row.components) {
                        if (component.type === "BUTTON" || component.customId) {
                            allButtons.push(component);
                        }
                    }
                }

                if (allButtons.length === 0) continue;

                // Encontrar o botão correto baseado nas categorias selecionadas
                let correctButton = null;
                for (const cat of searchCategories) {
                    correctButton = this._findCorrectButton(allButtons, cat);
                    if (correctButton) break;
                }

                if (correctButton) {
                    // Incrementar contagem de TENTATIVAS (Limite rigoroso de 5)
                    const newCount = this._addGuildClick(botId, guildId);
                    
                    try {
                        await msg.clickButton(correctButton.customId);
                        clickedSet.add(msg.id);

                        onLog(
                            `✅ Tentativa ${newCount}/${this.MAX_ENTRIES_PER_GUILD} em: #${channel.name} (${guildName}) - Botão: "${correctButton.label || correctButton.customId}"`,
                            "success"
                        );

                        // Atualizar estatísticas de sucesso
                        if (onStats) {
                            onStats({
                                entradas: (this._getTotalEntradas(botId) || 0) + 1
                            });
                        }

                        // Aguardar antes do próximo clique no mesmo canal
                        await new Promise(r => setTimeout(r, 1000));

                    } catch (err) {
                        onLog(`❌ Tentativa ${newCount}/${this.MAX_ENTRIES_PER_GUILD} falhou em: #${channel.name} (${guildName})`, "error");
                    }

                    if (newCount >= this.MAX_ENTRIES_PER_GUILD) {
                        // Silenciado a pedido do usuário: onLog(`⚠️ Limite de 5 tentativas atingido em "${guildName}". Pulando para o próximo servidor.`, "warn");
                        break;
                    }
                }
            }
        } catch (err) {
            automation.onLog(`❌ Erro ao processar canal de fila: ${err.message}`, "error");
        }
    }

    /**
     * Processa um canal de partida (Mensagem Automática e Menção)
     */
    async _processMatchChannel(botId, automation, client, channel) {
        try {
            const { msgauto, mentionauto, onLog } = automation;
            const sentSet = this.msgAutoSentThisSession.get(botId);
            const clickedSet = this.clickedMessages.get(botId);

            const msgs = await channel.messages.fetch({ limit: 5 });
            const firstMsg = msgs.find(m => m.components?.length);

            // ─── MENSAGEM AUTOMÁTICA ───
            if (msgauto && !sentSet.has(channel.id)) {
                try {
                    await channel.send(msgauto);
                    sentSet.add(channel.id);
                    onLog(`[MSG-AUTO] ✅ Mensagem enviada em #${channel.name} (${channel.guild?.name})`, "success");
                } catch (err) {
                    onLog(`[MSG-AUTO] ❌ Erro ao enviar em #${channel.name}: ${err.message}`, "error");
                    sentSet.add(channel.id);
                }
            }

            // Se não tem mensagem com componentes, pula menção
            if (!firstMsg) return;

            // ─── MENÇÃO AUTOMÁTICA ───
            if (mentionauto > 0) {
                const mentionKey = `mention_${channel.id}_${firstMsg.id}`;
                if (clickedSet.has(mentionKey)) return;

                await new Promise(res => setTimeout(res, mentionauto * 1000));

                let foundMentions = [];
                const regex = /<@!?(\d+)>/g;

                const contentMentions = [...(firstMsg.content || "").matchAll(regex)].map(m => m[1]).filter(id => id !== client.user.id);
                foundMentions.push(...contentMentions);

                for (const embed of firstMsg.embeds) {
                    if (embed.description) {
                        foundMentions.push(...[...embed.description.matchAll(regex)].map(m => m[1]).filter(id => id !== client.user.id));
                    }
                    if (embed.fields?.length) {
                        for (const field of embed.fields) {
                            foundMentions.push(...[...field.value.matchAll(regex)].map(m => m[1]).filter(id => id !== client.user.id));
                        }
                    }
                }

                foundMentions = [...new Set(foundMentions)];

                for (const mentionUserId of foundMentions) {
                    try {
                        const member = await channel.guild.members.fetch(mentionUserId);
                        // Lógica original exata: não mencionar se tiver MANAGE_MESSAGES
                        if (!member.permissions.has("MANAGE_MESSAGES")) {
                            await channel.send(`<@${mentionUserId}>`);
                            clickedSet.add(mentionKey);
                            onLog(`[MENÇÃO] ✅ Mencionou <@${mentionUserId}> em #${channel.name}`, "success");
                            break;
                        }
                    } catch (err) {
                        // Silencioso
                    }
                }
            }
        } catch (err) {
            automation.onLog(`❌ Erro no canal de partida: ${err.message}`, "error");
        }
    }

    /**
     * Encontra o botão correto baseado na categoria
     */
    _findCorrectButton(buttons, category) {
        const keywords = this.CATEGORY_KEYWORDS[category.toLowerCase()] || [category.toLowerCase()];

        for (const button of buttons) {
            if (!button.customId) continue;
            if (this.IGNORED_BUTTONS.includes(button.customId.toLowerCase())) continue;

            const customIdLower = (button.customId || "").toLowerCase();
            const labelLower = (button.label || "").toLowerCase()
                .normalize("NFD").replace(/\p{Diacritic}/gu, "");
            const searchText = `${customIdLower} ${labelLower}`.toLowerCase();

            for (const keyword of keywords) {
                if (searchText.includes(keyword.toLowerCase())) {
                    return button;
                }
            }
        }

        // Fallback: procurar por botão genérico de join
        return buttons.find(b => 
            b.customId === "join_player" || 
            b.customId?.toLowerCase().includes("join") ||
            b.customId?.toLowerCase().includes("entrar")
        ) || null;
    }

    /**
     * Auxiliares de Gerenciamento
     */
    _getGuildClicks(botId, guildId) {
        const guildMap = this.guildClickCount.get(botId);
        return guildMap ? (guildMap.get(guildId) || 0) : 0;
    }

    _addGuildClick(botId, guildId) {
        let guildMap = this.guildClickCount.get(botId);
        if (!guildMap) {
            guildMap = new Map();
            this.guildClickCount.set(botId, guildMap);
        }
        const current = guildMap.get(guildId) || 0;
        const newCount = current + 1;
        guildMap.set(guildId, newCount);
        return newCount;
    }

    _getTotalEntradas(botId) {
        const guildMap = this.guildClickCount.get(botId);
        if (!guildMap) return 0;
        let total = 0;
        for (const count of guildMap.values()) total += count;
        return total;
    }

    /**
     * Para a automação de uma instância
     */
    async stopAutomation(botId, onLog) {
        try {
            const automation = this.activeAutomations.get(botId);
            if (!automation) return false;

            automation.isRunning = false;
            if (automation.interval) clearInterval(automation.interval);

            for (const client of automation.clients.values()) {
                try { await client.destroy(); } catch (e) {}
            }
            automation.clients.clear();

            this.clickedMessages.delete(botId);
            this.guildClickCount.delete(botId);
            this.msgAutoSentThisSession.delete(botId);
            this.activeAutomations.delete(botId);

            onLog("⚠️ Automação parada", "warn");
            return true;
        } catch (err) {
            onLog(`❌ Erro ao parar: ${err.message}`, "error");
            return false;
        }
    }
}

module.exports = new AutomationEngine();
