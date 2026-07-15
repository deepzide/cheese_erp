import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.document_controller';

export const documentSearchService = {
    /** Manual test search from the ERP UI (audited with source TEST). */
    searchSemantic: async (data) => {
        return apiRequest(`${BASE}.search_documents_semantic`, {
            method: 'POST',
            body: JSON.stringify({ search_source: 'TEST', ...data }),
        });
    },

    listSearchLogs: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_semantic_search_logs?${searchParams}`);
    },
};
