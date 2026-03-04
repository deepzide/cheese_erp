import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.availability_controller';

export const availabilityService = {
    getAvailableSlots: async (experienceId, date) => {
        return apiRequest(`${BASE}.get_available_slots?experience_id=${experienceId}&date=${date}`);
    },

    getRouteAvailability: async (routeId, date = null, partySize = 1) => {
        const params = new URLSearchParams({ route_id: routeId, party_size: partySize });
        if (date) params.append('date', date);
        return apiRequest(`${BASE}.get_route_availability?${params}`);
    },
};
