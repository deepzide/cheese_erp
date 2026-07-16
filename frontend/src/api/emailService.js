import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.email_controller';

export const emailService = {
    getEmailServerStatus: async () => {
        return apiRequest(`${BASE}.get_email_server_status`);
    },

    sendTestEmail: async ({ recipient, subject, message } = {}) => {
        return apiRequest(`${BASE}.send_test_email`, {
            method: 'POST',
            body: JSON.stringify({ recipient, subject, message }),
        });
    },
};
