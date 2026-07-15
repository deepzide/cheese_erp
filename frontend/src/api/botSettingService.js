import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.bot_setting_controller';

export const botSettingService = {
    getWebhookSettings: async () => {
        return apiRequest(`${BASE}.get_webhook_settings`);
    },

    updateWebhookSettings: async (data) => {
        return apiRequest(`${BASE}.update_webhook_settings`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    testWebhook: async (data = {}) => {
        return apiRequest(`${BASE}.test_webhook`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    reindexDocuments: async () => {
        return apiRequest('/api/method/cheese.api.v1.document_controller.reindex_documents', {
            method: 'POST',
        });
    },
};
