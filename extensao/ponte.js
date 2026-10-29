// Roda no mundo da página (onde o WPP do wa-js existe) e atende os pedidos do
// painel, que roda isolado e só conversa com a página via postMessage.
(function () {
    const ORIGEM = 'exportador-grupo';

    function responder(id, ok, conteudo) {
        window.postMessage({ origem: ORIGEM, tipo: 'resposta', id, ok, ...conteudo }, '*');
    }

    function progresso(id, feito, total) {
        window.postMessage({ origem: ORIGEM, tipo: 'progresso', id, feito, total }, '*');
    }

    function estado() {
        const wpp = window.WPP;
        if (!wpp || !wpp.isFullReady) {
            return { pronto: false, autenticado: false };
        }
        return { pronto: true, autenticado: !!wpp.conn.isAuthenticated() };
    }

    async function listarGrupos() {
        const grupos = await WPP.group.getAllGroups();
        return grupos
            .filter(Boolean)
            .map(c => ({
                id: c.id._serialized,
                titulo: c.formattedTitle || c.name || c.id.user,
                participantes: c.groupMetadata?.participants?.length ?? null,
            }))
            .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    }

    // Mesma regra do index.js: telefone direto quando o ID é @c.us, senão tenta
    // o contato carregado e, por fim, o mapeamento LID → telefone do WhatsApp.
    async function resolverTelefone(p) {
        const serialized = p.id?._serialized || '';
        if (serialized.endsWith('@c.us')) {
            return serialized.split('@')[0];
        }

        const phoneWid = p.contact?.phoneNumber;
        if (phoneWid) {
            return phoneWid.user || phoneWid._serialized?.split('@')[0] || null;
        }

        if (serialized.endsWith('@lid')) {
            try {
                const entrada = await WPP.contact.getPnLidEntry(serialized);
                const pn = entrada?.phoneNumber;
                if (pn) return pn.id || pn._serialized?.split('@')[0] || null;
            } catch (_) {
                // Sem mapeamento disponível: fica como privado
            }
        }
        return null;
    }

    async function extrairParticipantes(pedidoId, grupoId) {
        const participantes = await WPP.group.getParticipants(grupoId);
        const linhas = [];
        for (let i = 0; i < participantes.length; i++) {
            const p = participantes[i];
            linhas.push({
                id: p.id?._serialized || '',
                telefone: await resolverTelefone(p),
                admin: !!(p.isAdmin || p.isSuperAdmin),
            });
            if (i % 25 === 0) progresso(pedidoId, i + 1, participantes.length);
        }
        progresso(pedidoId, participantes.length, participantes.length);
        return linhas;
    }

    window.addEventListener('message', async event => {
        const msg = event.data;
        if (event.source !== window || !msg || msg.origem !== ORIGEM || msg.tipo !== 'pedido') {
            return;
        }

        try {
            let resultado;
            if (msg.acao === 'estado') {
                resultado = estado();
            } else if (msg.acao === 'listarGrupos') {
                resultado = await listarGrupos();
            } else if (msg.acao === 'extrairParticipantes') {
                resultado = await extrairParticipantes(msg.id, msg.dados.grupoId);
            } else {
                throw new Error(`Ação desconhecida: ${msg.acao}`);
            }
            responder(msg.id, true, { resultado });
        } catch (err) {
            responder(msg.id, false, { erro: err && err.message ? err.message : String(err) });
        }
    });
})();
