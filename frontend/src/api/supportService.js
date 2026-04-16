import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.complaint_controller';

export const supportService = {
    listSupportCases: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_support_cases?${searchParams}`);
    },

    createComplaint: async (data) => {
        return apiRequest(`${BASE}.create_complaint`, {
            method: 'POST', body: JSON.stringify(data),
        });
    },

    updateSupportCaseStatus: async (supportCaseId, status, notes = null, assignedTo = null) => {
        return apiRequest(`${BASE}.update_support_case_status`, {
            method: 'POST',
            body: JSON.stringify({
                support_case_id: supportCaseId,
                status,
                notes,
                assigned_to: assignedTo,
            }),
        });
    },
};
