const { Client } = require("discord.js-selfbot-v13");

/**
 * AutomationEngine
 * Motor de automação que implementa a lógica original do bot
 * com suporte para múltiplas instâncias independentes
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.clickedMessages = new Map();
        this.guildClickCount = new Map();
        this.msgAutoSentThisSession = new Map();
        this.MAX_ENTRIES_PER_GUILD = 5;
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

            const { tokens, format, category, msgauto, mentionauto } = config;

            if (!tokens || tokens.length === 0) {
                onLog("❌ Nenhum token fornecido", "error");
                return false;
            }

            const formatSearch = format.replace("v", "x").toLowerCase();
            const categoryMap = {
                mobile: "mob",
                emulador: "emu",
                misto: "misto",
                tatico: "tatico"
            };
            const categoriaSearch = categoryMap[category];

            if (!categoriaSearch) {
                onLog(`❌ Categoria inválida: ${category}`, "error");
                return false;
            }

            onLog(`✅ Iniciando automação: ${format} - ${category}`, "success");

            // Inicializar estruturas para esta instância
            this.clickedMessages.set(botId, new Set());
            this.guildClickCount.set(botId, new Map());
            this.msgAutoSentThisSession.set(botId, new Set());

            // Armazenar automação ativa
            const automation = {
                botId,
                config,
                formatSearch,
                categoriaSearch,
                clients: new Map(),
                interval: null,
                isRunning: true,
                onLog,
                onStats
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
     * Loop principal de automação
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
            const { clients, formatSearch, categoriaSearch, onLog } = automation;
            const clientKey = `${token.substring(0, 10)}`;

            // Obter ou criar cliente
            let client = clients.get(clientKey);
            if (!client) {
                client = new Client();
                await client.login(token);
                clients.set(clientKey, client);
                onLog(`✅ Logado como: ${client.user.tag}`, "success");
            }

            // Buscar canais
            const canais = client.channels.cache.filter(c => {
                if (c.type !== "GUILD_TEXT") return false;
                const nome = c.name.toLowerCase();
                return nome.includes(formatSearch) && nome.includes(categoriaSearch);
            });

            if (canais.size === 0) {
                return;
            }

            // Processar cada canal
            for (const canal of canais.values()) {
                if (!automation.isRunning) break;
                await this._processChannel(botId, automation, client, canal);
            }
        } catch (err) {
            automation.onLog(`❌ Erro ao processar token: ${err.message}`, "error");
        }
    }

    /**
     * Processa um canal específico
     */
    async _processChannel(botId, automation, client, channel) {
        try {
            const { categoriaSearch, onLog, onStats } = automation;
            const guildId = channel.guild?.id;
            const guildName = channel.guild?.name || "?";

            if (!guildId) return;

            const guildClicks = this._getGuildClicks(botId, guildId);
            if (guildClicks >= this.MAX_ENTRIES_PER_GUILD) {
                return;
            }

            const msgs = await channel.messages.fetch({ limit: 15 });

            for (const msg of msgs.values()) {
                if (!automation.isRunning) break;
                
                // Verificar limite novamente dentro do loop para evitar cliques extras
                if (this._getGuildClicks(botId, guildId) >= this.MAX_ENTRIES_PER_GUILD) break;

                if (!msg.components?.length) continue;

                const clickedSet = this.clickedMessages.get(botId);
                if (clickedSet.has(msg.id)) continue;

                // Coletar botões
                const allButtons = [];
                for (const row of msg.components) {
                    for (const component of row.components) {
                        if (component.type === "BUTTON" || component.customId) {
                            allButtons.push(component);
                        }
                    }
                }

                if (allButtons.length === 0) continue;

                // Encontrar botão correto
                const correctButton = this._findCorrectButton(allButtons, categoriaSearch);

                if (correctButton) {
                    try {
                        await msg.clickButton(correctButton.customId);
                        clickedSet.add(msg.id);

                        // Incrementar contagem
                        const newCount = this._addGuildClick(botId, guildId);

                        onLog(
                            `✅ Clicado em: #${channel.name} (${guildName}) - Botão: "${correctButton.label || correctButton.customId}" [${newCount}/${this.MAX_ENTRIES_PER_GUILD}]`,
                            "success"
                        );

                        // Atualizar estatísticas
                        if (onStats) {
                            onStats({
                                entradas: (onStats.entradas || 0) + 1,
                                na_fila: onStats.na_fila || 0,
                                partidas: onStats.partidas || 0,
                                dms: onStats.dms || 0
                            });
                        }

                        // Aguardar antes do próximo clique
                        await new Promise(r => setTimeout(r, 1000));

                        if (newCount >= this.MAX_ENTRIES_PER_GUILD) {
                            break;
                        }
                    } catch (err) {
                        onLog(`❌ Erro ao clicar: ${err.message}`, "error");
                    }
                }
            }
        } catch (err) {
            automation.onLog(`❌ Erro ao processar canal: ${err.message}`, "error");
        }
    }

    /**
     * Encontra o botão correto baseado na categoria
     */
    _findCorrectButton(buttons, category) {
        const keywords = this.CATEGORY_KEYWORDS[category] || [];

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
     * Obtém o número de cliques de um servidor
     */
    _getGuildClicks(botId, guildId) {
        const guildMap = this.guildClickCount.get(botId);
        if (!guildMap) return 0;
        return guildMap.get(guildId) || 0;
    }

    /**
     * Incrementa o número de cliques de um servidor
     */
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

    /**
     * Para a automação de uma instância
     */
    async stopAutomation(botId, onLog) {
        try {
            const automation = this.activeAutomations.get(botId);
            if (!automation) {
                onLog("⚠️ Nenhuma automação em execução", "warn");
                return false;
            }

            automation.isRunning = false;

            // Limpar intervalo
            if (automation.interval) {
                clearInterval(automation.interval);
            }

            // Destruir clientes
            for (const [key, client] of automation.clients.entries()) {
                try {
                    await client.destroy();
                } catch (e) {
                    onLog(`Erro ao destruir cliente: ${e.message}`, "error");
                }
            }
            automation.clients.clear();

            // Limpar estruturas
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

    /**
     * Verifica se uma automação está rodando
     */
    isRunning(botId) {
        const automation = this.activeAutomations.get(botId);
        return automation ? automation.isRunning : false;
    }

    /**
     * Obtém informações sobre uma automação
     */
    getAutomationInfo(botId) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) {
            return null;
        }

        return {
            botId,
            isRunning: automation.isRunning,
            format: automation.config.format,
            category: automation.config.category,
            tokensCount: automation.config.tokens.length,
            clientsCount: automation.clients.size
        };
    }
}

module.exports = new AutomationEngine();
