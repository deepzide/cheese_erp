import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.establishment_controller';

export const establishmentService = {
    listEstablishments: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_establishments?${searchParams}`);
    },

    getEstablishmentDetails: async (establishmentId) => {
        return apiRequest(`${BASE}.get_establishment_details?company_id=${establishmentId}`);
    },
};
