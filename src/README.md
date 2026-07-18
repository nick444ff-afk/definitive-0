# Sistema de Filas Automatizadas - Versão Simplificada

## 🎯 Objetivo
Automação simples de filas sem dependência de planos, keys, assinaturas ou validações de acesso.

## 🚀 Fluxo de Uso

```
Configuração
    ↓
Iniciar
    ↓
Selecionar Formato (1v1, 2v2, 3v3, 4v4)
    ↓
Selecionar Tipo (Mobile, Emulador, Tático, Misto)
    ↓
Automação Inicia
```

## ⚙️ Configuração

### Pré-requisitos
- Node.js 16+
- Discord Bot Token
- Token de usuário Discord (para automação)

### Instalação

1. Clone o repositório
2. Instale as dependências:
```bash
npm install
```

3. Configure o arquivo `config.json`:
```json
{
  "token": "SEU_BOT_TOKEN_AQUI",
  "owner": ["SEU_USER_ID"]
}
```

4. Inicie o bot:
```bash
node src/index.js
```

## 📋 Comandos Disponíveis

### `/setpainel`
- **Descrição:** Cria o painel de controle das filas
- **Permissão:** Apenas Owner
- **Uso:** `/setpainel`

### `/ping`
- **Descrição:** Verifica o ping do bot
- **Uso:** `/ping`

## 🎮 Como Usar

1. **Configure suas filas:**
   - Clique em "Configuração"
   - Insira seu token Discord
   - Configure opções de automação (opcional):
     - Mensagem automática na fila
     - Menção automática ao adversário
     - Confirmação automática da fila

2. **Inicie a automação:**
   - Clique em "Iniciar"
   - Selecione o formato desejado (1v1, 2v2, etc.)
   - Selecione o tipo de fila (Mobile, Emulador, etc.)
   - A automação iniciará automaticamente

3. **Monitoramento:**
   - Visualize logs em tempo real
   - A automação funciona por 30 minutos
   - Pode ser interrompida manualmente

## 🔧 Opções de Automação

- **Mensagem Automática:** Envia uma mensagem pré-configurada na fila
- **Menção Automática:** Menciona automaticamente o adversário após X segundos
- **Confirmação Automática:** Confirma a fila automaticamente após X segundos

## 📊 Tipos de Fila Suportados

### 1v1
- Mobile Gelo Infinito
- Mobile Gelo Normal
- Emulador Gelo Infinito
- Emulador Gelo Normal
- Tático Mobile
- Tático Emulador

### 2v2, 3v3, 4v4
- Tático Mobile
- Tático Emulador
- Emulador
- Mobile
- Misto (variações)

## 🛡️ Segurança

- Tokens são armazenados localmente em `users.json`
- Nunca compartilhe seu token
- Mantenha o arquivo `config.json` seguro
- Use contas de teste quando possível

## 🐛 Troubleshooting

### "Token inválido"
- Verifique se o token está correto
- Certifique-se de que está usando token de usuário, não de bot

### "Nenhum canal encontrado"
- Verifique se os nomes dos canais contêm os tipos configurados
- Certifique-se de ter permissão de visualização

### "Erro ao conectar"
- Verifique sua conexão com a internet
- Reinicie o bot

## 📝 Changelog

### v1.0.0 - Simplificação Completa
- ✅ Removido sistema de Keys
- ✅ Removido sistema de Planos
- ✅ Removido sistema de Valor
- ✅ Corrigido timeout (30 minutos)
- ✅ Melhorada automação de filas
- ✅ Limpeza de código legado
- ✅ Otimizações de performance

## 📞 Suporte

Para reportar bugs ou sugerir melhorias, entre em contato com o desenvolvedor.

---

**Desenvolvido por @rugalxit7**
