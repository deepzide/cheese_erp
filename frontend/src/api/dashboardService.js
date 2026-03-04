import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.dashboard_controller';

export const dashboardService = {
    getCentralDashboard: async (period = 'today', dateFrom = null, dateTo = null) => {
        const params = new URLSearchParams({ period });
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        return apiRequest(`${BASE}.get_central_dashboard?${params}`);
    },

    getEstablishmentDashboard: async (establishmentId, period = 'today') => {
        const params = new URLSearchParams({ establishment_id: establishmentId, period });
        return apiRequest(`${BASE}.get_establishment_dashboard?${params}`);
    },

    getDashboardKpis: async (establishmentId = null, period = 'today') => {
        const params = new URLSearchParams({ period });
        if (establishmentId) params.append('establishment_id', establishmentId);
        return apiRequest(`${BASE}.get_dashboard_kpis?${params}`);
    },

    getPendingActions: async (establishmentId) => {
        return apiRequest(`${BASE}.get_pending_actions?establishment_id=${establishmentId}`);
    },

    getDayAgenda: async (establishmentId, date = null) => {
        const params = new URLSearchParams({ establishment_id: establishmentId });
        if (date) params.append('date', date);
        return apiRequest(`${BASE}.get_day_agenda?${params}`);
    },
};
