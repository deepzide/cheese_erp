import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.deposit_controller';

export const depositService = {
    listDeposits: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_deposits?${searchParams}`);
    },

    getDeposit: async (depositId) => {
        return apiRequest(`${BASE}.get_deposit?deposit_id=${depositId}`);
    },

    verifyDeposit: async (depositId) => {
        return apiRequest(`${BASE}.verify_deposit`, { method: 'POST', body: JSON.stringify({ deposit_id: depositId }) });
    },
};
