import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.hotel_controller';

export const hotelService = {
    listHotels: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_hotels?${searchParams}`);
    },

    getHotelExperiences: async (hotelId, params = {}) => {
        const searchParams = new URLSearchParams({ hotel_id: hotelId });
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.get_hotel_experiences?${searchParams}`);
    },

    getHotelAvailability: async (experienceId, params = {}) => {
        const searchParams = new URLSearchParams({ experience_id: experienceId });
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.get_hotel_availability?${searchParams}`);
    },

    createHotelSlots: async (data) => {
        return apiRequest(`${BASE}.create_hotel_slots`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateHotelSlot: async (slotId, data) => {
        return apiRequest(`${BASE}.update_hotel_slot`, { method: 'POST', body: JSON.stringify({ slot_id: slotId, ...data }) });
    },

    getHotelReservations: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.get_hotel_reservations?${searchParams}`);
    },
};
