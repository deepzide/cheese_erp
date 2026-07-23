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

    getRoomDayStates: async (roomType, dateFrom, dateTo) => {
        const searchParams = new URLSearchParams({ room_type: roomType, date_from: dateFrom, date_to: dateTo });
        return apiRequest(`/api/method/cheese.api.v1.room_controller.get_room_day_states?${searchParams}`);
    },

    listFreeRooms: async (roomType, checkIn, checkOut) => {
        const searchParams = new URLSearchParams({ room_type: roomType, check_in: checkIn, check_out: checkOut });
        return apiRequest(`/api/method/cheese.api.v1.room_controller.list_free_rooms?${searchParams}`);
    },

    getHotelReservations: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.get_hotel_reservations?${searchParams}`);
    },

    getHotelReservationDetails: async (ticketId) => {
        return apiRequest(`${BASE}.get_hotel_reservation_details?ticket_id=${ticketId}`);
    },
};
