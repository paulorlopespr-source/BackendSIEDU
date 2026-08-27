import test from 'node:test';
import assert from 'node:assert/strict';

import { logError } from '../src/utils/safe-logger.js';

test('logs de produção não expõem mensagem nem dados anexados ao erro', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousConsoleError = console.error;
  const calls = [];
  process.env.NODE_ENV = 'production';
  console.error = (...items) => calls.push(items);

  try {
    const error = Object.assign(new Error('senha=Segredo123 email=pessoa@example.com'), {
      code: 'TEST_CODE',
      requestBody: { cpf: '12345678900' },
    });
    const incidentId = logError('test', error);
    assert.match(incidentId, /^[0-9a-f-]{36}$/i);
    const output = JSON.stringify(calls);
    assert.doesNotMatch(output, /Segredo123|pessoa@example\.com|12345678900/);
    assert.match(output, /TEST_CODE/);
  } finally {
    console.error = previousConsoleError;
    process.env.NODE_ENV = previousEnvironment;
  }
});

