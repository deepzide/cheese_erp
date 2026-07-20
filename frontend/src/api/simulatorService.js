import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.pricing_controller';

export const simulatorService = {
    /** Price/availability preview — never creates tickets. */
    simulate: async (data) => {
        return apiRequest(`${BASE}.simulate_booking`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};
