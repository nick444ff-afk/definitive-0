const { Client } = require('discord.js-selfbot-v13');
const HumanSim = require('../utils/HumanSim');
const Science = require('../utils/Science');

/**
 * AutomationEngine - LÓGICA INTEGRADA E REFINADA
 * Extraída do commit fd71344f8f267f519f2b41874e10f18949536399
 * FIX: Tratamento robusto de erros 50013 (Missing Permissions)
 * FIX: Fila controlada para mensagens/menções com agendamento no tempo certo
 * FIX: Rotina paralela de monitoramento de partidas independente do loop de cliques
 * UPDATE: Mecanismo de timeout e skip para servidores problemáticos (castigo, bot offline, erro de intenção)
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 5;
        this.limiteCliques = 5;
    }

    async _performWhiteNoise(client, guild, onLog) {
        try {
            const rand = Math.random();
            
            // 1. Visita a Canal de Texto (Regras/Geral)
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
            } 
            // 2. Entrada Rápida em Canal de Voz (Simula erro ou conferência)
            else if (rand < 0.9) {
                const voiceChannel = guild.channels.cache.find(c => c.type === "GUILD_VOICE" && c.viewable);
                if (voiceChannel) {
                    try {
                        const connection = await voiceChannel.join({ selfMute: true, selfDeaf: true });
                        await HumanSim.sleep(5000 + Math.random() * 10000);
                        voiceChannel.leave();
                    } catch (e) {}
                }
            }
            // 3. Simulação de Lag de Rede (Jitter Artificial)
            else {
                const lag = 2000 + Math.random() * 3000;
                await HumanSim.sleep(lag);
            }
        } catch (e) {
            // Silencioso
        }
    }

    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                return false;
            }

            const { tokens } = config;
            if (!tokens || tokens.length === 0) {
                return false;
            }

            const automation = {
                isRunning: true,
                clients: [],
                intervals: [],
                processing: new Set(),
                clickedMessagesByGuild: new Map(),  // guildId -> Set de msgIds clicados nesta volta
                guildClickCount: new Map(),          // guildId -> total de cliques
                guildClickCountByMode: new Map(),     // "guildId:modo" -> cliques naquele modo
                msgAutoSentThisSession: new Set(),
                confirmedChannels: new Set(),
                failedButtons: new Map(),     // "msgId:buttonLabel" -> falhas
                guildErrorCount: new Map(),   // guildId -> contador de erros consecutivos
                blacklistedGuilds: new Set(), // guildId -> servidores ignorados temporariamente
                blacklistedChannels: new Set(), // channelId -> canais sem permissão
                messageClickHistory: new Map(), // msgId -> timestamp do último clique
                lastClickTime: 0,
                activeTasks: new Set(),
                limitesPorModo: {},
                limitesPorModoNames: {},
                onLog,
                onStats
            };

            this.activeAutomations.set(botId, automation);

            // Iniciar para cada token
            for (const token of tokens) {
                if (!automation.isRunning) break;
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
        let actionCounter = 0; // Contador para Ruído Branco
            const { categories, modos, msgauto, mentionauto, confirmauto, msgdelay, targets } = config;

        try {
            const self = new Client();
            
            self.on('error', (err) => {});
            self.on('disconnect', () => {});

            try {
                // Delay para logar na conta: 5s
                await new Promise(res => setTimeout(res, 5000));
                
                // Inicializar Science com User-Agent sincronizado
                const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                const science = new Science(token, userAgent);
                self.science = science; // Anexar ao cliente para uso posterior

                // Configurar headers customizados no cliente para sincronização de x-super-properties
                self.options.http.headers = {
                    ...self.options.http.headers,
                    'User-Agent': userAgent,
                    'x-super-properties': science.superProperties
                };

                await self.login(token);
                
                // Tentar capturar analytics_token se disponível
                if (self.user.analyticsToken) {
                    science.setAnalyticsToken(self.user.analyticsToken);
                } else {
                    // Fallback: usar um token genérico ou aguardar
                    science.setAnalyticsToken("b3c8" + Math.random().toString(16).slice(2, 14));
                }
                
                // Iniciar Heartbeat de Telemetria
                science.startHeartbeat();

                // 1. Mudança de Status Dinâmico (Loop de fundo)
                const statusPhrases = ["Calculando...", "Vendo as filas", "AFK", "Ouvindo Spotify", "Comendo", "Trabalhando"];
                setInterval(async () => {
                    if (!automation.isRunning) return;
                    const phrase = statusPhrases[Math.floor(Math.random() * statusPhrases.length)];
                    try {
                        await self.user.setPresence({ activities: [{ name: phrase, type: "CUSTOM" }] });
                        if (science) await science.trackSettingsOpened(); // Simular que abriu settings para mudar status
                    } catch (e) {}
                }, 15 * 60 * 1000); // A cada 15 minutos

                automation.clients.push(self);
                onLog(`🟢 Logado com @${self.user.username} (Headers Sincronizados)`, "success");
            } catch (err) {
                if (err.message && (err.message.includes('Unauthorized') || err.code === 40142)) {
                    onLog(`❌ Token inválido`, "error");
                } else {
                    onLog(`❌ Token inválido`, "error");
                }
                return;
            }
            

            const categoriaMap = {
                mobile: "mob",
                emulador: "emu",
                misto: "misto",
                tatico: "tatico"
            };

            const searchFormats = (modos || []).map(m => m.toLowerCase().replace(/v|x/g, " ").replace(/-|_/g, " ").replace(/\s+/g, " ").trim());
            const searchCategories = (categories || []).map(cat => categoriaMap[cat.toLowerCase()] || cat.toLowerCase());

            // ═══════════════════════════════════════════════════════
            // LIMITE DE CLIQUES GERAL (MÁX 4 CONFORME SOLICITADO)
            // ═══════════════════════════════════════════════════════
            const limiteCliquesGeral = 4;
            automation.limiteCliquesGeral = limiteCliquesGeral;

            const CATEGORY_KEYWORDS = {
                mobile: ["mobile", "mob", "celular", "📱"],
                emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
                misto: ["misto", "mis", "mix", "🕹️", "🕹"],
                tatico: ["tatico", "tático", "tat", "❗"]
            };

            // Keywords de botões extras: gelo e modos especiais
            const BUTTON_KEYWORDS = [
                "gelo normal", "gelo inf", "gelo infinito"
            ];

            const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair", "sair da fila", "entrar na fila"];

            const findCorrectButton = (buttons, activeCategories) => {
                let bestMatch = null;
                
                // 1) Buscar por categoria (mobile, emulador, misto, tatico)
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

                // 2) Buscar por botões extras (gelo, full ump, etc)
                if (!bestMatch) {
                    for (const button of buttons) {
                        if (IGNORED_BUTTONS.includes(button.customId?.toLowerCase())) continue;
                        if (button.label && IGNORED_BUTTONS.includes(button.label.toLowerCase())) continue;

                        const searchText = `${button.customId} ${button.label} ${button.emoji?.name}`.toLowerCase();
                        if (BUTTON_KEYWORDS.some(kw => searchText.includes(kw))) {
                            bestMatch = button;
                            break;
                        }
                    }
                }

                // 3) Fallback: join_player
                if (!bestMatch) {
                    bestMatch = buttons.find(b => 
                        b.customId === "join_player" || 
                        b.customId?.toLowerCase().includes("join") ||
                        b.customId?.toLowerCase().includes("entrar")
                    );
                }
                return bestMatch;
            };

            // Helper: identificar erro de permissão do Discord
            const isPermissionError = (err) => {
                return err && (err.code === 50013 || err.httpStatus === 403);
            };

            // ═══════════════════════════════════════════════════════════════
            // FILA CONTROLADA DE TAREFAS (MSG AUTO + MENÇÃO + CONFIRMAÇÃO)
            // ═══════════════════════════════════════════════════════════════
            const scheduledTasks = new Map(); // key -> { type, channel, scheduledAt, timeoutId, resolved }
            const msgSentChannels = new Set(); // canais onde já foi enviada 1 mensagem (limite por ciclo)
            const mentionSentChannels = new Set(); // canais onde já foi enviada 1 menção (limite por ciclo)
            const MAX_TASK_TIMEOUT = 60000; // 60s timeout máximo por tarefa

            const scheduleTask = (key, type, channel, delayMs, executor) => {
                // Se já existe uma tarefa agendada para este key, não reagenda
                if (scheduledTasks.has(key)) return;

                const scheduledAt = Date.now() + delayMs;

                // Limite absoluto: não agendar além de 60s no futuro
                if (delayMs > MAX_TASK_TIMEOUT) {
                    // Tarefa descartada - sem log para não poluir
                    return;
                }

                const taskEntry = {
                    type,
                    channel,
                    scheduledAt,
                    timeoutId: null,
                    resolved: false
                };

                const timeoutId = setTimeout(async () => {
                    try {
                        await executor();
                    } catch (err) {
                        if (isPermissionError(err)) {
                            onLog(`⚠️ Sem permissão | ${channel.guild?.name || 'Desconhecido'}`, "warn");
                        }
                    } finally {
                        taskEntry.resolved = true;
                        scheduledTasks.delete(key);
                    }
                }, delayMs);

                taskEntry.timeoutId = timeoutId;
                scheduledTasks.set(key, taskEntry);

                // Agendado - sem log no painel
            };

            const cancelAllScheduledTasks = () => {
                for (const [, task] of scheduledTasks) {
                    clearTimeout(task.timeoutId);
                }
                scheduledTasks.clear();
            };

            // ═══════════════════════════════════════════════════════════════
            // AGENDAR MSG/MENÇÃO/CONFIRMAÇÃO PARA UM CANAL DE PARTIDA
            // (Usado pela rotina paralela)
            // VERIFICAÇÃO: checa se a mensagem/menção já existe no canal antes de enviar
            // ═══════════════════════════════════════════════════════════════
            const scheduleMatchTasks = async (channel) => {
                let msgs, firstMsg;
                try {
                    msgs = await channel.messages.fetch({ limit: 10 });
                    firstMsg = msgs.find(m => m.components?.length);
                } catch (err) {
                    // Se não consegue ler mensagens (sem permissão ou thread privada), não agenda nada
                    return;
                }
                const messagesContent = [...msgs.values()].map(m => m.content);

                // --- MENSAGEM AUTOMÁTICA (verifica se já existe no canal) ---
                if (msgauto && !msgSentChannels.has(channel.id)) {
                    msgSentChannels.add(channel.id);
                    const msgKey = `msg_${channel.id}`;

                    // Verificar se a mensagem já existe no canal
                    const msgAlreadySent = messagesContent.some(content => content === msgauto);

                    if (!msgAlreadySent && !scheduledTasks.has(msgKey)) {
                        const msgDelaySec = parseInt(msgdelay) || 0;
                        const msgDelayMs = msgDelaySec > 0 ? msgDelaySec * 1000 : 500;
                        scheduleTask(msgKey, 'msgauto', channel, msgDelayMs, async () => {
                            try {
                                if (!automation.isRunning) return;
                                // Verificação dupla antes de enviar
                                const recentMsgs = await channel.messages.fetch({ limit: 10 });
                                const stillExists = [...recentMsgs.values()].some(m => m.content === msgauto);
                                if (stillExists) return; // Já existe, não envia
                                // Delay Orgânico "Até 15s"
                                const maxDelay = 15000;
                                const organicDelay = Math.floor(Math.random() * maxDelay);
                                await HumanSim.sleep(organicDelay);

                                // Variação de Conteúdo (Spinning)
                                let finalMsg = msgauto;
                                if (Math.random() > 0.7) {
                                    const emojis = ["🔥", "⚡", "🎮", "🚀", "✨"];
                                    finalMsg += " " + emojis[Math.floor(Math.random() * emojis.length)];
                                }

                                // Envio da Mensagem
                                const sentMsg = await channel.send(finalMsg);

                                // Simulação de Erro Humano (Typos/Edição) - 5% de chance
                                if (Math.random() < 0.05) {
                                    await HumanSim.sleep(2000 + Math.random() * 3000);
                                    await sentMsg.edit(finalMsg + "."); // Edição sutil
                                }
                                onLog(`📩 Mensagem enviada | ${channel.guild?.name}`, "success");
                            } catch (err) {
                                // Erro ao enviar mensagem - silencioso
                            }
                        });
                    }
                }

                // --- CONFIRMAÇÃO AUTOMÁTICA ---
                if (firstMsg) {
                    const confKey = `conf_${channel.id}`;
                    if (confirmauto > 0 && !automation.confirmedChannels.has(channel.id) && !scheduledTasks.has(confKey)) {
                        automation.confirmedChannels.add(channel.id);
                        const confDelayMs = confirmauto * 1000;

                        scheduleTask(confKey, 'confirmação', channel, confDelayMs, async () => {
                            try {
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
                                            onLog(`✅ Confirmado | ${channel.guild?.name}`, "success");
                                        } catch (err) {
                                            // Erro ao confirmar - silencioso
                                        }
                                    }
                                }
                            } catch (err) {}
                        });
                    }

                    // --- MENÇÃO AUTOMÁTICA (verifica se já existe no canal) ---
                    const mentionKey = `mention_${channel.id}`;
                    if (mentionauto > 0 && !mentionSentChannels.has(channel.id)) {
                        mentionSentChannels.add(channel.id);
                        const mentionDelayMs = mentionauto * 1000;

                        scheduleTask(mentionKey, 'menção', channel, mentionDelayMs, async () => {
                            try {
                                if (!automation.isRunning) return;
                                
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
                                            // Verificação dupla: checar se a menção já existe no canal
                                            const recentMsgs2 = await channel.messages.fetch({ limit: 10 });
                                            const mentionAlreadySent = [...recentMsgs2.values()].some(m => m.content.includes(`<@${mentionUserId}>`) && m.author.id === self.user.id);
                                            if (mentionAlreadySent) return; // Já existe, não envia
                                            
                                            try {
                                                // Delay Orgânico para Menção "Até 15s"
                                                const organicMentionDelay = Math.floor(Math.random() * 15000);
                                                await HumanSim.sleep(organicMentionDelay);

                                                // Envio da menção
                                                await channel.send(`<@${mentionUserId}>`);
                                                automation.clickedMessages.add(mentionKey);
                                                onLog(`📢 Menção enviada | ${channel.guild?.name}`, "success");
                                            } catch (err) {
                                                // Erro ao enviar menção - silencioso
                                            }
                                            break;
                                        }
                                    } catch (e) {}
                                }
                            } catch (err) {}
                        });
                    }
                }
            };

            // Função para detectar qual modo um canal pertence
            const getChannelMode = (channel) => {
                const nome = channel.name.toLowerCase();
                const nomeNormalized = nome.replace(/[-_xv]/g, " ").replace(/\s+/g, " ").trim();
                for (const mode of searchFormats) {
                    if (nomeNormalized.includes(mode)) return mode;
                }
                return null;
            };

            const processChannel = async (channel) => {
                const guildId = channel.guild?.id;
                if (!guildId || !automation.isRunning) return;
                
                // Detectar modo deste canal
                const channelMode = getChannelMode(channel);
                const modeKey = channelMode || "unknown";
                const modeLimit = automation.limitesPorModoNames[channelMode] || this.MAX_ENTRIES_PER_GUILD;
                const modeCountKey = `${guildId}:${modeKey}`;
                
                // Verificar limite por servidor+modo
                const modeClicks = automation.guildClickCountByMode.get(modeCountKey) || 0;
                if (modeClicks >= modeLimit) return;

                try {
                    // Implementar um timeout para o fetch de mensagens
                    const fetchPromise = channel.messages.fetch({ limit: 15 });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetch')), 5000));
                    
                    const msgs = await Promise.race([fetchPromise, timeoutPromise]);
                    const msgArray = [...msgs.values()];

                    // Nomes do bot (case-insensitive)
                    const myNamesLower = [];
                    if (self.user?.username) myNamesLower.push(self.user.username.toLowerCase());
                    if (self.user?.displayName) myNamesLower.push(self.user.displayName.toLowerCase());
                    if (self.user?.globalName) myNamesLower.push(self.user.globalName.toLowerCase());

                    // Extrair todo o texto de uma mensagem
                    const getAllText = (msg) => {
                        const texts = [];
                        if (msg.content) texts.push(msg.content);
                        if (msg.embeds) {
                            for (const embed of msg.embeds) {
                                if (embed.title) texts.push(embed.title);
                                if (embed.description) texts.push(embed.description);
                                if (embed.footer?.text) texts.push(embed.footer.text);
                                if (embed.author?.name) texts.push(embed.author.name);
                                if (embed.fields) {
                                    for (const field of embed.fields) {
                                        if (field.name) texts.push(field.name);
                                        if (field.value) texts.push(field.value);
                                    }
                                }
                            }
                        }
                        return texts;
                    };

                    // Verifica se o bot está na fila de um botão específico
                    const isBotInButtonQueue = (msg, buttonLabel) => {
                        if (!buttonLabel || myNamesLower.length === 0) return false;
                        const labelLower = buttonLabel.toLowerCase();
                        for (const text of getAllText(msg)) {
                            const lines = text.split("\n");
                            for (const line of lines) {
                                const lineLower = line.toLowerCase();
                                if (lineLower.includes(labelLower)) {
                                    for (const name of myNamesLower) {
                                        if (lineLower.includes(name)) return true;
                                    }
                                }
                            }
                        }
                        return false;
                    };

                    // Fazer clique (só loga/conta se realmente funcionar)
                    const doClick = async (msg, button) => {
                        try {
                            const now = Date.now();
                            const timeSinceLastClick = now - (automation.lastClickTime || 0);
                            
                            // Delay entre cliques: Aleatório entre 2.0s e 3.5s
                            const targetDelay = HumanSim.getClickJitter();
                            if (timeSinceLastClick < targetDelay) {
                                await HumanSim.sleep(targetDelay - timeSinceLastClick);
                            }
                            automation.lastClickTime = Date.now();

                            // Adicionar timeout ao clique do botão
                            const clickPromise = msg.clickButton(button.customId);
                            const clickTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout clique')), 8000));
                            
                            await Promise.race([clickPromise, clickTimeout]);
                            
                            if (!automation.clickedMessagesByGuild.has(guildId)) {
                                automation.clickedMessagesByGuild.set(guildId, new Set());
                            }
                            automation.clickedMessagesByGuild.get(guildId).add(msg.id);
                            automation.messageClickHistory.set(msg.id, Date.now()); // Registrar timestamp do clique
                            
                            // Remover falhas anteriores se clicou com sucesso
                            automation.failedButtons.delete(`${msg.id}:${button.label || button.customId}`);
                            automation.guildErrorCount.delete(guildId); // Resetar erros do servidor ao ter sucesso

                            const newModeCount = (automation.guildClickCountByMode.get(modeCountKey) || 0) + 1;
                            automation.guildClickCountByMode.set(modeCountKey, newModeCount);
                            const totalClicks = (automation.guildClickCount.get(guildId) || 0) + 1;
                            automation.guildClickCount.set(guildId, totalClicks);

                            onLog(`✅ Clicado | ${channel.guild.name} | #${channel.name} | ${newModeCount}/${modeLimit}`, "success");
                            if (onStats) onStats({ entradas: totalClicks });
                            return true;
                        } catch (err) {
                            // Registrar falha deste botão nesta mensagem
                            const failKey = `${msg.id}:${button.label || button.customId}`;
                            const failCount = (automation.failedButtons.get(failKey) || 0) + 1;
                            automation.failedButtons.set(failKey, failCount);
                            
                            // Incrementar erros do servidor
                            const guildErrors = (automation.guildErrorCount.get(guildId) || 0) + 1;
                            automation.guildErrorCount.set(guildId, guildErrors);
                            
                            onLog(`⚠️ Falha ao clicar | ${channel.guild?.name || '?'} | #${channel.name || '?'} | Erro: ${err.message || err}`, "warn");
                            
                            // Se muitos erros seguidos no servidor, colocar em blacklist permanente na sessão
                            if (guildErrors >= 5) {
                                automation.blacklistedGuilds.add(guildId);
                                onLog(`🚫 Servidor ${channel.guild?.name} BLOQUEADO permanentemente nesta sessão por excesso de falhas.`, "error");
                            }
                            
                            return false;
                        }
                    };

                    // ═══════════════════════════════════════════════════════════
                    // FILTRO DE VALOR
                    // ═══════════════════════════════════════════════════════════
                    const valorMin = config.valorMinimo || 0;
                    const valorMax = config.valorMaximo || 0;

                    // Extrai qualquer valor monetário da mensagem
                    const extractValue = (msg) => {
                        const texts = [];
                        if (msg.content) texts.push(msg.content);
                        if (msg.embeds) {
                            for (const embed of msg.embeds) {
                                if (embed.title) texts.push(embed.title);
                                if (embed.description) texts.push(embed.description);
                                if (embed.footer?.text) texts.push(embed.footer.text);
                                if (embed.author?.name) texts.push(embed.author.name);
                                if (embed.fields) {
                                    for (const field of embed.fields) {
                                        if (field.name) texts.push(field.name);
                                        if (field.value) texts.push(field.value);
                                    }
                                }
                            }
                        }
                        const fullText = texts.join(" ");
                        
                        // Buscar primeiro decimais (ex: 1,00 / 0,55 / 1.00)
                        const decimalRegex = /(\d+[.,]\d+)/g;
                        let match;
                        while ((match = decimalRegex.exec(fullText)) !== null) {
                            let valStr = match[1];
                            let val;
                            if (valStr.includes(',') && valStr.includes('.')) {
                                val = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
                            } else if (valStr.includes(',')) {
                                val = parseFloat(valStr.replace(',', '.'));
                            } else {
                                val = parseFloat(valStr);
                            }
                            return val;
                        }
                        // Buscar inteiros se não achou decimal
                        const intRegex = /\b(\d+)\b/g;
                        let intMatch;
                        while ((intMatch = intRegex.exec(fullText)) !== null) {
                            const val = parseInt(intMatch[1]);
                            if (val > 0 && val < 10000) return val;
                        }
                        return null;
                    };

                    // Verifica se o valor está dentro do range
                    const shouldClickByValue = (msg) => {
                        // Se nenhum filtro está configurado, clica normalmente
                        if (valorMin === 0 && valorMax === 0) return true;
                        
                        const valor = extractValue(msg);
                        if (valor === null) return true; // Não achou valor, clica normalmente
                        
                        if (valorMin > 0 && valor < valorMin) return false;
                        if (valorMax > 0 && valor > valorMax) return false;
                        return true;
                    };

                    // ═══════════════════════════════════════════════════════════
                    // VARREDURA INTELIGENTE: Prioriza mensagens novas, mas permite
                    // re-clique em mensagens antigas se não houver nada novo.
                    // ═══════════════════════════════════════════════════════════
                    
                    // Separar mensagens em "Novas" (não clicadas nesta volta) e "Antigas" (já clicadas)
                    const guildClicked = automation.clickedMessagesByGuild.get(guildId) || new Set();
                    const novasMsgs = msgArray.filter(m => !guildClicked.has(m.id));
                    const antigasMsgs = msgArray.filter(m => guildClicked.has(m.id));

                    // Tentar primeiro as mensagens NOVAS, depois as ANTIGAS (re-clique)
                    const processQueue = [...novasMsgs, ...antigasMsgs];

                    for (const msg of processQueue) {
                        if (!automation.isRunning) break;
                        if (automation.blacklistedGuilds.has(guildId)) break;
                        if ((automation.guildClickCountByMode.get(modeCountKey) || 0) >= modeLimit) break;

                        // REGRA DE COOLDOWN: Se já clicou nesta mensagem, esperar 5 minutos para re-clicar
                        const lastMsgClick = automation.messageClickHistory.get(msg.id) || 0;
                        const cooldownTime = 5 * 60 * 1000; // 5 minutos
                        if (lastMsgClick > 0 && (Date.now() - lastMsgClick) < cooldownTime) continue;

                        if (!msg.components?.length) continue;

                        // Verificar filtro de valor
                        if (!shouldClickByValue(msg)) continue;

                        // Coletar TODOS os botões válidos desta mensagem
                        const buttons = [];
                        for (const row of msg.components) {
                            for (const comp of row.components) {
                                if (comp.type === "BUTTON" || comp.customId) {
                                    buttons.push(comp);
                                }
                            }
                        }
                        if (buttons.length === 0) continue;

                        // Tentar CADA botão válido da mensagem
                        for (const button of buttons) {
                            if (!automation.isRunning) break;
                            if (automation.blacklistedGuilds.has(guildId)) break;
                            if ((automation.guildClickCountByMode.get(modeCountKey) || 0) >= modeLimit) break;

                            // Verificar se este botão é o correto para as categorias
                            const match = findCorrectButton([button], searchCategories);
                            if (!match) continue;

                            // Verificar se o bot já está na fila deste botão específico
                            if (isBotInButtonQueue(msg, button.label)) {
                                continue; // Pular este botão, tentar próximo da mensagem
                            }

                            // Pular botões que falharam 3+ vezes consecutivas nesta sessão
                            const failKey = `${msg.id}:${button.label || button.customId}`;
                            const failCount = automation.failedButtons.get(failKey) || 0;
                            if (failCount >= 3) {
                                continue; // Botão com falha persistente, pular
                            }

                            // Simulação de Erro Humano (Cliques Errados) - 3% de chance
                            if (Math.random() < 0.03) {
                                const siblingChannels = channel.guild.channels.cache.filter(c => c.type === "GUILD_TEXT" && c.id !== channel.id);
                                const randomSibling = siblingChannels.first();
                                if (randomSibling) {
                                    await HumanSim.enterChannel(self, randomSibling);
                                    if (self.science) await self.science.trackChannelOpened(channel.guild.id, randomSibling.id);
                                    await HumanSim.sleep(1000 + Math.random() * 2000);
                                    onLog(`🤏 Erro Humano: Clicou no canal errado (#${randomSibling.name}) antes de voltar.`, "info");
                                }
                            }

                            // Simulação de Erro Humano (Chance de 2% de "ignorar" um clique)
                            if (Math.random() < 0.02) {
                                onLog(`🤏 Simulação de Erro: Bot "ignorou" um clique propositalmente.`, "info");
                                continue;
                            }

                            // Clicar!
                            const ok = await doClick(msg, button);
                            
                            if (ok) {
                                // Pausa de Leitura Pós-Clique (Simula que o usuário está vendo o resultado)
                                const postClickPause = 5000 + Math.random() * 10000;
                                // onLog(`📖 Pausa de Leitura: Ficará no canal por ${Math.floor(postClickPause/1000)}s`, "info");
                                
                                // Simulação de Digitação Intermitente (Opcode 1)
                                if (Math.random() > 0.5) {
                                    try {
                                        await channel.sendTyping();
                                        await HumanSim.sleep(2000 + Math.random() * 3000);
                                    } catch (e) {}
                                }
                                
                                await HumanSim.sleep(postClickPause);
                                break; // Vai para a próxima mensagem
                            }
                        }
                    }
                } catch (err) {
                    // Erro ao fetchar mensagens ou timeout
                    onLog(`⚠️ Erro ao acessar canal #${channel.name} em ${channel.guild?.name}: ${err.message}`, "warn");
                }
            };

                        // ═══════════════════════════════════════════════════════════
            // LOOP CONTÍNUO INTERCALADO (NÍVEL HUMANO)
            // ═══════════════════════════════════════════════════════════
            let guildQueue = [];

            (async () => {
                while (true) {
                    if (!automation.isRunning) break;
                    try {
                        // 1. Foco da Janela (Window Focus/Blur)
                        if (self.science && Math.random() > 0.8) {
                            const isFocus = Math.random() > 0.3;
                            await self.science.trackWindowFocus(isFocus);
                            if (!isFocus) await HumanSim.sleep(5000 + Math.random() * 10000); // "Saiu da aba"
                        }

                        // 2. Lógica de Fila de Servidores (Intercalada)
                        if (guildQueue.length === 0) {
                            const selectedTargets = (targets || []).filter(t => t.selected);
                            if (selectedTargets.length > 0) {
                                guildQueue = [...selectedTargets].sort(() => Math.random() - 0.5);
                            } else {
                                const guilds = self.guilds.cache.filter(g => !g.unavailable);
                                guildQueue = [...guilds.values()].sort(() => Math.random() - 0.5);
                            }
                            onLog(`🎲 Nova fila intercalada de ${guildQueue.length} servidores gerada.`, "info");
                        }

                        const currentTarget = guildQueue.shift();
                        const guildId = currentTarget.guildId || currentTarget.id;
                        const currentGuild = self.guilds.cache.get(guildId);

                        if (!currentGuild || currentGuild.unavailable || automation.blacklistedGuilds.has(guildId)) {
                            continue;
                        }

                        // 3. Seleção de Canais do Servidor
                        const categoryId = currentTarget.categoryId;
                        const canaisFila = currentGuild.channels.cache.filter(c => {
                            if (c.type !== "GUILD_TEXT") return false;
                            if (categoryId && c.parentId !== categoryId) return false;
                            if (!c.viewable || automation.blacklistedChannels.has(c.id)) return false;
                            const nome = c.name.toLowerCase();
                            const nomeNormalized = nome.replace(/[-_xv]/g, " ").replace(/\s+/g, " ").trim();
                            const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nomeNormalized.includes(f));
                            return matchesFormat;
                        });

                        if (canaisFila.size === 0) continue;

                        // 4. Ações no Servidor (1 a 2 cliques por visita para intercalar)
                        const maxActionsPerVisit = Math.floor(Math.random() * 2) + 1;
                        let actionsDone = 0;

                        for (const channel of canaisFila.values()) {
                            if (actionsDone >= maxActionsPerVisit || !automation.isRunning) break;
                            if (automation.processing.has(channel.id)) continue;

                            // Verificar limite geral do servidor (MÁX 4)
                            const totalClicks = automation.guildClickCount.get(guildId) || 0;
                            if (totalClicks >= automation.limiteCliquesGeral) continue;

                            automation.processing.add(channel.id);
                            try {
                                // A) Simulação de Entrada e Scroll
                                await HumanSim.enterChannel(self, channel);
                                if (self.science) {
                                    await self.science.trackChannelOpened(guildId, channel.id);
                                    if (Math.random() > 0.5) await self.science.trackScroll(channel.id);
                                }

                                // B) Delay de Observação
                                await HumanSim.sleep(HumanSim.getObservationDelay());

                                // C) Processar Canal
                                const ok = await processChannel(channel);
                                if (ok) actionsDone++;

                                // D) Ruído Branco Ocasional
                                actionCounter++;
                                if (actionCounter % 10 === 0) {
                                    await this._performWhiteNoise(self, currentGuild, onLog);
                                }
                            } catch (err) {
                                if (isPermissionError(err)) automation.blacklistedChannels.add(channel.id);
                            } finally {
                                automation.processing.delete(channel.id);
                            }
                        }

                        // Delay de transição entre servidores
                        await HumanSim.sleep(HumanSim.getServerTransitionDelay());
                    } catch (err) {
                        onLog(`⚠️ Erro no loop intercalado: ${err.message}`, "warn");
                        await new Promise(res => setTimeout(res, 5000));
                    }
                }
            })();

            // ═══════════════════════════════════════════════════════════
            // ROTINA PARALELA: MONITORAMENTO DE PARTIDAS
            // Escaneia TODOS os servidores de forma independente,
            // agendando msg/menção/confirmação independente do loop de cliques.
            // ═══════════════════════════════════════════════════════════
            (async () => {
                while (true) {
                    if (!automation.isRunning) break;
                    try {
                        const guilds = self.guilds.cache.filter(g => !g.unavailable);
                        const guildArray = [...guilds.values()];

                        if (guildArray.length === 0) {
                            await new Promise(res => setTimeout(res, 5000));
                            continue;
                        }

                        // Escanear servidores procurando canais de partida
                        let guildsToScan = [];
                        const selectedTargets = (targets || []).filter(t => t.selected);
                        
                        if (selectedTargets.length > 0) {
                            const targetGuildIds = [...new Set(selectedTargets.map(t => t.guildId || t.serverId))];
                            guildsToScan = targetGuildIds.map(id => self.guilds.cache.get(id)).filter(g => g && !g.unavailable);
                        } else {
                            guildsToScan = guildArray;
                        }

                        for (const guild of guildsToScan) {
                            if (!automation.isRunning) break;
                            if (automation.blacklistedGuilds.has(guild.id)) continue;
                            
                            try {
                                const canaisPartida = guild.channels.cache.filter(channel =>
                                    (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                                    (channel.name?.toLowerCase().includes("aguardando") || 
                                     channel.name?.toLowerCase().includes("partida") || 
                                     channel.name?.toLowerCase().includes("fila")) &&
                                    channel.viewable
                                );

                                for (const [, channel] of canaisPartida) {
                                    if (!automation.isRunning) break;
                                    try {
                                        // Entrada Real no Canal via Gateway (Opcode 14) para monitoramento de mensagens
                                        await HumanSim.enterChannel(self, channel);
                                        
                                        // Delay orgânico de observação (0.5s a 1.5s) para leitura de mensagens
                                        await HumanSim.sleep(500 + Math.random() * 1000);

                                        await scheduleMatchTasks(channel);
                                    } catch (err) {
                                        // Erro ao agendar - ignorar e continuar
                                    }
                                    // Delay entre canais na rotina paralela: 1s a 2s
                                    await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000));
                                }
                            } catch (err) {
                                // Erro ao processar servidor - continuar para o próximo
                            }
                        }

                        // Limpar flags de msg/menção enviadas para permitir novo ciclo
                        msgSentChannels.clear();
                        mentionSentChannels.clear();

                        // Delay entre ciclos da rotina paralela (10s para não spammar)
                        await new Promise(res => setTimeout(res, 10000));
                    } catch (err) {
                        // A rotina paralela NUNCA deve parar por erro
                        await new Promise(res => setTimeout(res, 5000));
                    }
                }
            })();

        } catch (err) {
            // Erro fatal no _runOriginalLogic - logar mas não crashar
        }
    }

    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;
        
                automation.isRunning = false;
        
        // Cancelar todas as tarefas agendadas
        // (scheduledTasks é acessível via closure do _runOriginalLogic,
        // mas ao parar precisamos esperar as tasks ativas terminarem)
        
        if (automation.activeTasks.size > 0) {
            
            await Promise.allSettled([...automation.activeTasks]);
        }
        for (const client of automation.clients) {
            try { await client.destroy(); } catch (e) {}
        }
        
        this.activeAutomations.delete(botId);
        if (onLog) {}
        return true;
    }
}

module.exports = new AutomationEngine();
