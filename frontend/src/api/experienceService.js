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

    // `scope` is one of "this" | "following" | "all" — see backend
    // experience_controller._resolve_slot_recurrence_scope.
    updateTimeSlot: async (slotId, data, { scope = 'this', confirmActiveTickets = false } = {}) => {
        return apiRequest(`${BASE}.update_time_slot`, {
            method: 'POST',
            body: JSON.stringify({
                slot_id: slotId,
                scope,
                confirm_active_tickets: confirmActiveTickets ? 1 : 0,
                ...data,
            }),
        });
    },

    listTimeSlots: async (experienceId, params = {}) => {
        const searchParams = new URLSearchParams({ experience_id: experienceId });
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_time_slots?${searchParams}`);
    },

    // Tells the UI whether to render the Google-Calendar-style 3-option modal
    // and how many CONFIRMED reservations would be impacted by each scope.
    getSlotRecurrenceInfo: async (slotId) => {
        return apiRequest(`${BASE}.get_slot_recurrence_info?slot_id=${encodeURIComponent(slotId)}`);
    },

    blockTimeSlot: async (slotId, { scope = 'this' } = {}) => {
        return apiRequest(`${BASE}.block_time_slot`, {
            method: 'POST',
            body: JSON.stringify({ slot_id: slotId, scope }),
        });
    },

    updateBookingPolicy: async (experienceId, data) => {
        return apiRequest(`${BASE}.update_booking_policy`, { method: 'POST', body: JSON.stringify({ experience_id: experienceId, ...data }) });
    },

    linkBookingPolicy: async (experienceId, policyId) => {
        return apiRequest(`${BASE}.link_booking_policy`, {
            method: 'POST',
            body: JSON.stringify({ experience_id: experienceId, policy_id: policyId }),
        });
    },

    createRecurringSlots: async (data) => {
        return apiRequest(`${BASE}.create_recurring_slots`, { method: 'POST', body: JSON.stringify(data) });
    },

    deleteTimeSlot: async (slotId, { scope = 'this' } = {}) => {
        return apiRequest(`${BASE}.delete_time_slot`, {
            method: 'POST',
            body: JSON.stringify({ slot_id: slotId, scope }),
        });
    },

    deleteExperience: async (experienceId) => {
        return apiRequest(`${BASE}.delete_experience`, { method: 'POST', body: JSON.stringify({ experience_id: experienceId }) });
    },
};
