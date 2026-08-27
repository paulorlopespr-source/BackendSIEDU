# Backup, restauração e rollback do SIEDU

Este procedimento se aplica primeiro à homologação. Nunca restaure um backup diretamente sobre produção.

## Backup do PostgreSQL

1. Obtenha a URL privada do banco no ambiente correto do Railway.
2. Execute `scripts/backup-postgres.ps1`, sem salvar a URL em arquivos versionados.
3. Guarde o `.dump` e o SHA-256 retornado em armazenamento criptografado.
4. Mantenha cópia fora do Railway e retenção diária, semanal e mensal.

```powershell
.\scripts\backup-postgres.ps1 -DatabaseUrl '<URL_PRIVADA>'
```

## Teste real de restauração

Crie um banco temporário e isolado, com nome contendo `teste` ou `restore`:

```powershell
.\scripts\restore-postgres-test.ps1 `
  -BackupPath '.\backups\siedu-AAAAMMDD-HHMMSS.dump' `
  -TargetDatabaseUrl '<URL_DO_BANCO_DE_TESTE>' `
  -Confirmation 'RESTAURAR-BANCO-DE-TESTE'
```

Depois, rode as migrações, `npm run test:database` e confira contagens de escolas, usuários, alunos, turmas e matrículas. Exclua o banco temporário somente após registrar o resultado.

## Rollback

- Backend: registre SHA e deployment do Railway. Em incidente, redeploy da última versão saudável e confirme `/health`.
- Frontend: registre SHA e deployment da Vercel. Em incidente, promova novamente o último deployment saudável.
- Banco: prefira uma migração corretiva. Restauração integral é último recurso e exige backup imediatamente anterior.

## Registro mínimo por publicação

- data, responsável e ambiente;
- SHA do frontend e backend;
- migrações aplicadas e testes executados;
- identificação do backup anterior;
- deployment publicado e versão disponível para rollback.

