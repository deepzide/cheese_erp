import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.bot_control_controller';

export const botMetricsService = {
    getMetrics: async (days = 7) => {
        return apiRequest(`${BASE}.get_bot_llm_metrics`, {
            method: 'POST',
            body: JSON.stringify({ days }),
        });
    },
};
