// Gerador mínimo de .xlsx (uma planilha, cabeçalho verde e bordas), sem
// dependências. O ExcelJS usa eval, que o Chrome bloqueia em extensões.
// Um .xlsx é um zip de XMLs; aqui o zip é gravado sem compressão.
(function () {
    const encoder = new TextEncoder();

    const TABELA_CRC = (() => {
        const tabela = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            tabela[n] = c >>> 0;
        }
        return tabela;
    })();

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) crc = TABELA_CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function zip(arquivos) {
        const partes = [];
        const central = [];
        let offset = 0;

        for (const { nome, conteudo } of arquivos) {
            const nomeBytes = encoder.encode(nome);
            const dados = encoder.encode(conteudo);
            const crc = crc32(dados);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);       // versão necessária
            local.setUint16(6, 0x0800, true);   // nomes em UTF-8
            local.setUint16(8, 0, true);        // sem compressão
            local.setUint16(10, 0, true);       // hora
            local.setUint16(12, 0x21, true);    // data: 01/01/1980
            local.setUint32(14, crc, true);
            local.setUint32(18, dados.length, true);
            local.setUint32(22, dados.length, true);
            local.setUint16(26, nomeBytes.length, true);
            local.setUint16(28, 0, true);
            partes.push(new Uint8Array(local.buffer), nomeBytes, dados);

            const dir = new DataView(new ArrayBuffer(46));
            dir.setUint32(0, 0x02014b50, true);
            dir.setUint16(4, 20, true);
            dir.setUint16(6, 20, true);
            dir.setUint16(8, 0x0800, true);
            dir.setUint16(10, 0, true);
            dir.setUint16(12, 0, true);
            dir.setUint16(14, 0x21, true);
            dir.setUint32(16, crc, true);
            dir.setUint32(20, dados.length, true);
            dir.setUint32(24, dados.length, true);
            dir.setUint16(28, nomeBytes.length, true);
            dir.setUint32(42, offset, true);
            central.push(new Uint8Array(dir.buffer), nomeBytes);

            offset += 30 + nomeBytes.length + dados.length;
        }

        const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
        const fim = new DataView(new ArrayBuffer(22));
        fim.setUint32(0, 0x06054b50, true);
        fim.setUint16(8, arquivos.length, true);
        fim.setUint16(10, arquivos.length, true);
        fim.setUint32(12, tamanhoCentral, true);
        fim.setUint32(16, offset, true);

        return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
    }

    function escaparXml(valor) {
        return String(valor)
            // Remove caracteres de controle que o XML não aceita
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function letraColuna(indice) {
        return String.fromCharCode(65 + indice);
    }

    // Estilo 1 = cabeçalho (negrito branco, fundo verde WhatsApp, centralizado, borda)
    // Estilo 2 = dado com borda fina
    function celula(valor, ref, estilo) {
        if (typeof valor === 'number') {
            return `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`;
        }
        return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
    }

    const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF25D366"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    // colunas: [{ header, width }], linhas: arrays de valores na ordem das colunas
    function gerarPlanilhaXlsx(nomeAba, colunas, linhas) {
        const cols = colunas
            .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
            .join('');

        const todas = [colunas.map(c => c.header), ...linhas];
        const rows = todas
            .map((valores, r) => {
                const estilo = r === 0 ? 1 : 2;
                const cells = valores.map((v, c) => celula(v ?? '', `${letraColuna(c)}${r + 1}`, estilo)).join('');
                return `<row r="${r + 1}">${cells}</row>`;
            })
            .join('');

        const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;

        return zip([
            {
                nome: '[Content_Types].xml',
                conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
            },
            {
                nome: '_rels/.rels',
                conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
            },
            {
                nome: 'xl/workbook.xml',
                conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escaparXml(nomeAba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
            },
            {
                nome: 'xl/_rels/workbook.xml.rels',
                conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
            },
            { nome: 'xl/worksheets/sheet1.xml', conteudo: sheet },
            { nome: 'xl/styles.xml', conteudo: STYLES },
        ]);
    }

    globalThis.gerarPlanilhaXlsx = gerarPlanilhaXlsx;
})();
