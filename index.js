const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Nome do grupo pode vir pela linha de comando: node index.js "Nome do grupo"
const NOME_DO_GRUPO = process.argv[2] || 'Alva AFILIADOS Club 💙';

// Função sleep para pausar a execução
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Remove caracteres inválidos para nome de arquivo/pasta
function sanitizarNomeArquivo(nome) {
    return nome.replace(/[\\/:*?"<>|]/g, '').trim();
}

function obterDataFormatada() {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    return `${ano}-${mes}-${dia}`;
}

// Monta o caminho de saída em ./groups, nomeado com grupo + data.
// Se já existir um relatório do mesmo grupo no mesmo dia, acrescenta -1, -2, -3...
function gerarCaminhoArquivo(nomeGrupo) {
    const pastaGroups = path.join(__dirname, 'groups');
    if (!fs.existsSync(pastaGroups)) {
        fs.mkdirSync(pastaGroups, { recursive: true });
    }

    const nomeBase = sanitizarNomeArquivo(nomeGrupo);
    const data = obterDataFormatada();

    let caminho = path.join(pastaGroups, `${nomeBase}_${data}.xlsx`);
    let contador = 1;
    while (fs.existsSync(caminho)) {
        caminho = path.join(pastaGroups, `${nomeBase}_${data}-${contador}.xlsx`);
        contador++;
    }

    return caminho;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    // Sem webVersionCache: deixamos a biblioteca escolher uma versão do WhatsApp Web
    // compatível. Fixar uma versão antiga (ex.: 2.2412.54) quebra o getChats().
    puppeteer: {
        protocolTimeout: 0,
        takeoverTimeoutMs: 120000,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

// A página do WhatsApp Web recarrega de forma intermitente logo após o "ready",
// destruindo o contexto de execução. Este helper reexecuta a avaliação quando
// isso acontece, em vez de deixar o erro derrubar o processo.
async function pageEvalWithRetry(pageFn, arg, retries = 6, delayMs = 5000) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            return await client.pupPage.evaluate(pageFn, arg);
        } catch (err) {
            lastErr = err;
            const msg = err && err.message ? err.message : String(err);
            const recuperavel =
                msg.includes('Execution context was destroyed') ||
                msg.includes('Cannot find context') ||
                msg.includes('Target closed') ||
                msg === 'r';
            if (recuperavel && i < retries - 1) {
                console.log(`Contexto instável (${msg}), tentando novamente (${i + 1}/${retries})...`);
                await sleep(delayMs);
            } else {
                throw err;
            }
        }
    }
    throw lastErr;
}

// Extrai o grupo alvo e seus participantes direto do Store, dentro da página.
// Evita client.getChats(), que processa TODOS os chats e quebra num deles.
function extrairGrupoNaPagina(nome) {
    const chats = window.Store.Chat.getModelsArray();
    const grupo = chats.find(c =>
        c.id?.server === 'g.us' &&
        ((c.formattedTitle || c.name || '').trim() === nome.trim())
    );

    if (!grupo) {
        return {
            encontrado: false,
            titulos: chats
                .filter(c => c.id?.server === 'g.us')
                .map(c => c.formattedTitle || c.name)
                .filter(Boolean),
        };
    }

    return { encontrado: true, id: grupo.id._serialized, titulo: grupo.formattedTitle || grupo.name };
}

// Atualiza os metadados do grupo e devolve os participantes (com telefone já
// resolvido quando o contato estiver disponível na página).
async function extrairParticipantesNaPagina(grupoId) {
    const chatWid = window.Store.WidFactory.createWid(grupoId);
    const gm = window.Store.GroupMetadata || window.Store.WAWebGroupMetadataCollection;
    await gm.update(chatWid);

    const grupo = window.Store.Chat.get(grupoId);
    const models = grupo?.groupMetadata?.participants?._models || [];

    return models.map(p => {
        const serialized = p.id?._serialized || '';
        // Telefone resolvido no próprio Store, quando disponível (contato conhecido)
        const phoneWid = p.contact?.phoneNumber;
        const phone =
            (phoneWid && (phoneWid.user || phoneWid._serialized?.split('@')[0])) ||
            (serialized.endsWith('@c.us') ? serialized.split('@')[0] : null);
        return {
            serialized,
            isAdmin: !!(p.isAdmin || p.isSuperAdmin),
            phone,
        };
    });
}

client.on('ready', async () => {
  try {
    console.log('Bot pronto! Aguardando estabilização da página...');
    await sleep(8000);

    const info = await pageEvalWithRetry(extrairGrupoNaPagina, NOME_DO_GRUPO);

    if (!info.encontrado) {
        console.log(`Grupo "${NOME_DO_GRUPO}" não encontrado. Grupos disponíveis:`);
        (info.titulos || []).forEach(t => console.log('  •', t));
        process.exit(1);
    }

    console.log(`Extraindo contatos de: ${info.titulo}  (${info.id})`);

    const participantes = await pageEvalWithRetry(extrairParticipantesNaPagina, info.id);
    console.log(`Participantes encontrados: ${participantes.length}`);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contatos');

    // Cabeçalhos
    sheet.columns = [
        { header: 'Nº',              key: 'index',  width: 6  },
        { header: 'Número WhatsApp', key: 'numero', width: 22 },
        { header: 'ID Completo',     key: 'id',     width: 32 },
        { header: 'Admin',           key: 'admin',  width: 10 },
    ];

    // Estilo do cabeçalho (verde WhatsApp)
    sheet.getRow(1).eachCell(cell => {
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF25D366' } };
        cell.alignment = { horizontal: 'center' };
    });

    // Linhas de dados
    let semTelefone = 0;
    for (let i = 0; i < participantes.length; i++) {
        const p = participantes[i];
        let numero = p.phone;

        // Fallback: para IDs @lid sem telefone resolvido na página, tenta o contato
        if (!numero && p.serialized.endsWith('@lid')) {
            try {
                const contact = await client.getContactById(p.serialized);
                numero = contact.number || contact.id?.user || null;
            } catch (_) {
                numero = null;
            }
        }

        if (numero) {
            console.log(`#${i + 1} | ${numero} | id="${p.serialized}"`);
        } else {
            semTelefone++;
            console.log(`[privado/LID] #${i + 1} | id="${p.serialized}"`);
            numero = '(privado - LID)';
        }

        sheet.addRow({
            index:  i + 1,
            numero,
            id:     p.serialized,
            admin:  p.isAdmin ? 'Sim' : 'Não',
        });
    }
    console.log(`\n📊 Resumo: ${participantes.length} participantes | ${participantes.length - semTelefone} com telefone visível | ${semTelefone} com privacidade LID (sem telefone)`);

    // Bordas em todas as células
    sheet.eachRow(row => {
        row.eachCell(cell => {
            cell.border = {
                top:    { style: 'thin' },
                left:   { style: 'thin' },
                bottom: { style: 'thin' },
                right:  { style: 'thin' },
            };
        });
    });

    const caminhoArquivo = gerarCaminhoArquivo(info.titulo);
    await workbook.xlsx.writeFile(caminhoArquivo);
    console.log(`✅ Salvo: ${caminhoArquivo} (${participantes.length} contatos)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao extrair contatos:', err.message || err);
    process.exit(1);
  }
});

// Evita que uma rejeição não tratada derrube o processo com stack trace crua
process.on('unhandledRejection', (reason) => {
    console.error('❌ Rejeição não tratada:', reason && reason.message ? reason.message : reason);
    process.exit(1);
});

client.initialize();
