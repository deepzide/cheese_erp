import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.quotation_controller';

export const quotationService = {
    listQuotations: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_quotations?${searchParams}`);
    },

    getQuotation: async (quotationId) => {
        return apiRequest(`${BASE}.get_quotation?quotation_id=${quotationId}`);
    },

    createQuotation: async (data) => {
        return apiRequest(`${BASE}.create_quotation`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateQuotation: async (quotationId, data) => {
        return apiRequest(`${BASE}.update_quotation`, { method: 'POST', body: JSON.stringify({ quotation_id: quotationId, ...data }) });
    },
};
