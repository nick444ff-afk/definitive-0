const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const bodyParser = require("body-parser");
const InstanceManager = require("./managers/InstanceManager");
const { us } = require("./databases");

const app = express();
const PORT = process.env.PORT || 8000;

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../uploads"));
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});
const upload = multer({ storage });

// Servir arquivos estáticos (painel web)
app.use(express.static(path.join(__dirname, "../public")));

// ═══════════════════════════════════════════════════════════════
// ROTAS - SAÚDE E STATUS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /
 * Verifica se o servidor está rodando
 */
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        message: "Servidor do painel web está rodando",
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /status/:botId
 * Obtém o status de uma instância específica
 */
app.get("/status/:botId", (req, res) => {
    const { botId } = req.params;
    const instance = InstanceManager.getInstance(botId);
    const stats = InstanceManager.getStats(botId);

    res.json({
        bot_id: botId,
        is_running: instance.is_running,
        current_format: instance.current_format,
        current_category: instance.current_category,
        uptime: instance.start_time ? Date.now() - instance.start_time : 0,
        stats: stats,
        config: instance.config
    });
});

// ═══════════════════════════════════════════════════════════════
// ROTAS - CONTROLE DE AUTOMAÇÃO
// ═══════════════════════════════════════════════════════════════

/**
 * POST /start_bot/:botId
 * Inicia a automação de uma instância
 */
app.post("/start_bot/:botId", async (req, res) => {
    try {
        const { botId } = req.params;
        const instance = InstanceManager.getInstance(botId);
        const config = instance.config;

        // Se nao houver configuracao salva, retornar erro
        if (!config || !config.tokens || config.tokens.length === 0) {
            return res.status(400).json({
                status: "error",
                message: "Nenhuma configuracao salva. Configure os tokens primeiro."
            });
        }

        const result = await InstanceManager.startAutomation(
            botId,
            config.tokens,
            config.format || "1v1",
            config.category || "mobile",
            config.mensagem || "",
            config.mencao || 0,
            config.categories || [],
            config.modos || []
        );

        res.json(result);
    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
});

/**
 * POST /stop_bot/:botId
 * Para a automação de uma instância
 */
app.post("/stop_bot/:botId", async (req, res) => {
    try {
        const { botId } = req.params;
        const result = await InstanceManager.stopAutomation(botId);
        res.json(result);
    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS - CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════

/**
 * POST /save_config
 * Salva a configuração de uma instância
 */
app.post("/save_config", upload.single("imagem_auto"), async (req, res) => {
    try {
        const { bot_id, tokens, mensagem, mencao, categories, modos } = req.body;

        if (!bot_id || !tokens) {
            return res.status(400).json({
                status: "error",
                message: "bot_id e tokens são obrigatórios"
            });
        }

        const config = {
            tokens: tokens.split("\n").map(t => t.trim()).filter(t => t),
            mensagem: mensagem || "",
            mencao: parseFloat(mencao) || 0,
            categories: categories ? JSON.parse(categories) : [],
            modos: modos ? JSON.parse(modos) : [],
            imagem_auto: req.file ? req.file.path : null,
            saved_at: new Date().toISOString()
        };

        const result = await InstanceManager.saveConfig(bot_id, config);
        
        res.json({
            ...result,
            message: "Configuração salva com sucesso"
        });
    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
});

/**
 * GET /config/:botId
 * Obtém a configuração de uma instância
 */
app.get("/config/:botId", async (req, res) => {
    try {
        const { botId } = req.params;
        const config = await InstanceManager.loadConfig(botId);
        
        res.json({
            status: "success",
            config: config
        });
    } catch (err) {
        res.status(500).json({
            status: "error",
            message: err.message
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS - LOGS E ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /logs/:botId
 * Obtém os logs de uma instância
 */
app.get("/logs/:botId", (req, res) => {
    const { botId } = req.params;
    const logs = InstanceManager.getLogs(botId);

    res.json({
        bot_id: botId,
        logs: logs
    });
});

/**
 * POST /clear_logs/:botId
 * Limpa os logs de uma instância
 */
app.post("/clear_logs/:botId", (req, res) => {
    const { botId } = req.params;
    InstanceManager.clearLogs(botId);

    res.json({
        status: "success",
        message: "Logs limpos"
    });
});

/**
 * POST /reset_stats/:botId
 * Reseta as estatísticas de uma instância
 */
app.post("/reset_stats/:botId", (req, res) => {
    const { botId } = req.params;
    InstanceManager.resetStats(botId);

    res.json({
        status: "success",
        message: "Estatísticas resetadas"
    });
});

// ═══════════════════════════════════════════════════════════════
// ROTA - SERVIR O PAINEL HTML
// ═══════════════════════════════════════════════════════════════

/**
 * GET /painel
 * Serve o painel web
 */
app.get("/painel", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/painel.html"));
});

// Fallback para servir painel.html na raiz também
app.get("/painel.html", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/painel.html"));
});

// ═══════════════════════════════════════════════════════════════
// TRATAMENTO DE ERROS
// ═══════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
    console.error("[ERRO]", err);
    res.status(500).json({
        status: "error",
        message: "Erro interno do servidor",
        error: process.env.NODE_ENV === "development" ? err.message : undefined
    });
});

// ═══════════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🚀 Servidor do Painel Web iniciado`);
    console.log(`📍 Endereço: http://localhost:${PORT}`);
    console.log(`🎛️  Painel: http://localhost:${PORT}/painel`);
    console.log(`${"═".repeat(60)}\n`);
});

module.exports = app;
