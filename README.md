# Exportar Grupo do WhatsApp

Gera uma planilha `.xlsx` com os participantes de um grupo do WhatsApp:

| Nº | Número WhatsApp | ID Completo | Admin |
|----|-----------------|-------------|-------|

Há duas formas de usar:

- **Extensão do Chrome** (recomendada): roda dentro do WhatsApp Web, sem
  servidor e sem terminal. Veja [extensao/LEIA-ME.md](extensao/LEIA-ME.md).
- **Script de terminal** (`index.js`): abre um WhatsApp Web escondido via
  `whatsapp-web.js`, pede o QR Code no terminal e salva em `groups/`.

## Extensão do Chrome

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `extensao`.
3. Abra https://web.whatsapp.com, clique em **Exportar grupo**, busque o grupo
   e clique em **Gerar XLSX**.

A pasta `extensao/vendor` já traz o
[`@wppconnect/wa-js`](https://github.com/wppconnect-team/wa-js), então dá para
instalar direto do repositório, sem `npm install`.

## Script de terminal

```bash
npm install
npm run terminal -- "Nome do grupo"
```

Na primeira vez aparece um QR Code no terminal. A sessão fica salva em
`.wwebjs_auth/` e o relatório é gravado em `groups/`.

## Atualizar o wa-js da extensão

Quando o WhatsApp Web mudar e a extensão parar de funcionar:

```bash
npm update @wppconnect/wa-js
npm run extensao
```

Depois recarregue a extensão em `chrome://extensions`.

## Dados sensíveis

`.wwebjs_auth/` (sessão do WhatsApp) e `groups/` (telefones) estão no
`.gitignore` e nunca devem ser versionados.

## Estrutura

```
extensao/          extensão do Chrome (manifest, painel, ponte, gerador de xlsx)
extensao/vendor/   cópia do wa-js usada pela extensão
index.js           script de terminal
```
