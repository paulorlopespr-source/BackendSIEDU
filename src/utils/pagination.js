export function getPagination(query, options = {}) {
  const requested = query.page != null || query.limit != null;

  if (!requested) {
    return null;
  }

  const defaultLimit = options.defaultLimit || 25;
  const maxLimit = options.maxLimit || 100;

  const requestedPage = Number(query.page);
  const requestedLimit = Number(query.limit);

  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;

  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, maxLimit)
    : defaultLimit;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function paginatedResponse(data, total, pagination) {
  return {
    dados: data,
    paginacao: {
      pagina: pagination.page,
      limite: pagination.limit,
      total,
      totalPaginas: Math.ceil(total / pagination.limit),
    },
  };
}
