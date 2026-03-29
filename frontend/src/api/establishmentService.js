import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.establishment_controller';

export const establishmentService = {
    listEstablishments: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_establishments?${searchParams}`);
    },

    getEstablishmentDetails: async (establishmentId) => {
        return apiRequest(`${BASE}.get_establishment_details?company_id=${encodeURIComponent(establishmentId)}`);
    },

    createEstablishment: async (data) => {
        return apiRequest(`${BASE}.create_establishment`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateEstablishment: async (companyId, data) => {
        return apiRequest(`${BASE}.update_establishment`, {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId, ...data }),
        });
    },

    deleteEstablishment: async (companyId) => {
        return apiRequest(`${BASE}.delete_establishment`, {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId }),
        });
    },

    archiveEstablishment: async (companyId) => {
        return apiRequest(`${BASE}.archive_establishment`, {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId }),
        });
    },

    unarchiveEstablishment: async (companyId) => {
        return apiRequest(`${BASE}.unarchive_establishment`, {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId }),
        });
    },
};
