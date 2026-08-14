import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeDemandAttachment,
  demandAttachmentDisposition,
  safeDemandFilename,
} from '../src/demand-attachments.js';

test('decodifica um anexo permitido e normaliza o nome', () => {
  const result = decodeDemandAttachment({
    nome: '../evidência.pdf',
    dados: `data:application/pdf;base64,${Buffer.from('arquivo').toString('base64')}`,
  });
  assert.equal(result.nome, '_evidência.pdf');
  assert.equal(result.mime, 'application/pdf');
  assert.equal(result.bytes.toString(), 'arquivo');
});

test('recusa formato executável', () => {
  assert.throws(() => decodeDemandAttachment({
    nome: 'programa.exe',
    dados: `data:application/x-msdownload;base64,${Buffer.from('MZ').toString('base64')}`,
  }), /Tipo de arquivo não permitido/);
});

test('gera cabeçalho de download seguro para nome com acento', () => {
  assert.equal(safeDemandFilename('foto\n"teste".png'), 'foto__teste_.png');
  assert.match(demandAttachmentDisposition('evidência.pdf'), /filename\*=UTF-8''evid%C3%AAncia.pdf/);
});
