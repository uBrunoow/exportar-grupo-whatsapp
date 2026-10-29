// Painel flutuante dentro do WhatsApp Web: busca o grupo e baixa o .xlsx.
// Roda no mundo isolado da extensão e pede os dados à ponte.js via postMessage.
(function () {
    const ORIGEM = 'exportador-grupo';
    let proximoId = 1;
    const pendentes = new Map();

    window.addEventListener('message', event => {
        const msg = event.data;
        if (event.source !== window || !msg || msg.origem !== ORIGEM) return;
        const pendente = pendentes.get(msg.id);
        if (!pendente) return;

        if (msg.tipo === 'progresso') {
            pendente.onProgresso?.(msg.feito, msg.total);
        } else if (msg.tipo === 'resposta') {
            pendentes.delete(msg.id);
            clearTimeout(pendente.timer);
            msg.ok ? pendente.resolve(msg.resultado) : pendente.reject(new Error(msg.erro));
        }
    });

    function pedir(acao, dados, { onProgresso, timeoutMs } = {}) {
        return new Promise((resolve, reject) => {
            const id = `${Date.now()}-${proximoId++}`;
            const timer = timeoutMs
                ? setTimeout(() => {
                      pendentes.delete(id);
                      reject(new Error('A página do WhatsApp não respondeu.'));
                  }, timeoutMs)
                : null;
            pendentes.set(id, { resolve, reject, onProgresso, timer });
            window.postMessage({ origem: ORIGEM, tipo: 'pedido', id, acao, dados }, '*');
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function normalizar(texto) {
        return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function sanitizarNomeArquivo(nome) {
        return nome.replace(/[\\/:*?"<>|]/g, '').trim();
    }

    function obterDataFormatada() {
        const hoje = new Date();
        const dia = String(hoje.getDate()).padStart(2, '0');
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        return `${hoje.getFullYear()}-${mes}-${dia}`;
    }

    function baixar(blob, nomeArquivo) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ---------- Interface ----------

    const host = document.createElement('div');
    host.id = 'exportador-grupo';
    const raiz = host.attachShadow({ mode: 'open' });
    raiz.innerHTML = `
<style>
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap {
  --fundo: #ffffff; --texto: #111b21; --suave: #667781; --linha: #e9edef;
  --hover: #f5f6f6; --verde: #25d366; --verde-escuro: #008069; --erro: #d93025;
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
}
@media (prefers-color-scheme: dark) {
  .wrap { --fundo: #1f2c34; --texto: #e9edef; --suave: #8696a0; --linha: #2a3942; --hover: #2a3942; --verde-escuro: #00a884; }
}
.fab {
  border: 0; border-radius: 999px; padding: 10px 16px; cursor: pointer;
  background: var(--verde-escuro); color: #fff; font-size: 14px; font-weight: 600;
  box-shadow: 0 4px 14px rgba(0,0,0,.2);
}
.fab:hover { filter: brightness(1.08); }
.painel {
  width: 360px; max-width: calc(100vw - 40px); max-height: 70vh;
  display: none; flex-direction: column;
  background: var(--fundo); color: var(--texto);
  border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.25); overflow: hidden;
}
.painel.aberto { display: flex; }
.topo { padding: 14px 16px 10px; border-bottom: 1px solid var(--linha); }
.titulo { display: flex; justify-content: space-between; align-items: center; margin: 0 0 10px; }
.titulo h2 { margin: 0; font-size: 15px; font-weight: 600; }
.icone { border: 0; background: none; color: var(--suave); cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: 6px; }
.icone:hover { background: var(--hover); color: var(--texto); }
input {
  width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--linha);
  background: var(--hover); color: var(--texto); font-size: 14px; outline: none;
}
input:focus { border-color: var(--verde-escuro); }
.status { padding: 10px 16px; font-size: 13px; color: var(--suave); border-bottom: 1px solid var(--linha); }
.status:empty { display: none; }
.status.erro { color: var(--erro); }
.status.ok { color: var(--verde-escuro); }
ul { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1; }
ul:empty { display: none; }
li { display: flex; align-items: center; gap: 10px; padding: 8px 16px; }
li:hover { background: var(--hover); }
.info { flex: 1; min-width: 0; }
.nome { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qtd { font-size: 12px; color: var(--suave); }
.gerar {
  flex-shrink: 0; border: 1px solid var(--verde-escuro); background: none; color: var(--verde-escuro);
  border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.gerar:hover:not(:disabled) { background: var(--verde-escuro); color: #fff; }
.gerar:disabled { opacity: .45; cursor: default; }
.vazio { padding: 16px; font-size: 13px; color: var(--suave); text-align: center; }
</style>
<div class="wrap">
  <section class="painel" aria-label="Exportar grupo">
    <div class="topo">
      <div class="titulo">
        <h2>Exportar grupo</h2>
        <span>
          <button class="icone" data-acao="recarregar" title="Atualizar lista">Atualizar</button>
          <button class="icone" data-acao="fechar" title="Fechar">✕</button>
        </span>
      </div>
      <input type="search" placeholder="Buscar grupo pelo nome" autocomplete="off">
    </div>
    <div class="status" role="status"></div>
    <ul></ul>
  </section>
  <button class="fab" data-acao="abrir">Exportar grupo</button>
</div>`;

    const painel = raiz.querySelector('.painel');
    const busca = raiz.querySelector('input');
    const status = raiz.querySelector('.status');
    const lista = raiz.querySelector('ul');

    let grupos = [];
    let exportando = false;
    let carregando = false;

    function mostrarStatus(texto, tipo = '') {
        status.textContent = texto;
        status.className = `status ${tipo}`;
    }

    function renderizarLista() {
        const termo = normalizar(busca.value.trim());
        const filtrados = termo ? grupos.filter(g => normalizar(g.titulo).includes(termo)) : grupos;
        lista.replaceChildren();

        if (!grupos.length) return;
        if (!filtrados.length) {
            const li = document.createElement('li');
            li.className = 'vazio';
            li.textContent = 'Nenhum grupo com esse nome.';
            lista.appendChild(li);
            return;
        }

        for (const grupo of filtrados) {
            const li = document.createElement('li');
            const info = document.createElement('div');
            info.className = 'info';
            const nome = document.createElement('div');
            nome.className = 'nome';
            nome.textContent = grupo.titulo;
            nome.title = grupo.titulo;
            info.appendChild(nome);
            if (grupo.participantes != null) {
                const qtd = document.createElement('div');
                qtd.className = 'qtd';
                qtd.textContent = `${grupo.participantes} participantes`;
                info.appendChild(qtd);
            }
            const botao = document.createElement('button');
            botao.className = 'gerar';
            botao.textContent = 'Gerar XLSX';
            botao.disabled = exportando;
            botao.addEventListener('click', () => exportar(grupo));
            li.append(info, botao);
            lista.appendChild(li);
        }
    }

    // Espera o wa-js carregar e o usuário estar logado antes de listar
    async function carregarGrupos() {
        if (carregando) return;
        carregando = true;
        try {
            grupos = [];
            renderizarLista();
            mostrarStatus('Carregando o WhatsApp…');

            while (painel.classList.contains('aberto')) {
                let estado;
                try {
                    estado = await pedir('estado', null, { timeoutMs: 3000 });
                } catch (_) {
                    estado = { pronto: false };
                }
                if (estado.pronto && estado.autenticado) break;
                if (estado.pronto) mostrarStatus('Faça login lendo o QR Code na tela do WhatsApp.');
                await sleep(2000);
            }
            if (!painel.classList.contains('aberto')) return;

            mostrarStatus('Buscando seus grupos…');
            grupos = await pedir('listarGrupos');
            mostrarStatus(grupos.length ? '' : 'Nenhum grupo encontrado nesta conta.');
            renderizarLista();
            busca.focus();
        } catch (err) {
            mostrarStatus(`Erro ao listar grupos: ${err.message}`, 'erro');
        } finally {
            carregando = false;
        }
    }

    async function exportar(grupo) {
        if (exportando) return;
        exportando = true;
        renderizarLista();
        mostrarStatus(`Lendo participantes de "${grupo.titulo}"…`);

        try {
            const participantes = await pedir(
                'extrairParticipantes',
                { grupoId: grupo.id },
                {
                    onProgresso: (feito, total) =>
                        mostrarStatus(`Lendo participantes de "${grupo.titulo}"… ${feito}/${total}`),
                }
            );

            let semTelefone = 0;
            const linhas = participantes.map((p, i) => {
                if (!p.telefone) semTelefone++;
                return [i + 1, p.telefone || '(privado - LID)', p.id, p.admin ? 'Sim' : 'Não'];
            });

            const blob = gerarPlanilhaXlsx(
                'Contatos',
                [
                    { header: 'Nº', width: 6 },
                    { header: 'Número WhatsApp', width: 22 },
                    { header: 'ID Completo', width: 32 },
                    { header: 'Admin', width: 10 },
                ],
                linhas
            );
            baixar(blob, `${sanitizarNomeArquivo(grupo.titulo)}_${obterDataFormatada()}.xlsx`);

            mostrarStatus(
                `Pronto: ${participantes.length} participantes, ` +
                    `${participantes.length - semTelefone} com telefone, ` +
                    `${semTelefone} privados (LID).`,
                'ok'
            );
        } catch (err) {
            mostrarStatus(`Erro ao exportar: ${err.message}`, 'erro');
        } finally {
            exportando = false;
            renderizarLista();
        }
    }

    raiz.addEventListener('click', event => {
        const acao = event.target.closest('[data-acao]')?.dataset.acao;
        if (acao === 'abrir') {
            const abrir = !painel.classList.contains('aberto');
            painel.classList.toggle('aberto', abrir);
            if (abrir && !grupos.length) carregarGrupos();
            if (abrir && grupos.length) busca.focus();
        } else if (acao === 'fechar') {
            painel.classList.remove('aberto');
        } else if (acao === 'recarregar' && !exportando) {
            carregarGrupos();
        }
    });

    busca.addEventListener('input', renderizarLista);
    // Evita que as teclas digitadas na busca acionem atalhos do WhatsApp
    busca.addEventListener('keydown', event => event.stopPropagation());

    document.documentElement.appendChild(host);
})();
