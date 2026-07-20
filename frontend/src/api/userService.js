import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.user_controller';

export const userService = {
    listUsers: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_users?${searchParams}`);
    },

    getUser: async (userId) => {
        return apiRequest(`${BASE}.get_user?user_id=${encodeURIComponent(userId)}`);
    },

    createUser: async (data) => {
        return apiRequest(`${BASE}.create_user`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    updateUser: async (userId, data) => {
        return apiRequest(`${BASE}.update_user`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, ...data }),
        });
    },

    deleteUser: async (userId) => {
        return apiRequest(`${BASE}.delete_user`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
        });
    },

    listCompanies: async () => {
        return apiRequest(`${BASE}.list_companies_for_assignment`);
    },

    setUserCompanies: async (userId, companies) => {
        return apiRequest(`${BASE}.set_user_companies`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, companies }),
        });
    },
};
