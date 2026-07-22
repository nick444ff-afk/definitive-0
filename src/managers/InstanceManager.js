const { us } = require("../databases");
const AutomationEngine = require("./AutomationEngine");

/**
 * InstanceManager
 * Gerencia múltiplas instâncias de bots (Bot 1, Bot 2, etc.)
 * Cada instância é completamente independente
 */
class InstanceManager {
    constructor() {
        this.instances = new Map();
        this.logs = new Map();
        this.stats = new Map();
    }

    /**
     * Inicializa uma instância
     */
    async initInstance(botId) {
        if (!this.instances.has(botId)) {
            this.instances.set(botId, {
                id: botId,
                is_running: false,
                config: {},
                current_format: null,
                current_category: null,
                start_time: null
            });
            this.logs.set(botId, []);
            this.stats.set(botId, {
                entradas: 0,
                na_fila: 0,
                partidas: 0,
                dms: 0
            });
            
            // Carregar configuração salva de forma assíncrona
            try {
                const { us } = require("../databases/index");
                const saved = await us.get(`${botId}.config`) || await us.get(botId);
                if (saved) {
                    this.instances.get(botId).config = saved;
                }
            } catch (e) {
                console.error(`[InstanceManager] Erro ao carregar config de ${botId}:`, e.message);
            }
        }
    }

    /**
     * Salva a configuração de uma instância
     */
    async saveConfig(botId, config) {
        await this.initInstance(botId);
        const instance = this.instances.get(botId);
        instance.config = config;

        try {
            const { us } = require("../databases/index");
            await us.set(`${botId}.config`, config);
            console.log(`[InstanceManager] Config de ${botId} salva no disco.`);
        } catch (e) {
            console.error(`[InstanceManager] Erro ao salvar config de ${botId}:`, e.message);
        }

        return { status: "success" };
    }

    /**
     * Obtém a configuração de uma instância
     */
    async getConfig(botId) {
        await this.initInstance(botId);
        return this.instances.get(botId).config;
    }

    /**
     * Obtém o estado de uma instância
     */
    async getInstance(botId) {
        await this.initInstance(botId);
        return this.instances.get(botId);
    }

    /**
     * Inicia a automação de uma instância
     */
    async startAutomation(botId, tokens, format, category, msgauto, mentionauto, categories, modos, confirmauto, msgdelay) {
        try {
            await this.initInstance(botId);
            const instance = this.instances.get(botId);
            
            if (instance.is_running) {
                this.addLog(botId, "⚠️ Automação já está em execução", "warn");
                return { status: "error", message: "Automação já em execução" };
            }

            // Parar automação anterior se existir
            await this.stopAutomation(botId);

            instance.is_running = true;
            instance.start_time = Date.now();
            instance.config = {
                tokens: Array.isArray(tokens) ? tokens : tokens.split("\n").map(t => t.trim()).filter(t => t),
                msgauto,
                msgdelay: parseFloat(msgdelay) || 0,
                mentionauto,
                confirmauto: parseFloat(confirmauto) || 0,
                mensagem: msgauto,
                mencao: mentionauto,
                categories,
                modos
            };
            instance.current_format = format;
            instance.current_category = category;

            // O AutomationEngine já faz o log detalhado dos modos e categorias selecionados
            // this.addLog(botId, `✅ Iniciando automação: ${format} - ${category}`, "success");

            // Iniciar automação via AutomationEngine
            const success = await AutomationEngine.startAutomation(
                botId,
                instance.config,
                (msg, type) => this.addLog(botId, msg, type),
                (stats) => {
                    const instanceStats = this.stats.get(botId);
                    Object.assign(instanceStats, stats);
                }
            );

            if (!success) {
                instance.is_running = false;
                return { status: "error", message: "Falha ao iniciar automação" };
            }

            return { status: "success", message: "Automação iniciada" };
        } catch (err) {
            this.addLog(botId, `❌ Erro ao iniciar: ${err.message}`, "error");
            return { status: "error", message: err.message };
        }
    }



    /**
     * Para a automação de uma instância
     */
    async stopAutomation(botId) {
        try {
            const instance = this.getInstance(botId);
            instance.is_running = false;

            // Parar via AutomationEngine
            await AutomationEngine.stopAutomation(botId, (msg, type) => this.addLog(botId, msg, type));

            return { status: "success", message: "Automação parada" };
        } catch (err) {
            this.addLog(botId, `❌ Erro ao parar: ${err.message}`, "error");
            return { status: "error", message: err.message };
        }
    }

    /**
     * Adiciona um log para uma instância
     */
    addLog(botId, message, type = "info") {
        this.initInstance(botId);
        const logs = this.logs.get(botId);
        logs.push({
            timestamp: new Date().toISOString(),
            message,
            type
        });

        // Manter apenas os últimos 100 logs
        if (logs.length > 100) {
            logs.shift();
        }

        console.log(`[${botId}] ${message}`);
    }

    /**
     * Obtém os logs de uma instância
     */
    async getLogs(botId) {
        await this.initInstance(botId);
        return this.logs.get(botId) || [];
    }

    /**
     * Limpa os logs de uma instância
     */
    clearLogs(botId) {
        this.logs.set(botId, []);
    }

    /**
     * Obtém as estatísticas de uma instância
     */
    getStats(botId) {
        this.initInstance(botId);
        return this.stats.get(botId) || {};
    }

    /**
     * Reseta as estatísticas de uma instância
     */
    resetStats(botId) {
        this.stats.set(botId, {
            entradas: 0,
            na_fila: 0,
            partidas: 0,
            dms: 0
        });
        this.addLog(botId, "⚠️ Estatísticas resetadas", "warn");
    }

    /**
     * Salva a configuração de uma instância
     */
    async saveConfig(botId, config) {
        try {
            const instance = this.getInstance(botId);
            instance.config = config;
            
            // Salvar no banco de dados
            await us.set(`${botId}.config`, config);
            
            this.addLog(botId, "✅ Configuração salva", "success");
            return { status: "success", message: "Configuração salva" };
        } catch (err) {
            this.addLog(botId, `❌ Erro ao salvar config: ${err.message}`, "error");
            return { status: "error", message: err.message };
        }
    }

    /**
     * Carrega a configuração de uma instância
     */
    async loadConfig(botId) {
        try {
            const config = await us.get(`${botId}.config`);
            if (config) {
                const instance = this.getInstance(botId);
                instance.config = config;
            }
            return config || {};
        } catch (err) {
            this.addLog(botId, `❌ Erro ao carregar config: ${err.message}`, "error");
            return {};
        }
    }
}

module.exports = new InstanceManager();
