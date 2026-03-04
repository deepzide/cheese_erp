import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.lead_controller';

export const leadService = {
    listLeads: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_leads?${searchParams}`);
    },

    getLead: async (leadId) => {
        return apiRequest(`${BASE}.get_lead?lead_id=${leadId}`);
    },

    createLead: async (data) => {
        return apiRequest(`${BASE}.create_lead`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateLead: async (leadId, data) => {
        return apiRequest(`${BASE}.update_lead`, { method: 'POST', body: JSON.stringify({ lead_id: leadId, ...data }) });
    },
};
