import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.bot_user_controller';

export const botUserService = {
    listBotUsers: async () => {
        return apiRequest(`${BASE}.list_bot_users`);
    },

    provisionBotUsers: async ({ company, resetPassword } = {}) => {
        return apiRequest(`${BASE}.provision_bot_users`, {
            method: 'POST',
            body: JSON.stringify({
                company: company || undefined,
                reset_password: resetPassword ? 1 : 0,
            }),
        });
    },
};
