# Exportar Grupo do WhatsApp (extensão do Chrome)

Faz no navegador o que o `index.js` faz no terminal: busca um grupo e gera um
`.xlsx` com os participantes (Nº, Número WhatsApp, ID Completo, Admin).
Não precisa de servidor nem banco. Tudo roda dentro do WhatsApp Web.

## Instalar (uma vez)

1. No Chrome (ou Edge), abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha esta pasta `extensao`.

Para passar a outra pessoa, compacte a pasta `extensao` num `.zip`. A pessoa
descompacta e segue os mesmos passos.

## Usar

1. Abra https://web.whatsapp.com e faça login pelo QR Code, como de costume.
2. Clique no botão verde **Exportar grupo** no canto inferior direito.
3. Digite parte do nome do grupo e clique em **Gerar XLSX**.

O arquivo é baixado como `<nome do grupo>_<AAAA-MM-DD>.xlsx`. Participantes
com privacidade de número (LID) aparecem como `(privado - LID)`.

## Quando o WhatsApp mudar e parar de funcionar

A extensão usa o `@wppconnect/wa-js` para ler os grupos. Para atualizar:

```bash
npm update @wppconnect/wa-js && npm run extensao
```

Depois clique no ícone de recarregar da extensão em `chrome://extensions`
e recarregue a aba do WhatsApp.

## Arquivos

- `manifest.json`: configuração da extensão.
- `ponte.js`: roda na página do WhatsApp e lê grupos e participantes via `WPP`.
- `painel.js`: botão, busca e montagem da planilha.
- `xlsx.js`: gera o `.xlsx` sem dependências.
- `vendor/wppconnect-wa.js`: cópia do wa-js (gerada por `npm run extensao`).
