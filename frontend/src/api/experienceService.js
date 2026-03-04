import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.experience_controller';

export const experienceService = {
    listExperiences: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_experiences?${searchParams}`);
    },

    getExperienceDetail: async (experienceId) => {
        return apiRequest(`${BASE}.get_experience_detail?experience_id=${experienceId}`);
    },

    updateExperiencePricing: async (experienceId, data) => {
        return apiRequest(`${BASE}.update_experience_pricing`, { method: 'POST', body: JSON.stringify({ experience_id: experienceId, ...data }) });
    },

    createTimeSlot: async (data) => {
        return apiRequest(`${BASE}.create_time_slot`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateTimeSlot: async (slotId, data) => {
        return apiRequest(`${BASE}.update_time_slot`, { method: 'POST', body: JSON.stringify({ slot_id: slotId, ...data }) });
    },

    listTimeSlots: async (experienceId, params = {}) => {
        const searchParams = new URLSearchParams({ experience_id: experienceId });
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_time_slots?${searchParams}`);
    },

    blockTimeSlot: async (slotId) => {
        return apiRequest(`${BASE}.block_time_slot`, { method: 'POST', body: JSON.stringify({ slot_id: slotId }) });
    },

    updateBookingPolicy: async (experienceId, data) => {
        return apiRequest(`${BASE}.update_booking_policy`, { method: 'POST', body: JSON.stringify({ experience_id: experienceId, ...data }) });
    },
};
