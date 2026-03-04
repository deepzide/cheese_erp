import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.route_controller';

export const routeService = {
    listRoutes: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_routes?${searchParams}`);
    },

    getRouteDetails: async (routeId) => {
        return apiRequest(`${BASE}.get_route_details?route_id=${routeId}`);
    },

    createRoute: async (data) => {
        return apiRequest(`${BASE}.create_route`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateRoute: async (routeId, data) => {
        return apiRequest(`${BASE}.update_route`, { method: 'POST', body: JSON.stringify({ route_id: routeId, ...data }) });
    },

    publishRoute: async (routeId) => {
        return apiRequest(`${BASE}.publish_route`, { method: 'POST', body: JSON.stringify({ route_id: routeId }) });
    },

    unpublishRoute: async (routeId) => {
        return apiRequest(`${BASE}.unpublish_route`, { method: 'POST', body: JSON.stringify({ route_id: routeId }) });
    },

    archiveRoute: async (routeId) => {
        return apiRequest(`${BASE}.archive_route`, { method: 'POST', body: JSON.stringify({ route_id: routeId }) });
    },

    configureRouteDeposit: async (routeId, data) => {
        return apiRequest(`${BASE}.configure_route_deposit`, { method: 'POST', body: JSON.stringify({ route_id: routeId, ...data }) });
    },

    getRouteBankAccount: async (routeId) => {
        return apiRequest(`${BASE}.get_route_bank_account?route_id=${routeId}`);
    },
};
