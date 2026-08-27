import { randomUUID } from 'node:crypto';

export function logError(context, error) {
  const incidentId = randomUUID();
  const safeDetails = {
    incidentId,
    context,
    type: error?.name || 'Error',
    code: error?.code || null,
  };

  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(safeDetails));
  } else {
    console.error(JSON.stringify(safeDetails), error);
  }

  return incidentId;
}

