# SystemX - Painel Web de Controle de Bots

Sistema de painel web para controlar múltiplas instâncias de bots Discord de forma independente.

## Características

- ✅ Suporte para múltiplas instâncias (Bot 1, Bot 2, etc.)
- ✅ Cada instância funciona de forma completamente independente
- ✅ Interface web moderna e responsiva
- ✅ Automação de entrada em filas do Discord
- ✅ Sistema de logs em tempo real
- ✅ Gerenciamento de configurações por instância
- ✅ Estatísticas de desempenho

## Estrutura do Projeto

```
projeto_web/
├── src/
│   ├── server.js                 # Servidor Express principal
│   ├── managers/
│   │   ├── InstanceManager.js    # Gerenciador de instâncias
│   │   └── AutomationEngine.js   # Motor de automação
│   ├── databases/
│   │   ├── index.js              # Configuração do banco de dados
│   │   └── users.json            # Dados dos usuários
│   ├── events/
│   ├── commands/
│   └── handler/
├── public/
│   └── painel.html               # Interface web do painel
├── uploads/                      # Diretório para uploads de arquivos
├── package.json
└── README.md
```

## Instalação

1. Clone ou extraia o projeto
2. Instale as dependências:
```bash
npm install
```

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (opcional):
```
PORT=8000
NODE_ENV=development
```

### Config.json

Edite o arquivo `config.json` com seus tokens do Discord:
```json
{
  "token": "SEU_TOKEN_AQUI",
  "owner": ["SEU_ID_AQUI"]
}
```

## Uso

### Iniciar o Servidor

```bash
npm start
```

O servidor iniciará em `http://localhost:8000`

### Acessar o Painel

Abra seu navegador e acesse:
```
http://localhost:8000/painel
```

## API Endpoints

### Status e Saúde

- `GET /` - Verifica se o servidor está rodando
- `GET /status/:botId` - Obtém o status de uma instância

### Controle de Automação

- `POST /start_bot/:botId` - Inicia a automação
- `POST /stop_bot/:botId` - Para a automação

### Configuração

- `POST /save_config` - Salva a configuração de uma instância
- `GET /config/:botId` - Obtém a configuração salva

### Logs e Estatísticas

- `GET /logs/:botId` - Obtém os logs de uma instância
- `POST /clear_logs/:botId` - Limpa os logs
- `POST /reset_stats/:botId` - Reseta as estatísticas

## Como Funciona

### Instâncias Independentes

Cada bot (BOT1, BOT2, etc.) é completamente independente:
- Possui sua própria configuração
- Seus próprios logs
- Suas próprias estatísticas
- Pode estar ligado ou desligado independentemente

### Fluxo de Automação

1. **Configuração**: Salve os tokens, formato e categoria
2. **Inicialização**: Clique no botão Play para iniciar
3. **Automação**: O sistema processa as filas automaticamente
4. **Monitoramento**: Acompanhe os logs em tempo real

### Busca de Canais

O sistema busca canais que contenham:
- Formato: `1x1`, `2x2`, `3x3`, `4x4`
- Categoria: `mob` (mobile), `emu` (emulador), `misto`, `tatico`

Exemplo: `1x1-mob` ou `2x2-emu`

## Deployment

### Railway

1. Conecte seu repositório ao Railway
2. Configure as variáveis de ambiente
3. O Railway detectará automaticamente `package.json` e iniciará com `npm start`

### Outras Plataformas

O projeto é compatível com qualquer plataforma Node.js que suporte:
- Express.js
- Discord.js-selfbot-v13
- Multer para upload de arquivos

## Estrutura de Dados

### Instância

```javascript
{
  id: "BOT1",
  is_running: false,
  config: {
    tokens: ["token1", "token2"],
    format: "1v1",
    category: "mobile",
    mensagem: "Mensagem automática",
    mencao: 10,
    categories: ["Mobile"],
    modos: ["1x1"]
  },
  current_format: "1v1",
  current_category: "mobile",
  start_time: 1234567890
}
```

### Estatísticas

```javascript
{
  entradas: 0,
  na_fila: 0,
  partidas: 0,
  dms: 0
}
```

### Log

```javascript
{
  timestamp: "2026-07-18T19:00:00.000Z",
  message: "Mensagem de log",
  type: "success" // success, error, warn, info
}
```

## Troubleshooting

### Erro: "Nenhuma configuração salva"

Certifique-se de:
1. Salvar a configuração com tokens válidos
2. Os tokens devem ter entre 59 e 100 caracteres

### Erro: "Nenhum canal encontrado"

Verifique:
1. Os canais existem no servidor
2. O nome segue o padrão: `{formato}-{categoria}`
3. O bot tem acesso aos canais

### Erro de Conexão

1. Verifique se o servidor está rodando
2. Confirme a URL da API
3. Verifique o console do navegador para mais detalhes

## Desenvolvimento

### Adicionar Nova Instância

As instâncias são criadas dinamicamente. Basta usar um novo `botId` na API.

### Modificar Lógica de Automação

Edite `src/managers/AutomationEngine.js` para alterar o comportamento da automação.

### Customizar Interface

Edite `public/painel.html` para modificar o design e funcionalidades do painel.

## Segurança

⚠️ **Importante:**
- Nunca compartilhe seus tokens
- Mantenha o arquivo `config.json` seguro
- Use HTTPS em produção
- Implemente autenticação se necessário

## Licença

ISC

## Suporte

Para problemas ou dúvidas, verifique:
1. Os logs do servidor
2. O console do navegador
3. A seção Troubleshooting acima
